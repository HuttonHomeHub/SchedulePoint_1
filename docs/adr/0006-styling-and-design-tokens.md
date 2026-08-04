# ADR-0006: Styling and design tokens

- **Status:** Accepted — **except the shadcn/ui + Radix clause, which was never
  adopted.** The token model, Tailwind v4 CSS-first, CVA and the dark-mode
  strategy below are all live and binding. The component-library clause is not:
  `src/components/ui/` is **hand-rolled on semantic HTML + the WAI-ARIA APG**,
  and there has never been a Radix dependency in `apps/web/package.json`. The
  standard that actually governs a primitive is
  [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) and
  [`docs/COMPONENT_LIBRARY.md`](../COMPONENT_LIBRARY.md); adding a component
  library is an ADR-level decision that has not been taken. Recorded by the
  2026-08-04 reconciliation pass, which found this ADR still instructing a
  reader to copy in shadcn primitives — the decision body is left intact
  (`CLAUDE.md` §6: never rewrite an ADR) and this line carries the correction.
- **Date:** 2026-07-08
- **Deciders:** Frontend architecture, Design System

## Context

The UI must feel like a polished, consistent commercial SaaS product across
many screens and many years of contributors. That requires a single source of
truth for visual decisions (colour, type, spacing, radius, motion), a
mechanism that makes _consistent_ the path of least resistance, and _zero_
one-off component styling.

The stack already commits to Tailwind CSS v4, shadcn/ui, and Lucide (see
`CLAUDE.md`). This ADR records _how_ we use them.

## Decision

- **Design tokens are the source of truth.** Semantic tokens (e.g. `background`,
  `primary`, `muted-foreground`, `destructive`, `ring`) are defined once as CSS
  custom properties in `apps/web/src/styles/globals.css`, for both light and
  dark themes, authored in **OKLCH**. Tailwind's `@theme inline` maps them to
  utilities. Components use **semantic utilities only** (`bg-primary`,
  `text-muted-foreground`) — never raw palette values or magic hex.
- **Tailwind CSS v4 (CSS-first)** for styling. No `tailwind.config.js`; theme
  lives in CSS. Utilities keep styles co-located and purgeable.
- **shadcn/ui + Radix primitives** for accessible, unstyled behaviour that we
  own as source (copied into `src/components/ui/`), not a black-box dependency.
- **Variants via `class-variance-authority` (CVA)** with `clsx` +
  `tailwind-merge` (a `cn()` helper). Component variants (size, intent, state)
  are declared once in the component, giving a typed, discoverable API and
  eliminating ad-hoc class soup at call sites.
- **Dark mode** via a `.dark` class on `<html>` (class strategy), driven by the
  theme manager (see ADR/architecture); tokens flip automatically.

## Alternatives considered

- **CSS Modules / plain SCSS** — no token enforcement, easy to drift into
  one-off styles; weaker consistency guarantees. Rejected.
- **CSS-in-JS (styled-components/Emotion)** — runtime cost, SSR friction, and
  redundant given Tailwind. Rejected.
- **A heavy component kit (MUI/Chakra/Ant)** — fast to start but hard to
  restyle to a distinctive brand and to keep accessible/consistent on our
  terms; large bundle. Rejected in favour of owning shadcn/ui primitives.
- **Tailwind config in JS (v3 style)** — superseded by v4's CSS-first theming.

## Consequences

- **Positive:** one place to change the look of the whole app; consistent,
  accessible primitives; small CSS; typed variant APIs; trivial theming.
- **Negative / risks:** contributors must learn the token names and the `cn()`
  - CVA pattern (documented in `docs/DESIGN_SYSTEM.md` and
    `docs/COMPONENT_LIBRARY.md`). "No one-off styling" is enforced by the
    Component Reviewer and UX Reviewer agents.

## References

- `docs/DESIGN_SYSTEM.md`, `apps/web/src/styles/globals.css`,
  <https://ui.shadcn.com>, <https://cva.style>
