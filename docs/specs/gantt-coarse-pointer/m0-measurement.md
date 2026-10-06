# M0 — Measurement record

Evidence for [`implementation-plan.md`](implementation-plan.md) M0 (ADR-0113, ADR-0142): the problem is
measured before the remedy is built. The predictions were committed first, in
[`m0-falsification.md`](m0-falsification.md) (commit `d05cc009`, before the harness existed). Nothing
here changes the product.

**Command** (from the repository root, after `scripts/e2e-local.sh --db-only`):

```sh
pnpm --filter @repo/web measure:gantt --grep "M0-T1"
```

Spec: `apps/web/measure-gantt/coarse-targets.spec.ts`, in the existing
`playwright.measure-gantt.config.ts` (no new config, no CI step). Output (gitignored):
`apps/web/measure-output/gantt-coarse-targets.json`, whose `tallies` and `spread` keys are what the
tables below are read from.

**Run:** 2026-10-06, three runs per cell, 16.7 minutes, **container Chromium**. This is **emulation, not
a Surface**: gestures are CDP `Input.dispatchTouchEvent`, so a real finger's palm rejection, the OS's own
long-press and the Surface's `pointer: fine`-with-the-cover-attached are not measured. Anything that
turns on them is `INDETERMINATE`, and the device checklist
([`device-checklist.md`](device-checklist.md)) is the arbiter (ADR-0128 D4).

**Fixture:** `plan:capability-types-and-wbs`, seeded through the public REST API by the seeder CLI. A
**fresh plan per run** (12 plans): an edge drag writes, and the first three-run set reused one plan, so a
second run found the bar pushed off screen and read nothing (kept here because it reads as a flaky browser
and was not one). Viewports 1646 × 1097 and 1368 × 912. Contexts `fine` (`pointer: fine`) and `coarse`
(`hasTouch: true`), with `matchMedia` asserted in each before anything was read.

**The hybrid (ADR-0118 D7).** The `fine` context received the same CDP touch gestures, so its readings are
touch input delivered under `pointer: fine`: the nearest emulation of the Surface with the cover attached.
The two contexts agree on every gesture below except where stated. That is evidence the gesture outcomes do
not depend on the media query, **not** evidence about the real device.

**Pinned positives** (the spec fails without them): at least one disclosure chevron, one movable bar, a
start handle and a finish handle, and `pointer: coarse` matching in the coarse context. All held.

**What is stable and what is not.** Every size and `touch-action` figure below was identical across the
three runs and both viewports, except where noted. Gesture outcomes were stable for the body, the divider,
the milestone, the summary bar, the double tap, the hold and the canvas. **Edge-handle outcomes were not**
(see P2): the same handle resizes in one run and is cancelled in the next, in both contexts, and the
`spread` key lists every reading that moved. They are reported as counts, never as a single verdict.

## Verdicts

