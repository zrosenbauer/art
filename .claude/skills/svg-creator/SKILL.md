---
name: svg-creator
description: Generate SVG image assets for this art repo with strict edge-to-edge viewBox discipline, automatically converting the SVG to PNG via @art/svg-to-png and starting the local React asset viewer (TanStack Start) for live in-browser preview, archive/move/rename, and clipboard-copy. Each asset gets its own directory under art/<category>/<name>/ with an art.yaml describing it; the repo README is auto-generated from those art.yaml files. Use this skill whenever the user asks to create, generate, draw, design, mock up, illustrate, or update an SVG, illustration, banner, badge, icon, hero image, diagram, IDE/terminal mockup, or any visual asset — even if they don't say "SVG" explicitly. Also use when the user wants to fix a viewBox, render an existing SVG to PNG, archive/restore/rename/move an asset, regenerate the README, or open the asset viewer in the browser. Prefer this skill over hand-rolling SVGs from scratch — it bakes in the AGENTS.md "no padding, edge-to-edge" rule and the repo's auto-conversion + live-reload pipeline.
---

# svg-creator

End-to-end procedure for creating SVG assets in this monorepo. Each step
explains the why so you can adapt — don't follow them mechanically.

## How the asset pipeline works (read this first)

The repo is a pnpm monorepo with three workspaces:

- `art/` — the actual assets, one directory per asset with an `art.yaml`
- `apps/viewer/` — TanStack Start (React + Vite) viewer at port 4321
- `packages/svg-to-png/` — Playwright SVG→PNG library + CLI bin

The viewer's Vite plugin
(`apps/viewer/scripts/asset-watcher.plugin.ts`) watches `art/` exclusively
using chokidar. When any `.svg` is added or modified, the plugin invokes
`@art/svg-to-png` to write the sibling PNG and broadcasts an SSE `reload`
event so the open browser tab re-fetches the asset tree.

Two implications:

1. **Start the viewer before saving the SVG.** If the watcher is running,
   the file save fires `add` → conversion → broadcast in one step. If the
   viewer is down, the SVG sits without a PNG sibling.
2. **Don't redundantly invoke the converter.** Only do that as an explicit
   fallback when the viewer isn't reachable, or for bulk conversion.

## Step 1 — Plan before drawing

Decide three things:

1. **Which category folder.** Assets live at `art/banners/`, `art/badges/`,
   `art/misc/` (add new categories as siblings). Don't dump assets at the
   `art/` root.
2. **The asset name (== directory name).** Lowercase with underscores or
   hyphens (`banner_under_construction`, not `BannerUnderConstruction`).
   Banners prefix `banner_`; badges prefix `badge_`. The asset's directory
   name **equals** the basename of every format file inside it.
3. **The dimensions.** Pick W and H from the actual content's bounding
   box, not the consumer's display size.

Sensible defaults:

- GitHub repo banner: `1280×256` (5:1 aspect, matches existing banners)
- Badge / icon: `96×96` or `128×128`
- Window/IDE/CLI mockup: `660×420`
- Wide hero strip: `1920×400` (16:5)

## Step 2 — Ensure the viewer is up (do this _before_ writing the SVG)

```bash
bash .claude/skills/svg-creator/scripts/ensure-viewer.sh
```

This script:

- Does nothing if port 4321 is already bound (preserves watcher state and any open browser tab).
- Otherwise spawns `pnpm --filter @art/viewer dev` from the repo root as a detached daemon.
- Polls until the port comes up or 10s elapses.

When invoking from Claude Code's Bash tool, set `run_in_background: true`
so Claude isn't blocked.

If `pnpm install` hasn't run yet:

```bash
pnpm install
pnpm exec --filter @art/viewer playwright install chromium
```

## Step 3 — Author the asset directory

Create three files in `art/<category>/<name>/`:

```
art/banners/banner_active/
├── art.yaml                  # title, description, alt, tags
├── banner_active.svg         # the actual artwork
└── banner_active.png         # generated automatically once viewer is up
```

### art.yaml

```yaml
title: Active
description: Show that a project is actively maintained.
alt: Active
tags: [banner, status]
# Optional:
# examples:
#   - https://github.com/some/repo
# legacy: true   # PNG-only — no SVG source
```

