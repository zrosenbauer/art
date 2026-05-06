import type { Asset } from '@/server/scan'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ArchiveConfirmDialogProps {
  open: boolean
  items: Asset[]
  /** When true, shows "Restore" language instead of "Archive" */
  archiveMode: boolean
  onConfirm: () => void
  onCancel: () => void
}

const MAX_LISTED = 5

export function ArchiveConfirmDialog({
  open,
  items,
  archiveMode,
  onConfirm,
  onCancel,
}: ArchiveConfirmDialogProps) {
  const count = items.length
  const verb = archiveMode ? 'Restore' : 'Archive'
  const title = count === 1 ? `${verb} 1 asset?` : `${verb} ${count} assets?`

  const listed = items.slice(0, MAX_LISTED)
  const overflow = count - listed.length

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <ul className="mt-1 space-y-0.5 text-sm">
                {listed.map((a) => (
                  <li key={`${a.group}::${a.name}`} className="font-mono truncate">
                    {a.group !== '.' ? `${a.group}/` : ''}
                    {a.name}
                  </li>
                ))}
              </ul>
              {overflow > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">…and {overflow} more</p>
              )}
              {!archiveMode && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Assets will be moved to <code className="font-mono">.archive/</code> and can be
                  restored later.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {verb}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
