# `@art/library`

The actual art assets — banners, badges, and miscellaneous visual art — live here.

This package contains **only files**: no source code, no entry point. Its
purpose is to be a workspace member so the viewer (`@art/viewer`) and
docs generator (`scripts/build-docs.mjs`) can discover assets via
`pnpm-workspace.yaml` rather than hard-coded paths.

## Layout

```
art/
├── banners/                       wide hero banners (5:1, e.g. 1280×256)
│   ├── banner_archived/
│   │   ├── art.yaml               metadata
│   │   ├── banner_archived.svg    editable source
│   │   └── banner_archived.png    auto-generated 2× retina
│   └── banner_under_construction/
│       └── …
├── badges/                        compact / square status badges
├── misc/                          anything else
└── .archive/                      holding pen for archived assets (gitignored)
```

### The directory-as-asset rule

A directory **is** an asset when:

- it contains an `art.yaml` (preferred), **or**
- it contains a file named `<dirname>.<ext>` for one of the recognized
  asset extensions (`.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`).

The asset's name **equals** the directory name **and** the basename of
every format file inside. So `banner_archived/banner_archived.svg` —
never `banner_archived/foo.svg`.

The viewer's scanner (`apps/viewer/src/server/scan.ts`) and the docs
generator (`scripts/build-docs.mjs`) both rely on this convention.

## `art.yaml` schema

Every field is optional; missing fields fall back to derivations from
the directory name (e.g. `title` falls back to a prettified slug).

```yaml
# Required-ish (you'll almost always want these two)
title: Archived
description: Show that a project is archived and not maintained.

# Useful
alt: Archived
tags: [banner, status]
examples:
  - https://github.com/javascript-is-fun

# Rare — marks PNG-only assets that predate the SVG-first workflow.
# Renders an amber "legacy" badge in the viewer's preview pane.
legacy: true
```

### Validation rules

The viewer's scanner is permissive (any extra fields are kept; missing
fields fall back), but `pnpm docs` enforces these guardrails:

| Field         | Rule                                                                  |
| ------------- | --------------------------------------------------------------------- |
| `title`       | Newlines are stripped; `[`, `]`, backtick are escaped in markdown alt |
| `description` | Newlines are stripped                                                 |
| `alt`         | HTML-entity-encoded for use in `<img alt="…">`                        |
| `examples`    | Must be an array of strings; each is URL-encoded                      |
| `tags`        | Must be an array of strings; each is rendered as `\`tag\``            |

Whatever you put in `art.yaml` is interpolated into both Markdown and
HTML, so the generator escapes injection vectors. Don't try to be cute
with `<script>` in a title — it'll be rendered as text.

## Conventions

- **Lowercase, underscores or hyphens** in asset names —
  `banner_under_construction`, never `BannerUnderConstruction`.
- **Prefix banners with `banner_`** and badges with `badge_` so they sort
  together in the tree.
- **Edge-to-edge viewBox** — `viewBox="0 0 W H"`. No offsets, no padding.
  See [AGENTS.md → Image / Asset Generation](../AGENTS.md#image--asset-generation)
  for the full rationale. `pnpm lint:svg` enforces it.
- **Hex colors only** in SVGs (CSS variables don't resolve in standalone
  SVGs). The skill's
  [`references/colors.md`](../.claude/skills/svg-creator/references/colors.md)
  has the palette.
- **One asset per directory.** Composite layouts belong in the consumer's
  README, not in a single SVG.

## Don't

- Don't hand-edit a generated `.png` — re-export from the `.svg`.
- Don't put files at the `art/` root. Use a category folder.
- Don't move existing PNGs without updating every consumer that links them
  via `raw.githubusercontent.com` URL.
- Don't commit assets in `.archive/` — that directory is gitignored. To
  truly delete an archived asset, `rm -rf` it after archiving.

## Authoring with the Claude Code skill

The [`svg-creator` skill](../.claude/skills/svg-creator/SKILL.md) automates the
whole pipeline: it boots the viewer, drafts the SVG, lints the viewBox,
verifies the PNG sibling was written, and reminds you to regenerate the
README. Just describe what you want — it auto-invokes for prompts like
"draw an archived banner" or "make a badge for X".
