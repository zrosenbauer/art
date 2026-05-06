# `@art/svg-to-png`

<p align="center">
  <a href="../../README.md"><img src="https://img.shields.io/badge/catalog-browse-ec4899?style=flat-square" alt="Browse catalog" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-c026d3?style=flat-square" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/Playwright-f97316?style=flat-square" alt="Playwright" />
  <img src="https://img.shields.io/badge/2x_retina-7dcfff?style=flat-square" alt="2× retina" />
</p>

> Browser-based SVG → PNG converter — used by the [`@zrosenbauer/art`](../..) viewer and exposed as a CLI bin.

Renders SVG files via headless Chromium (Playwright) at a configurable retina scale, writes the PNG as a sibling of the source SVG, and enforces the project's edge-to-edge viewBox rule.

## Why a browser, not librsvg?

librsvg / `rsvg-convert` is faster but can't handle a few things this repo
relies on:

- Unicode box-drawing characters (`╔═╗`, `█`, `▌`) used in retro CRT banners
- `@font-face` declarations inside `<style>`
- Newer SVG 2 features (e.g. `paint-order`, certain filter primitives)

A real browser engine renders all of the above identically to how a
GitHub README will display them. The trade is a ~700 ms cold start per
batch (Playwright launching Chromium); `convertAll` amortises that across
many files.

## Install

This package is a workspace member of the `art` monorepo. Outside the
monorepo:

```bash
pnpm add -D @art/svg-to-png
pnpm exec playwright install chromium    # one-time browser install
```

## CLI

```bash
svg-to-png path/to/banner.svg                          # one file
svg-to-png path/to/banner.svg path/to/badge.svg        # many files
svg-to-png --scale=3 path/to/banner.svg                # custom retina scale (default: 2)
svg-to-png --help                                      # usage
```

Inside the `art` monorepo, use `pnpm svg2png` from the repo root — that
script forwards to this bin.

### Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | All files processed (some may have been skipped)       |
| `1`  | Fatal — couldn't launch the browser, etc.              |
| `2`  | Bad invocation — unknown flag, invalid `--scale` value |

A file being **skipped** is not a fatal error. The converter logs a
warning and moves on. Skip reasons:

- File doesn't end in `.svg` (refused — would otherwise overwrite the source)
- Can't read the file (`ENOENT`, permissions, etc.)
- No `<svg>` root element
- No `viewBox` attribute on the root
- viewBox doesn't start with `0 0` (the project's edge-to-edge rule)
- viewBox dimensions are zero or negative

## Library

```ts
import { convertSvg, convertAll } from '@art/svg-to-png'

// Single file — spins up + tears down a Chromium per call
const png = await convertSvg('banners/foo.svg')
// → '/abs/path/to/banners/foo.png' (or null if skipped)

// Batch — shares one Chromium across the whole list
const written = await convertAll(['banners/foo.svg', 'badges/bar.svg'], { scale: 3 })
// → ['/abs/.../foo.png', '/abs/.../bar.png']
```

### `convertSvg(svgPath, opts?) → Promise<string | null>`

Convert one SVG. Returns the absolute path of the written PNG, or `null`
if the file was skipped (see [skip reasons](#exit-codes)).

| Option  | Type     | Default | Description                                              |
| ------- | -------- | ------- | -------------------------------------------------------- |
| `scale` | `number` | `2`     | Render at `width*scale × height*scale` for retina output |

### `convertAll(svgPaths, opts?) → Promise<string[]>`

Convert many SVGs reusing one Chromium instance. **Per-file failures
don't abort the batch** — they log a warning and the next file proceeds.
Returns the list of successfully-written PNG paths (skipped/failed files
are omitted). One-and-done errors (browser launch, unhandled rejection)
still bubble out of the function.

## The viewBox rule

This package will **only** convert SVGs whose root element starts with
`viewBox="0 0 W H"`:

```svg
<!-- ✓ converted -->
<svg viewBox="0 0 1280 256" width="1280" height="256">…</svg>

<!-- ✗ skipped — offset viewBox bakes padding into the asset -->
<svg viewBox="120 40 660 420" width="660" height="420">…</svg>

<!-- ✗ skipped — no viewBox -->
<svg width="1280" height="256">…</svg>
```

Why? Padding inside an asset can't be removed downstream. It bakes empty
pixels into every usage, fights `object-fit: contain`, breaks alignment
in flex/grid layouts, and makes the asset unreusable at different sizes.
Layout spacing belongs in the layout (CSS, README, slide template), not
in the asset.

The companion lint script
[`lint-viewbox.mjs`](../../.claude/skills/svg-creator/scripts/lint-viewbox.mjs)
fails the build if any committed SVG violates the rule.

## Security

The package strips `<script>` blocks (and self-closing variants) from the
SVG before injecting it into the headless page via `setContent`. SVGs in
the parent `art` repo are user-controlled, but the same library may be
used elsewhere — defence in depth. Stripping happens regardless of the
caller's trust level; there's no opt-out flag.

This is not a sandbox. Pathological SVGs (e.g. with massive embedded
binary `xlink:href` payloads or pathological filters) could exhaust
memory or run for a long time. The package doesn't impose a CPU/memory
budget; if you're processing arbitrary user uploads, run it inside a
container with limits.

## Troubleshooting

**`Could not launch chromium`** — install the browser:

```bash
pnpm exec playwright install chromium
```

**Output PNG looks pixelated or wrong size** — check that the SVG's
`viewBox` matches its `width`/`height`. Mismatches make Chromium scale
the SVG inside the page, which the screenshot then captures.

**Fonts render as fallback (e.g. boxes for missing chars)** — the host
machine doesn't have the named font installed and the SVG didn't embed
it. Either install the font system-wide or embed it via
`@font-face` + base64 inside a `<style>` element in the SVG.

## License

[MIT](../../LICENSE) — same license as the parent repo.
