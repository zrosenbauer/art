/**
 * Per-key in-process serialization for filesystem mutations.
 *
 * Two concurrent POSTs that target the same asset (e.g. an archive +
 * rename racing each other) are TOCTOU-prone — the `access()`
 * pre-checks in each route are not atomic with the subsequent
 * `fsRename`. Wrapping per-asset work in `withLock(key, fn)` chains
 * callers behind the same Promise, so the second one only runs after
 * the first finishes.
 *
 * Scope is per Node process. The viewer is a single-process dev server,
 * so this is sufficient for our threat model. A multi-process production
 * deploy would need a real lock (e.g. a sentinel file or a database
 * row) — out of scope here.
 *
 * Survives Vite HMR via globalThis stash so reloads don't lose pending
 * work.
 */

declare global {
  // eslint-disable-next-line no-var
  var __assetLockQueues: Map<string, Promise<unknown>> | undefined
}

const queues: Map<string, Promise<unknown>> = (globalThis.__assetLockQueues ??= new Map())

/**
 * Serialize work keyed by an opaque string. The next caller for the same
 * key waits for the current one to settle (resolved or rejected) before
 * its `fn` runs. Different keys never block each other.
 *
 * Note: `prev.then(fn, fn)` runs `fn` whether `prev` resolved or rejected.
 * That's intentional — we don't want one failing op to wedge the queue
 * for that key forever. Don't "fix" this to a single-arg `then`.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const next: Promise<T> = prev.then(fn, fn)
  queues.set(key, next)
  try {
    return await next
  } finally {
    // Best-effort cleanup: only delete if we're still the tail of the
    // queue. If a later caller already chained on top of us, leave the
    // entry in place so the chain stays intact.
    if (queues.get(key) === next) queues.delete(key)
  }
}

/**
 * Acquire multiple locks before running `fn`. Keys are sorted before
 * acquisition to give every caller a consistent global order — that's
 * what prevents the classic deadlock (caller A holds key1 and waits for
 * key2 while caller B holds key2 and waits for key1).
 *
 * Used by rename/move where the operation's source AND destination both
 * need protection from concurrent mutators.
 */
export async function withLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  const ordered = [...new Set(keys)].sort()
  const acquire = (i: number): Promise<T> => {
    if (i >= ordered.length) return fn()
    return withLock(ordered[i], () => acquire(i + 1))
  }
  return acquire(0)
}

/** Build a stable lock key for an asset. */
export function assetLockKey(group: string, name: string): string {
  // `:` is rejected by isValidSegment so this delimiter can't collide
  // with a legitimate segment value.
  return `asset:${group}::${name}`
}
