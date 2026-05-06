# Contributing

How to run the asset viewer, add new assets, and keep the catalog in sync.

**Quick links** · [Architecture](#architecture) · [Develop](#develop) · [Adding a new asset](#adding-a-new-asset) · [Common tasks](#common-tasks) · [Troubleshooting](#troubleshooting) · [AGENTS.md](./AGENTS.md)

## Architecture

```
                      ┌──────────────────────────────────┐
                      │  art/<category>/<name>/          │
   author edits ─────►│    art.yaml                      │
                      │    <name>.svg                    │
                      └──────────────┬───────────────────┘
                                     │  chokidar watch
                                     ▼
                      ┌──────────────────────────────────┐
                      │  apps/viewer  (Vite plugin)      │──── live React UI ────►  http://localhost:4321
                      │    asset-watcher.plugin.ts       │      ↑   SSE /api/events
                      │    invokes @art/svg-to-png  ─────┼──┐
                      └──────────────────────────────────┘  │
                                                            ▼
                      ┌──────────────────────────────────┐
                      │  packages/svg-to-png             │
                      │    Playwright Chromium @ 2× scale│──── writes <name>.png ───► sibling on disk
                      └──────────────────────────────────┘

  scripts/build-docs.mjs ──► reads every art.yaml ──► regenerates README.md catalog
```

A pnpm monorepo with three workspaces:

| Path                   | Package           | Purpose                                                |
| ---------------------- | ----------------- | ------------------------------------------------------ |
| `art/`                 | `@art/library`    | The assets themselves — one directory per asset        |
| `apps/viewer/`         | `@art/viewer`     | TanStack Start asset-viewer at `http://localhost:4321` |
| `packages/svg-to-png/` | `@art/svg-to-png` | Browser-based SVG → PNG library + CLI bin              |

## Develop

```bash
pnpm install                                            # one-time
pnpm exec --filter @art/viewer playwright install chromium   # one-time

pnpm dev                                                # asset viewer at http://localhost:4321
pnpm svg2png art/banners/foo/foo.svg                    # one-off SVG → PNG
pnpm docs                                               # regenerate README.md from art.yaml
pnpm lint                                               # oxlint
pnpm format                                             # oxfmt --write
pnpm typecheck                                          # tsc --noEmit (recursive)
pnpm lint:svg                                           # enforce edge-to-edge viewBox
pnpm build                                              # build the viewer for production
```

When `pnpm dev` is running, save any `.svg` under `art/` and the watcher
will:

1. Re-render the sibling `.png` via Playwright (2× retina).
2. Hot-reload every open browser tab via SSE.

The viewer's TTY accepts:
**`r`** restart · **`o`** open browser · **`c`** clear · **`s`** bulk svg→png · **`q`** quit.

## Adding a new asset

1. Create `art/<category>/<name>/` (e.g. `art/banners/banner_active/`). The
   directory name **is** the asset name and **must** match the basename of
   every format file inside it.
2. Add `art.yaml` with at least a title and description:
   ```yaml
   title: Active
   description: Show that a project is actively maintained.
   alt: Active
   tags: [banner, status]
   # Optional:
   # examples: [https://github.com/some/repo]
   # legacy: true   # PNG-only — no SVG source
   ```
3. Author `<name>.svg` with `viewBox="0 0 W H"` (no offsets, no padding —
   see [AGENTS.md → Image / Asset Generation](./AGENTS.md#image--asset-generation)
   for the rule).
4. Save. The PNG sibling is generated automatically.
5. Lint: `pnpm lint:svg`.
6. Regenerate the catalog: `pnpm docs`.

Claude Code users: the [`svg-creator` skill](./.claude/skills/svg-creator/SKILL.md)
automates this entire pipeline (boots the viewer, drafts the SVG, lints,
confirms, regenerates docs) — just describe what you want.

## Common tasks

| I want to…                                 | Run / do                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| **Use a banner in someone else's README**  | Copy the markdown snippet from the catalog in [README.md](./README.md)  |
| **See every asset visually**               | `pnpm dev` → http://localhost:4321                                      |
| **Add a new asset**                        | See [Adding a new asset](#adding-a-new-asset)                           |
| **Rename, move, or archive an asset**      | Use the `···` menu in the viewer (or POST `/api/{rename,move,archive}`) |
| **Bulk-regenerate every PNG**              | `pnpm svg2png art/**/*.svg` (or press `s` in the viewer TTY)            |
| **Update the README catalog**              | `pnpm docs`                                                             |
| **Verify the README is in sync** (CI)      | `pnpm docs:check`                                                       |
| **Check every viewBox is edge-to-edge**    | `pnpm lint:svg`                                                         |
| **Type-check everything**                  | `pnpm typecheck`                                                        |
| **Toggle dark / light mode in the viewer** | Sun/Moon button in the header (persists to localStorage)                |
| **Build for production**                   | `pnpm build`                                                            |

## Troubleshooting

<details>
<summary><strong><code>pnpm dev</code> fails with "Could not launch chromium"</strong></summary>

Playwright's browser binary isn't installed. Run:

```bash
pnpm exec --filter @art/viewer playwright install chromium
```

</details>

<details>
<summary><strong>I added an SVG but no PNG appeared</strong></summary>

The watcher only fires when `pnpm dev` is running. Either start the
viewer, or run `pnpm svg2png art/<category>/<name>/<name>.svg` to convert
explicitly.

If the viewer **is** running and you still see no PNG, check
`/tmp/art-asset-viewer.log` — the converter logs warnings there. The
likeliest cause is a viewBox that doesn't start with `0 0` (the converter
silently skips those).

</details>

<details>
<summary><strong><code>pnpm typecheck</code> can't find <code>routeTree.gen.ts</code></strong></summary>

That file is generated by TanStack Router on first `pnpm dev`. It's
gitignored. Run `pnpm dev` once to generate it (Ctrl+C immediately after
the server starts), then re-run typecheck.

</details>

<details>
<summary><strong>Light/dark mode looks broken in the viewer</strong></summary>

Make sure you didn't accidentally remove the
`@custom-variant dark (&:where(.dark, .dark *));` line or the
`@theme inline { ... }` block from
`apps/viewer/src/styles/app.css`. Both are load-bearing for shadcn — see
[AGENTS.md → shadcn / UI](./AGENTS.md#shadcn--ui).

</details>

<details>
<summary><strong>Public banner URLs broke after restructure</strong></summary>

In May 2026 the layout changed from `banners/<name>.png` to
`art/banners/<name>/<name>.png`. The auto-generated catalog in
[README.md](./README.md) has the new URLs. External READMEs that linked
the old paths need updating.

</details>
