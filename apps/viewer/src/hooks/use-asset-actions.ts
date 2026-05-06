import { useCallback } from 'react'
import { toast } from 'sonner'
import type { Asset } from '@/server/scan'

interface UseAssetActionsArgs {
  scope: string
  archiveMode: boolean
}

/**
 * Per-item result from /api/archive and /api/restore. Discriminated on `ok`
 * so callers either get `error` (failure) or nothing extra (success), never
 * both/neither.
 */
type ApiResultEntry =
  | { ok: true; group?: string; name?: string }
  | { ok: false; group?: string; name?: string; error?: string }

/**
 * Wraps the four mutating asset endpoints with consistent error
 * handling and toast feedback. Pulled out of AssetBrowser so the
 * component stays focused on UI state, and so the same handlers can
 * be reused (e.g. by a future right-click menu or batch toolbar).
 *
 * Each handler returns `true` on success so callers can advance UI
 * state only after the server confirms the change.
 */
export function useAssetActions({ scope, archiveMode }: UseAssetActionsArgs) {
  const archiveOrRestore = useCallback(
    async (items: Array<Pick<Asset, 'group' | 'name'>>): Promise<boolean> => {
      const endpoint = archiveMode ? '/api/restore' : '/api/archive'
      const verb = archiveMode ? 'restore' : 'archive'
      const Verb = verb[0].toUpperCase() + verb.slice(1)

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, items }),
        })
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          results?: ApiResultEntry[]
        }
        if (!res.ok) {
          toast.error(`${Verb} failed`, {
            description: body.error ?? `${verb} failed (${res.status})`,
          })
          return false
        }
        const results = Array.isArray(body.results) ? body.results : []
        const failed = results.filter((r) => r.ok === false)
        if (failed.length) {
          const first = failed[0]
          toast.error(`${failed.length} ${verb} failure${failed.length === 1 ? '' : 's'}`, {
            description: first.error
              ? `${first.name ?? 'asset'}: ${first.error}`
              : `${first.name ?? 'asset'} failed`,
          })
          return false
        }
        if (results.length) {
          toast.success(`${Verb}d ${results.length} asset${results.length === 1 ? '' : 's'}`)
        }
        return true
      } catch (err) {
        toast.error(`${Verb} failed`, {
          description: err instanceof Error ? err.message : String(err),
        })
        return false
      }
    },
    [scope, archiveMode],
  )

  const rename = useCallback(
    async (asset: Asset, newName: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, group: asset.group, name: asset.name, newName }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          toast.error('Rename failed', {
            description: body.error ?? `rename failed (${res.status})`,
          })
          return false
        }
        toast.success(`Renamed to ${newName}`)
        return true
      } catch (err) {
        toast.error('Rename failed', {
          description: err instanceof Error ? err.message : String(err),
        })
        return false
      }
    },
    [scope],
  )

  const move = useCallback(
    async (asset: Asset, newGroup: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, group: asset.group, name: asset.name, newGroup }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          toast.error('Move failed', {
            description: body.error ?? `move failed (${res.status})`,
          })
          return false
        }
        toast.success(`Moved to ${newGroup === '.' ? 'root' : newGroup}`)
        return true
      } catch (err) {
        toast.error('Move failed', {
          description: err instanceof Error ? err.message : String(err),
        })
        return false
      }
    },
    [scope],
  )

  return { archiveOrRestore, rename, move }
}
