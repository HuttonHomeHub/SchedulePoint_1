---
'@repo/web': patch
---

Fix the Corporate theme's colour-contrast defects structurally, by giving the token
vocabulary a notion of **surface** (ADR-0055 §1–§2, S0).

Corporate paints a navy chrome around a light page, so a single `--muted-foreground` cannot
be right in both places. Each theme now declares a complete 15-token family per surface
(`chrome`, `panel`), and a new `<Surface>` primitive rebinds the ordinary semantic names
inside a region — so the header and rail keep every class they had and simply start
resolving colours that were validated against the fill they sit on. Six defects are fixed
without touching the components that carried them: nav links at rest, on hover and on the
current page; the account area; the rail's secondary text; and the tree rows.

Also fixed, both found by the new gates rather than by eye:

- The `outline` button variant specified a fill and inherited its ink — invisible on navy.
- Placeholder text used the surface's grey rather than the field's, so a placeholder in a
  white input on navy chrome was 2:1. Fields now have their own `--field-muted-foreground`.
- Corporate's primary action on the page is the brand navy; amber (1.9:1 against the
  off-white page) stays where it is legible — the navy chrome, the focus ring there, the
  row wash and the charts.

New gates so this class of defect fails the build rather than reaching a user: a computed
contrast matrix over 3 themes × 3 surfaces, structural pins on the token architecture and
the surface seam, an ESLint rule against raw colour literals in markup, and a Playwright
suite that runs axe over **all four** theme options instead of only the default.

Light and Dark are unchanged.
