import { forwardRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

/**
 * Search input with forwardRef so AssetBrowser can focus it via the '/' key,
 * mirroring asset-viewer.client.js '/' handler (line 211–215).
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, placeholder = 'Search…', className },
  ref,
) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-7 bg-background border border-border rounded text-xs px-2 pr-7',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary',
          'font-mono',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </div>
  )
})
