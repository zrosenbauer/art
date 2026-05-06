import { sep, resolve } from 'node:path'
import { rootForScope } from './scan'
import type { Scope } from './scan'
import { isValidSegment as universalIsValidSegment, isValidGroupPath } from '@/lib/asset-paths'

/**
 * Validate that a scope string is well-formed.
 * Flat repo only knows the 'all' scope.
 */
export function parseScope(raw: unknown): Scope | null {
  if (raw === 'all' || raw == null || raw === '') return 'all'
  if (typeof raw !== 'string') return null
  return raw === 'all' ? 'all' : null
}

/**
 * Re-export `isValidSegment` from the shared lib so server consumers
 * don't have to know about the universal module. Adding a server-only
 * tightening on top of this is the natural extension point if we ever
 * need it.
 */
export const isValidSegment = universalIsValidSegment
export { isValidGroupPath }

export function isSafeChild(resolvedPath: string, scopeRoot: string): boolean {
  return resolvedPath.startsWith(scopeRoot + sep) || resolvedPath === scopeRoot
}

export function safeResolve(scopeRoot: string, ...parts: string[]): string | null {
  const abs = resolve(scopeRoot, ...parts)
  if (!isSafeChild(abs, scopeRoot)) return null
  return abs
}

export function getScopeRoot(rawScope: unknown): { scope: Scope; scopeRoot: string } | null {
  const scope = parseScope(rawScope)
  if (!scope) return null
  try {
    const scopeRoot = rootForScope(scope)
    return { scope, scopeRoot }
  } catch {
    return null
  }
}
