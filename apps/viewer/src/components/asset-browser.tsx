import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
// `toast` is used by the keyboard handler for the Copy hotkey.
import { toast } from 'sonner'
import type { TreeNode, Asset } from '@/server/scan'
import { AssetTree } from './asset-tree'
import { AssetPreview, copyImgToClipboard } from './asset-preview'
import { SearchInput } from './search-input'
import { useReloadStream } from '@/hooks/use-reload-stream'
import { useAssetActions } from '@/hooks/use-asset-actions'
import { countAssets, fuzzyMatch, buildSearchHay } from '@/lib/format'
import { ArchiveConfirmDialog } from './archive-confirm-dialog'
import { MoveToDialog } from './move-to-dialog'

interface AssetBrowserProps {
  tree: TreeNode
  scope: string
  /** When true, show archived assets view */
  archiveMode?: boolean
}

/**
 * Collect all assets from a tree in depth-first order.
 * Used for hash-based initial selection.
 */
function collectAssets(node: TreeNode): Asset[] {
  const out: Asset[] = []
  for (const child of node.children.values()) out.push(...collectAssets(child))
  out.push(...node.items)
  return out
}

/**
 * Find the asset whose format path matches the given hash file path.
 * Mirrors asset-viewer.client.js hash-restore logic (lines 234–249).
 */
function assetFromHash(tree: TreeNode, hashFile: string): Asset | null {
  const all = collectAssets(tree)
  for (const a of all) {
    for (const relPath of Object.values(a.formats)) {
      if (relPath === hashFile) return a
    }
  }
  return null
}

function assetKey(a: Asset): string {
  return `${a.group}::${a.name}`
}

