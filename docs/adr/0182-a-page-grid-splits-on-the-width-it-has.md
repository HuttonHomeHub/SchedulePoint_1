# ADR-0182: A page grid splits on the width it has

- **Status:** Accepted (CQ-2 threshold provisional: chosen by the orchestrator under the product
  owner's delegation, pending his confirmation) — 2026-10-09. The spec was approved by the product
  owner on 2026-10-08 (CQ-1: change the default for all three consumers). CQ-2, the threshold, was
  delegated to the M0 photographs; the rule could not decide it and the orchestrator chose 72rem.
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

- **What a reader sees, measured on the same fixture before and after, Explorer at 276** (boxes
  wholly visible without scrolling, of four; `m0-raw-run.md` and `m1-after-run.md`):

  | Window                            | Before (two columns from `md`) | After (one column, stacked at content height)             |
  | --------------------------------- | ------------------------------ | --------------------------------------------------------- |
  | 1024 × 600                        | 2 of 4                         | **1 of 4**; `<main>` scrolls 2179 px in a 549 px viewport |
  | 1280 × 800                        | 2 of 4                         | **1 of 4**; scrolls 2179 in 749                           |
  | 1440 × 900                        | 2 of 4                         | **1 of 4**; scrolls 2179 in 849                           |
  | 1272 × 1800 (the surface upright) | 4 of 4                         | **3 of 4**                                                |
  | 1477 × 900 and up                 | unchanged                      | unchanged (two columns); 1912 is identical, 732 px tracks |

  One column is the product's decision to put readable rows ahead of an above-the-fold count, and it
  costs most at the 1024 × 600 floor: the first box ("Jump back in", 179 px) is what is visible, and
  the other three are a scroll away. A 1440 laptop, which `@5xl` would have left in two 546 px
  columns, gets one 1115 px column, the width ADR-0146 rejected as too wide a single column.

- **The poorest two-column state.** At 1477, the narrowest pair, the long programme's `project ·
client` subtitle shows **0 of 584 px** in "Where the work stands" and "Recently changed", and the
  ordinary pair 154 and 124 of 284 px. That is `RowSubject`'s defect at every width
  (`docs/TECH_DEBT.md` #472, at 1912 it still shows 133 and 125 px of the long one), not something the
  threshold can remove. Only 1477 and 1912 were photographed; 1478–1911 is interpolated.
- **72rem is a named Tailwind step chosen with margin, not the minimum the evidence allows.** The
  name-wrap boundary is bracketed between 505 and 546 px tracks, so a grid of about 1034–1115 px would
  keep a 1440 window in two columns. An arbitrary `@[69rem]` is a possible later refinement and needs
  one re-take at 1400 and 1440; it was not taken because the evidence cannot place the boundary
  inside that bracket.
- The Explorer is now seen: folded at 1280 the grid is 1187 and splits; at 420 a 1440 window is 971 and
  stays one column. Browser zoom counts as width: 150 % on a 1912 monitor (~1275) is one column.
- The staff console has no Explorer, so it splits from a 1200 px window and changes only in 1024-1199.
  That result is **derived, not measured**: no staff track has ever been photographed.
- **The cap is written in two files.** The grid takes its height only from the split (`@6xl:min-h-0
@6xl:flex-1`) and so does a `fill` section card (`SectionCard`); in one column the four boxes stack
  at their content height. The first build left the caps on in every state and clamped four boxes to
  220 px each; the journey now measures box height, body clipping and `<main>` scroll in one column.
  `page-grid.structural.test.ts` holds the two files to one container size.
- Each `fill` body keeps its tab stop although in one column it no longer scrolls
  (`docs/TECH_DEBT.md` #474).
- `container-type: inline-size` applies layout containment: the frame is the containing block for any
  non-portalled `fixed` or `absolute` descendant. Nothing in the three screens renders one (scanned);
  `Menu` and `Tooltip` portal to `body`. The requirement stands for the next section added.
- The reflow is instant, with no transition, as `md:` was.
- Behaviour is held by the `e2e-overview` journey; jsdom evaluates no container query.

- **Closed by ADR-0184 (2026-10-09):** the `RowSubject` truncation this ADR set aside as #472 is fixed
  (`docs/specs/row-subject-truncation/`). The 1477 × 900 poorest-case reading above is superseded: the long
  programme's subtitle is shown whole there, at the cost of row height.

## References

- `docs/TECH_DEBT.md` #333 (the report), #472 (subtitle truncation), #473 (splitter `region`), #474
  (fill-body tab stop), #475 (stale statements)
- `apps/web/src/components/ui/page/page-grid.tsx`, `page-grid.structural.test.ts`
