import { createFileRoute } from '@tanstack/react-router'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { rootForScope } from '@/server/scan'

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

export const Route = createFileRoute('/api/asset/$')({
  server: {
    handlers: {
      GET: async ({ params }: { params: { _splat?: string } }) => {
        const splat = params._splat ?? ''
        // splat may carry a leading scope token for backwards compatibility
        // ("all/banners/foo.svg") or be a bare relative path ("banners/foo.svg")
        let relPath = splat
        if (splat.startsWith('all/')) {
          relPath = splat.slice('all/'.length)
        }

        if (!relPath) {
          return new Response('missing path', { status: 400 })
        }

        const scopeRoot = rootForScope('all')
        const absPath = resolve(scopeRoot, relPath)

        // Lexical containment check on the requested path.
        if (!absPath.startsWith(scopeRoot + sep) && absPath !== scopeRoot) {
          return new Response('forbidden', { status: 403 })
        }

        // Only serve known image formats — no art.yaml, no hidden files.
        const ext = extname(absPath).toLowerCase()
        const contentType = CONTENT_TYPES[ext]
        if (!contentType) {
          return new Response('forbidden', { status: 403 })
        }

        // Re-check containment AFTER resolving symlinks on BOTH the path
        // and the scope root. Resolving only the path produces false
        // 403s when scopeRoot itself is a symlink (e.g. /tmp →
        // /private/tmp on macOS). realpath throws ENOENT for missing
        // files — caught below as 404.
        let realPath: string
        let realRoot: string
        try {
          realPath = await realpath(absPath)
          realRoot = await realpath(scopeRoot)
        } catch {
          return new Response('not found', { status: 404 })
        }
        if (!realPath.startsWith(realRoot + sep) && realPath !== realRoot) {
          return new Response('forbidden', { status: 403 })
        }

        try {
          const data = await readFile(realPath)
          return new Response(data, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'no-store',
            },
          })
        } catch {
          return new Response('not found', { status: 404 })
        }
      },
    },
  },
})
