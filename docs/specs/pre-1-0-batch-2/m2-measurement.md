# M2-T1 measurement: contrast themes (TECH_DEBT #505, ADR-0191)

**Taken 2026-10-13**, Chromium 1194 (headless, container), `forcedColors` emulated with `page.emulateMedia` on one live page,
viewport 1920 x 1080, by `apps/web/measure-gantt/forced-colors-m2.spec.ts` (output `measure-output/forced-colors-m2.json`,
not committed). Fixture: `seedForcedColoursPlan` in `apps/web/e2e-gantt/support.ts`. This is **emulation, not Windows with
a real theme** (`docs/TECH_DEBT.md` #154); the device check sheet steps 22 and 23 still confirm.

In this build's emulation the system colours resolve to: `Canvas` white, `CanvasText` black, `Highlight`
`rgba(5, 0, 73, 0.8)`, `GrayText` `rgb(96, 0, 0)`, `ButtonText` black. The journey compares against probes, never these
literals.

## Two instrument faults found and fixed first

1. **A colour read in the frame after a mode switch is a point on a transition.** `Button` carries `transition-colors`; the
   first reading of a pending `Button` was `rgb(0, 0, 0)` with `opacity: 1`, which looked like the rule failing on
   `Button`. With transitions disabled for the read it is `GrayText` (below). The harness and the journey now inject
   `*{transition:none!important}`. This is a reading artefact, not a product defect.
2. **A missing mark blocks `evaluate` until the test times out.** The summary had no progress band at all: the engine does
   **not** roll a child's percent up into its summary (`percentComplete` stays 0 on the summary). The seed now sets the
   summary's progress directly with `PATCH /activities/:id/progress` after the recalculation. Not faked: the band is
   the real element, drawn from the summary's own stored percent.

## Marks: forced colours active against ordinary colours (after the change)

| Mark               | Active: computed                                                                       | Differs from the box without it | Ordinary (control)          |
| ------------------ | -------------------------------------------------------------------------------------- | ------------------------------- | --------------------------- |
| Task bar           | 1 px solid `CanvasText` edge, `Canvas` fill                                            | yes                             | no border, translucent fill |
| Critical bar       | **3 px** solid `CanvasText` edge, `Canvas` fill                                        | yes                             | no border, red fill         |
| Float tail         | 1 px dashed `CanvasText` (survived unaided)                                            | yes                             | dashed, 40 % grey           |
| Baseline ghost     | 1 px dashed `CanvasText` (survived unaided)                                            | yes                             | dashed, 50 % grey           |
| Summary bar        | solid `CanvasText` fill, 1 px `CanvasText` border, `forced-color-adjust: none`         | yes                             | 70 % foreground fill        |
| Summary progress   | `Canvas` band at `left: 1px; top: 1px` inside the border                               | yes                             | 45 % foreground, flush      |
| Milestone          | solid `CanvasText` diamond                                                             | yes                             | solid foreground            |
| Progress on a task | `CanvasText` band at `left: 1px; top: 1px`                                             | yes                             | 45 % foreground, flush      |
| Armed bar          | 2 px solid `CanvasText` outline (3 px edge kept); grips solid `CanvasText`             | yes                             | 2 px blue outline           |
| Dependency arrow   | stroke stays the author's mid grey `oklch(0.5 0 0)`, 1.25 px; **survives, left alone** | yes                             | same                        |

**What vanished before the change** (read from the code and confirmed by the red runs below): the task bar, the critical
bar, progress and the grips all computed to `Canvas` fills with no ring (`box-shadow` is `none` in the mode), so they were the
page colour; the summary and milestone solid fills were replaced by `Canvas` the same way. **Survived unaided:** the float
tail and the ghost (dashed borders), the armed outline (an outline), and the arrows (an SVG stroke, not in the properties the
mode overrides), so none of those carries a forced form, as the spec predicted.

## The selected row

| Reading                         | Active                                                                 | Verdict                                 |
| ------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| Sticky first cell `::before`    | `Highlight` background, 4 px wide, `position: absolute`, `content: ""` | the edge paints                         |
| Row and sticky cell background  | `Canvas`, `forced-color-adjust: auto`                                  | nothing un-forced                       |
| Name cell, menu trigger         | `CanvasText`, `forced-color-adjust: auto`                              | reader's own ink                        |
| A bar inside the row            | `Canvas` fill, `CanvasText` edge                                       | unchanged by being in the row           |
| `⋯` trigger focused by keyboard | 2 px solid `Highlight` outline; colour behind it `Canvas`              | the ring differs from what is behind it |
| Ordinary colours                | `::before` has `content: none`, row fill is the accent wash            | the edge does not leak                  |

**The design change this reading confirms.** The spec's default was a `Highlight` fill with `HighlightText`. It was withdrawn
before measurement on the review findings (a `Highlight` fill needs `forced-color-adjust: none`, which inherits, and the
global focus ring is `Highlight`), and the numbers above are the shipped edge: the ring sits on `Canvas`, not on `Highlight`.

## Open cell, summary edge, critical

- **Open cell in the selected row:** ink differs from fill (asserted by the journey; the row is not un-forced, so the input
  keeps the mode's `Field` / `FieldText`).
- **Summary with progress keeps its left edge:** the summary has a 1 px `CanvasText` border and the band is a `Canvas` fill
  held 1 px inside it.
- **Critical:** 3 px against the task bar's 1 px, `CanvasText`, visible in the box comparison.

## Shaded controls

| Control                                                      | Active                                                                                                                                 | Ordinary (control)          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Shaded row-menu item (`Indent`)                              | `GrayText`, opacity 1                                                                                                                  | muted grey `oklch(0.5 0 0)` |
| Available row-menu item (`Logic`)                            | `CanvasText`                                                                                                                           | foreground                  |
| Shaded default `Button` (create dialog, save in flight)      | `GrayText`, `border-color: GrayText`, **opacity 1**                                                                                    | `opacity: 0.6`              |
| Shaded outline-variant `Button` (clone with `aria-disabled`) | `GrayText`, 1 px `GrayText` border, opacity 1                                                                                          | `opacity: 0.6`              |
| Toolbar controls shaded (pen held: 6; pen released: 14)      | all `GrayText`, including `Undo` and the split-button caret **after** their `forced-colors:[color:GrayText]` restatements were deleted | muted ink                   |

No pressed-and-shaded member exists in this plan's states, so the `:not([aria-pressed='true'])` exclusion is exercised by
`deck-tracks-forced-colors.spec.ts` in `web:workspace-fit`, not here. `viewport-notice.tsx` and `conflict-readout.ts` are
not interactive roles carrying `aria-disabled`, so the global selector cannot match them (by selector, not by a driven state).

## Red-first for the journey

`e2e-gantt/forced-colors.spec.ts` was run three ways against the same build:

1. **Green** with everything present (`1 passed`).
2. **Red with the global rule removed** (selector changed so it matches nothing): the first failing step was "active: the
   shaded item is GrayText and the available one is not", `a shaded menu item is GrayText`, expected `rgb(96, 0, 0)`,
   received `rgb(0, 0, 0)`.
3. **Red with the Gantt forms removed** (every `FORCED_*` constant emptied): the first failing step was "active: a task bar is
   a 1 px CanvasText edge on Canvas", expected `1px`, received `0px`.

Each was restored and the journey re-run green. Playwright stops a test at its first failed step, so these are the first of
the failures, not the whole list.
