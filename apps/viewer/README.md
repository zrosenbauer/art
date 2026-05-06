# `@art/viewer`

<p align="center">
  <a href="../../README.md"><img src="https://img.shields.io/badge/catalog-browse-ec4899?style=flat-square" alt="Browse catalog" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-c026d3?style=flat-square" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/TanStack_Start-f97316?style=flat-square" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/React_19-7dcfff?style=flat-square" alt="React 19" />
</p>

> Live asset viewer for the `art/` library. In-browser preview, multi-select, archive/restore, rename, move, and clipboard copy — with auto SVG→PNG conversion when any source SVG changes.

## Quick start

From the repo root:

```bash
pnpm install
pnpm exec --filter @art/viewer playwright install chromium   # one-time
pnpm dev                                                     # → http://localhost:4321
```

Save any `.svg` under `art/` and the watcher fires:

1. Chokidar detects the change.
2. `@art/svg-to-png` writes the sibling PNG.
3. SSE `reload` is broadcast → the open browser tab re-fetches the asset tree.

## Keyboard shortcuts

| Key         | Action                                       |
| ----------- | -------------------------------------------- |
| `/`         | Focus search (fuzzy on name + folder)        |
| `↑` `↓`     | Navigate the tree                            |
| `B`         | Toggle sidebar                               |
| `G`         | Toggle alignment grid overlay                |
| `C`         | Copy displayed asset to clipboard as PNG     |
| `Escape`    | Clear multi-selection / restore sidebar      |
| Cmd-click   | Toggle row in multi-select                   |
| Shift-click | Range-select                                 |

The TTY (when `pnpm dev` runs in a real terminal) accepts: **`r`** restart · **`o`** open browser · **`c`** clear · **`s`** bulk svg→png · **`q`** quit.

## Per-row actions

Via the `···` menu in the tree, or the preview toolbar:

- **Rename** — inline edit. Renames the directory **and** every `<name>.<ext>` file inside.
- **Move to…** — fuzzy-pick an existing folder, or `+ New folder…`.
- **Archive** — moves the entire asset directory into `art/.archive/<group>/<name>/`. Files survive on disk but stop showing in the main view.

The archive view (header button → `?archived=1`) dims rows and turns the per-row action into **Restore**.

## Stack

- **TanStack Start** (`@tanstack/react-start`) — React 19 + file-based router + server functions
- **Vite 7** — dev server + custom asset-watcher plugin (`scripts/asset-watcher.plugin.ts`)
- **Tailwind CSS v4** + **shadcn/ui** (`new-york` style, lucide icons, CSS variables) — styled in `src/styles/app.css`
- **chokidar v5** — file watcher driving live reload + auto-conversion
- **js-yaml** — `art.yaml` parser

## Project structure

```
apps/viewer/
├── scripts/
│   └── asset-watcher.plugin.ts     vite plugin: watcher + SSE + TUI
├── src/
│   ├── components/                 colocated UI components
│   │   └── ui/                     shadcn primitives — don't hand-edit
│   ├── routes/                     TanStack file-based router
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── api/                    rename / move / archive / restore / events
│   ├── server/                     server-only code (scan, fs ops, SSE)
│   └── styles/app.css              Tailwind v4 + shadcn theme
├── components.json                 shadcn config
└── vite.config.ts
```

## Adding shadcn primitives

```bash
cd apps/viewer
pnpm dlx shadcn@latest add <component>
```

Lands under `src/components/ui/<component>.tsx`. **Don't hand-edit** these — re-run the CLI to update.

## Don't

- Don't migrate to Next.js. shadcn supports TanStack Start as a first-class target; the migration cost is high.
- Don't introduce a second styling system (CSS Modules, Emotion, etc.). Tailwind v4 + shadcn is the only path.
- Don't hardcode colors. Use semantic Tailwind utilities (`bg-card`, `text-muted-foreground`, `border-border`).
- Don't bypass the viewBox lint — fix the SVG.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full development workflow.