export function AssetBrowser({ tree, scope, archiveMode = false }: AssetBrowserProps) {
  const [search, setSearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [gridVisible, setGridVisible] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const stageImgRef = useRef<HTMLImageElement | null>(null)

  // Multi-select state: set of "group::name" keys
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set())
  // Last single-clicked item index (for shift-click range)
  const lastClickedRef = useRef<string | null>(null)
  // Archive confirm dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  // Items pending archive confirmation (can be a single item or the whole selection)
  const [pendingArchive, setPendingArchive] = useState<Asset[]>([])
  // Inline rename state: asset being renamed + current input value
  const [renamingAsset, setRenamingAsset] = useState<Asset | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Move-to dialog state
  const [moveAsset, setMoveAsset] = useState<Asset | null>(null)

  // ── URL hash restore ──
  // Initial value MUST match between SSR and the first client render to
  // avoid React hydration warnings — start `null` everywhere, then resolve
  // to the hash target (or first asset) in an effect after mount.
  const [selected, setSelected] = useState<Asset | null>(null)
  useEffect(() => {
    const hash = window.location.hash
    if (hash) {
      const hashFile = decodeURIComponent(hash.slice(1))
      const found = assetFromHash(tree, hashFile)
      if (found) {
        setSelected(found)
        return
      }
    }
    const all = collectAssets(tree)
    setSelected(all[0] ?? null)
    // Run once on mount; tree-change effect below handles updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror props/state into refs so callbacks below can stay referentially
  // stable across tree/selection changes — they're only ever read inside
  // event handlers and effects, not during render
  // (rerender-defer-reads / advanced-event-handler-refs).
  const treeRef = useRef(tree)
  const selectedRef = useRef(selected)
  const selectedSetRef = useRef(selectedSet)
  treeRef.current = tree
  selectedRef.current = selected
  selectedSetRef.current = selectedSet

  // Persist selection to location.hash on change
  const handleSelect = useCallback((asset: Asset, e?: React.MouseEvent) => {
    const key = assetKey(asset)

    if (e && (e.metaKey || e.ctrlKey)) {
      // Cmd/Ctrl+click: toggle in multi-select
      setSelectedSet((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      lastClickedRef.current = key
      return
    }

    if (e && e.shiftKey && lastClickedRef.current) {
      // Shift+click: range select using all assets in depth-first order
      const all = collectAssets(treeRef.current)
      const keys = all.map(assetKey)
      const lastIdx = keys.indexOf(lastClickedRef.current)
      const curIdx = keys.indexOf(key)
      if (lastIdx !== -1 && curIdx !== -1) {
        const [lo, hi] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx]
        setSelectedSet((prev) => {
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) next.add(keys[i])
          return next
        })
        return
      }
    }

    // Normal click: clear multi-select, set single selected
    setSelectedSet(new Set())
    lastClickedRef.current = key
    setSelected(asset)
    const fmt = asset.formats.svg ?? asset.formats.png ?? Object.values(asset.formats)[0]
    if (fmt && typeof window !== 'undefined') {
      window.location.hash = encodeURIComponent(fmt)
    }
  }, [])

  // Re-resolve `selected` when the tree changes (rename/move/archive). If
  // the previously-selected asset still exists (by group::name key), keep
  // it; otherwise fall back to the URL hash, then to nothing.
  //
  // Also reconcile the URL hash so a reload restores the right asset:
  //  - Selection still resolved → repoint hash to the new format path
  //    (rename/move would have changed it under the same group::name key).
  //  - Selection is null → clear the hash.
  useEffect(() => {
    setSelectedSet(new Set())
    setRenamingAsset(null)
    setMoveAsset(null)

    setSelected((prev) => {
      let next: Asset | null = null
      if (prev) {
        const all = collectAssets(tree)
        next = all.find((a) => assetKey(a) === assetKey(prev)) ?? null
      }
      if (!next && typeof window !== 'undefined' && window.location.hash) {
        const hashFile = decodeURIComponent(window.location.hash.slice(1))
        next = assetFromHash(tree, hashFile)
      }

      if (typeof window !== 'undefined') {
        if (next) {
          const fmt = next.formats.svg ?? next.formats.png ?? Object.values(next.formats)[0]
          if (fmt) {
            const encoded = encodeURIComponent(fmt)
            // Avoid pushing duplicate history entries when the hash
            // already matches.
            if (window.location.hash !== `#${encoded}`) {
              window.history.replaceState(null, '', `#${encoded}`)
            }
          }
        } else if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }

      return next
    })
  }, [tree])

  // Subscribe to SSE reload events for this scope
  const { isFlashing } = useReloadStream(scope)

  // All toast-wrapped server mutations live here — keeps this component
  // focused on UI state.
  const actions = useAssetActions({ scope, archiveMode })

  const total = countAssets(tree)

  // Open archive confirm for selected set. Reads tree and selection
  // through refs so the callback stays stable across every reload/
  // selection toggle (rerender-defer-reads).
  const handleArchiveSelected = useCallback(() => {
    const all = collectAssets(treeRef.current)
    const set = selectedSetRef.current
    const items = all.filter((a) => set.has(assetKey(a)))
    if (items.length === 0) return
    setPendingArchive(items)
    setArchiveDialogOpen(true)
  }, [])

  // Open archive confirm for a single asset (from preview toolbar)
  const handleArchiveSingle = useCallback((asset: Asset) => {
    setPendingArchive([asset])
    setArchiveDialogOpen(true)
  }, [])

  const handleConfirmArchive = useCallback(async () => {
    await actions.archiveOrRestore(pendingArchive.map((a) => ({ group: a.group, name: a.name })))
    setSelectedSet(new Set())
    setArchiveDialogOpen(false)
  }, [pendingArchive, actions])

  // Start inline rename for an asset
  const handleStartRename = useCallback((asset: Asset) => {
    setRenamingAsset(asset)
    setRenameValue(asset.name)
  }, [])

  const handleCommitRename = useCallback(async () => {
    if (!renamingAsset || !renameValue.trim() || renameValue.trim() === renamingAsset.name) {
      setRenamingAsset(null)
      return
    }
    await actions.rename(renamingAsset, renameValue.trim())
    setRenamingAsset(null)
  }, [renamingAsset, renameValue, actions])

  // Open move-to dialog
  const handleStartMove = useCallback((asset: Asset) => {
    setMoveAsset(asset)
  }, [])

  // Visible assets in tree-DFS order, filtered by current search. Used by
  // the ↑/↓ arrow handlers below.
  const visibleAssets = useMemo(() => {
    const q = search.toLowerCase()
    return collectAssets(tree).filter((a) => fuzzyMatch(q, buildSearchHay(a.name, a.group)))
  }, [tree, search])

  // ── Keyboard shortcuts ──
  // Read transient state through refs inside the listener so the document
  // keydown handler doesn't have to be re-attached every time selection,
  // search, or the tree changes (advanced-event-handler-refs).
  const visibleAssetsRef = useRef(visibleAssets)
  visibleAssetsRef.current = visibleAssets

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping =
        target === searchRef.current ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if (e.key === '/' && !isTyping) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }

      if (isTyping) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = visibleAssetsRef.current
        if (list.length === 0) return
        e.preventDefault()
        const cur = selectedRef.current
        const idx = cur ? list.findIndex((a) => assetKey(a) === assetKey(cur)) : -1
        const next =
          e.key === 'ArrowDown'
            ? list[idx < 0 ? 0 : (idx + 1) % list.length]
            : list[idx <= 0 ? list.length - 1 : idx - 1]
        if (next) {
          setSelectedSet(new Set())
          setSelected(next)
          const fmt = next.formats.svg ?? next.formats.png ?? Object.values(next.formats)[0]
          if (fmt) window.location.hash = encodeURIComponent(fmt)
        }
        return
      }

      if (e.key === 'b' || e.key === 'B') {
        setSidebarCollapsed((c) => !c)
        return
      }

      if (e.key === 'Escape') {
        if (selectedSetRef.current.size > 0) {
          setSelectedSet(new Set())
          return
        }
        setSidebarCollapsed(false)
        return
      }

      if (e.key === 'g' || e.key === 'G') {
        setGridVisible((v) => !v)
        return
      }

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        const img = stageImgRef.current
        if (img) {
          copyImgToClipboard(img)
            .then(() => toast.success('Added to clipboard'))
            .catch((err) =>
              toast.error('Copy failed', {
                description: err instanceof Error ? err.message : String(err),
              }),
            )
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const actionLabel = archiveMode ? 'Restore' : 'Archive'

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <SearchInput
          ref={searchRef}
          value={search}
          onChange={setSearch}
          placeholder="search assets…"
          className="w-64"
        />

        {/* Batch selection toolbar */}
        {selectedSet.size > 0 ? (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-muted-foreground font-mono">
              {selectedSet.size} selected
            </span>
            <button
              type="button"
              onClick={handleArchiveSelected}
              className="flex items-center gap-1 px-2 py-0.5 text-xs rounded font-mono border border-destructive text-destructive hover:bg-destructive/10"
            >
              <TrashIcon />
              {actionLabel} selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedSet(new Set())}
              className="px-2 py-0.5 text-xs rounded font-mono text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : null}

        <span className="text-xs text-muted-foreground font-mono ml-auto">{total} assets</span>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tree panel — has its OWN footer with sidebar-related keys
            (↑↓ navigate, / search, B sidebar). Image-related keys live in
            the preview footer instead. */}
        <div
          className="shrink-0 border-r border-border overflow-hidden transition-all duration-200 flex flex-col"
          style={{ width: sidebarCollapsed ? 0 : '20rem', opacity: sidebarCollapsed ? 0 : 1 }}
        >
          <div className="flex-1 overflow-hidden">
            <AssetTree
              tree={tree}
              search={search}
              selected={selected}
              selectedSet={selectedSet}
              onSelect={handleSelect}
              archiveMode={archiveMode}
              onArchive={handleArchiveSingle}
              onRename={!archiveMode ? handleStartRename : undefined}
              onMove={!archiveMode ? handleStartMove : undefined}
              renamingAsset={renamingAsset}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameCommit={handleCommitRename}
              onRenameCancel={() => setRenamingAsset(null)}
            />
          </div>
          <div className="shrink-0 border-t border-border px-3 py-1.5 flex items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground font-mono">
            <SidebarKbd k="↑" />
            <SidebarKbd k="↓" />
            <span>navigate</span>
            <span className="text-border">·</span>
            <SidebarKbd k="/" />
            <span>search</span>
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex-1 overflow-hidden">
          <AssetPreview
            asset={selected}
            scope={scope}
            gridVisible={gridVisible}
            stageImgRef={stageImgRef}
            archiveMode={archiveMode}
            onArchive={handleArchiveSingle}
          />
        </div>
      </div>

      {/* Archive/restore confirm dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        items={pendingArchive}
        archiveMode={archiveMode}
        onConfirm={handleConfirmArchive}
        onCancel={() => setArchiveDialogOpen(false)}
      />

      {/* Move-to dialog */}
      <MoveToDialog
        open={moveAsset !== null}
        asset={moveAsset}
        tree={tree}
        scope={scope}
        onClose={() => setMoveAsset(null)}
      />

      {/* HMR flash — pulses on every SSE reload. aria-hidden because it's a
          purely decorative status pulse and the reload itself is silent. */}
      <div className={isFlashing ? 'hmr-flash show' : 'hmr-flash'} aria-hidden="true">
        RELOADING
      </div>
    </div>
  )
}

function SidebarKbd({ k }: { k: string }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40 text-foreground text-[10px] font-mono">
      {k}
    </kbd>
  )
}

/** Inline trash SVG icon — avoids importing lucide for a single icon */
function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}
