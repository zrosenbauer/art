import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { scanScope, scanArchive, getArtRoot } from './scan'

let TMP_ART: string

beforeEach(async () => {
  TMP_ART = await mkdtemp(join(tmpdir(), 'art-scan-'))
  process.env.ART_ROOT_OVERRIDE = TMP_ART
})

afterEach(async () => {
  delete process.env.ART_ROOT_OVERRIDE
  await rm(TMP_ART, { recursive: true, force: true })
})

/** Build a minimal asset directory with an art.yaml + a single SVG. */
async function makeAsset(
  group: string,
  name: string,
  opts: { yaml?: string; svg?: string; png?: boolean } = {},
): Promise<string> {
  const dir = group === '.' ? join(TMP_ART, name) : join(TMP_ART, group, name)
  await mkdir(dir, { recursive: true })
  if (opts.yaml !== undefined) {
    await writeFile(join(dir, 'art.yaml'), opts.yaml)
  }
  if (opts.svg !== undefined) {
    await writeFile(join(dir, `${name}.svg`), opts.svg)
  }
  if (opts.png) {
    // Tiny valid PNG header so consumers don't choke. We don't actually
    // decode it.
    await writeFile(join(dir, `${name}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  }
  return dir
}

function flatTreeNames(tree: {
  items: { name: string }[]
  children: Map<string, unknown>
}): string[] {
  const out = tree.items.map((i) => i.name)
  for (const c of tree.children.values()) {
    out.push(...flatTreeNames(c as { items: { name: string }[]; children: Map<string, unknown> }))
  }
  return out
}

describe('getArtRoot()', () => {
  it('honors ART_ROOT_OVERRIDE', () => {
    expect(getArtRoot()).toBe(TMP_ART)
  })
})

describe('scanScope', () => {
  it('returns an empty tree when art/ is empty', async () => {
    const tree = await scanScope('all')
    expect(flatTreeNames(tree)).toEqual([])
  })

  it('detects an asset dir with art.yaml + svg', async () => {
    await makeAsset('banners', 'banner_test', {
      yaml: 'title: Test\ndescription: A test\n',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"></svg>',
    })

    const tree = await scanScope('all')
    expect(flatTreeNames(tree)).toEqual(['banner_test'])

    // Walk into banners → first asset
    const banners = tree.children.get('banners')!
    const asset = banners.items[0]
    expect(asset.name).toBe('banner_test')
    expect(asset.group).toBe('banners')
    expect(asset.formats.svg).toBe('banners/banner_test/banner_test.svg')
    expect(asset.meta.title).toBe('Test')
    expect(asset.meta.description).toBe('A test')
  })

  it('detects an asset dir without art.yaml when name.<ext> exists', async () => {
    await makeAsset('badges', 'plain', { png: true })
    const tree = await scanScope('all')
    expect(flatTreeNames(tree)).toEqual(['plain'])
    const asset = tree.children.get('badges')!.items[0]
    expect(asset.formats.png).toBe('badges/plain/plain.png')
    expect(asset.meta).toEqual({})
  })

  it('treats a non-object yaml as empty meta', async () => {
    await makeAsset('banners', 'foo', { yaml: '"just a string"\n', png: true })
    const tree = await scanScope('all')
    const asset = tree.children.get('banners')!.items[0]
    expect(asset.meta).toEqual({})
  })

  it('skips reserved directories (.archive, .git, node_modules, _legacy, dotfiles)', async () => {
    await mkdir(join(TMP_ART, '.archive'), { recursive: true })
    await mkdir(join(TMP_ART, '.git'), { recursive: true })
    await mkdir(join(TMP_ART, 'node_modules'), { recursive: true })
    await mkdir(join(TMP_ART, '_legacy'), { recursive: true })
    await mkdir(join(TMP_ART, '.hidden'), { recursive: true })
    await makeAsset('.git', 'evil', { png: true })
    await makeAsset('.archive', 'evil', { png: true })
    await makeAsset('node_modules', 'evil', { png: true })
    await makeAsset('_legacy', 'evil', { png: true })
    await makeAsset('.hidden', 'evil', { png: true })

    const tree = await scanScope('all')
    expect(flatTreeNames(tree)).toEqual([])
  })

  it('does not follow symlinks', async () => {
    // Real asset…
    await makeAsset('banners', 'real', { png: true })
    // …plus a symlink-as-dir pointing OUTSIDE the art root.
    const outside = await mkdtemp(join(tmpdir(), 'art-outside-'))
    await mkdir(join(outside, 'leak'), { recursive: true })
    await writeFile(join(outside, 'leak', 'leak.png'), 'pwned')

    const linkPath = join(TMP_ART, 'evil')
    await symlink(outside, linkPath, 'dir')

    const tree = await scanScope('all')

    // Only the real asset is found — the symlink target isn't walked.
    expect(flatTreeNames(tree)).toEqual(['real'])

    await rm(outside, { recursive: true, force: true })
  })

  it('skips an asset directory whose only files have unrecognized extensions', async () => {
    const dir = join(TMP_ART, 'banners', 'oops')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'oops.txt'), 'not an asset')
    // No art.yaml AND no recognized format → not an asset.
    const tree = await scanScope('all')
    expect(flatTreeNames(tree)).toEqual([])
  })

  it('does not surface an asset directory with art.yaml but zero format files', async () => {
    const dir = join(TMP_ART, 'banners', 'metaonly')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'art.yaml'), 'title: x\n')
    const tree = await scanScope('all')
    expect(flatTreeNames(tree)).toEqual([])
  })
})

describe('scanArchive', () => {
  it('returns empty when .archive/ is missing', async () => {
    const tree = await scanArchive('all')
    expect(flatTreeNames(tree)).toEqual([])
  })

  it('walks .archive/ with the same directory-as-asset rules', async () => {
    // Live tree
    await makeAsset('banners', 'live', { png: true })
    // Archived asset
    await mkdir(join(TMP_ART, '.archive', 'banners', 'old'), { recursive: true })
    await writeFile(join(TMP_ART, '.archive', 'banners', 'old', 'old.png'), 'archived')

    const live = await scanScope('all')
    expect(flatTreeNames(live)).toEqual(['live'])

    const archived = await scanArchive('all')
    expect(flatTreeNames(archived)).toEqual(['old'])
    // Group is prefixed with .archive/
    const archiveCategory = archived.children.get('.archive')!.children.get('banners')!
    expect(archiveCategory.items[0].group).toBe('.archive/banners')
    expect(archiveCategory.items[0].formats.png).toBe('.archive/banners/old/old.png')
  })
})
