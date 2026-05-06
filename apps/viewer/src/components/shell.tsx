import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeToggle } from './theme-toggle'
import type { IndexSearch } from '@/routes/index'

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()

  const searchParams = new URLSearchParams(location.search)
  const isArchived = searchParams.get('archived') === '1'

  function toggleArchive() {
    const search: IndexSearch = isArchived ? {} : { archived: '1' }
    navigate({ to: '/', search })
  }

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-50 h-12 flex items-center gap-3 px-4 bg-card border-b border-border">
        <pre
          aria-label="ART"
          className="text-[10px] leading-[10px] font-bold text-primary shrink-0 select-none whitespace-pre m-0"
        >{`█▀█ █▀█ ▀█▀
█▀█ █▀▄  █ `}</pre>
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleArchive}
          className={
            isArchived
              ? 'px-2 py-1 text-xs rounded font-mono border border-primary text-primary bg-primary/10'
              : 'px-2 py-1 text-xs rounded font-mono border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
          }
          title={isArchived ? 'Hide archived items' : 'Show archived items'}
        >
          {isArchived ? 'Archive view' : 'Show archive'}
        </button>
        <ThemeToggle />
      </header>
      <Outlet />
    </TooltipProvider>
  )
}
