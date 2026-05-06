#!/usr/bin/env node
/**
 * Regenerate the repo's README.md from the art/ tree.
 *
 * Walks `art/<category>/<asset>/art.yaml` and emits a grouped catalog
 * with markdown + html snippets (raw.githubusercontent.com URLs).
 *
 * The output README.md has a fixed header/footer pulled from
 * `scripts/templates/{header,footer}.md`. The catalog section between
 * `<!-- BEGIN CATALOG -->` and `<!-- END CATALOG -->` is overwritten;
 * everything else is preserved from the templates.
 *
 * Usage:
 *   node scripts/build-docs.mjs           # write README.md
 *   node scripts/build-docs.mjs --check   # exit 1 if README is stale
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const ART_ROOT = join(REPO_ROOT, 'art')
const README_PATH = join(REPO_ROOT, 'README.md')
const TEMPLATE_DIR = join(__dirname, 'templates')

const REPO_SLUG = 'zrosenbauer/art' // owner/repo for raw.githubusercontent.com
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_SLUG}/main`

const ASSET_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'])
const SKIP = new Set(['.archive', '_legacy', 'node_modules', '.git'])

const CATEGORY_ORDER = ['banners', 'badges', 'misc']
const CATEGORY_LABELS = {
  banners: 'Repository Banners',
  badges: 'Badges',
  misc: 'General Art',
}
const CATEGORY_INTROS = {
  banners: "Wide hero banners (5:1 aspect, e.g., 1280×256) for the top of a repo's README.",
  badges: 'Compact status badges — square / pill-shaped indicators.',
  misc: "Anything that doesn't fit a banner or badge.",
}

const args = process.argv.slice(2)
const CHECK_ONLY = args.includes('--check')

main()

function main() {
  const catalog = scanCatalog(ART_ROOT)
  const generated = renderReadme(catalog)

  if (CHECK_ONLY) {
    let current = ''
    try {
      current = readFileSync(README_PATH, 'utf-8')
    } catch {}
    if (current !== generated) {
      console.error('✗ README.md is stale — run `pnpm docs` to regenerate')
      process.exit(1)
    }
    console.log('✓ README.md is up to date')
    return
  }

  writeFileSync(README_PATH, generated, 'utf-8')
  console.log(
    `✓ wrote ${README_PATH} (${catalog.totalAssets} assets across ${catalog.groups.length} groups)`,
  )
}

// ── Filesystem walk ──

function scanCatalog(root) {
  const groups = []
  let totalAssets = 0
  let entries = []
  try {
    entries = readdirSync(root)
  } catch {
    return { groups, totalAssets }
  }

  for (const entry of entries) {
    if (SKIP.has(entry) || entry.startsWith('.')) continue
    const full = join(root, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (!s.isDirectory()) continue

    const assets = collectAssetsInGroup(full, entry)
    if (assets.length === 0) continue
    groups.push({ name: entry, assets })
    totalAssets += assets.length
  }

  // Order groups by CATEGORY_ORDER, then alphabetical for the rest
  groups.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.name)
    const bi = CATEGORY_ORDER.indexOf(b.name)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.name.localeCompare(b.name)
  })

  return { groups, totalAssets }
}

function collectAssetsInGroup(groupDir, groupName) {
  const out = []
  let entries = []
  try {
    entries = readdirSync(groupDir)
  } catch {
    return out
  }

  for (const entry of entries) {
    if (SKIP.has(entry) || entry.startsWith('.')) continue
    const full = join(groupDir, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (!s.isDirectory()) continue

    const formats = readAssetFormats(full, entry, groupName)
    if (Object.keys(formats).length === 0) continue
    const meta = readArtYaml(full)
    out.push({ name: entry, group: groupName, formats, meta })
  }

  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

function readAssetFormats(dir, name, groupName) {
  const formats = {}
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return formats
  }
  for (const e of entries) {
    const ext = extname(e).toLowerCase()
    if (!ASSET_EXTS.has(ext)) continue
    if (basename(e, extname(e)) !== name) continue
    formats[ext.slice(1)] = `art/${groupName}/${name}/${e}`
  }
  return formats
}

function readArtYaml(dir) {
  for (const candidate of ['art.yaml', 'art.yml']) {
    const path = join(dir, candidate)
    try {
      const txt = readFileSync(path, 'utf-8')
      const parsed = yaml.load(txt)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // try next candidate
    }
  }
  return {}
}

// ── Render ──

function renderReadme({ groups }) {
  const header = readTemplate('header.md')
  const footer = readTemplate('footer.md')

  const catalogSections = groups.length
    ? groups.map(renderGroup).join('\n')
    : '_(no assets yet — drop one under `art/<category>/<name>/` and run `pnpm docs`)_\n'

  // Wrap the generated content in a stable `## Catalog` heading so
  // `#catalog` anchors in the templates always resolve, regardless of
  // which categories happen to be present.
  const catalog = [
    '<!-- BEGIN CATALOG (auto-generated by scripts/build-docs.mjs — do not edit) -->',
    '',
    '## Catalog',
    '',
    catalogSections,
    '<!-- END CATALOG -->',
  ].join('\n')

  return `${header.trimEnd()}\n\n${catalog}\n\n${footer.trimStart()}`
}

function readTemplate(name) {
  return readFileSync(join(TEMPLATE_DIR, name), 'utf-8')
}

function renderGroup({ name, assets }) {
  const label = CATEGORY_LABELS[name] || name
  const intro = CATEGORY_INTROS[name] || ''

  const head = `## ${label}\n\n${intro ? intro + '\n\n' : ''}`

  const body = assets.length === 0 ? `_(none yet)_\n` : assets.map(renderAsset).join('\n')

  return head + body
}

function renderAsset({ name, formats, meta }) {
  const title = mdText(meta.title || prettifyName(name))
  const desc = mdText(meta.description || '')
  const alt = htmlAttr(meta.alt || title)
  const altMd = mdAlt(meta.alt || title)
  const png = formats.png
  const svg = formats.svg

  // Prefer PNG for embedding (most consumers); the SVG link is auxiliary.
  const previewPath = png || svg
  if (!previewPath) return ''
  const url = `${RAW_BASE}/${encodePath(previewPath)}`

  // Build a sub-heading line: dimensions + tags + legacy badge.
  const meta_parts = []
  const dims = svg ? readSvgDims(join(REPO_ROOT, svg)) : null
  if (dims) meta_parts.push(`${dims.w}×${dims.h}`)
  if (meta.legacy === true) meta_parts.push('_legacy_')
  if (Array.isArray(meta.tags)) {
    for (const t of meta.tags) {
      if (typeof t === 'string' && t.length) meta_parts.push(`\`${mdText(t)}\``)
    }
  }
  const subHeading = meta_parts.length ? `<sup>${meta_parts.join(' · ')}</sup>` : ''

  const examples = (Array.isArray(meta.examples) ? meta.examples : [])
    .filter((u) => typeof u === 'string')
    .map((u) => `[${mdText(u)}](${safeEncodeURL(u)})`)
    .join(' · ')

  const sources = [
    svg ? `[svg](./${encodePath(svg)})` : null,
    png ? `[png](./${encodePath(png)})` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // Image is visible by default — that's the whole point of an art repo.
  // Wrapped in a paragraph with `align="center"` so it renders centered
  // when GitHub's column is wider than the image.
  const lines = [`### ${title}`, '']
  if (subHeading) {
    lines.push(subHeading, '')
  }
  lines.push(
    `<p align="center"><img src="${url}" alt="${alt}" /></p>`,
    '',
    desc,
    '',
    '**Markdown**',
    '',
    '```markdown',
    `![${altMd}](${url})`,
    '```',
    '',
    '**HTML**',
    '',
    '```html',
    `<img src="${url}" alt="${alt}" />`,
    '```',
    '',
    `📁 Sources: ${sources}`,
  )
  if (examples) lines.push(`🔗 Examples: ${examples}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * Extract the W and H from an SVG's `viewBox="0 0 W H"` so the README can
 * show dimensions next to each asset. Returns null on any parse failure —
 * the catalog still renders fine without a size hint.
 */
