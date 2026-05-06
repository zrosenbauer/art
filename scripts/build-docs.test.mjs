/**
 * Integration test for scripts/build-docs.mjs.
 *
 * The script reads art/ from a fixed path (REPO_ROOT/art) and writes
 * REPO_ROOT/README.md. We can't easily redirect REPO_ROOT without
 * refactoring, so the test uses Node's child_process to spawn the
 * script with a temporary CWD via a shim, OR we test the underlying
 * helpers in isolation. Here we go a third route: spawn the script
 * with REPO_ROOT_OVERRIDE-style env vars by importing it as a module
 * after temporarily relocating the cwd-relative paths.
 *
 * Simpler approach: dynamic-import the script in a child Vitest worker
 * with a tmp REPO via process.chdir + monkey-patching of REPO_ROOT.
 *
 * Easiest of all: spawn `node build-docs.mjs` as a subprocess, with
 * env that points it at a tmp dir. That requires the script to honor
 * an env override. It currently uses `resolve(__dirname, '..')` which
 * is fixed.
 *
 * For test purposes we'll set up a fixture under a tmp dir and
 * invoke a copied build-docs against it. Cleanest way is to just
 * test the FUNCTIONALITY (yaml parsing, sub-heading rendering,
 * encoding) via a minimal harness that dynamic-imports the script
 * after redirecting the working directory. Since build-docs is one
 * file with no deep imports we can just spawn it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const BUILD_DOCS = join(REPO_ROOT, 'scripts', 'build-docs.mjs')

let WORK_REPO

beforeEach(async () => {
  WORK_REPO = await mkdtemp(join(tmpdir(), 'art-builddocs-'))
  // Mirror the layout build-docs expects.
  await mkdir(join(WORK_REPO, 'art', 'banners'), { recursive: true })
  await mkdir(join(WORK_REPO, 'scripts', 'templates'), { recursive: true })

  // Copy templates into the tmp repo so build-docs finds them.
  const headerSrc = await readFile(join(REPO_ROOT, 'scripts', 'templates', 'header.md'), 'utf8')
  const footerSrc = await readFile(join(REPO_ROOT, 'scripts', 'templates', 'footer.md'), 'utf8')
  await writeFile(join(WORK_REPO, 'scripts', 'templates', 'header.md'), headerSrc)
  await writeFile(join(WORK_REPO, 'scripts', 'templates', 'footer.md'), footerSrc)
})

afterEach(async () => {
  await rm(WORK_REPO, { recursive: true, force: true })
})

/**
 * Run scripts/build-docs.mjs against the tmp repo. The script computes
 * REPO_ROOT from its own location, so we COPY the script (and its
 * dependency on `js-yaml`) into the tmp repo and exec it there. To
 * keep the test cheap we instead run the original script with
 * `process.chdir(WORK_REPO)` + an --output-target flag — but the
 * script has no such flag. So we copy.
 */
async function runBuildDocs(args = []) {
  await writeFile(join(WORK_REPO, 'scripts', 'build-docs.mjs'), await readFile(BUILD_DOCS, 'utf8'))
  // Symlink node_modules so js-yaml resolves.
  const { symlink } = await import('node:fs/promises')
  await symlink(join(REPO_ROOT, 'node_modules'), join(WORK_REPO, 'node_modules'), 'dir').catch(
    () => {},
  )
  const result = spawnSync(
    process.execPath,
    [join(WORK_REPO, 'scripts', 'build-docs.mjs'), ...args],
    {
      cwd: WORK_REPO,
      encoding: 'utf8',
      env: process.env,
    },
  )
  return result
}

async function makeAsset(group, name, yaml, png = true) {
  const dir = join(WORK_REPO, 'art', group, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'art.yaml'), yaml)
  if (png) await writeFile(join(dir, `${name}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
}

describe('build-docs.mjs', () => {
  it('writes README.md from a fixture art/ tree', async () => {
    await makeAsset(
      'banners',
      'banner_demo',
      'title: Demo\ndescription: A demo banner.\ntags: [banner]\n',
    )

    const r = await runBuildDocs()
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/wrote .*README\.md/)

    const readme = await readFile(join(WORK_REPO, 'README.md'), 'utf8')
    expect(readme).toMatch(/## Catalog/)
    expect(readme).toMatch(/### Demo/)
    expect(readme).toMatch(/A demo banner\./)
    expect(readme).toMatch(/banners\/banner_demo\/banner_demo\.png/)
    expect(readme).toMatch(/<!-- BEGIN CATALOG/)
    expect(readme).toMatch(/<!-- END CATALOG -->/)
  })

  it('--check returns 0 when README is in sync, 1 when stale', async () => {
    await makeAsset('banners', 'banner_demo', 'title: Demo\n')

    // First write
    const w = await runBuildDocs()
    expect(w.status).toBe(0)

    // Now --check should pass
    const ok = await runBuildDocs(['--check'])
    expect(ok.status).toBe(0)
    expect(ok.stdout).toMatch(/up to date/)

    // Edit the yaml to make the catalog stale
    await writeFile(
      join(WORK_REPO, 'art', 'banners', 'banner_demo', 'art.yaml'),
      'title: NewTitle\n',
    )
    const stale = await runBuildDocs(['--check'])
    expect(stale.status).toBe(1)
    expect(stale.stderr).toMatch(/stale/)
  })

  it('escapes user-provided strings to prevent markdown/HTML injection', async () => {
    await makeAsset(
      'banners',
      'evil',
      'title: Bad"Title<x>\ndescription: line one\\nline two\nalt: a"b\n',
    )

    const r = await runBuildDocs()
    expect(r.status).toBe(0)
    const readme = await readFile(join(WORK_REPO, 'README.md'), 'utf8')

    // HTML <img alt="…"> must have entities, not raw `"` or `<`.
    expect(readme).toMatch(/alt="a&quot;b"|alt="a&#34;b"/)
    expect(readme).not.toMatch(/<img src="[^"]*" alt="a"b" \/>/)
  })

  it('skips an asset directory whose only file is art.yaml', async () => {
    // No png, no svg → directory has only the metadata.
    await makeAsset('banners', 'metaonly', 'title: Empty\n', /* png */ false)

    const r = await runBuildDocs()
    expect(r.status).toBe(0)
    const readme = await readFile(join(WORK_REPO, 'README.md'), 'utf8')
    expect(readme).not.toMatch(/### Empty/)
  })

  it('emits the empty-catalog placeholder when art/ is empty', async () => {
    const r = await runBuildDocs()
    expect(r.status).toBe(0)
    const readme = await readFile(join(WORK_REPO, 'README.md'), 'utf8')
    expect(readme).toMatch(/no assets yet/)
  })
})
