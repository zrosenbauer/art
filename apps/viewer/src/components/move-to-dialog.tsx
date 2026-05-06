import { useState, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import type { TreeNode, Asset } from '@/server/scan'
import { isValidGroupPath } from '@/lib/asset-paths'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface MoveToDialogProps {
  open: boolean
  asset: Asset | null
  tree: TreeNode
  scope: string
  onClose: () => void
}

/** Collect all unique group paths from a tree */
function collectGroups(node: TreeNode, prefix = ''): string[] {
  const groups: string[] = []
  for (const [key, child] of node.children.entries()) {
    const groupPath = prefix ? `${prefix}/${key}` : key
    groups.push(groupPath)
    groups.push(...collectGroups(child, groupPath))
  }
  // Also include root '.'
  return groups
}

export function MoveToDialog({ open, asset, tree, scope, onClose }: MoveToDialogProps) {
  const [filter, setFilter] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [busy, setBusy] = useState(false)
  const filterRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFilter('')
      setNewFolderMode(false)
      setNewFolderName('')
      setTimeout(() => filterRef.current?.focus(), 50)
    }
  }, [open])

  // Tree-derived list memoized so re-renders driven by `filter` keystrokes
  // don't re-walk the whole tree (rerender-split-combined-hooks).
  const allGroups = useMemo(() => ['.', ...collectGroups(tree)], [tree])

  // Exclude current group and apply the search filter. Filter recomputes
  // on every keystroke (cheap), but the underlying tree walk above does not.
  const filtered = useMemo(() => {
    if (!asset) return []
    const q = filter.toLowerCase()
    return allGroups
      .filter((g) => g !== asset.group)
      .filter((g) => !q || g.toLowerCase().includes(q))
  }, [allGroups, asset, filter])

  if (!asset) return null

  async function moveTo(newGroup: string) {
    if (!asset || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, group: asset.group, name: asset.name, newGroup }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = typeof body?.error === 'string' ? body.error : `move failed (${res.status})`
        toast.error('Move failed', { description: msg })
        return
      }
      toast.success(`Moved to ${newGroup === '.' ? 'root' : newGroup}`)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Move failed', { description: msg })
    } finally {
      setBusy(false)
    }
  }

  // Validation is shared with the server (apps/viewer/src/lib/asset-paths.ts).
  // Server still validates authoritatively; this is fast inline UX
  // feedback so the user sees disabled-Move before the round-trip.
  const trimmedFolder = newFolderName.trim()
  const newFolderValid = isValidGroupPath(trimmedFolder) && trimmedFolder !== '.'

  async function handleNewFolder() {
    if (!newFolderValid) return
    await moveTo(trimmedFolder)
  }

  const displayGroup = (g: string) => (g === '.' ? '/ (root)' : g)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">
            Move &ldquo;{asset.name}&rdquo; to…
          </DialogTitle>
        </DialogHeader>

        {/* Filter input */}
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter folders…"
          className="w-full h-7 bg-background border border-border rounded text-xs px-2 font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Folder list */}
        <div className="max-h-48 overflow-y-auto border border-border rounded text-xs font-mono">
          {filtered.length === 0 && !newFolderMode && (
            <div className="px-3 py-2 text-muted-foreground">no matching folders</div>
          )}
          {filtered.map((g) => (
            <button
              key={g}
              type="button"
              disabled={busy}
              onClick={() => moveTo(g)}
              className="w-full text-left px-3 py-1.5 hover:bg-accent truncate disabled:opacity-50"
            >
              {displayGroup(g)}
            </button>
          ))}
        </div>

        {/* New folder option */}
        {!newFolderMode ? (
          <button
            type="button"
            onClick={() => setNewFolderMode(true)}
            className="text-xs text-muted-foreground hover:text-foreground font-mono text-left"
          >
            + New folder…
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNewFolder()
                if (e.key === 'Escape') setNewFolderMode(false)
              }}
              placeholder="folder/path"
              className="flex-1 h-7 bg-background border border-border rounded text-xs px-2 font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              disabled={!newFolderValid || busy}
              onClick={handleNewFolder}
              title={!newFolderValid && trimmedFolder ? 'invalid folder path' : undefined}
              className="px-2 py-0.5 text-xs rounded font-mono bg-primary text-primary-foreground disabled:opacity-50"
            >
              Move
            </button>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs rounded font-mono border border-border text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
