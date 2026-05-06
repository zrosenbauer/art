/**
 * Integration test for .claude/skills/svg-creator/scripts/lint-viewbox.mjs.
 * Spawns the script with a tmp file argument and asserts the exit code
 * + stderr.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const LINT = join(REPO_ROOT, '.claude', 'skills', 'svg-creator', 'scripts', 'lint-viewbox.mjs')

let WORK

beforeEach(async () => {
  WORK = await mkdtemp(join(tmpdir(), 'art-lint-vb-'))
})

afterEach(async () => {
  await rm(WORK, { recursive: true, force: true })
})

function run(...args) {
  return spawnSync(process.execPath, [LINT, ...args], { encoding: 'utf8' })
}

async function svg(name, content) {
  const path = join(WORK, name)
  await writeFile(path, content)
  return path
}

describe('lint-viewbox.mjs', () => {
  it('passes a well-formed edge-to-edge viewBox', async () => {
    const path = await svg(
      'good.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"></svg>',
    )
    const r = run(path)
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/✓ .*good\.svg/)
  })

  it('rejects an offset viewBox', async () => {
    const path = await svg(
      'bad.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="120 40 660 420" width="660" height="420"></svg>',
    )
    const r = run(path)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/must start with "0 0"/)
  })

  it('rejects a missing viewBox attribute', async () => {
    const path = await svg(
      'noviewbox.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>',
    )
    const r = run(path)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/no viewBox/)
  })

  it('rejects a malformed viewBox', async () => {
    const path = await svg(
      'malformed.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="abc def" width="1" height="1"></svg>',
    )
    const r = run(path)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/malformed/)
  })

  it('rejects non-positive dimensions', async () => {
    const path = await svg(
      'zero.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 50" width="0" height="50"></svg>',
    )
    const r = run(path)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/non-positive/)
  })

  it('accepts comma-separated viewBox values', async () => {
    const path = await svg(
      'commas.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,100,50" width="100" height="50"></svg>',
    )
    const r = run(path)
    expect(r.status).toBe(0)
  })

  it('accepts single-quoted viewBox attribute', async () => {
    const path = await svg(
      'singlequote.svg',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox='0 0 100 50' width='100' height='50'></svg>`,
    )
    const r = run(path)
    expect(r.status).toBe(0)
  })

  it('reports each file with pass/fail in summary', async () => {
    const a = await svg('a.svg', '<svg viewBox="0 0 1 1" width="1" height="1"></svg>')
    const b = await svg('b.svg', '<svg viewBox="10 10 1 1" width="1" height="1"></svg>')
    const r = run(a, b)
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/1\/2 passed/)
    expect(r.stdout).toMatch(/1 need fixing/)
  })

  it('exits 0 with friendly message when given an empty directory', async () => {
    const r = run(WORK)
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/no SVG files to check/)
  })
})