function readSvgDims(svgPath) {
  let txt
  try {
    txt = readFileSync(svgPath, 'utf-8')
  } catch {
    return null
  }
  const root = txt.match(/<svg\b[^>]*>/i)
  if (!root) return null
  const vb = root[0].match(/\bviewBox\s*=\s*(?:"([^"]+)"|'([^']+)')/i)
  if (!vb) return null
  const parts = (vb[1] ?? vb[2])
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  const [, , w, h] = parts
  if (w <= 0 || h <= 0) return null
  return { w: Math.round(w), h: Math.round(h) }
}

// ── User-string sanitization ──
// art.yaml is user-controlled. Sanitize before interpolating into markdown
// or HTML to prevent injection that breaks the README structure.

function mdText(s) {
  return String(s)
    .replace(/[\r\n]+/g, ' ')
    .trim()
}

function mdAlt(s) {
  // Markdown image alt-text: square-bracket and backtick are the special
  // chars that can break out of `![alt](...)`.
  return mdText(s).replace(/[[\]`]/g, '\\$&')
}

function htmlAttr(s) {
  return mdText(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  )
}

function encodePath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/')
}

/**
 * Encode a URL only if it isn't already a valid URL. Prevents
 * double-encoding cases where the user's `art.yaml` contains an already
 * percent-encoded URL like `https://x/%E2%9C%93` — `encodeURI` would
 * otherwise re-encode the `%` characters into `%25E2…`.
 */
function safeEncodeURL(u) {
  // If URL.canParse accepts it as-is, the URL is already well-formed
  // (and any percent-escapes are intentional). Otherwise re-encode.
  if (typeof URL.canParse === 'function' ? URL.canParse(u) : tryParse(u)) {
    return u
  }
  return encodeURI(u)
}

function tryParse(u) {
  try {
    return Boolean(new URL(u))
  } catch {
    return false
  }
}

function prettifyName(slug) {
  return slug
    .replace(/^banner_/, '')
    .replace(/^badge_/, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
