import { readdir, lstat, readFile } from 'node:fs/promises'
import { join, extname, basename, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

// apps/viewer/src/server/scan.ts → apps/viewer/src/server → repo root (4 up)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')

/**
 * Repo root path. Read from `ART_REPO_ROOT_OVERRIDE` if present (used by
 * tests that operate on a tmp directory), otherwise computed from this
 * module's path.
 */
export function getRepoRoot(): string {
  const override = process.env.ART_REPO_ROOT_OVERRIDE
  return override ? resolve(override) : DEFAULT_REPO_ROOT
}

/**
 * Asset library root. Read from `ART_ROOT_OVERRIDE` if present (tests),
 * otherwise `<repo>/art`.
 */
export function getArtRoot(): string {
  const override = process.env.ART_ROOT_OVERRIDE
  return override ? resolve(override) : join(getRepoRoot(), 'art')
}

// Backwards-compat exports — most callers should switch to `getArtRoot()`
// so env overrides apply at call time, but for static imports the
// constants still resolve at module-load.
export const REPO_ROOT = DEFAULT_REPO_ROOT
export const ART_ROOT = join(DEFAULT_REPO_ROOT, 'art')

export const ASSET_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'])

/**
 * Single 'all' scope — the whole `art/` workspace.
 */
export type Scope = 'all'

export type ArtMeta = {
  title?: string
  description?: string
  alt?: string
  examples?: string[]
  tags?: string[]
  legacy?: boolean
}

export type Asset = {
  /** Path from ART_ROOT to the parent of the asset directory ('.' for root). */
  group: string
  /** Asset directory name (also the basename of every format file inside). */
  name: string
  /** Format ext (no dot) → path relative to ART_ROOT. */
  formats: Record<string, string>
  /** Parsed art.yaml; empty object if missing. */
  meta: ArtMeta
}

export type TreeNode = {
  name: string
  children: Map<string, TreeNode>
  items: Asset[]
}

export function rootForScope(_scope: Scope): string {
  return getArtRoot()
}

const SKIP = new Set(['.archive', '_legacy', 'node_modules', '.git'])

/**
 * Is this a regular file? Uses `lstat` (does NOT follow symlinks) — the
 * scanner refuses to descend into or surface symlinks at all, so a
 * `~/.ssh` symlink dropped under `art/` can't leak via `/api/asset`.
 */
async function isFile(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isFile()
  } catch {
    return false
  }
}

async function readArtYaml(dir: string): Promise<ArtMeta> {
  for (const candidate of ['art.yaml', 'art.yml']) {
    const path = join(dir, candidate)
    if (!(await isFile(path))) continue
    try {
      const txt = await readFile(path, 'utf-8')
      const parsed = yaml.load(txt)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ArtMeta
      }
    } catch {
      // fall through
    }
    return {}
  }
  return {}
}

/**
 * An asset directory contains at least one file named `<dirname>.<ext>`
 * for a recognized asset extension. `art.yaml` alone doesn't qualify:
 * category dirs (e.g. `art/banners/`) carry their own `art.yaml` for
 * category metadata, and the walker needs to descend into them to find
 * the assets nested inside.
 */
async function isAssetDir(dir: string, name: string): Promise<boolean> {
  for (const ext of ASSET_EXTS) {
    if (await isFile(join(dir, `${name}${ext}`))) return true
  }
  return false
}

/**
 * Find every `<name>.<ext>` file under `dir` (case-insensitive on ext) and
 * return a map keyed by ext-without-dot, valued by path relative to `root`.
 */
async function readAssetFormats(
  dir: string,
  name: string,
  root: string,
): Promise<Record<string, string>> {
  const formats: Record<string, string> = {}
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return formats
  }
  for (const e of entries) {
    const ext = extname(e).toLowerCase()
    if (!ASSET_EXTS.has(ext)) continue
    if (basename(e, extname(e)) !== name) continue
    formats[ext.slice(1)] = relative(root, join(dir, e))
  }
  return formats
}

async function walkAssetTree(
  dir: string,
  groupRel: string,
  root: string,
  byKey: Map<string, Asset>,
  filterDots = true,
): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  for (const e of entries) {
    if (e === '.DS_Store') continue
    if (filterDots && (SKIP.has(e) || e.startsWith('.'))) continue

    const full = join(dir, e)
    let s
    try {
      s = await lstat(full) // lstat: do NOT follow symlinks — see isFile()
    } catch {
      continue
    }
    if (!s.isDirectory()) continue
    if (s.isSymbolicLink()) continue // explicit, even though lstat()+isDirectory excludes them

    if (await isAssetDir(full, e)) {
      const formats = await readAssetFormats(full, e, root)
      if (Object.keys(formats).length === 0) continue
      const meta = await readArtYaml(full)
      const group = groupRel || '.'
      byKey.set(`${group}::${e}`, { group, name: e, formats, meta })
    } else {
      const childGroup = groupRel ? `${groupRel}/${e}` : e
      await walkAssetTree(full, childGroup, root, byKey, filterDots)
    }
  }
}

function naturalCompare(a: string, b: string): number {
  const na = Number(a),
    nb = Number(b)
  const aIsNum = a !== '' && !isNaN(na)
  const bIsNum = b !== '' && !isNaN(nb)
  if (aIsNum && bIsNum) return na - nb
  if (aIsNum) return -1
  if (bIsNum) return 1
  return a.localeCompare(b)
}

function buildTree(assets: Asset[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map(), items: [] }
  for (const a of assets) {
    const parts = a.group === '.' ? [] : a.group.split('/')
    let node = root
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map(), items: [] })
      }
      node = node.children.get(part)!
    }
    node.items.push(a)
  }
  function sortItems(node: TreeNode) {
    node.items.sort((a, b) => a.name.localeCompare(b.name))
    for (const c of node.children.values()) sortItems(c)
  }
  sortItems(root)
  function sortChildren(node: TreeNode): TreeNode {
    const sorted = new Map([...node.children.entries()].sort(([a], [b]) => naturalCompare(a, b)))
    for (const [k, child] of sorted.entries()) {
      sorted.set(k, sortChildren(child))
    }
    return { ...node, children: sorted }
  }
  return sortChildren(root)
}

export async function scanScope(_scope: Scope): Promise<TreeNode> {
  const root = getArtRoot()
  const byKey = new Map<string, Asset>()
  await walkAssetTree(root, '', root, byKey)
  return buildTree([...byKey.values()])
}

/**
 * Scan `art/.archive/` — same directory-as-asset model as the live tree.
 * Format paths are kept relative to ART_ROOT so the asset URL works
 * uniformly: `/api/asset/all/.archive/banners/...`.
 */
export async function scanArchive(_scope: Scope): Promise<TreeNode> {
  const root = getArtRoot()
  const archiveRoot = join(root, '.archive')
  const byKey = new Map<string, Asset>()
  // filterDots=false so we don't skip nested dotted names; SKIP still gates
  // node_modules etc., though they shouldn't appear inside .archive anyway.
  await walkAssetTree(archiveRoot, '', root, byKey, false)
  // Prefix every group with .archive/ so the tree visually mirrors the live tree
  const prefixed: Asset[] = [...byKey.values()].map((a) => ({
    ...a,
    group: a.group === '.' ? '.archive' : `.archive/${a.group}`,
  }))
  return buildTree(prefixed)
}
