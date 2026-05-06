import { createFileRoute } from '@tanstack/react-router'
import { scanArchive } from '@/server/scan'
import { getScopeRoot } from '@/server/validate'

export const Route = createFileRoute('/api/archived')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url)
        const rawScope = url.searchParams.get('scope')

        const sr = getScopeRoot(rawScope)
        if (!sr) return Response.json({ error: 'invalid scope' }, { status: 400 })

        const tree = await scanArchive(sr.scope)
        // TreeNode has Map children — serialize via replacer
        return new Response(
          JSON.stringify(tree, (_key, value) => {
            if (value instanceof Map) {
              return Object.fromEntries(value)
            }
            return value
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
