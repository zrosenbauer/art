/**
 * Convert a single SVG file to a sibling PNG.
 * @returns the written PNG path on success, or null if skipped.
 */
export function convertSvg(svgPath: string, opts?: { scale?: number }): Promise<string | null>

/**
 * Convert many SVGs reusing one Chromium instance.
 * @returns list of written PNG paths (skipped files omitted).
 */
export function convertAll(svgPaths: string[], opts?: { scale?: number }): Promise<string[]>
