import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { THEME_STORAGE_KEY } from '@/lib/constants'

type Theme = 'light' | 'dark'

/**
 * Sun/Moon toggle in the header. Persists the choice to localStorage and
 * toggles the `dark` class on <html>. The actual class flip on first paint
 * happens synchronously in an inline script in <head> (see __root.tsx) so
 * there's no FOUC; this component only keeps the icon in sync after
 * hydration and writes the choice when the user toggles.
 */
export function ThemeToggle() {
  // Lazy initializer so the first client render's icon already matches
  // the class the inline theme-init script set on <html>. SSR returns
  // 'dark' (the default); on hydration we read whatever's actually live.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  })

  // Sync against external mutations of the html class (e.g. another tab's
  // ThemeToggle wrote localStorage and a focus event re-applied it, or
  // browser dev-tools poked the class manually).
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private mode / storage disabled — choice won't persist across
      // reloads but the live toggle still works for the session.
    }
  }

  const Icon = theme === 'dark' ? Sun : Moon
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="px-2 py-1 rounded font-mono border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
    >
      <Icon size={14} aria-hidden="true" />
    </button>
  )
}
