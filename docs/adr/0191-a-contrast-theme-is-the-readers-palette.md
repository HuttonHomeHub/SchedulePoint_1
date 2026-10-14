# ADR-0191: A contrast theme is the reader's palette

- **Status:** Accepted — 2026-10-13. The spec was approved by the product owner on 2026-10-13, with Q4 answered "no"
  (the diagram keeps its own colours; D3). D2's mapping is the spec's default, revised after the accessibility, component and UX reviews (the selected row is an
  edge, not a fill) and trimmed by the M2-T1 readings (`docs/specs/pre-1-0-batch-2/m2-measurement.md`, taken 2026-10-13): the float tail,
  the ghost, the armed outline and the arrows survive unaided and carry no forced form.
- **Spec:** [`docs/specs/pre-1-0-batch-2/feature-spec.md`](../specs/pre-1-0-batch-2/feature-spec.md) §4.1 · **Plan:**
  [`implementation-plan.md`](../specs/pre-1-0-batch-2/implementation-plan.md) Milestone 2
- **Date:** 2026-10-13
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Builds on:** `docs/TECH_DEBT.md` #324 (the global forced-colours focus ring, whose unlayered block this joins),
  ADR-0082 and ADR-0083 (a shaded control is `aria-disabled`, never `disabled`), ADR-0055 (colour is never the only
  carrier), ADR-0113 (measure before building) and ADR-0097 (one theme, no new colour token).

## Context

