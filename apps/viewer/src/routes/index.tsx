import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { scanScope, scanArchive } from '@/server/scan'
import type { TreeNode } from '@/server/scan'
import { AssetBrowser } from '@/components/asset-browser'

const fetchAll = createServerFn({ method: 'GET' }).handler(
  (): Promise<TreeNode> => scanScope('all'),
)

const fetchArchive = createServerFn({ method: 'GET' }).handler(
  (): Promise<TreeNode> => scanArchive('all'),
)

export type IndexSearch = { archived?: '1' }

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): IndexSearch =>
    search.archived === '1' ? { archived: '1' } : {},
  loaderDeps: ({ search }) => ({ archived: search.archived }),
  loader: ({ deps }) => (deps.archived === '1' ? fetchArchive() : fetchAll()),
  component: IndexPage,
})

function IndexPage() {
  const tree = Route.useLoaderData()
  const { archived } = Route.useSearch()
  return <AssetBrowser tree={tree} scope="all" archiveMode={archived === '1'} />
}
