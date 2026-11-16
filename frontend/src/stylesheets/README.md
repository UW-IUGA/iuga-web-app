# Stylesheets for the IUGA Web Application
- [7-1 Architecture](https://sass-guidelin.es/#architecture)

## Folder structure

| Folder | Purpose |
|---|---|
| `abstracts/` | Design tokens (`_variables.scss`), shared mixins (`_mixins.scss`), theme roles (`_theme.scss`), and the admin and events-calendar palettes |
| `base/` | Global element styles: reset, typography, color utilities, misc helpers |
| `vendors/` | Third-party library overrides (include-media, toastify) |
| `layout/` | Structural components: container, responsive navigation, footer, form |
| `components/` | Reusable UI: buttons, cards, calendar, tags, sidebar, etc. |
| `pages/` | Page-specific styles (home, events, resources, etc.) |

## Conventions

- `main.scss` holds no CSS rules, only `@use` lines that load the partials
- Load order: vendors → base → layout → components → pages. `abstracts/` is not
  in that list: it emits no CSS, and each partial loads it itself with
  `@use "../abstracts" as *;`
- Every partial ends up in one global bundle, so a class name in one page's
  partial styles any element with that class on every page. Prefix a page's
  classes with the page name, or nest them under its root class
- All color and font variables use the `$color-*` naming convention
- Colours that change with the light/dark theme are roles, not variables:
  `theme(heading)`, `theme-alpha(brand, 0.12)`, from `abstracts/_theme.scss`
  (see Theme in `docs/FRONTEND.md`). A partial that uses them must load the
  abstracts, or Sass prints `theme(...)` into the CSS unchanged
- All variables are centralized in `abstracts/_variables.scss`