A Windows contrast theme (`forced-colors: active`) replaces author colours with the reader's system colours, drops
`box-shadow` and forces every `background-color` to `Canvas`. #324 fixed the first casualty, the focus ring. Two more
were found by reading the code on 2026-10-13 (`docs/TECH_DEBT.md` #505) and are fixed here:

- **A shaded control looks available.** The product shades with `aria-disabled` (ADR-0082/0083) so the control keeps
  its tab stop and its reason. Forced colours greys only the `disabled` attribute, so a shaded menu item (muted text
  colour, which the mode replaces) and a shaded `Button` (60 % opacity, which the mode leaves) read as available. A
  shaded item is the only signal that an action is refused.
- **The Gantt's bars are the page.** A task bar is a translucent fill and a 1 px inset ring, a critical bar a fill and a
  2 px ring, a summary bar a solid fill, progress a darker fill, the selected row a `bg-accent`. All are backgrounds or
  `box-shadow`, so every one computes to `Canvas` or to nothing.

## Decision

**D1: a shaded interactive control is `GrayText` under forced colours, from one unlayered rule, and components do
not restate it.** The rule sits in `globals.css`'s existing unlayered `@media (forced-colors: active)` block for the
reason #324 gives: an unlayered declaration beats every layered utility, and a layered rule would lose to a
component's own colour class. It matches `[aria-disabled='true']` on interactive roles only (colour inherits, so a
shaded group must not grey its children) and sets `color`, `border-color` and `opacity: 1`, so `GrayText` alone carries
the state as Windows' own controls do. It sets no `box-shadow`, which the mode computes to `none`. The roles are
`button`, `a`, `input`, `select`, `textarea`, `summary` and `role=` button, link, menuitem (and radio and checkbox
forms), option, tab, treeitem, gridcell, radio, checkbox, switch, combobox, spinbutton and slider. Left out on
purpose: `row`, `group`, `toolbar`, `menu`, `listbox`, `tablist`, `grid`, `treegrid`, `tree` and `dialog`, which are
containers (greying one would grey its live children), and `separator`, which is not operable.
A component that paints its own shaded state under `forced-color-adjust: none` excludes itself by state and says so: the
toolbar's pressed-and-shaded member (a `GrayText` fill with `Canvas` ink) is excluded by `:not([aria-pressed='true'])`,
since `GrayText` ink on that fill would erase its label. A new shaded primitive needs nothing, and the two toolbar
sites that restated `forced-colors:[color:GrayText]` (the `disabled` variant and the split button's caret) lost it.

**D2: a mark that carries meaning by fill gets a forced-colours form that carries it by system colour and by shape,
and `forced-color-adjust: none` goes on a fill and on nothing that contains controls.** The vocabulary is one module,
`components/ui/forced-colors.ts`. In the Gantt:

- a task bar is a 1 px `CanvasText` edge on `Canvas`; a critical bar's edge is **3 px**. A 3 px solid edge was chosen over
  `border-double`: at the bar's 14 px height a double border is 1 px line, 1 px gap, 1 px line, which anti-aliases into a
  grey 3 px edge on some displays, while three times the width reads as "heavier" at any scaling;
- a summary bar and a milestone are solid `CanvasText`; the summary keeps a 1 px `CanvasText` border so a band laid inside
  it cannot erase its start;
- progress is a `CanvasText` band inside an outlined bar and a `Canvas` band inside a solid summary, both held 1 px inside
  the edge, so a finished task still reads as an outlined bar and not as a summary. The band follows the **bar's** branch,
  so a critical summary (an outlined bar) gets the outlined band;
- the armed outline is `CanvasText` and the grips are `CanvasText`. Not `Highlight`: that is the selected row's edge and
  the focus ring's colour, and an armed bar sits inside the selected row, so a second `Highlight` mark would blur which is
  which. A summary is never armed (its dates are a rollup), so grips are never drawn on a solid bar;
- **the selected row is a 4 px `Highlight` edge**, a pseudo-element on the sticky first cell, and not a fill. A fill was
  tried first (the spec's default) and withdrawn: a `Highlight` background needs `forced-color-adjust: none`, which
  **inherits**, so it un-forced every control, cell input and bar inside the row. That put the global `Highlight` focus ring
  on a `Highlight` fill (invisible, WCAG 2.4.7 and 2.4.11), left the armed outline and grips in author colours, gave an open
  cell input `HighlightText` ink on a light author fill, and drew `CanvasText` bars on `Highlight`. The edge is out of flow
  (no layout shift) and a pseudo-element has no descendants, so the opt-out reaches nothing else. This is the spec's own
  named fallback, now the chosen design.

A mark that is already a border or an outline (the float tail, the baseline ghost) survives and gets nothing.

**D3: canvas bitmaps keep their own palette (owner's answer to Q4, 2026-10-13).** The TSLD diagram is a bitmap with its
own palette, stays visible, and its colours are the design system's checked contrast. Repainting it from system colours
is a separate and larger piece of work, tracked as `docs/TECH_DEBT.md` #508 with a trigger: a contrast-theme user
report, or the owner's reversal.

**D4: a forced-colours check lives in the suite of the surface it tests, asserts computed system colours first, and
has an ordinary-colours control.** The Gantt's is `apps/web/e2e-gantt/forced-colors.spec.ts`. A screenshot that
differs from the same box without the mark is supplementary, because a rule that resolves to a colour nobody can see
passes a computed read. Emulation is Chromium's; it does not stand in for a real Windows theme (#154), and the device
check sheet still confirms.

## Alternatives considered

- **Per-component shaded rules in `menu.tsx` and `button.tsx`.** Smaller blast radius, but it leaves every hand-rolled
  recipe outside the two primitives uncovered, which is the population `docs/TECH_DEBT.md` #251 says keeps growing.
  Rejected.
- **A layered global rule.** Loses to any utility that sets a colour; a non-system author colour is then reverted to the
  browser default rather than to the next author rule, so it would never paint. Rejected for #324's reason.
- **A rule on every `[aria-disabled]`.** Greys a whole shaded group through inheritance. Rejected.
- **Repainting the diagram from system colours now (Q4).** Declined by the owner; recorded in D3.

## Consequences

- Every shaded interactive control in the product changes presentation under a contrast theme and under no other
  condition; ordinary colours are unchanged by construction (the rule and the variants are inside `forced-colors`).
- `docs/DESIGN_SYSTEM.md` gains one "Forced colours" section gathering the notes that were scattered; `docs/FRONTEND_QUALITY.md`
  says where forced-colours checks live and their control; `docs/COMPONENT_LIBRARY.md` says a new shaded primitive needs nothing.
- `focus-ring.structural.test.ts` guards the new rule (present, unlayered, pressed exclusion, no `box-shadow`), red first.
- A selected Gantt row is a `Highlight` edge and every control inside it stays in the reader's colours, so the global
  `Highlight` focus ring is drawn on `Canvas`. The journey asserts the ring differs from what is behind it.
- `docs/TECH_DEBT.md` #505 closes on the measurement and the journey, not on this ADR; #508 opens for D3.

## References

- `docs/TECH_DEBT.md` #505, #324, #251, #154, #508.
- `apps/web/src/styles/globals.css` (the unlayered block), `apps/web/src/features/gantt/components/GanttPanel.tsx`.
- `apps/web/e2e-gantt/forced-colors.spec.ts`, `apps/web/measure-gantt/forced-colors-m2.spec.ts`.