| #   | Prediction                                            | Verdict                                                           | Reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Bar body 14 tall, `touch-action: auto`, touch cancels | **CONFIRMED**                                                     | 14 tall at both pointers and both viewports (width 235.5 / 152.1, or 54 in a few runs: the plan's calculated state, not the pointer). `touch-action: auto`. A touch drag ended in `pointercancel` **12 of 12** (four cells, three runs) for the unselected bar **and 12 of 12 for the selected one**, never wrote and never scrolled (the chart had nothing to scroll; the cancel is the browser claiming the gesture): selecting a bar changes nothing today.                                                                                                                                  |
| P2  | Selected bar's edges 8 × 14, `touch-none`, resize     | **CONFIRMED on geometry; INDETERMINATE on the gesture**           | 8 × 14, `touch-action: none`, at both pointers. Touch drag of the selected finish edge: `pointerup` 12 of 12, wrote 7 (the five that did not write ended in `pointerup` with no version change, a no-op drag, not a cancel). Selected start edge: wrote 11 of 12, **cancelled 1**. So a `touch-none` handle was cancelled by the browser: across the three start-edge touch cells **11 of 36** attempts, against **0 of 12** for the mouse control on the same handle (wrote 11 of 12). Why is not established; it is the reading the M1-T1 journey must not trip over, and the device decides. |
| P2b | Unselected bar's edges resize instead of scrolling    | **CONFIRMED**                                                     | A touch drag on an **unselected** bar's finish edge wrote in **11 of 12** runs (`pointerup` 12 of 12) and never scrolled. The start edge (+20 px) wrote in 6 of 12 and was cancelled in the other 6; the same drag the other way (-20 px) wrote in 7, cancelled in 4. The handles are `touch-none` whatever the selection, so the accidental-write path exists.                                                                                                                                                                                                                                 |
| P3  | Row menu trigger 28 × 28                              | **CONFIRMED**                                                     | 28 × 28 at both pointers. **New:** it overlaps the start handle of a bar that starts near the chart's left edge (see Collisions).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P4  | Chevron <= 16 × 16, below 24 at fine                  | **CONFIRMED**                                                     | 12 × 12 at both pointers. The §2.5.8 24 px-circle spacing test **passed** on this fixture (nothing else within 12 px of its centre): recorded, not judged. Whether the spacing exception holds is M2-T2's decision, and the plan already doubts it, because the chevron sits inside a row that is itself a target.                                                                                                                                                                                                                                                                              |
| P5  | Sort headers 24 tall                                  | **CONFIRMED, one exception**                                      | Five of six are 24 tall. `Float left` is 44 × 32. All six pass the spacing test. None is under 24.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P6  | Column edges 24 × 34 fine, not rendered coarse        | **CONFIRMED**                                                     | Six edges at 24 × 34, `display: block`, under `pointer: fine`; `display: none` (0 × 0) under `pointer: coarse`, in both viewports.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P7  | Divider ~24 wide, `touch-action: auto`, cancels       | **CONFIRMED on behaviour; REFUTED on the box**                    | `touch-action: auto`; a touch drag cancelled 12 of 12 after moving the value 584 to 598 (14 px of 40). The separator element's own box is **1 px wide** (the grab area is a descendant), not ~24. Consistent with `docs/TECH_DEBT.md` #439.                                                                                                                                                                                                                                                                                                                                                     |
| P8  | No app menu on a hold; `contextmenu` timing           | **CONFIRMED (no app menu); INDETERMINATE (`contextmenu` timing)** | An 800 ms hold produced no app menu, no selected text, and **no `contextmenu` event at all** in emulation: `pointerdown`, `touchstart`, then on release `pointerup`, `touchend`, `selectstart`, `click`. CDP does not synthesise the OS long-press, so whether Windows fires `contextmenu` on hold or on release is the device's answer.                                                                                                                                                                                                                                                        |
| P9  | Double tap on a cell: indeterminate                   | **INDETERMINATE**                                                 | In emulation a double tap synthesised `dblclick` and opened the input 12 of 12. That is the browser's emulation, not a Surface; checklist item 5.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P10 | Open cell input 24 tall                               | **CONFIRMED**                                                     | 164 × 24 at both pointers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P11 | Row menu items >= 44 coarse                           | **CONFIRMED**                                                     | 10 items, 32 px at fine and 44 px at coarse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P12 | Width fields 44 coarse; compact checkboxes unknown    | **CONFIRMED; the unknown is now known**                           | Width fields 96 × 36 fine, 96 × 44 coarse. **Compact checkboxes** stay a 28 px row with a 16 × 16 box at **both** pointers, so under 44 at coarse: an ADR-0118 D1 exception candidate for M2-T4.                                                                                                                                                                                                                                                                                                                                                                                                |
| P13 | Object bar >= 44 coarse                               | **CONFIRMED**                                                     | Every toolbar button is >= 36 at fine and >= 44 at coarse (min width 24 fine, 44 coarse).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P14 | Milestone diamond has no pointer handler              | **CONFIRMED**                                                     | 14.1 × 14.1. A touch drag cancelled 12 of 12 and wrote nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P15 | Refusal reason is `title` only; touch is silent       | **CONFIRMED**                                                     | The summary bar's reason is a `title` on an `aria-hidden` span; a touch drag on it cancelled 12 of 12 and the live regions did not change.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P16 | TSLD canvas owns every gesture                        | **CONFIRMED on the canvas; INDETERMINATE on writes**              | Scene canvas `touch-action: none`; no `pointercancel` in any of 18 touch readings (drag, tap-then-drag, hold); a hold opens no menu. Writes cannot be judged: the **mouse control wrote nothing either**, so the pixel scan may not have found a bar. Fine-pointer / coarse readings agree. 1646 only.                                                                                                                                                                                                                                                                                          |

## Collisions (new, not predicted)

**The row menu trigger sits over the first 28 px of the chart.** For a bar (or a milestone) that starts at
the chart's left edge, the element at the centre of its start handle is the `⋯` button (or its icon), at
both 1646 and 1368:

| Viewport (pointer) | Start handle box | Hit at its centre | Start-of-plan diamond hit | `⋯` box        |
| ------------------ | ---------------- | ----------------- | ------------------------- | -------------- |
| 1646 (fine)        | x 883.2, 8 × 14  | `button`          | `button`                  | x 861, 28 × 28 |
| 1646 (coarse)      | x 883.2, 8 × 14  | `button`          | `button`                  | x 861, 28 × 28 |
| 1368 (fine)        | x 873.9, 8 × 14  | `svg` (in `⋯`)    | `svg` (in `⋯`)            | x 861, 28 × 28 |
| 1368 (coarse)      | x 863.0, 8 × 14  | `span`            | `span`                    | x 861, 28 × 28 |

