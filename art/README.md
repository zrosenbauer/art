# `@art/library`

<p align="center">
  <a href="../README.md"><img src="https://img.shields.io/badge/catalog-browse-ec4899?style=flat-square" alt="Browse catalog" /></a>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-MIT-c026d3?style=flat-square" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/files--only-no_code-f97316?style=flat-square" alt="files only" />
</p>

> The art itself — every banner, badge, skill icon, and miscellaneous asset lives here. No source code, no entry point. Pure files.

This package exists so the viewer (`@art/viewer`) and the docs generator (`scripts/build-docs.mjs`) can discover assets via `pnpm-workspace.yaml` instead of hardcoded paths.

## Layout

```
art/
├── banners/                       wide hero banners (5:1, e.g. 1280×256)
│   └── banner_archived/
│       ├── art.yaml               metadata
│       ├── banner_archived.svg    editable source
│       └── banner_archived.png    auto-generated 2× retina
├── badges/                        compact / square status badges
├── skillicons/                    skillicons.dev-style tech icons
├── misc/                          anything else
└── .archive/                      holding pen for archived assets (gitignored)
```

Each category folder also has its own `art.yaml` with `title`, `description`, and `order` — used by the docs generator to label and sort sections.

## The directory-as-asset rule

A directory **is** an asset when it contains a file named `<dirname>.<ext>` for one of: `.svg` `.png` `.jpg` `.jpeg` `.gif` `.webp`.

The asset's name **equals** the directory name **and** the basename of every format file inside:

```
✅ banner_archived/banner_archived.svg
❌ banner_archived/foo.svg
```

The viewer's scanner and the docs generator both rely on this convention.

## `art.yaml` schema

Every field is optional; missing fields fall back to derivations from the directory name.

```yaml
title: Archived
description: Show that a project is archived and not maintained.

alt: Archived
tags: [banner, status]
examples:
  - https://github.com/javascript-is-fun

# Rare — marks PNG-only assets that predate the SVG-first workflow.
legacy: true
```

| Field         | Notes                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `title`       | Newlines stripped; `[`, `]`, backtick are escaped in markdown alt     |
| `description` | Newlines stripped                                                     |
| `alt`         | HTML-entity-encoded for use in `<img alt="…">`                        |
| `examples`    | Array of strings; each is URL-encoded                                 |
| `tags`        | Array of strings; each is rendered as `` `tag` ``                     |

## Conventions

- **Lowercase, underscores or hyphens** in names — `banner_under_construction`, never `BannerUnderConstruction`.
- **Prefix banners with `banner_`**, badges with `badge_` so they sort together.
- **Edge-to-edge viewBox** — `viewBox="0 0 W H"`. No offsets, no padding. `pnpm lint:svg` enforces it.
- **Hex colors only** in SVGs. See [`references/colors.md`](../.claude/skills/svg-creator/references/colors.md).
- **One asset per directory.** Composite layouts belong in the consumer's README.

## Don't

- Don't hand-edit a generated `.png` — re-export from the `.svg`.
- Don't put files at the `art/` root. Use a category folder.
- Don't move existing PNGs without updating every external consumer.

## Authoring with Claude Code

The [`svg-creator` skill](../.claude/skills/svg-creator/SKILL.md) automates the whole pipeline: it boots the viewer, drafts the SVG, lints the viewBox, verifies the PNG sibling, and reminds you to regenerate the README. Just describe what you want.
