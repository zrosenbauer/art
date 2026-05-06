import { rename as fsRename, cp, rm } from 'node:fs/promises'

/**
 * Move a directory atomically. Tries `rename` first (single fs syscall);
 * on `EXDEV` (cross-device move) falls back to a tmp-dir copy + rename
 * + source-rm sequence so partial failures never leave both src and dst
 * populated:
 *
 *   1. cp -r  src       → dst.tmp-<pid>-<ts>     (could fail mid-copy → tmp gets cleaned)
 *   2. rename dst.tmp   → dst                    (atomic on the dst device)
 *   3. rm -r  src                                (only after dst is in place)
 *
 * Step 3 failing is the only way to end up with files at both locations,
 * and the failure is surfaced (not swallowed). If the caller retries, the
 * subsequent `cp` to a fresh tmp succeeds because dst already exists, but
 * we want callers to see the failure rather than ignore it — they can
 * decide whether to clean up.
 */
export async function moveDir(src: string, dst: string): Promise<void> {
  try {
    await fsRename(src, dst)
    return
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
  }

  // Cross-device fallback. tmp lives next to dst (same filesystem) so the
  // tmp→dst rename is atomic.
  const tmp = `${dst}.tmp-${process.pid}-${Date.now()}`
  try {
    await cp(src, tmp, { recursive: true, errorOnExist: true, force: false })
    await fsRename(tmp, dst)
  } catch (err) {
    // Clean up tmp on any partial-copy failure. force:true so we don't
    // throw if tmp doesn't exist yet.
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    throw err
  }
  // Only remove the source after dst is fully in place. If THIS step
  // fails, the asset now exists at BOTH locations — surface that loudly
  // so the caller can manually clean up `src`. We do NOT try to roll back
  // by deleting `dst` here, because that's the side that's verified
  // intact.
  try {
    await rm(src, { recursive: true, force: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `moveDir: dst written successfully but source removal failed (${msg}). ` +
        `Asset now exists at BOTH ${src} and ${dst} — manually remove the source.`,
      { cause: err },
    )
  }
}
