import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Image } from 'lucide-react'
import type { TreeNode, Asset } from '@/server/scan'
import { fuzzyMatch, buildSearchHay, countAssets } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AssetTreeProps {
  tree: TreeNode
  search: string
  selected: Asset | null
  selectedSet: Set<string>
  onSelect: (asset: Asset, e?: React.MouseEvent) => void
  archiveMode?: boolean
  onArchive?: (asset: Asset) => void
  onRename?: (asset: Asset) => void
  onMove?: (asset: Asset) => void
  renamingAsset?: Asset | null
  renameValue?: string
  onRenameChange?: (v: string) => void
  onRenameCommit?: () => void
  onRenameCancel?: () => void
}

export function AssetTree({
  tree,
  search,
  selected,
  selectedSet,
  onSelect,
  archiveMode = false,
  onArchive,
  onRename,
  onMove,
  renamingAsset,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: AssetTreeProps) {
  return (
    <div className="overflow-y-auto h-full text-xs font-mono select-none">
      <TreeNodeView
        node={tree}
        depth={0}
        search={search}
        selected={selected}
        selectedSet={selectedSet}
        onSelect={onSelect}
        isRoot
        archiveMode={archiveMode}
        onArchive={onArchive}
        onRename={onRename}
        onMove={onMove}
        renamingAsset={renamingAsset}
        renameValue={renameValue}
        onRenameChange={onRenameChange}
        onRenameCommit={onRenameCommit}
        onRenameCancel={onRenameCancel}
      />
    </div>
  )
}

interface TreeNodeViewProps {
  node: TreeNode
  depth: number
  search: string
  selected: Asset | null
  selectedSet: Set<string>
  onSelect: (asset: Asset, e?: React.MouseEvent) => void
  isRoot?: boolean
  archiveMode?: boolean
  onArchive?: (asset: Asset) => void
  onRename?: (asset: Asset) => void
  onMove?: (asset: Asset) => void
  renamingAsset?: Asset | null
  renameValue?: string
  onRenameChange?: (v: string) => void
  onRenameCommit?: () => void
  onRenameCancel?: () => void
}

function TreeNodeView({
  node,
  depth,
  search,
  selected,
  selectedSet,
  onSelect,
  isRoot,
  archiveMode,
  onArchive,
  onRename,
  onMove,
  renamingAsset,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: TreeNodeViewProps) {
  const visibleItems = node.items.filter((a) =>
    fuzzyMatch(search.toLowerCase(), buildSearchHay(a.name, a.group)),
  )
  const visibleChildren = [...node.children.entries()].filter(([, child]) =>
    subtreeHasMatch(child, search),
  )

  if (!isRoot && visibleItems.length === 0 && visibleChildren.length === 0) return null

  if (isRoot) {
    return (
      <>
        {visibleChildren.map(([key, child]) => (
          <FolderView
            key={key}
            node={child}
            depth={depth}
            search={search}
            selected={selected}
            selectedSet={selectedSet}
            onSelect={onSelect}
            forceOpen={search.length > 0}
            archiveMode={archiveMode}
            onArchive={onArchive}
            onRename={onRename}
            onMove={onMove}
            renamingAsset={renamingAsset}
            renameValue={renameValue}
            onRenameChange={onRenameChange}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
          />
        ))}
        {visibleItems.map((a) => (
          <AssetRow
            key={`${a.group}::${a.name}`}
            asset={a}
            depth={depth}
            selected={selected}
            selectedSet={selectedSet}
            onSelect={onSelect}
            archiveMode={archiveMode}
            onArchive={onArchive}
            onRename={onRename}
            onMove={onMove}
            renamingAsset={renamingAsset}
            renameValue={renameValue}
            onRenameChange={onRenameChange}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
          />
        ))}
      </>
    )
  }

  return null
}

interface FolderViewProps {
  node: TreeNode
  depth: number
  search: string
  selected: Asset | null
  selectedSet: Set<string>
  onSelect: (asset: Asset, e?: React.MouseEvent) => void
  forceOpen?: boolean
  archiveMode?: boolean
  onArchive?: (asset: Asset) => void
  onRename?: (asset: Asset) => void
  onMove?: (asset: Asset) => void
  renamingAsset?: Asset | null
  renameValue?: string
  onRenameChange?: (v: string) => void
  onRenameCommit?: () => void
  onRenameCancel?: () => void
}

function FolderView({
  node,
  depth,
  search,
  selected,
  selectedSet,
  onSelect,
  forceOpen,
  archiveMode,
  onArchive,
  onRename,
  onMove,
  renamingAsset,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: FolderViewProps) {
  const [open, setOpen] = useState(depth < 2)
  const isOpen = forceOpen || open

  const visibleItems = node.items.filter((a) =>
    fuzzyMatch(search.toLowerCase(), buildSearchHay(a.name, a.group)),
  )
  const visibleChildren = [...node.children.entries()].filter(([, child]) =>
    subtreeHasMatch(child, search),
  )

  const total = countAssets(node)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className="w-full flex items-center gap-1 py-0.5 pr-2 hover:bg-accent text-muted-foreground hover:text-foreground"
      >
        <span className="shrink-0 w-3 h-3" aria-hidden="true">
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="shrink-0 w-3 h-3" aria-hidden="true">
          {isOpen ? <FolderOpen className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
        </span>
        <span className="flex-1 text-left truncate">{node.name}</span>
        <span className="shrink-0 text-[10px] tracking-wider px-1.5 py-px rounded-full border border-border bg-background/40 text-muted-foreground">
          {total}
        </span>
      </button>
      {isOpen && (
        <>
          {visibleChildren.map(([key, child]) => (
            <FolderView
              key={key}
              node={child}
              depth={depth + 1}
              search={search}
              selected={selected}
              selectedSet={selectedSet}
              onSelect={onSelect}
              forceOpen={forceOpen}
              archiveMode={archiveMode}
              onArchive={onArchive}
              onRename={onRename}
              onMove={onMove}
              renamingAsset={renamingAsset}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
          {visibleItems.map((a) => (
            <AssetRow
              key={`${a.group}::${a.name}`}
              asset={a}
              depth={depth + 1}
              selected={selected}
              selectedSet={selectedSet}
              onSelect={onSelect}
              archiveMode={archiveMode}
              onArchive={onArchive}
              onRename={onRename}
              onMove={onMove}
              renamingAsset={renamingAsset}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </>
      )}
    </div>
  )
}

interface AssetRowProps {
  asset: Asset
  depth: number
  selected: Asset | null
  selectedSet: Set<string>
  onSelect: (asset: Asset, e?: React.MouseEvent) => void
  archiveMode?: boolean
  onArchive?: (asset: Asset) => void
  onRename?: (asset: Asset) => void
  onMove?: (asset: Asset) => void
  renamingAsset?: Asset | null
  renameValue?: string
  onRenameChange?: (v: string) => void
  onRenameCommit?: () => void
  onRenameCancel?: () => void
}

function AssetRow({
  asset,
  depth,
  selected,
  selectedSet,
  onSelect,
  archiveMode = false,
  onArchive,
  onRename,
  onMove,
  renamingAsset,
  renameValue = '',
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: AssetRowProps) {
  const key = `${asset.group}::${asset.name}`
  const isSelected = selected?.group === asset.group && selected?.name === asset.name
  const isChecked = selectedSet.has(key)
  const isRenaming = renamingAsset?.group === asset.group && renamingAsset?.name === asset.name

  const renameInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  return (
    <div
      className={cn(
        'group w-full flex items-center gap-1 py-0.5 pr-1 text-left',
        isSelected
          ? 'bg-primary/20 text-primary'
          : isChecked
            ? 'bg-accent/60 text-foreground'
            : 'hover:bg-accent text-foreground',
        archiveMode && 'opacity-70',
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {/* Checkbox for multi-select */}
      <button
        type="button"
        onClick={(e) => {
          onSelect(asset, { ...e, metaKey: true } as React.MouseEvent)
        }}
        className="shrink-0 w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="Select asset"
      >
        <span
          className={cn(
            'w-3 h-3 rounded-sm border border-muted-foreground/50',
            isChecked && 'bg-primary border-primary',
          )}
        >
          {isChecked && (
            <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground fill-current">
              <path
                d="M10 3L5 8.5 2 5.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </button>

      {/* Asset name OR inline rename input */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onRenameCommit?.()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onRenameCancel?.()
            }
          }}
          onBlur={() => onRenameCommit?.()}
          className="flex-1 h-5 bg-background border border-primary rounded px-1 text-xs font-mono text-foreground outline-none min-w-0"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => onSelect(asset, e)}
          className="flex-1 flex items-center gap-1 min-w-0 truncate"
        >
          <span className="shrink-0 w-3 h-3 text-muted-foreground" aria-hidden="true">
            <Image className="w-3 h-3" />
          </span>
          <span className="flex-1 truncate text-left">{asset.name}</span>
          <span className="text-muted-foreground/50 shrink-0">
            {Object.keys(asset.formats).join(' ')}
          </span>
        </button>
      )}

      {/* Context menu (…) — shown on hover */}
      {!isRenaming && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent-foreground/10"
              aria-label="Asset actions"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-muted-foreground text-[10px] leading-none">···</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs font-mono">
            {!archiveMode && onRename && (
              <DropdownMenuItem onClick={() => onRename(asset)}>Rename</DropdownMenuItem>
            )}
            {!archiveMode && onMove && (
              <DropdownMenuItem onClick={() => onMove(asset)}>Move to…</DropdownMenuItem>
            )}
            {onArchive && (
              <DropdownMenuItem variant="destructive" onClick={() => onArchive(asset)}>
                {archiveMode ? 'Restore' : 'Archive'}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

function subtreeHasMatch(node: TreeNode, search: string): boolean {
  if (!search) return true
  for (const a of node.items) {
    if (fuzzyMatch(search.toLowerCase(), buildSearchHay(a.name, a.group))) return true
  }
  for (const c of node.children.values()) {
    if (subtreeHasMatch(c, search)) return true
  }
  return false
}