Every field is optional; missing fields fall back to the directory name.

### `<name>.svg` — the viewBox rule (everything else hangs off this)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width="W" height="H">
```

The viewBox **must** start with `0 0` and use the actual content
dimensions. No offsets like `viewBox="120 40 660 420"`. No padding. The
lint script in step 4 enforces this; the converter silently skips any
non-conforming SVG.

**Why this rule matters:** padding inside an asset can't be removed
downstream. It bakes empty pixels into every usage, fights `object-fit:
contain`, breaks alignment in any layout that consumes it, and makes the
asset unreusable at different sizes. Layout spacing belongs in the layout
(CSS, README, slide template), not in the asset. (See AGENTS.md → "Image /
Asset Generation" for the full rationale.)

**How this changes how you draw:** if you want a "window inside a workspace"
look, the workspace **is** the asset — make the workspace itself the
bounding box. Don't simulate "the window inside a frame" by offsetting the
window inside a larger viewBox.

**Colors:** read `references/colors.md` for hex values when picking colors.
SVGs cannot consume CSS variables, so hardcode the hex. The viewer's React
UI uses the same palette (vendored into `apps/viewer/src/styles/app.css`).

**Typography:** `Geist, system-ui, sans-serif` for headings/UI;
`'Geist Mono', monospace` for code, terminals, file trees.

**Recipes:** `references/patterns.md` has copy-pasteable patterns for repo
banners, badges, window chrome, terminals, diagram nodes, arrows, and icons
— including viewBox math and common anti-patterns.

The moment the SVG is written, the watcher fires `add`, runs
`@art/svg-to-png`, writes the sibling PNG, and broadcasts an SSE reload.
You'll see this in `/tmp/art-asset-viewer.log`.

## Step 4 — Lint the viewBox

```bash
node .claude/skills/svg-creator/scripts/lint-viewbox.mjs <path-to-svg>
# or, repo-wide:
pnpm lint:svg
```

The lint checks: viewBox exists, is well-formed, starts with `0 0`, has
positive width/height. On failure it prints a fix hint and exits 1.

If the lint fails, edit the SVG. Each save fires another `change` event,
so the PNG always reflects the final good state.

## Step 5 — Show the SVG in the browser (live preview)

The viewer at **`http://localhost:4321`** is already showing your asset.
The React UI gives you more than just preview — it's a full asset manager:

**Browsing**

- Sidebar (collapsible with **`B`**) lists every asset under `art/`,
  grouped by category. New assets appear automatically; renamed/moved/deleted
  assets update automatically (loaders re-fetch on SSE `reload`).
- Click a row, or use **↑/↓** arrow keys, to load it on the stage.
- The header shows the **`art.yaml` title** when present, with the
  directory name in parens; the description appears in a metadata strip
  below, with tags rendered as pills and a `legacy` badge if applicable.
- **`/`** focuses the search box (fuzzy subsequence match on name + folder).
- **Top-bar SVG/PNG toggle** flips between source and rendered PNG sibling
  — useful for verifying the converter output matches the source render.
- **`G`** toggles the alignment grid overlay on the stage.

**Multi-select & batch actions**

- **Cmd/Ctrl+click** a row's checkbox to toggle multi-select.
- **Shift+click** range-selects.
- The toolbar shows `N selected` with a batch **Archive** button.
- **`Escape`** clears selection.

**Per-row actions** (`···` menu in the tree, or the preview toolbar)

- **Rename** — inline edit. Renames the asset directory **and** every
  `<name>.<ext>` file inside it. `art.yaml` is left alone.
- **Move to…** — opens a dialog with a fuzzy-filterable list of every
  existing folder, plus a "+ New folder…" mode. Moves the entire asset
  directory.
- **Archive** — moves the asset directory (yaml + all formats) into
  `art/.archive/<group>/<name>/`. Files survive on disk but don't show in
  the main view. Confirmation dialog lists what will be archived.

**Archive view**

- The header **"Show archive"** button toggles `?archived=1`. The route
  loader switches to `scanArchive`, the UI dims rows, and the per-row
  action becomes **Restore**.

**Copy to clipboard**

