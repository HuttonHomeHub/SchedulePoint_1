# ADR-0006: Styling and design tokens

- **Status:** Accepted
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
