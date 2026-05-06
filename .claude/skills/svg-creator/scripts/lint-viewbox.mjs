#!/usr/bin/env node
// Strict viewBox lint for SVG assets in this art repo.
//
// Enforces the AGENTS.md "Image / Asset Generation" rule: the viewBox must
// start at "0 0" and equal the actual content extents — no offsets, no
// padding. Padding baked into an asset cannot be removed downstream and
// breaks alignment in any layout that consumes it.
//
// Usage:
//   node lint-viewbox.mjs <path>...   # check one or more SVG files
//   node lint-viewbox.mjs <dir>       # recursively check all .svg under <dir>
//
// Exit codes: 0 = all pass, 1 = at least one failure, 2 = bad invocation.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, extname, relative } from 'node:path'

const args = process.argv.slice(2)
if (!args.length) {
  console.error('usage: lint-viewbox.mjs <svg-or-dir>...')
  process.exit(2)
}

const SKIP_DIRS = new Set(['node_modules', 'scripts', '_legacy'])

const targets = []
for (const arg of args) {
  const abs = resolve(arg)
  let s
  try {
    s = statSync(abs)
  } catch (err) {
    console.error(`✗ cannot stat ${arg}: ${err.message}`)
    process.exit(2)
  }
  if (s.isDirectory()) targets.push(...findSvgs(abs))
  else if (extname(abs).toLowerCase() === '.svg') targets.push(abs)
  else console.error(`  (skipping non-svg: ${arg})`)
}

if (!targets.length) {
  console.log('no SVG files to check')
  process.exit(0)
}

let failures = 0
for (const path of targets) {
  if (!check(path)) failures++
}

const total = targets.length
const passed = total - failures
console.log(`\n${passed}/${total} passed${failures ? ` — ${failures} need fixing` : ''}`)
process.exit(failures ? 1 : 0)

// ---------------------------------------------------------------------------

function findSvgs(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) out.push(...findSvgs(full))
    else if (extname(entry).toLowerCase() === '.svg') out.push(full)
  }
  return out
}

function check(path) {
  const rel = relative(process.cwd(), path)
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch (err) {
    console.error(`✗ ${rel}: cannot read (${err.message})`)
    return false
  }

  const open = content.match(/<svg\b[^>]*>/i)
  if (!open) {
    console.error(`✗ ${rel}: no <svg> element found`)
    return false
  }
  const tag = open[0]

  const vb = tag.match(/\bviewBox\s*=\s*"([^"]+)"/i) ?? tag.match(/\bviewBox\s*=\s*'([^']+)'/i)
  if (!vb) {
    console.error(`✗ ${rel}: <svg> has no viewBox attribute`)
    console.error(`  Fix: add viewBox="0 0 W H" matching the drawn content's bounding box.`)
    return false
  }

  const parts = vb[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    console.error(`✗ ${rel}: malformed viewBox "${vb[1]}"`)
    return false
  }

  const [minX, minY, w, h] = parts
  if (minX !== 0 || minY !== 0) {
    console.error(`✗ ${rel}: viewBox must start with "0 0" — got "${parts.join(' ')}"`)
    console.error(
      `  Fix: shift all content so its bounding box is at (0, 0), then set viewBox="0 0 ${w} ${h}".`,
    )
    console.error(
      `  Why: an offset viewBox bakes empty pixels into the asset. AGENTS.md "Image / Asset Generation" forbids it.`,
    )
    return false
  }
  if (w <= 0 || h <= 0) {
    console.error(`✗ ${rel}: viewBox has non-positive dimensions ${w}×${h}`)
    return false
  }

  console.log(`✓ ${rel}  (${w}×${h})`)
  return true
}
