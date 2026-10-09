# ADR-0182: A page grid splits on the width it has

- **Status:** Accepted — 2026-10-09. The spec was approved by the product owner on 2026-10-08 (CQ-1:
  change the default for all three consumers). CQ-2, the threshold, was delegated to the M0
  photographs and decided on 2026-10-09 by the coordinator under that delegation; the product owner can
  object.
- **Spec:** [`docs/specs/landing-two-columns/feature-spec.md`](../specs/landing-two-columns/feature-spec.md)
  (with its dated amendment) · **Plan:** [`implementation-plan.md`](../specs/landing-two-columns/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/landing-two-columns/m0-measurement.md)
- **Date:** 2026-10-09
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0143 D3's mechanism (the split moves from a viewport rule to a container rule); its
  span-by-demand rule stands.
- **Builds on:** ADR-0146 D1 (one page measure), ADR-0179 D1 (the 1024 × 600 floor, Explorer at its
  default width), ADR-0105 (why this was a spec), ADR-0113 (measure the problem first).

## Context

`PageGrid` went to two columns at Tailwind `md` (768 px of viewport). That was a proxy for a rule its
own docblock stated — a column must not be narrower than the width at which a row reads — chosen before
the shell had a docked Project Explorer. The Explorer takes 34 to 420 px beside every organisation
screen, so the grid's width is not the window's: at the 1024 floor the columns were 338 px, below the
366 px the docblock called the defect, and one window size gave grids up to 386 px apart depending on
the Explorer.

The brief's remedy, "two columns only from `xl`", is `min-width: 1280px` inclusive and does not fix 1280. M0 measured every width the spec derived (955 / 466 at 1280, 1115 / 546 at 1440, 1488 / 732 at
1912, and 699 / 338 at 1024 for the first time) and applied the spec's written decision rule.

## Decision

1. **`PageGrid` splits on its own width.** It renders a frame that declares `@container` and a grid
   inside that queries it: one column until the grid reaches **72rem** (`@6xl`), two after. The unit is
   rem, so a larger reading size keeps the page single-column longer. A column is never narrower than
   564 px.
2. **The threshold is chosen by the one clause of SC-6 that can discriminate: a plan name must not wrap
   to a second line.** In "Needs your attention" a 57-character plan name wraps in 500 and 505 px
   tracks (`@5xl`'s narrowest pair) and not in 546 px or wider. The rule's other clause — no
   `project · client` subtitle truncated mid-word — fails at 1912 (258 of 284 px shown) and so cannot
   choose a threshold; it is dropped as a threshold test. That truncation is `RowSubject`'s, at every
   width, and is `docs/TECH_DEBT.md` #472.
3. **Everything keyed to the split is emitted by the primitive.** A `wide` item spans
   `col-span-full`, which needs no breakpoint; the landing's capped, fit-then-fill row template is the
   `rows="fit-then-fill"` prop, emitted beside `@6xl:grid-cols-2` in the same file, so the threshold is
   written once.
4. **The caller's `className` lands on the frame**, which is always `flex min-h-0 flex-1 flex-col` (the
   `StatGrid` and `FieldGridContainer` convention). The grid takes no public override. The frame adds
   no landmark and no role.
5. **It applies to all three consumers** — the organisation landing, Members and the staff console.

## Alternatives considered

- **A. `xl:` viewport split** (the brief). Misses its own target: `xl` includes 1280.
- **B. A higher viewport breakpoint.** Blind to the Explorer, and a single column up to ~1274 px wide
  at 1599 brings back the rows ADR-0098 narrowed.
- **C. A landing-only class override.** One-off styling that fights the primitive through `twMerge`.
- **D. An opt-in prop, default unchanged.** Keeps a mode nobody wants and leaves Members cramped.
- **`@5xl` (64rem).** Rejected by M0: a long plan name wraps at its narrowest pair.

## Consequences

- With the Explorer at 276, the landing and Members are **one column at windows up to 1476** and two
  from 1477. **A 1440 laptop, which `@5xl` would have left in two 546 px columns, gets one 1115 px
  column.** That is the price of the name not wrapping, and it is the width ADR-0146 rejected as too
  wide a single column; it is accepted here and stated rather than softened. The product owner's two
  screens (1912) are unchanged, 732 px tracks.
- The Explorer is now seen: folded at 1280 the grid is 1187 and splits; at 420 a 1440 window is 971 and
  stays one column. Browser zoom counts as width — 150 % on a 1912 monitor (~1275) is one column.
- The staff console has no Explorer, so it splits from a 1200 px window and changes only in 1024–1199
  (derived, not measured).
- The landing's height cap exists only where the grid is two columns; below the split the four boxes
  stack at their own height and `<main>` scrolls. Each `fill` body keeps its tab stop although it no
  longer scrolls (`docs/TECH_DEBT.md` #474).
- `container-type: inline-size` applies layout containment: the frame is the containing block for any
  non-portalled `fixed` or `absolute` descendant. Nothing in the three screens renders one (scanned);
  `Menu` and `Tooltip` portal to `body`. The requirement stands for the next section added.
- The reflow is instant, with no transition, as `md:` was.
- Behaviour is held by the `e2e-overview` journey; jsdom evaluates no container query.

## References

- `docs/TECH_DEBT.md` #333 (the report), #472 (subtitle truncation), #473 (splitter `region`), #474
  (fill-body tab stop), #475 (stale statements)
- `apps/web/src/components/ui/page/page-grid.tsx`, `page-grid.structural.test.ts`
