#!/usr/bin/env node
/**
 * svg-to-png CLI — convert one or more SVGs to PNG (2× scale).
 *
 * Usage:
 *   svg-to-png path/to/banner.svg [more/banners.svg ...]
 *   svg-to-png --scale=3 path/to/banner.svg
 *
 * Exit codes:
 *   0 — success (all files converted or non-fatal skips)
 *   1 — fatal error (could not launch browser, etc.)
 *   2 — bad invocation (unknown flag, invalid scale)
 */

import { convertAll } from './src/index.mjs'

const args = process.argv.slice(2)
const targets = []
let scale = 2

for (const a of args) {
  if (a === '-h' || a === '--help') {
    printHelp()
    process.exit(0)
  } else if (a.startsWith('--scale=')) {
    const n = Number(a.slice('--scale='.length))
    if (!Number.isFinite(n) || n <= 0) {
      console.error(`Invalid scale: ${a}`)
      process.exit(2)
    }
    scale = n
  } else if (a.startsWith('-')) {
    console.error(`Unknown flag: ${a}`)
    printHelp()
    process.exit(2)
  } else {
    targets.push(a)
  }
}

if (!targets.length) {
  printHelp()
  process.exit(0)
}

try {
  const written = await convertAll(targets, { scale })
  console.log(`\n  ${written.length} file${written.length !== 1 ? 's' : ''} converted`)
  process.exit(0)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`\n  ✗ fatal: ${msg}`)
  process.exit(1)
}

function printHelp() {
  console.log('Usage: svg-to-png <path>... [--scale=N]')
  console.log('Convert one or more SVG files to PNG siblings (2× scale by default).')
  console.log('Only SVGs whose root viewBox begins with "0 0 W H" are converted.')
}
