import { convertSvg as runConvertSvg, convertAll as runConvertAll } from '@art/svg-to-png'

const inFlight = new Map<string, Promise<void>>()

/**
 * Convert a single SVG file via @art/svg-to-png. In-flight map deduplicates
 * concurrent requests for the same file (e.g., when chokidar fires `add`
 * and `change` back-to-back during an editor save).
 *
 * The map entry is set BEFORE awaiting the conversion, so a synchronously-
 * resolving promise can't leak its `.finally` cleanup before a second
 * concurrent caller checks the map.
 */
export function convertSvg(absPath: string): Promise<void> {
  const existing = inFlight.get(absPath)
  if (existing) return existing
  let resolve!: () => void
  const ticket = new Promise<void>((r) => {
    resolve = r
  })
  inFlight.set(absPath, ticket)
  ;(async () => {
    try {
      await runConvertSvg(absPath)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`  ⚠ svg→png failed for ${absPath}: ${msg}`)
    } finally {
      inFlight.delete(absPath)
      resolve()
    }
  })()
  return ticket
}

/**
 * Convert many SVGs reusing one Chromium instance. Faster than a loop of
 * single conversions for bulk operations (e.g., the TUI `s` keystroke).
 */
export async function convertAll(absPaths: string[]): Promise<void> {
  if (absPaths.length === 0) return
  await runConvertAll(absPaths).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`  ⚠ bulk svg→png failed: ${msg}`)
  })
}
