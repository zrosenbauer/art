import { createFileRoute } from '@tanstack/react-router'
import { mkdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { broadcast } from '@/server/events'
import { moveDir } from '@/server/fs-move'
import { assetLockKey, withLocks } from '@/server/locks'
import { getScopeRoot, isValidSegment, safeResolve } from '@/server/validate'

/**
 * Move an asset directory from `<group>/<name>/` to `<newGroup>/<name>/`.
 * The asset's name doesn't change — only its parent group folder.
 */
export const Route = createFileRoute('/api/move')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'invalid JSON' }, { status: 400 })
        }

        const { scope: rawScope, group, name, newGroup } = body as Record<string, unknown>

        const sr = getScopeRoot(rawScope)
        if (!sr) return Response.json({ error: 'invalid scope' }, { status: 400 })
        const { scope, scopeRoot } = sr

        // `isValidSegment` is a `s is string` type guard; failing branches
        // return early so `group` and `name` are narrowed to `string` for
        // the rest of the function — no `as string` cast needed.
        if (group !== '.' && !isValidSegment(group)) {
          return Response.json({ error: 'invalid group' }, { status: 400 })
        }
        if (!isValidSegment(name)) return Response.json({ error: 'invalid name' }, { status: 400 })

        if (typeof newGroup !== 'string') {
          return Response.json({ error: 'invalid newGroup' }, { status: 400 })
        }
        if (newGroup !== '.') {
          for (const part of newGroup.split('/')) {
            if (!isValidSegment(part)) {
              return Response.json({ error: 'invalid newGroup' }, { status: 400 })
            }
          }
        }
        if (newGroup === '.archive' || newGroup.startsWith('.archive/')) {
          return Response.json({ error: '.archive is reserved' }, { status: 400 })
        }

        const groupStr: string = group
        const nameStr = name

        if (groupStr === newGroup) {
          return Response.json({ ok: true, noop: true })
        }

        // Lock the asset under BOTH its source and destination group,
        // in sorted order. Source-only locking would let a concurrent
        // mover from a different group race us at the same `<newGroup>/
        // <name>/` destination.
        const srcKey = assetLockKey(groupStr, nameStr)
        const dstKey = assetLockKey(newGroup, nameStr)
        return await withLocks([srcKey, dstKey], async () => {
          const srcAssetDir =
            groupStr === '.' ? join(scopeRoot, nameStr) : join(scopeRoot, groupStr, nameStr)
          const dstAssetDir =
            newGroup === '.' ? join(scopeRoot, nameStr) : join(scopeRoot, newGroup, nameStr)

          const safeSrc = safeResolve(
            scopeRoot,
            groupStr === '.' ? nameStr : `${groupStr}/${nameStr}`,
          )
          const safeDst = safeResolve(
            scopeRoot,
            newGroup === '.' ? nameStr : `${newGroup}/${nameStr}`,
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

          await mkdir(dirname(dstAssetDir), { recursive: true })

          try {
            await moveDir(srcAssetDir, dstAssetDir)
          } catch (e: unknown) {
            // Log full error (with paths) server-side; return a sanitized
            // message to the client so we don't leak filesystem internals.
            // See `err-server-errors` skill rule.
            console.error('[api/move] moveDir failed:', e)
            return Response.json({ error: 'move failed' }, { status: 500 })
          }

          broadcast('reload', scope)
          return Response.json({ ok: true })
        })
      },
    },
  },
})
