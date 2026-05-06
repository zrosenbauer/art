/**
 * End-to-end tests against the API route handlers.
 *
 * Each test sets `ART_ROOT_OVERRIDE` to a fresh tmp dir, populates it
 * with an asset tree, then invokes the route handler with a `Request`
 * object and asserts the on-disk state and JSON response. Real I/O,
 * no mocking — that's the point of testing these.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Route as ArchiveRoute } from './archive'
import { Route as RestoreRoute } from './restore'
import { Route as MoveRoute } from './move'
import { Route as RenameRoute } from './rename'
import { Route as AssetRoute } from './asset.$'

let TMP_ART: string

beforeEach(async () => {
  TMP_ART = await mkdtemp(join(tmpdir(), 'art-routes-'))
  process.env.ART_ROOT_OVERRIDE = TMP_ART
})

afterEach(async () => {
  delete process.env.ART_ROOT_OVERRIDE
  await rm(TMP_ART, { recursive: true, force: true })
})

// TanStack Start exposes handlers under `Route.options.server.handlers`.
// We extract the POST/GET handler at test time so a future API change
// doesn't silently fall back to a stale shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(route: any, method: 'POST' | 'GET') {
  const handler = route?.options?.server?.handlers?.[method]
  if (typeof handler !== 'function') {
    throw new Error(`route handler ${method} not exposed under Route.options.server.handlers`)
  }
  return handler as (ctx: { request: Request; params: { _splat?: string } }) => Promise<Response>
}

const archiveHandler = pick(ArchiveRoute, 'POST')
const restoreHandler = pick(RestoreRoute, 'POST')
const moveHandler = pick(MoveRoute, 'POST')
const renameHandler = pick(RenameRoute, 'POST')
const assetHandler = pick(AssetRoute, 'GET')

async function makeAsset(group: string, name: string, opts: { png?: boolean; svg?: string } = {}) {
  const dir = group === '.' ? join(TMP_ART, name) : join(TMP_ART, group, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'art.yaml'), `title: ${name}\n`)
  if (opts.png !== false) {
    await writeFile(join(dir, `${name}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  }
  if (opts.svg !== undefined) {
    await writeFile(join(dir, `${name}.svg`), opts.svg)
  }
  return dir
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/archive', () => {
  it('moves an asset directory into .archive/<group>/', async () => {
    await makeAsset('banners', 'foo')
    const res = await archiveHandler({
      request: postJson('http://x/api/archive', {
        scope: 'all',
        items: [{ group: 'banners', name: 'foo' }],
      }),
      params: {},
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.results[0].ok).toBe(true)
    expect(await exists(join(TMP_ART, 'banners', 'foo'))).toBe(false)
    expect(await exists(join(TMP_ART, '.archive', 'banners', 'foo'))).toBe(true)
  })

  it('rejects an item whose name contains `:` (lock-key delimiter)', async () => {
    await makeAsset('banners', 'foo')
    const res = await archiveHandler({
      request: postJson('http://x/api/archive', {
        scope: 'all',
        items: [{ group: 'banners', name: 'foo:bar' }],
      }),
      params: {},
    })
    const body = await res.json()
    expect(body.results[0].ok).toBe(false)
    expect(body.results[0].error).toMatch(/invalid group or name/)
  })

  it('rejects an item whose name traverses', async () => {
    await makeAsset('banners', 'foo')
    const res = await archiveHandler({
      request: postJson('http://x/api/archive', {
        scope: 'all',
        items: [{ group: 'banners', name: '../leak' }],
      }),
      params: {},
    })
    const body = await res.json()
    expect(body.results[0].ok).toBe(false)
  })

  it('returns 400 on invalid scope', async () => {
    const res = await archiveHandler({
      request: postJson('http://x/api/archive', { scope: 'global', items: [] }),
      params: {},
    })
    expect(res.status).toBe(400)
  })

  it('refuses to clobber an existing archived directory', async () => {
    await makeAsset('banners', 'foo')
    // Pre-populate .archive/banners/foo to simulate a prior archive.
    await mkdir(join(TMP_ART, '.archive', 'banners', 'foo'), { recursive: true })
    await writeFile(join(TMP_ART, '.archive', 'banners', 'foo', 'foo.png'), 'old')

    const res = await archiveHandler({
      request: postJson('http://x/api/archive', {
        scope: 'all',
        items: [{ group: 'banners', name: 'foo' }],
      }),
      params: {},
    })
    const body = await res.json()
    expect(body.results[0].ok).toBe(false)
    expect(body.results[0].error).toMatch(/already exists/)
    // Source still intact (didn't get swallowed).
    expect(await exists(join(TMP_ART, 'banners', 'foo'))).toBe(true)
  })
})

describe('POST /api/restore', () => {
  it('round-trips an archived asset back to its live group', async () => {
    await makeAsset('banners', 'foo')
    // Archive
    await archiveHandler({
      request: postJson('http://x/api/archive', {
        scope: 'all',
        items: [{ group: 'banners', name: 'foo' }],
      }),
      params: {},
    })
    // Restore
    const res = await restoreHandler({
      request: postJson('http://x/api/restore', {
        scope: 'all',
        items: [{ group: 'banners', name: 'foo' }],
      }),
      params: {},
    })
    const body = await res.json()
    expect(body.results[0].ok).toBe(true)
    expect(await exists(join(TMP_ART, 'banners', 'foo'))).toBe(true)
    expect(await exists(join(TMP_ART, '.archive', 'banners', 'foo'))).toBe(false)
  })

  it('strips a `.archive/` prefix from the group', async () => {
    await makeAsset('banners', 'foo')
    await archiveHandler({
      request: postJson('http://x/api/archive', {
        scope: 'all',
        items: [{ group: 'banners', name: 'foo' }],
      }),
      params: {},
    })

    // Client sends `group: '.archive/banners'` (the way the tree
    // displays archived assets). Server should normalize.
    const res = await restoreHandler({
      request: postJson('http://x/api/restore', {
        scope: 'all',
        items: [{ group: '.archive/banners', name: 'foo' }],
      }),
      params: {},
    })
    const body = await res.json()
    expect(body.results[0].ok).toBe(true)
    expect(await exists(join(TMP_ART, 'banners', 'foo'))).toBe(true)
  })
})

describe('POST /api/rename', () => {
  it('renames the asset directory + every name.<ext> inside it', async () => {
    await makeAsset('banners', 'old', {
      svg: '<svg viewBox="0 0 1 1"/>',
    })

    const res = await renameHandler({
      request: postJson('http://x/api/rename', {
        scope: 'all',
        group: 'banners',
        name: 'old',
        newName: 'new',
      }),
      params: {},
    })
    expect(res.status).toBe(200)

    expect(await exists(join(TMP_ART, 'banners', 'old'))).toBe(false)
    expect(await exists(join(TMP_ART, 'banners', 'new'))).toBe(true)
    expect(await exists(join(TMP_ART, 'banners', 'new', 'new.png'))).toBe(true)
    expect(await exists(join(TMP_ART, 'banners', 'new', 'new.svg'))).toBe(true)
    // art.yaml is left alone (not name-renamed)
    expect(await exists(join(TMP_ART, 'banners', 'new', 'art.yaml'))).toBe(true)
  })

  it('returns 409 when the destination already exists', async () => {
    await makeAsset('banners', 'src')
    await makeAsset('banners', 'dst')

    const res = await renameHandler({
      request: postJson('http://x/api/rename', {
        scope: 'all',
        group: 'banners',
        name: 'src',
        newName: 'dst',
      }),
      params: {},
    })
    expect(res.status).toBe(409)
    // Source unchanged.
    expect(await exists(join(TMP_ART, 'banners', 'src'))).toBe(true)
  })

  it('rejects newName containing `:`', async () => {
    await makeAsset('banners', 'src')
    const res = await renameHandler({
      request: postJson('http://x/api/rename', {
        scope: 'all',
        group: 'banners',
        name: 'src',
        newName: 'a:b',
      }),
      params: {},
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/move', () => {
  it('moves an asset to a different group', async () => {
    await makeAsset('banners', 'foo')

    const res = await moveHandler({
      request: postJson('http://x/api/move', {
        scope: 'all',
        group: 'banners',
        name: 'foo',
        newGroup: 'misc',
      }),
      params: {},
    })
    expect(res.status).toBe(200)
    expect(await exists(join(TMP_ART, 'banners', 'foo'))).toBe(false)
    expect(await exists(join(TMP_ART, 'misc', 'foo'))).toBe(true)
  })

  it('rejects newGroup `.archive`', async () => {
    await makeAsset('banners', 'foo')
    const res = await moveHandler({
      request: postJson('http://x/api/move', {
        scope: 'all',
        group: 'banners',
        name: 'foo',
        newGroup: '.archive',
      }),
      params: {},
    })
    expect(res.status).toBe(400)
  })

  it('rejects newGroup with a traversal segment', async () => {
    await makeAsset('banners', 'foo')
    const res = await moveHandler({
      request: postJson('http://x/api/move', {
        scope: 'all',
        group: 'banners',
        name: 'foo',
        newGroup: 'misc/..',
      }),
      params: {},
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/asset/$', () => {
  it('serves a recognized image format', async () => {
    await makeAsset('banners', 'foo')
    const res = await assetHandler({
      request: new Request('http://x/api/asset/all/banners/foo/foo.png'),
      params: { _splat: 'all/banners/foo/foo.png' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 403 for non-image extensions (e.g. art.yaml)', async () => {
    await makeAsset('banners', 'foo')
    const res = await assetHandler({
      request: new Request('http://x/api/asset/all/banners/foo/art.yaml'),
      params: { _splat: 'all/banners/foo/art.yaml' },
    })
    expect(res.status).toBe(403)
  })

  it('returns 403 for a symlink whose target escapes art/', async () => {
    // Drop a .png-named symlink inside art/ that points OUTSIDE the
    // root. realpath should resolve it and the handler should refuse.
    const outside = await mkdtemp(join(tmpdir(), 'art-outside-'))
    await writeFile(join(outside, 'secret.png'), 'pwned')

    const linkPath = join(TMP_ART, 'banners', 'evil.png')
    await mkdir(join(TMP_ART, 'banners'), { recursive: true })
    await symlink(join(outside, 'secret.png'), linkPath, 'file')

    const res = await assetHandler({
      request: new Request('http://x/api/asset/all/banners/evil.png'),
      params: { _splat: 'all/banners/evil.png' },
    })
    expect(res.status).toBe(403)

    await rm(outside, { recursive: true, force: true })
  })

  it('returns 400 for an empty path', async () => {
    const res = await assetHandler({
      request: new Request('http://x/api/asset/'),
      params: { _splat: '' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a missing file with a recognized extension', async () => {
    const res = await assetHandler({
      request: new Request('http://x/api/asset/all/banners/missing/missing.png'),
      params: { _splat: 'all/banners/missing/missing.png' },
    })
    expect(res.status).toBe(404)
  })
})
