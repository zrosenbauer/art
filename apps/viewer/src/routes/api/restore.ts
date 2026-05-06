import { createFileRoute } from '@tanstack/react-router'
import { mkdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { broadcast } from '@/server/events'
import { moveDir } from '@/server/fs-move'
import { assetLockKey, withLock } from '@/server/locks'
import { getScopeRoot, isValidSegment, safeResolve } from '@/server/validate'

/**
 * Per-asset outcome. Discriminated on `ok` so a successful entry can never
 * carry a stray `error` field and vice versa.
 */
type RestoreResult =
  | { group: string; name: string; ok: true }
  | { group: string; name: string; ok: false; error: string }

/** Narrow an unknown value to `{ group: unknown; name: unknown }`. */
function isItemShape(v: unknown): v is { group: unknown; name: unknown } {
  return typeof v === 'object' && v !== null && 'group' in v && 'name' in v
}

/**
 * Restore an archived asset directory.
 * `group` is the original group (e.g. "banners"), NOT prefixed with .archive.
 */
export const Route = createFileRoute('/api/restore')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'invalid JSON' }, { status: 400 })
        }

        const { scope: rawScope, items } = body as Record<string, unknown>

        const sr = getScopeRoot(rawScope)
        if (!sr) return Response.json({ error: 'invalid scope' }, { status: 400 })
        const { scope, scopeRoot } = sr

        if (!Array.isArray(items) || items.length === 0) {
          return Response.json({ error: 'items must be a non-empty array' }, { status: 400 })
        }

        const archiveRoot = join(scopeRoot, '.archive')
        const results: RestoreResult[] = []

        for (const rawItem of items) {
          if (!isItemShape(rawItem)) {
            results.push({ group: '', name: '', ok: false, error: 'invalid group or name' })
            continue
          }
          const { name } = rawItem
          let group: unknown = rawItem.group

          // Group may arrive prefixed with `.archive/` (the tree shows it
          // that way for clarity). Strip the prefix — we operate on the
          // *live* group.
          if (group === '.archive') group = '.'
          else if (typeof group === 'string' && group.startsWith('.archive/')) {
            group = group.slice('.archive/'.length)
          }

          if ((!isValidSegment(group) && group !== '.') || !isValidSegment(name)) {
            const gStr = typeof group === 'string' ? group : ''
            const nStr = typeof name === 'string' ? name : ''
            results.push({ group: gStr, name: nStr, ok: false, error: 'invalid group or name' })
            continue
          }

          const result = await withLock(assetLockKey(group, name), async () => {
            const srcAssetDir =
              group === '.' ? join(archiveRoot, name) : join(archiveRoot, group, name)
            const safeSrc = safeResolve(
              scopeRoot,
              group === '.' ? `.archive/${name}` : `.archive/${group}/${name}`,
            )
            if (!safeSrc) return { ok: false as const, error: 'forbidden source path' }

            try {
              await access(srcAssetDir)
            } catch {
              return { ok: false as const, error: 'archived asset not found' }
            }

            const dstAssetDir = group === '.' ? join(scopeRoot, name) : join(scopeRoot, group, name)
            const safeDst = safeResolve(scopeRoot, group === '.' ? name : `${group}/${name}`)
            if (!safeDst) return { ok: false as const, error: 'forbidden destination' }

            try {
              await access(dstAssetDir)
              return { ok: false as const, error: 'destination already exists' }
            } catch {
              // expected
            }

            await mkdir(dirname(dstAssetDir), { recursive: true })

            try {
              await moveDir(srcAssetDir, dstAssetDir)
              return { ok: true as const }
            } catch (e: unknown) {
              // Log raw error server-side; surface a sanitized message
              // to the client (err-server-errors skill rule).
              console.error('[api/restore] moveDir failed:', e)
              return { ok: false as const, error: 'restore failed' }
            }
          })

          results.push({ group, name, ...result })
        }

        const anyOk = results.some((r) => r.ok)
        if (anyOk) {
          broadcast('reload', scope)
        }

        return Response.json({ results })
      },
    },
  },
})