The row menu's own 24 px circle also intersects the start handle on the ordinary task row used for P3.
Per M2-T1's exit, a collision **re-scopes** that task (back to the product owner): a start zone that "grows
outward" would grow into the `⋯`.

## Go / no-go per later task

| Task                                    | Verdict                                                                      | Because                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1-T1** arm by selection              | **GO**                                                                       | P1 and P2b are both confirmed, so neither exit fires: the whole-task drop needs both refuted. A finger cannot move a bar (12 of 12 cancelled), and selecting does not change that, so the `pan-y`-when-selected rule is the fix, not an addition. Stylus exit: **owed from the device** (emulation here is touch only). The journey must be written to tolerate, and to investigate, the start-handle cancellation (P2).                                         |
| **M1-T2** long-press / right-click menu | **GO**; fallback **owed from the device**                                    | P8: no app menu exists today. The fallback ("Windows fires no `contextmenu` on a touch hold, so extract `useLongPress`") rests on a reading emulation cannot take: **no `contextmenu` arrived in emulation**, which is what the fallback assumes, but CDP does not synthesise the OS long-press, so the decision is made from checklist item 4. Build the `contextmenu` path (the right-click half needs no device); decide the fallback on the device's answer. |
| **M1-T3** device confirmation + docs    | **GO**                                                                       | Depends on M1-T2.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **M2-T1** edge zones grow outward       | **RE-SCOPE (back to the product owner); edge hit rate owed from the device** | The collision above is the exit's second trigger. The first (>= 8/10 edge hits by finger in tablet posture) needs the device: checklist items 3 and 7.                                                                                                                                                                                                                                                                                                           |
| **M2-T2** disclosure chevron            | **GO**                                                                       | P4 confirmed: 12 × 12 at both pointers, so the exit ("refuted, >= 24") does not fire. May land straight after M0, as planned. Whether an exemption or a 24 × 24 box is accessibility-reviewer's call (the circle test passed on this fixture).                                                                                                                                                                                                                   |
| **M2-T3** sort headers fill their cell  | **Owed from the device**                                                     | Geometry: 24 tall at both pointers (`Float left` 32). The exit (>= 8/10 header hits in tablet posture) is a device figure: checklist item 8.                                                                                                                                                                                                                                                                                                                     |
| **M2-T4** gates and close-out           | **GO** (owed whenever any task lands)                                        | Two inventory facts for D4: the compact checkboxes (28 px row, 16 × 16 box) are under 44 at coarse, and `Float left` is 32 tall.                                                                                                                                                                                                                                                                                                                                 |

## Owed from the device

Everything the emulator cannot settle, with the checklist item that answers it:

| Owed                                                                   | Item                                |
| ---------------------------------------------------------------------- | ----------------------------------- |
| A finger on a bar body and on an unselected edge, in **both postures** | 1, 2, 3 (A and B)                   |
| Whether a hold fires `contextmenu`, and whether on hold or on release  | 4 (A and B)                         |
| A real double tap on a cell (P9)                                       | 5                                   |
| `⋯` and chevron hit rates                                              | 6                                   |
| Edge hit rate and header hit rate (M2-T1 and M2-T3 exits)              | 7, 8 (tablet posture)               |
| The stylus: drag, edge, hold (M1-T1's stylus exit)                     | stylus pass                         |
| The D7 hybrid on the real device (the cover attached, `pointer: fine`) | the pointer-check photo, and pass A |

## Things found wrong in the spec or the plan

- **M0-T2's checklist could not answer M2-T1's or M2-T3's exits.** The plan says item 6 supplies "the hit
  rates M2-T1/T2 exit on", but item 6 counts only the `⋯` and the chevron. M2-T1 exits on **edge** hits and
  M2-T3 on **header** hits, and neither was counted. Items 7 and 8 are added to the checklist.
- **P7's "~24 wide" is the wrong object.** The separator element is 1 px wide; the grab area is a
  descendant. The behaviour (`touch-action: auto`, `pointercancel`) is as predicted.
- **M2-T1's premise.** The spec's M2-T1 assumes the start zone can grow outward into
  whitespace; for a bar at the chart's start the whitespace is the `⋯` (Collisions above).
- **Selecting a bar changes nothing for touch today.** A selected body is `touch-action: auto` and is
  cancelled exactly as an unselected one is, so M1-T1 adds a working touch drag rather than restoring one.

## Bookkeeping

- The unswept divider is annotated on `docs/TECH_DEBT.md` #439; no new row is opened.
- `docs/BACKLOG.md`'s Gantt entry carries the spec's §0 corrections.
