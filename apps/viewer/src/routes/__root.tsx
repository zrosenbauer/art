import type { ReactNode } from 'react'
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import { Shell } from '@/components/shell'
import { Toaster } from '@/components/ui/sonner'
import '../styles/app.css'

// Inline script that runs before React hydration to apply the user's
// preferred theme without a flash of unstyled (wrong-theme) content.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('art-theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Asset Viewer — Art' },
    ],
  }),
  component: RootComponent,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground font-mono">
        {children}
        <Toaster position="bottom-left" closeButton richColors />
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <RootDocument>
      <Shell />
    </RootDocument>
  )
}
