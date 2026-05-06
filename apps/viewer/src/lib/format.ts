/**
 * Pure format helpers — direct ports of legacy asset-viewer logic.
 */
import type { TreeNode } from '@/server/scan'

/**
 * Pick the default display format for an asset.
 * Order: svg → png → first sorted key.
 * Mirrors asset-viewer.mjs line 62 and asset-viewer.client.js line 113.
 */
export function pickDefaultFormat(formats: Record<string, string>): string {
  const keys = Object.keys(formats)
  if (keys.includes('svg')) return 'svg'
  if (keys.includes('png')) return 'png'
  return keys.sort()[0] ?? ''
}

/**
 * Subsequence (fuzzy) match.
 * Returns true if every character of `query` appears in order inside `hay`.
 * Mirrors asset-viewer.client.js lines 160–167.
 */
export function fuzzyMatch(query: string, hay: string): boolean {
  if (!query) return true
  let qi = 0
  for (let i = 0; i < hay.length && qi < query.length; i++) {
    if (hay[i] === query[qi]) qi++
  }
  return qi === query.length
}

/**
 * Natural number-aware string compare.
 * Mirrors asset-viewer.mjs naturalCompare (lines 69–77).
 */
export function naturalCompare(a: string, b: string): number {
  const na = Number(a),
    nb = Number(b)
  const aIsNum = a !== '' && !isNaN(na)
  const bIsNum = b !== '' && !isNaN(nb)
  if (aIsNum && bIsNum) return na - nb
  if (aIsNum) return -1
  if (bIsNum) return 1
  return a.localeCompare(b)
}

/**
 * Count total assets in a tree node (recursive).
 * Mirrors asset-viewer.mjs countAssets (lines 101–105).
 */
export function countAssets(node: TreeNode): number {
  let n = node.items.length
  for (const c of node.children.values()) {
    n += countAssets(c)
  }
  return n
}

/**
 * Build the search haystack string for an asset (matches legacy data-search attr).
 * Pattern from asset-viewer.mjs line 113: `${name} ${fullPath || 'root'}`.toLowerCase()
 */
export function buildSearchHay(name: string, group: string): string {
  return `${name} ${group && group !== '.' ? group : 'root'}`.toLowerCase()
}

/**
 * Order format keys for display: svg first, png second, rest sorted alphabetically.
 * Mirrors asset-viewer.client.js renderFormatToggle ordering (lines 31–34).
 */
export function orderedFormats(formats: Record<string, string>): string[] {
  const keys = Object.keys(formats)
  const ordered: string[] = []
  if (keys.includes('svg')) ordered.push('svg')
  if (keys.includes('png')) ordered.push('png')
  for (const k of keys.sort()) if (!ordered.includes(k)) ordered.push(k)
  return ordered
}
