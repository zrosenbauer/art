import { createFileRoute } from '@tanstack/react-router'
import { readdir, rename as fsRename, access } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { ASSET_EXTS } from '@/server/scan'
import { broadcast } from '@/server/events'
import { assetLockKey, withLocks } from '@/server/locks'
import { getScopeRoot, isValidSegment, safeResolve } from '@/server/validate'

/**
 * Rename an asset directory + every name.<ext> file inside it from `name`
 * to `newName`. art.yaml is left alone (the user can edit its `title` field
 * separately if they want).
 */
export const Route = createFileRoute('/api/rename')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'invalid JSON' }, { status: 400 })
        }

        const { scope: rawScope, group, name, newName } = body as Record<string, unknown>

        const sr = getScopeRoot(rawScope)
        if (!sr) return Response.json({ error: 'invalid scope' }, { status: 400 })
        const { scope, scopeRoot } = sr

        // `isValidSegment` is a `s is string` type guard. Calling it on each
        // input narrows the variable to `string` for the rest of the block,
        // which is why no `as string` cast is needed below. The `'.'` literal
        // short-circuits the group check (root is allowed).
        if (group !== '.' && !isValidSegment(group)) {
          return Response.json({ error: 'invalid group' }, { status: 400 })
        }
        if (!isValidSegment(name)) return Response.json({ error: 'invalid name' }, { status: 400 })
        if (!isValidSegment(newName)) {
          return Response.json({ error: 'invalid newName' }, { status: 400 })
        }

        const groupStr: string = group
        const nameStr = name
        const newNameStr = newName

        if (newNameStr === nameStr) {
          return Response.json({ results: [] })
        }

        // Lock BOTH the source asset key and the destination key, in
        // sorted order, so that:
        //  - concurrent rename/archive/move on the source serializes
        //  - a concurrent op that would land at our dst (e.g. archive
        //    placing a different asset there) also serializes
        // Sorted-key acquisition prevents A-waits-for-B + B-waits-for-A
        // deadlock between two renames swapping names.
        const srcKey = assetLockKey(groupStr, nameStr)
        const dstKey = assetLockKey(groupStr, newNameStr)
        return await withLocks([srcKey, dstKey], async () => {
          const srcAssetDir =
            groupStr === '.' ? join(scopeRoot, nameStr) : join(scopeRoot, groupStr, nameStr)
          const dstAssetDir =
            groupStr === '.' ? join(scopeRoot, newNameStr) : join(scopeRoot, groupStr, newNameStr)

          const safeSrc = safeResolve(
            scopeRoot,
            groupStr === '.' ? nameStr : `${groupStr}/${nameStr}`,
          )
          const safeDst = safeResolve(
            scopeRoot,
            groupStr === '.' ? newNameStr : `${groupStr}/${newNameStr}`,
          )
          if (!safeSrc || !safeDst) return Response.json({ error: 'forbidden' }, { status: 403 })

          try {
            await access(srcAssetDir)
          } catch {
            return Response.json({ error: 'asset not found' }, { status: 404 })
          }

          try {
            await access(dstAssetDir)
            return Response.json({ error: 'destination already exists' }, { status: 409 })
          } catch {
            // expected
          }

          // Two-phase rename with rollback so we never leave the asset
          // directory in a half-renamed state. Files are renamed FIRST
          // inside the source dir; if any rename fails we roll back and
          // bail. Only when every file has been renamed do we move the
          // directory itself.

          // Phase 0 — discover sibling files we need to rename.
          let entries: string[]
          try {
            entries = await readdir(srcAssetDir)
          } catch (err) {
            // Sanitize: log raw error server-side, return a generic
            // message to the client (err-server-errors).
            console.error('[api/rename] pre-rename readdir failed:', err)
            return Response.json({ error: 'pre-rename readdir failed' }, { status: 500 })
          }
          const siblings = entries.filter((e) => {
            const ext = extname(e).toLowerCase()
            return ASSET_EXTS.has(ext) && basename(e, ext) === nameStr
          })

          // Phase 1 — rename inner files; track applied so we can roll back.
          const applied: Array<{ from: string; to: string }> = []
          const renames: Array<{ from: string; to: string; ok: boolean; error?: string }> = []
          for (const e of siblings) {
            const ext = extname(e)
            const fromAbs = join(srcAssetDir, e)
            const toAbs = join(srcAssetDir, `${newNameStr}${ext}`)
            try {
              await fsRename(fromAbs, toAbs)
              applied.push({ from: fromAbs, to: toAbs })
              renames.push({ from: e, to: `${newNameStr}${ext}`, ok: true })
            } catch (err) {
              for (const a of applied.reverse()) {
                await fsRename(a.to, a.from).catch(() => {})
              }
              // Log internal error server-side; client gets a stable,
              // non-leaking message (err-server-errors).
              console.error('[api/rename] inner rename failed:', err)
              return Response.json(
                { error: 'inner rename failed (rolled back)' },
                { status: 500 },
              )
            }
          }

          // Phase 2 — rename the asset directory itself.
          try {
            await fsRename(srcAssetDir, dstAssetDir)
          } catch (err) {
            for (const a of applied.reverse()) {
              await fsRename(a.to, a.from).catch(() => {})
            }
            // Log internal error server-side; client gets a stable,
            // non-leaking message (err-server-errors).
            console.error('[api/rename] directory rename failed:', err)
            return Response.json(
              { error: 'directory rename failed (rolled back)' },
              { status: 500 },
            )
          }

          broadcast('reload', scope)
          return Response.json({ results: renames })
        })
      },
    },
  },
})
