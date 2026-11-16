# Scaled workspace, M3: every state against its floor

- **Status:** Accepted — M3 readings for ADR-0222 (the milestone ADR-0179 D10 names, at the new size)
- **Date:** 2026-11-15. **Tree:** `scale-m3` on `scale-m1` at `e06bdefd` (web 1.16.0). Product code changed: one constant (section 2).
- **Harness:** `apps/web/e2e-workspace-fit/designed-floors.spec.ts`, which now **asserts** what this file reads. Real sign-up, real API, a
  real Postgres, the Vite dev server; **Chrome for Testing**, headless, `deviceScaleFactor` 1, this container's fonts (ADR-0128), so
  nothing here says anything about Firefox, WebKit or another machine's fonts. The first runs were a logging version of the same
  spec (every state, JSON out); the numbers below are those readings.
- **Fixture:** three tasks in three lanes, one link, recalculated; the pen held. One plan per pointer. The coarse pointer is a
  `hasTouch` context (`pointer: coarse`), as the existing suites use. The window is resized and the plan reopened for each state, so the
  workspace measures itself again.
- **Units:** the stage's height in **layout px** (screen height divided by the scale), because the floors are layout quantities. The
  stage is the diagram's scene canvas, or the Gantt's scrolling pane. Fractions are screen px over window height.

## 1. The readings

Stage height (layout px). "None" is no selection and the panel shut; "sel" is one activity selected (the selection bar docks in the foot
row); "panel" is the activities panel expanded (with and without a selection read the same). Every state: deck on **2 lines**, no page
scroll.

| Window (scale)        | Pointer | Diagram none | Diagram sel | Diagram panel | Gantt none | Gantt sel | Gantt panel | Deck / band share of height |
| --------------------- | ------- | ------------ | ----------- | ------------- | ---------- | --------- | ----------- | --------------------------- |
| **1280 × 800** (1)    | fine    | 562          | 486         | 332           | 602        | 526       | 372         | 0.10 / 0.11                 |
| **1280 × 800**        | coarse  | 546 ¹        | 454 ¹       | 316 ¹         | 586 ¹      | 542 ¹     | 356 ¹       | 0.12 / 0.13                 |
| **1024 × 600** (0.75) | fine    | 545          | 469         | 315           | 585        | 509       | 355         | 0.10 / 0.11                 |
| **1024 × 600**        | coarse  | 524          | 432         | swapped ²     | 564        | 520       | swapped ²   | 0.12 / 0.13                 |

¹ Read at scale **0.995**, which is finding 1 below; after the fix the same states read at scale 1 and the test asserts them.
² At coarse 1024 × 600 the layout is 17 px under the short-body line (ADR-0222 D3's note on the 0.75 floor), so Expand gives the panel the
whole body and hides the stage (ADR-0180 D1). That is the designed behaviour and the test names it.

**The floors.** The diagram is owed 350 px with nothing beside it (ADR-0092; `floor-states.spec.ts`'s `CANVAS_MIN_PX`) and the panel's
`CANVAS_MIN_HEIGHT` 240 while the activities panel is open (a panel is the reader's own choice of split, ADR-0180). Every non-swapped
state clears its floor at 1280 × 800 on both pointers (lowest: 454 without the panel, 316 with it), and so does 1024 × 600 scaled. The
Gantt has no floor of its own in an ADR; the same two numbers are asserted and it clears them (lowest 520 / 355).

**Walkthrough rank 47** ("with touch at 1024 × 600 the toolbar takes about 0.43 of the height in four rows"): the deck is **two rows and
0.12 of the height** at 1280 × 800 and at 1024 × 600 scaled, on a finger. That was the actual-size layout's cost; scaling removed it. At
**actual size** (the opt-out, ADR-0222 D9) a finger at 1024 × 600 still has three rows and 0.25 of the height (band 156 px), which is the
short-window rules' result and is not this milestone's.

## 2. What was under its floor

1. **A touch screen at the designed size was scaled to 0.995.** The finger-sized band is 104 px against the designed 88, the unit's box
   came out 1003 × 746 against 1003 × 749, and `min(1, 1003/1003, 746/749)` is 0.996 (`steady` rounds to 0.995). Every glyph went through
   a resampling transform and the foot row offered "Scaled to 99 %", at the window the layout is designed for. Fix, inside the existing
   rule: `WORKSPACE_SCALE_SNAP = 0.99`, a fit within 1 % of 1 is 1 (`workspace-scale.ts`). Red first: with the snap disabled the new unit
   test (`snaps a fit within 1 %…`) fails, and the live sweep read 0.995 before the change and reads 1 after.
2. Nothing else. No diagram, Gantt, deck-line or deck-share reading at 1280 × 800 is under its floor, with or without a selection, on
   either pointer. The 1024 × 600 selection bar that ADR-0219 recorded under 350 px is now 469 (fine) and 432 (coarse): the scale gave
   the layout the height the short-window rules were chasing.

## 3. Pressable controls under 24 × 24

Every `button`, link, field, `summary`, focusable `tabindex`, and `role` of button, tab, menuitem, switch, checkbox, radio, option or
slider in `main` and in the command band, measured in layout px (30 to 56 per state), in all 32 states above **and** at actual size at
1024 × 600 and 800 × 600 on both pointers: **none is under 24 × 24, with two named exceptions and two non-targets.** The selector omits the Gantt's rows and grid cells, which render at 21 and 12 px at 0.75 (a `role="row"` with `tabindex=0` at 461 × 21, gridcells at 63 × 12, measured in the accessibility sweep): the Gantt is ADR-0183 D7's named exception, and axe's target-size rule passes there at both pointers. Two things measure under 24 and are not targets: the diagram's
parallel listbox (a 1 px screen-reader copy of the canvas), and the 1 px divider lines, whose hit strip (`[data-resizer-hit]`, at least 24
px, 44 on a finger) is what the audit measures. The foot row's Recalculate was the one that passed 2.5.8 only through the spacing exception;
`e06bdefd` made it 24 px. **Not covered:** controls that exist only while a menu, popover or dialog is open (those are portalled and
unscaled; `scaled-workspace.spec.ts` runs axe's `target-size` over the workspace).

## 4. Actual size, recorded and not changed

The opt-out layout (`chooseActualSize`) at 1024 × 600, stage in px: fine 362 none / 326 selection; coarse **290 / 200** (194 visible), three deck
rows. At 800 × 600: fine 358 / 322, coarse 338 / 242, one deck row. With the panel open every one of them swaps. These are the short-window
rules' results, kept by ADR-0222 D9 for a reader who zoomed, enlarged text or chose actual size; M3's scope is the designed window.
