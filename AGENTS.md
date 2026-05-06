# Art

A pnpm monorepo of GitHub banners, badges, and miscellaneous visual art for
`@zrosenbauer` projects. Each asset lives in its own directory under
`art/<category>/<name>/` with an `art.yaml` describing it (title,
description, tags). The repo's top-level `README.md` is auto-generated from
those `art.yaml` files. A live React asset-viewer (`apps/viewer/`) manages
everything: in-browser preview, multi-select, archive/restore, rename,
move, and clipboard copy — with auto SVG→PNG conversion via the
`@art/svg-to-png` library when any source SVG changes.

## Repo Structure

```
art/                              the assets themselves — workspace pkg @art/library
  banners/                        wide hero banners (5:1, e.g. 1280×256)
    banner_archived/
      art.yaml                    title, description, alt, examples, tags, legacy?
      banner_archived.svg         editable source (when present)
      banner_archived.png         auto-generated PNG sibling
  badges/                         compact / square status badges
  misc/                           anything else
  .archive/                       holding pen for archived assets (gitignored)
apps/
  assets/                         TanStack Start asset-viewer app (@art/viewer)
packages/
  svg-to-png/                     Playwright SVG→PNG library + CLI bin (@art/svg-to-png)
scripts/
  build-docs.mjs                  README generator (`pnpm docs`)
  templates/                      header.md + footer.md (the non-generated bits)
.claude/skills/svg-creator/       Claude Code skill — auto-invokes for "draw a banner" etc.
pnpm-workspace.yaml               packages: apps/*, packages/*, art
AGENTS.md / CLAUDE.md (symlink)
```

### `art.yaml` schema

```yaml
title: Archived
description: Show that a project is archived and not maintained.
alt: Archived
examples:
  - https://github.com/javascript-is-fun
tags: [banner, status]
legacy: true # PNG-only asset that predates the SVG-first workflow
```

The full schema is documented in `art/README.md`. Every field is optional;
missing fields fall back to derivations from the file name.

## Tech Stack