- **`C`** (or the Copy button) copies the displayed asset to the system
  clipboard as PNG (works for both `.svg` and `.png` selections).

**HMR feedback**

- The lime-yellow flash badge in the top-right confirms the viewer picked
  up a file change. If it doesn't flash, the watcher isn't running —
  re-run `ensure-viewer.sh`.

If the viewer didn't auto-open in the browser, run
`open http://localhost:4321` or press `o` in the viewer's TTY.

## Step 6 — Verify the PNG sibling exists

After a few hundred ms:

```bash
test -f art/banners/banner_active/banner_active.png && echo "✓ PNG exists"
```

If the PNG is missing (e.g., the viewer wasn't running, or Playwright
needs `pnpm exec --filter @art/viewer playwright install chromium`),
fall back to the explicit converter:

```bash
pnpm svg2png art/banners/banner_active/banner_active.svg
```

Or press `s` inside the viewer's TTY for bulk conversion.

## Step 7 — Regenerate the README

The repo's top-level `README.md` is generated from `art.yaml` files:

```bash
pnpm docs
```

Run this whenever you add a new asset, rename one, change `art.yaml`, or
move an asset to a different category. CI's `pnpm docs:check` will fail PRs
that forgot.

## Step 8 — Confirm

Tell the user:

- The asset directory path (e.g., `art/banners/banner_active/`).
- The viewer URL: `http://localhost:4321`.
- A one-line description of dimensions and what's in the asset.
- Confirm the README was regenerated (or that there's nothing to regenerate).

If anything in steps 4–7 failed, surface it explicitly — don't claim
success when only the SVG was written.

## Modifying an existing SVG

1. Read the current file before editing.
2. Make the smallest possible edit.
3. Re-run the lint.
4. The viewer's `change` watcher will regenerate the PNG. Confirm via
   `ls -la <path>/<name>.png` that the mtime updated.
5. If you also touched `art.yaml`, run `pnpm docs`.

## Renaming, moving, archiving without leaving the chat

You can drive the React UI's actions from Claude Code by hitting the same
HTTP API the UI uses (these routes live in `apps/viewer/src/routes/api/`):

- **Rename**:

  ```bash
  curl -X POST http://localhost:4321/api/rename \
    -H 'Content-Type: application/json' \
    -d '{"scope":"all","group":"banners","name":"old","newName":"new"}'
  ```

  Renames the directory `art/banners/old/` → `art/banners/new/` and every
  `old.<ext>` file inside to `new.<ext>`.

- **Move**:

  ```bash
  curl -X POST http://localhost:4321/api/move \
    -H 'Content-Type: application/json' \
    -d '{"scope":"all","group":"misc","name":"foo","newGroup":"badges"}'
  ```

  Moves the entire asset directory.

- **Archive**:

  ```bash
  curl -X POST http://localhost:4321/api/archive \
    -H 'Content-Type: application/json' \
    -d '{"scope":"all","items":[{"group":"banners","name":"old_banner"}]}'
  ```

  Moves the directory to `art/.archive/banners/old_banner/`.

- **Restore** (from `.archive/`): same shape as archive, `POST /api/restore`.

All endpoints broadcast SSE `reload` on success. Run `pnpm docs` after to
keep the README in sync.

## Bulk linting / converting

```bash
pnpm lint:svg                                            # check art/
pnpm svg2png art/banners/foo/foo.svg                     # one-off
pnpm svg2png art/banners/*/*.svg art/badges/*/*.svg      # batch via shell glob
```

Or press **`s`** inside the viewer's TTY for bulk conversion across the
whole `art/` tree with progress output.

## Files in this skill

- `SKILL.md` — this file
- `scripts/ensure-viewer.sh` — idempotent viewer launcher (used in step 2)
- `scripts/lint-viewbox.mjs` — viewBox linter (used in step 4)
- `references/colors.md` — color hex reference (matches the viewer's vendored palette)
- `references/patterns.md` — copy-pasteable SVG recipes for common shapes

The skill does **not** ship its own SVG-to-PNG converter — that lives in
`packages/svg-to-png/` (`@art/svg-to-png`). The viewer's watcher invokes
it automatically on file changes, and the CLI bin is available via
`pnpm svg2png`.
