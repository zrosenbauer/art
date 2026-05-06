/**
 * Universal path-segment validation, shared by server (`validate.ts`) and
 * client (`MoveToDialog.tsx`).
 *
 * Has no Node imports so it's safe in the browser. The server adds
 * filesystem-level guards (path-traversal resolution, scope resolution)
 * on top of these checks; the client uses them to give users immediate
 * inline feedback before submitting to the server.
 *
 * Keeping these rules in ONE module is what stops server and client
 * validators from drifting apart.
 */

/**
 * Reject these single-component values outright. Used by both server and
 * client validators.
 */
const RESERVED_SEGMENTS = new Set(['', '.', '..', '.archive'])

/**
 * Validate a SINGLE path component — no separators, no traversal, no
 * control chars, no characters that would break our internal lock-key
 * encoding.
 *
 * Rejected:
 * - empty string, `.`, `..`, `.archive`
 * - any `/` or `\` (separator — would make the segment traverse)
 * - `..` substring (parent-dir traversal even with no separator)
 * - `:` (lock-key delimiter — see server/locks.ts)
 * - control chars (NUL through \x1f)
 */
export function isValidSegment(s: unknown): s is string {
  if (typeof s !== 'string') return false
  if (RESERVED_SEGMENTS.has(s)) return false
  if (s.includes('/') || s.includes('\\')) return false
  if (s.includes('..')) return false
  if (s.includes(':')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(s)) return false
  return true
}

/**
 * Validate a multi-component group path (e.g. `move`'s `newGroup`).
 * Splits on `/` and checks each part with `isValidSegment`. The literal
 * `'.'` is allowed as a special "root" value.
 */
export function isValidGroupPath(s: unknown): s is string {
  if (typeof s !== 'string') return false
  if (s === '.') return true
  if (s === '.archive' || s.startsWith('.archive/')) return false
  if (s.startsWith('/') || s.startsWith('\\')) return false
  for (const part of s.split('/')) {
    if (!isValidSegment(part)) return false
  }
  return true
}
