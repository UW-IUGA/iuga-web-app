# Stylesheets for the IUGA Web Application
- [7-1 Architecture](https://sass-guidelin.es/#architecture)

## Folder structure

| Folder | Purpose |
|---|---|
| `abstracts/` | Design tokens (`_variables.scss`) and shared mixins (`_mixins.scss`) |
| `base/` | Global element styles: reset, typography, color utilities, misc helpers |
| `vendors/` | Third-party library overrides (include-media, toastify) |
| `layout/` | Structural components: container, responsive navigation, footer, form |
| `components/` | Reusable UI: buttons, cards, calendar, tags, sidebar, etc. |
| `pages/` | Page-specific styles (home, events, resources, etc.) |

## Conventions

- `main.scss` is an import-only file — no CSS rules, just `@import` statements
- Import order: abstracts → vendors → base → layout → components → pages
- All color and font variables use the `$color-*` naming convention
- All variables are centralized in `abstracts/_variables.scss`