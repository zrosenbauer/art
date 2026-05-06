import type { Asset } from '@/server/scan'
import { pickDefaultFormat, orderedFormats } from '@/lib/format'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AssetPreviewProps {
  asset: Asset | null
  scope: string
  /** When true, show the grid overlay (toggled externally via G key) */
  gridVisible?: boolean
  /** Ref forwarded from AssetBrowser so the C key can copy the image directly */
  stageImgRef?: React.RefObject<HTMLImageElement | null>
  /** When true, show Restore instead of Archive */
  archiveMode?: boolean
  /** Called when user clicks Archive/Restore in the preview toolbar */
  onArchive?: (asset: Asset) => void
}

/**
 * Copy the currently displayed image to the clipboard as PNG.
 * Mirrors asset-viewer.client.js copyImageToClipboard() (lines 69–109).
 */
async function copyImgToClipboard(img: HTMLImageElement): Promise<void> {
  if (!img.complete || !img.naturalWidth) {
    await new Promise<void>((resolve, reject) => {
      img.addEventListener('load', () => resolve(), { once: true })
      img.addEventListener('error', reject, { once: true })
    })
  }
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('toBlob failed'))
    }, 'image/png')
  })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function AssetPreview({
  asset,
  scope,
  gridVisible = false,
  stageImgRef,
  archiveMode = false,
  onArchive,
}: AssetPreviewProps) {
  const [format, setFormat] = useState<string>('')
  const [copying, setCopying] = useState(false)
  const localImgRef = useRef<HTMLImageElement | null>(null)

  // Reset format when asset changes
  useEffect(() => {
    if (asset) setFormat(pickDefaultFormat(asset.formats))
  }, [asset])

  const handleCopy = useCallback(async () => {
    const img = stageImgRef?.current ?? localImgRef.current
    if (!img) return
    setCopying(true)
    try {
      await copyImgToClipboard(img)
      toast.success('Added to clipboard')
    } catch (err) {
      toast.error('Copy failed', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setCopying(false)
    }
  }, [stageImgRef])

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground font-mono">
        <div className="text-5xl leading-none text-border select-none">■</div>
        <p className="text-xs uppercase tracking-[1px]">Select an asset</p>
      </div>
    )
  }

  const activeFormat = format || pickDefaultFormat(asset.formats)
  const relPath = asset.formats[activeFormat]
  // Encode each path segment individually so the browser doesn't treat a
  // literal `#` or `?` in a filename as a fragment/query.
  const src = relPath
    ? `/api/asset/${scope}/${relPath.split('/').map(encodeURIComponent).join('/')}`
    : ''
  const formats = orderedFormats(asset.formats)
  const archiveLabel = archiveMode ? 'Restore' : 'Archive'

  const meta = asset.meta ?? {}
  const displayTitle = meta.title || asset.name

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="flex-1 truncate text-xs font-mono text-foreground">
          {displayTitle}
          {meta.title && <span className="ml-2 text-muted-foreground">({asset.name})</span>}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {asset.group !== '.' ? asset.group : 'root'}
        </span>
      </div>

      {/* Metadata strip — only renders when art.yaml provides anything */}
      {(meta.description || (meta.tags && meta.tags.length) || meta.legacy) && (
        <div className="shrink-0 px-3 py-2 border-b border-border bg-muted/5 flex flex-col gap-1.5">
          {meta.description && (
            <p className="text-xs text-foreground/80 font-mono leading-relaxed">
              {meta.description}
            </p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {meta.legacy && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-500/90 font-mono">
                legacy
              </span>
            )}
            {meta.tags?.map((t) => (
              <span
                key={t}
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Format toggle + action buttons */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-border">
        {formats.map((fmt) => (
          <button
            key={fmt}
            type="button"
            onClick={() => setFormat(fmt)}
            className={cn(
              'px-2 py-0.5 text-xs rounded font-mono',
              fmt === activeFormat
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {fmt}
          </button>
        ))}
        {/* Archive / Restore button */}
        {onArchive && (
          <button
            type="button"
            onClick={() => onArchive(asset)}
            title={archiveLabel}
            className={cn(
              'ml-auto px-2 py-0.5 text-xs rounded font-mono border border-border',
              'text-destructive hover:border-destructive disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {archiveLabel}
          </button>
        )}
        {/* Copy button — mirrors legacy topbar copy-btn. Title shows C key hint. */}
        <button
          type="button"
          onClick={handleCopy}
          disabled={copying || !src}
          title="Copy image to clipboard (C)"
          className={cn(
            onArchive ? '' : 'ml-auto',
            'px-2 py-0.5 text-xs rounded font-mono border border-border',
            'text-lime-400 hover:border-lime-400 disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {copying ? 'Copying…' : 'Copy'}
        </button>
      </div>

      {/* Image stage with optional grid overlay */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/10 relative">
        {src ? (
          <img
            key={src}
            ref={(el) => {
              localImgRef.current = el
              if (stageImgRef)
                (stageImgRef as React.MutableRefObject<HTMLImageElement | null>).current = el
            }}
            src={src}
            alt={asset.name}
            className={cn(
              'max-w-full max-h-full object-contain relative z-0',
              archiveMode && 'opacity-70',
            )}
          />
        ) : (
          <span className="text-xs text-muted-foreground font-mono">no preview</span>
        )}
        {/* Grid overlay sits ABOVE the image so it's actually useful for alignment */}
        {gridVisible && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              backgroundImage:
                'linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        )}
      </div>

      {/* Footer — path + IMAGE-ONLY keyboard hints (G grid, C copy). Sidebar
          and search keys belong in the sidebar's own footer, not here. */}
      <div className="shrink-0 px-3 py-1.5 border-t border-border flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">{relPath}</span>
        <KbdHint k="G" label="grid" />
        <span className="text-border">·</span>
        <KbdHint k="C" label="copy" />
      </div>
    </div>
  )
}

export { copyImgToClipboard }

function KbdHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
      <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/40 text-foreground text-[10px] font-mono">
        {k}
      </kbd>
      {label}
    </span>
  )
}
