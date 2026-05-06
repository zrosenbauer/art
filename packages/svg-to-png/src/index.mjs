/**
 * @art/svg-to-png — browser-based SVG → PNG converter.
 *
 * Renders SVG files via Chromium (Playwright) at a configurable retina scale
 * and writes a sibling PNG alongside the source file. Handles unicode and
 * embedded fonts that librsvg/rsvg-convert can't.
 *
 * The renderer enforces the project's edge-to-edge viewBox rule: only SVGs
 * whose root element starts with `viewBox="0 0 W H"` are converted. SVGs
 * with offset viewBoxes are skipped with a warning, since the resulting
 * PNG would inherit the offset and bake padding into the asset.
 *
 * Security: SVGs are wrapped in an HTML document via `setContent`, so any
 * inline `<script>` tags would otherwise execute in the headless browser.
 * We strip them before rendering. SVGs in this repo are user-controlled,
 * but the same library may be used elsewhere — defence in depth.
 *
 * @module @art/svg-to-png
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  ;({ chromium } = await import('playwright-chromium'))
}

// Match the SVG root open tag, then parse viewBox from inside.
// Mirrors lint-viewbox.mjs so the converter and lint agree on what's valid.
const SVG_ROOT_RE = /<svg\b[^>]*>/i
const VIEWBOX_ATTR_RE = /\bviewBox\s*=\s*(?:"([^"]+)"|'([^']+)')/i
// Strip <script> elements (and their bodies) before rendering. Defence in
// depth — committed SVGs shouldn't have them, but third-party SVGs imported
// to art/ might.
const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi
const SCRIPT_SELF_CLOSING_RE = /<script\b[^>]*\/\s*>/gi

/**
 * Convert a single SVG file to a sibling PNG.
 * Spins up a fresh Chromium instance for the call. For batch conversion
 * use {@link convertAll} which amortizes the browser-launch cost.
 *
 * @param {string} svgPath  Absolute or CWD-relative path to the SVG.
 * @param {{ scale?: number }} [opts]  scale defaults to 2 (retina).
 * @returns {Promise<string | null>}   PNG path on success, null if skipped.
 */
export async function convertSvg(svgPath, opts = {}) {
  const browser = await chromium.launch()
  try {
    return await renderToPng(browser, svgPath, opts.scale ?? 2)
  } finally {
    await browser.close()
  }
}

/**
 * Convert many SVGs reusing one Chromium instance.
 * One-file failures are logged but do not abort the batch.
 *
 * @param {string[]} svgPaths
 * @param {{ scale?: number }} [opts]
 * @returns {Promise<string[]>}  list of written PNG paths (skipped/failed files omitted).
 */
export async function convertAll(svgPaths, opts = {}) {
  if (!svgPaths.length) return []
  const browser = await chromium.launch()
  const written = []
  try {
    for (const p of svgPaths) {
      try {
        const out = await renderToPng(browser, p, opts.scale ?? 2)
        if (out) written.push(out)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`  ⚠ ${p}: ${msg}`)
      }
    }
  } finally {
    await browser.close()
  }
  return written
}

async function renderToPng(browser, input, scale) {
  const svgPath = resolve(input)

  // Refuse anything that isn't a `.svg` source — otherwise `replace(/\.svg$/, '.png')`
  // would silently overwrite the input file with a PNG.
  if (!/\.svg$/i.test(svgPath)) {
    console.warn(`  ⚠ Skipping ${svgPath} — not a .svg file`)
    return null
  }
  const pngPath = svgPath.replace(/\.svg$/i, '.png')

  let svgContent
  try {
    svgContent = readFileSync(svgPath, 'utf-8')
  } catch (err) {
    console.warn(`  ⚠ Cannot read ${svgPath}: ${err.message}`)
    return null
  }

  // Find the root <svg> open tag and parse its viewBox.
  const rootMatch = svgContent.match(SVG_ROOT_RE)
  if (!rootMatch) {
    console.warn(`  ⚠ Skipping ${svgPath} — no <svg> root element`)
    return null
  }
  const vbMatch = rootMatch[0].match(VIEWBOX_ATTR_RE)
  if (!vbMatch) {
    console.warn(`  ⚠ Skipping ${svgPath} — no viewBox on <svg> root`)
    return null
  }
  const parts = (vbMatch[1] ?? vbMatch[2])
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    console.warn(`  ⚠ Skipping ${svgPath} — malformed viewBox`)
    return null
  }
  const [minX, minY, w, h] = parts
  if (minX !== 0 || minY !== 0 || w <= 0 || h <= 0) {
    console.warn(`  ⚠ Skipping ${svgPath} — viewBox not edge-to-edge "0 0 W H"`)
    return null
  }
  const width = Math.round(w)
  const height = Math.round(h)

  const safeSvg = svgContent.replace(SCRIPT_BLOCK_RE, '').replace(SCRIPT_SELF_CLOSING_RE, '')

  const page = await browser.newPage()
  try {
    await page.setViewportSize({ width: width * scale, height: height * scale })
    await page.setContent(
      `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { width: ${width * scale}px; height: ${height * scale}px; overflow: hidden; background: transparent; }
  svg { width: ${width * scale}px; height: ${height * scale}px; display: block; }
</style></head>
<body>${safeSvg}</body></html>`,
    )
    // Wait for any @font-face declarations to finish loading. Playwright's
    // page.evaluate auto-awaits a Promise returned by the page-side IIFE,
    // so resolving document.fonts.ready blocks until the FontFaceSet is
    // ready. If document.fonts is unavailable (very old engines), the
    // expression resolves to null immediately — acceptable since Playwright
    // ships a modern Chromium that always exposes the FontFaceSet API.
    await page.evaluate(() => (document.fonts && document.fonts.ready) || null)
    await page.screenshot({ path: pngPath, type: 'png', omitBackground: true })
  } finally {
    await page.close().catch(() => {})
  }

  console.log(`  ✓ ${pngPath}`)
  return pngPath
}
