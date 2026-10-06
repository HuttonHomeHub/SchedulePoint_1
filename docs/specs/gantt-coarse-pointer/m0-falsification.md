# M0 — the predictions, committed before the first run

> **Committed before any measurement ran**, in its own commit, so the ordering is provable from
> `git log` rather than asserted ([`implementation-plan.md`](implementation-plan.md) M0-T0; the
> ADR-0118 M0 precedent, `docs/specs/touch-and-control-height/m0-falsification.md`).
>
> Every prediction below is read from the code, not run. The run is allowed to disagree with all
> of them. Anything the emulator cannot settle is `INDETERMINATE` (ADR-0128 D4) until the product
> owner's device answers.

**Verdicts** are `CONFIRMED`, `REFUTED` or `INDETERMINATE`. The instrument is CDP
`Input.dispatchTouchEvent` in container Chromium, with `matchMedia('(pointer: coarse)')` asserted
first (ADR-0118 D3) — emulation, not a Surface.

## The predictions

| #   | Target                                                       | Prediction (fine → coarse)                                                        | Falsified by                                                                                         |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P1  | Bar body (movable)                                           | 14 tall at both; `touch-action: auto`; CDP touch drag → `pointercancel`, no write | A touch drag writes (version changes), or the body's `touch-action` is not `auto`, or height != 14.  |
| P2  | Edge handles, **selected** bar                               | 8 × 14 at both; `touch-none`; CDP touch drag resizes                              | A touch drag on a selected edge does not write, or the box differs, or `touch-action` is not `none`. |
| P2b | Edge handles, **unselected** bar                             | Same as P2: **a finger resizes instead of scrolling** (an accidental-write path)  | A touch drag on an unselected edge does not write (the path does not exist).                         |
| P3  | Row menu trigger `⋯`                                         | 28 × 28 at both                                                                   | Either dimension differs at either pointer.                                                          |
| P4  | WBS disclosure chevron                                       | <= 16 × 16 at both, so below 24 at fine                                           | Either dimension >= 24 (M2-T2 is then dropped).                                                      |
| P5  | Sort header buttons                                          | 24 tall at both                                                                   | Height != 24 at either pointer.                                                                      |
| P6  | Column edges                                                 | 24 × 34 at fine; not rendered at coarse                                           | Rendered at coarse, or a different size at fine.                                                     |
| P7  | `Grid width` divider                                         | ~24 wide; `touch-action: auto`; `pointercancel` (as #439)                         | A touch drag moves the divider, or `touch-action` is not `auto`.                                     |
| P8  | Long-press / right-click on a row                            | No app menu; browser default; `contextmenu` timing (hold vs release) is recorded  | An app menu opens (some other handler exists), or no `contextmenu` event fires at all on a hold.     |
| P9  | Double tap on a writable cell                                | `INDETERMINATE` in emulation                                                      | Not falsifiable by emulation; the device answers (checklist item 5).                                 |
| P10 | Open cell input                                              | 24 tall at both                                                                   | Height != 24 at either pointer.                                                                      |
| P11 | Row menu items                                               | >= 44 at coarse                                                                   | Any item < 44 tall at coarse.                                                                        |
| P12 | `View` Columns group width fields and `Show logic links`     | Width fields 44 at coarse; compact checkboxes unknown (recorded)                  | Width fields < 44 at coarse.                                                                         |
| P13 | Object bar in the Gantt                                      | >= 44 at coarse                                                                   | < 44 at coarse.                                                                                      |
| P14 | Milestone diamond                                            | No pointer handler at either pointer: a touch drag does not write                 | A drag writes.                                                                                       |
| P15 | Refusal reasons                                              | `title` only, on an `aria-hidden` span; a refused touch is silent                 | A refusal is announced or visible text appears on a touch refusal.                                   |
| P16 | **TSLD canvas**: finger on an unselected bar, selected, hold | The canvas owns every gesture (`touch-none`); a hold opens nothing                | The canvas scrolls on touch, lets the browser claim the gesture, or a hold opens a menu.             |

Sources: `GanttPanel.tsx:1967-1994` and `use-bar-pointer-drag.ts:152-159` (P1);
`GanttPanel.tsx:2043-2063` (P2, P2b); `button.tsx:75` (P3); `GanttPanel.tsx:1856-1874` (P4);
`GanttPanel.tsx:1119-1146`, `GanttRuler.tsx:6` (P5); `GanttColumnEdge.tsx:64` (P6);
`panel-resizer.tsx:104-135` (P7); no `onContextMenu` under `features/gantt` (P8); `GanttCell.tsx:137`
(P9), `:155` (P10); `menu.tsx:457` (P11); `gantt-columns-group.tsx:179-241`, `form.tsx:263-307`
(P12); `toolbar-styles.ts:179` (P13); `GanttPanel.tsx:1952-1957` (P14); `GanttPanel.tsx:1992`,
`use-bar-pointer-drag.ts:84-85` (P15); `TsldCanvas.tsx:2323` (P16).

## What each outcome decides

Go / no-go per later task is written in `m0-measurement.md` (M0-T3) from the verdicts above, using
the exits in the implementation plan: M1-T1 on P1 / P2 / P2b, M1-T2 on P8, M2-T1 on the device's
edge hit rate, M2-T2 on P4, M2-T3 on the device's header hit rate.