- **pnpm workspaces** — three workspaces: `apps/*`, `packages/*`, `art`
- **Node 20+**, ESM throughout
- **TanStack Start** (`@tanstack/react-start`) — React 19 + file-based router + server fns. _Not_ Next.js. Stay on TanStack Start; don't migrate.
- **Vite 7** — dev server, custom plugin for asset watching
- **Tailwind CSS v4** + **shadcn/ui** (`new-york` style, lucide icons, CSS variables) — viewer styling. **Always reach for shadcn primitives and blocks before hand-rolling UI.** See "shadcn / UI" section below.
- **chokidar v5** — file watcher driving live reload + auto-conversion
- **Playwright Chromium** — browser-based SVG→PNG renderer at 2× scale (handles fonts, unicode, emoji that librsvg can't)
- **js-yaml** — `art.yaml` parser (used by both the viewer scan and the docs generator)

## shadcn / UI

The asset-viewer (`apps/viewer/`) is wired up with the official shadcn-ui
CLI. Always prefer adding shadcn primitives and blocks over hand-rolling
new components — the CSS variables, dark-mode wiring, and accessibility
behavior are already done for you.

### Where things live

- `apps/viewer/components.json` — shadcn config (`style: new-york`, `iconLibrary: lucide`, `cssVariables: true`, aliases for `@/components/ui`, `@/lib/utils`, `@/hooks`).
- `apps/viewer/src/components/ui/` — the generated primitives. **Don't hand-edit these.** Re-run the CLI to update.
- `apps/viewer/src/styles/app.css` — Tailwind v4 + shadcn theme tokens. Two blocks:
  - `:root` defines light tokens.
  - `.dark` overrides with dark tokens.
- The `@custom-variant dark (&:where(.dark, .dark *));` line is what makes `dark:foo` Tailwind utilities fire on the `.dark` class instead of the OS media query — **don't remove it**.
- The `@theme inline { --color-background: var(--background); ... }` block re-exports every shadcn slot as a Tailwind theme color so utilities like `bg-background`, `text-foreground`, `border-border` are actually generated. **Don't remove it.** When you add a shadcn primitive that introduces a new slot variable, add the matching `--color-foo: var(--foo)` line here.

### Adding a primitive

```bash
cd apps/viewer
pnpm dlx shadcn@latest add <component>
# examples:
pnpm dlx shadcn@latest add card
pnpm dlx shadcn@latest add command
pnpm dlx shadcn@latest add sonner
```

The CLI reads `components.json`, fetches the source, writes it under
`src/components/ui/<component>.tsx`, and updates dependencies in
`package.json` if needed. After adding, run `pnpm install` once if a new
dep landed.

### Adding a block

Blocks are larger composite layouts (sidebars, dashboards, login forms,
calendars). They pull in multiple primitives and are good starting points
for new screens.

```bash
cd apps/viewer
pnpm dlx shadcn@latest add <block-name>
# examples:
pnpm dlx shadcn@latest add sidebar-07     # collapsible app sidebar
pnpm dlx shadcn@latest add dashboard-01   # admin-style dashboard layout
```

Blocks land under `src/components/<block-name>/` (or similar) and may
require small adaptations: routing references, prop shapes, and the
brand palette in `app.css` if a block ships its own theme overrides.
After adoption, delete or refactor the hand-rolled equivalent — don't
keep both.

### Theme

- **Default mode is dark.** SSR renders `<html class="dark">`; an inline
  script in `<head>` (`apps/viewer/src/routes/__root.tsx`) reads
  `localStorage['art-theme']` _before hydration_ and only removes the
  `dark` class if the user has explicitly chosen `'light'`. This avoids
  FOUC.
- The `ThemeToggle` component (`src/components/ThemeToggle.tsx`) puts a
  Sun/Moon button in the header that flips the class and persists the
  choice.
- Brand and status colors are mode-invariant. Only surfaces (`--card`,
  `--background`) and text (`--foreground`, `--muted-foreground`) change
  between modes. If you add a new color token, define it in `:root` and,
  if it should differ in dark mode, override under `.dark`.
- The skill's `references/colors.md` mirrors the dark palette — if you
  change `app.css`, update that file too so SVG authors see the right
  hex values.

### Don't

- Don't hand-edit files under `src/components/ui/`. Re-run the CLI.
- Don't hardcode colors in components — use the semantic Tailwind
  utilities (`bg-card`, `text-muted-foreground`, `border-border`, etc.)
  so light/dark mode work without manual overrides.
- Don't introduce a second styling system (CSS Modules, Emotion, etc.) —
  Tailwind v4 + shadcn is the only path here.
- Don't migrate to Next.js. shadcn supports TanStack Start as a
  first-class target; the migration cost is high and you'd lose the
  Vite-plugin watcher pattern.

## Scripts

From the repo root:

```bash
pnpm install                                      # one-time
pnpm exec --filter @art/viewer playwright install chromium   # one-time

pnpm dev                                          # asset viewer at http://localhost:4321
pnpm build                                        # build the assets app
pnpm typecheck                                    # tsc --noEmit across workspaces
pnpm svg2png art/banners/foo/foo.svg              # one-off SVG → PNG via @art/svg-to-png bin
pnpm svg2png --scale=3 art/banners/foo/foo.svg    # custom retina scale
pnpm docs                                         # regenerate README.md from art.yaml files
pnpm docs:check                                   # CI guard — exits 1 if README is stale
pnpm lint:svg                                     # enforce edge-to-edge viewBox under art/
```

When `pnpm dev` is running, saving any `.svg` under `art/` triggers:

1. The Vite plugin's chokidar watcher fires `add`/`change`.
2. `@art/svg-to-png` renders the sibling `.png` via Playwright (2× retina).
3. SSE `reload` is broadcast; the React UI re-fetches the tree (`useReloadStream` invalidates the TanStack Router loader).

The viewer's TTY accepts: **`r`** restart · **`o`** open browser · **`c`**
clear · **`s`** bulk svg→png · **`q`** quit.

## Image / Asset Generation

**RULE: NO PADDING. NO MARGIN. EDGE-TO-EDGE.**

When generating any image asset (SVG, PNG) — banners, badges, illustrations,
diagrams, icons, anything — the **edge of the image must be flush with the
content**. The bounding box of the visual must equal the bounding box of
the file. Zero whitespace around the artwork.

This applies to:

- **SVG `viewBox`** — must match the content bounds exactly. If a banner is
  1280×256, the viewBox is `0 0 1280 256`. Do **not** use a larger viewBox
  like `0 0 1400 320` and offset the content with `x="60" y="32"`.
- **PNG output** — generated PNGs inherit the viewBox.
- **All artwork** — there is no "canvas padding." Consumers (READMEs,
  Slack, PR comments) handle spacing. Assets do not.

**Why:** padding inside an asset can't be removed downstream. It bakes
empty pixels into every usage, fights `object-fit: contain`, breaks
alignment when embedded in flex/grid layouts, and makes the asset
unreusable at different sizes. Layout spacing belongs in the layout, not
in the asset.

`pnpm lint:svg` enforces this; the viewer's converter (`@art/svg-to-png`)
silently skips any SVG whose root `viewBox` doesn't begin with `0 0`.

## Skill: svg-creator

`.claude/skills/svg-creator/` is a Claude Code skill that bundles the
asset-creation workflow:

1. Boots the live viewer (`pnpm --filter @art/viewer dev`) if it's not already up.
2. Drops you into copy-pasteable patterns (banner, badge, window, icon).
3. Lints viewBox before claiming success.
4. Confirms the PNG sibling was written.
5. Walks through the React UI's preview / multi-select / archive / rename / move features.
6. Reminds you to run `pnpm docs` to regenerate the README catalog.

When the user says "draw a banner", "create an SVG for X", "fix that
viewBox", "render this SVG to PNG", "archive that banner" — Claude
auto-invokes this skill.

Reference docs in the skill:

- `references/colors.md` — palette hex values (matches the viewer's vendored palette in `apps/viewer/src/styles/app.css`)
- `references/patterns.md` — recipes for banners, badges, IDE windows, terminals, icons, arrows, gradients

## Asset-viewer features (cheat sheet)

| Key         | Action                                       |
| ----------- | -------------------------------------------- |
| `/`         | Focus search (fuzzy across name + folder)    |
| `↑` `↓`     | Navigate the tree                            |
| `B`         | Toggle sidebar                               |
| `G`         | Toggle alignment grid overlay                |
| `C`         | Copy the displayed asset to clipboard as PNG |
| `Escape`    | Clear multi-selection (or restore sidebar)   |
| Cmd-click   | Toggle row in multi-select                   |
| Shift-click | Range-select                                 |

**Per-row actions** via the `···` menu: Rename (inline — moves the asset
directory + every `name.<ext>` file inside), Move to… folder, Archive
(moves the entire asset directory to `art/.archive/<group>/<name>/`).
All operations apply to every sibling format in lock-step and broadcast
SSE `reload` on success.

**Archive view** via the header button — `?archived=1`; rows dim, action
becomes Restore.

The preview pane surfaces the `art.yaml` fields when present:
title (replacing the directory name in the header), description (in a
metadata strip below), tags as pills, and a `legacy` badge for PNG-only
assets.

## Coding Guidelines

- **Source of truth is the SVG.** PNGs are derived by `@art/svg-to-png`; never hand-edit a PNG (except for legacy PNG-only assets in `art.yaml: legacy: true`).
- **Source of truth for docs is `art.yaml`.** Don't edit the catalog sections of the root `README.md` — edit `art.yaml` and run `pnpm docs`.
- **One asset per directory.** Composite layouts belong in the consumer, not in a single asset.
- **Hex colors only.** SVGs can't read CSS variables; pull hex from the skill's `references/colors.md`.
- **No emoji or library fonts unless embedded.** Playwright falls back to system fonts; if pixel-identical output across machines matters, embed via `@font-face` inside `<style>`.
- **App code (apps/viewer/)** — components are colocated under `src/components/`. shadcn primitives live in `src/components/ui/` (don't hand-edit; regenerate via shadcn CLI). Server-only code lives in `src/server/`. API endpoints are file-routed under `src/routes/api/`.
- **Scope is vestigial.** The codebase carries a `scope` parameter (`'all'`) inherited from the multi-deck slides repo this app was forked from. Always pass `'all'`; the server collapses it to `art/` root.

## Agent-Specific Notes

- When adding a new banner, **always start the viewer first** (`pnpm dev`) so the file save triggers automatic SVG→PNG and live browser reload.
- The asset path is `art/<category>/<name>/<name>.<ext>` — the directory name == file basename.
- After adding/renaming/moving an asset, run `pnpm docs` to regenerate the README. CI should run `pnpm docs:check` to fail PRs that forgot.
- For new SVGs, prefer `1280×256` for banners and `128×128` for badges to keep proportions consistent across the collection.
- After modifying the brand palette in `apps/viewer/src/styles/app.css` or in the skill's `references/colors.md`, **update both** so the viewer's render matches the SVG you're authoring.
- Don't bypass the lint — fix the viewBox.
- The `routeTree.gen.ts` under `apps/viewer/src/` is auto-generated by TanStack Router on `pnpm dev`. It's gitignored. If `pnpm typecheck` complains it doesn't exist, run `pnpm dev` once to generate it, then Ctrl+C.
- The watcher plugin attaches a TTY (alternate-screen buffer) when stdin is a TTY. If you run `pnpm dev` from a non-TTY (CI, nohup), the TUI is skipped automatically.
- If `pnpm dev` fails with "Could not launch chromium": run `pnpm exec --filter @art/viewer playwright install chromium`.
- The viewer's archive/move/rename actions hit `apps/viewer/src/routes/api/*` — they operate on whole asset directories now (the `art.yaml` + every `name.<ext>` move together as a unit).
- **Public URL change (May 2026)**: existing banner URLs at `banners/banner_archived.png` etc. moved under the new `art/` workspace — they're now at `art/banners/banner_archived/banner_archived.png`. The auto-generated README has the new URLs. Any external README that linked the old URLs needs updating.
