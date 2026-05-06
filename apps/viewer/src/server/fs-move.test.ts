import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { moveDir } from './fs-move'

let WORK: string

beforeEach(async () => {
  WORK = await mkdtemp(join(tmpdir(), 'art-fs-move-'))
})

afterEach(async () => {
  await rm(WORK, { recursive: true, force: true })
})

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

describe('moveDir', () => {
  it('renames a directory in place when src and dst are on the same device', async () => {
    const src = join(WORK, 'src')
    const dst = join(WORK, 'dst')
    await mkdir(src, { recursive: true })
    await writeFile(join(src, 'a.txt'), 'hello')

    await moveDir(src, dst)

    expect(await exists(src)).toBe(false)
    expect(await exists(dst)).toBe(true)
    expect((await readFile(join(dst, 'a.txt'), 'utf8')).toString()).toBe('hello')
  })

  it('preserves nested file structure', async () => {
    const src = join(WORK, 'src')
    const dst = join(WORK, 'dst')
    await mkdir(join(src, 'sub'), { recursive: true })
    await writeFile(join(src, 'sub', 'deep.txt'), 'nested')
    await writeFile(join(src, 'top.txt'), 'top')

    await moveDir(src, dst)

    expect(await readFile(join(dst, 'top.txt'), 'utf8')).toBe('top')
    expect(await readFile(join(dst, 'sub', 'deep.txt'), 'utf8')).toBe('nested')
  })

  it('throws ENOENT when src does not exist', async () => {
    await expect(moveDir(join(WORK, 'missing'), join(WORK, 'dst'))).rejects.toThrow(/ENOENT/)
  })

  it('throws when dst already exists and is non-empty', async () => {
    // POSIX rename(2) on a non-empty existing directory fails with
    // ENOTEMPTY. Confirms moveDir surfaces that rather than silently
    // merging (the caller is expected to access()-check first).
    const src = join(WORK, 'src')
    const dst = join(WORK, 'dst')
    await mkdir(src, { recursive: true })
    await writeFile(join(src, 'a.txt'), 'src')
    await mkdir(dst, { recursive: true })
    await writeFile(join(dst, 'b.txt'), 'dst')

    await expect(moveDir(src, dst)).rejects.toThrow()
  })
})
