# Device results — the Surface test sheet, answered

The product owner's answers to [`device-checklist.md`](device-checklist.md), taken on his Surface on
**2026-10-07** (12:41–12:50 local) against **`web` 0.177.2**, through a tap-to-answer copy of the sheet
(the answers were read back item by item; nothing here is paraphrased into a different outcome). This is
the arbiter M0 deferred to (ADR-0128 D4): every `INDETERMINATE` in [`m0-measurement.md`](m0-measurement.md)
that turns on the real device is settled by the rows below.

## The device

Two `pointer-check.html` photos, one per posture (both at device pixel ratio 1.5):

| Posture                 | `pointer` | `any-pointer` | `hover` | `any-hover` | Viewport (CSS px) |
| ----------------------- | --------- | ------------- | ------- | ----------- | ----------------- |
| Keyboard cover attached | fine      | fine + coarse | hover   | hover       | 1912 × 1114       |
| Tablet                  | coarse    | coarse        | none    | none        | 1912 × 1104       |

- **ADR-0118 D7 holds on the real device**: with the cover attached the Surface reports `pointer: fine`, so
  a `pointer-coarse:` rule reaches nobody in that posture, exactly as the spec assumed.
- The text changed by itself when the cover was folded (A0b: yes).
- **The viewport is 1912 wide, not ~1368.** The Surface's working size in the hand-off and in M0's
  fixture (1368 × 912) is a smaller display scale than this device runs at. Nothing in M0 or M1 depended
  on the smaller figure; it is corrected in `docs/HANDOFF.md`.

## Answers

| Item | Test                                 | Cover attached (A)             | Tablet (B)                      | Stylus (cover attached)        |
| ---- | ------------------------------------ | ------------------------------ | ------------------------------- | ------------------------------ |
| 1    | Drag an unselected bar sideways      | the chart scrolled             | the chart scrolled              | the chart scrolled             |
| 2    | Tap the bar, then drag it            | moved                          | moved                           | not asked                      |
| 3    | Drag the end of an unselected bar    | the chart scrolled             | the chart scrolled              | the chart scrolled             |
| 4    | Press and hold a row                 | SchedulePoint menu, after lift | SchedulePoint menu, after lift  | SchedulePoint menu, after lift |
| 5    | Double-tap a Duration                | a text box opened              | a text box opened               | not asked                      |
| 6    | Ten taps each: `⋯` / chevron, misses | 0 / 10, 0 / 10                 | 0 / 10, 0 / 10                  | not asked                      |
| 7    | Selected bar's end, ten drags        | not asked                      | stretched 10 / 10, other 0 / 10 | not asked                      |
| 8    | Sort heading, ten taps, misses       | not asked                      | 0 / 10                          | not asked                      |
| 9    | Menu key on a selected row           | exactly one SchedulePoint menu | not asked                       | not asked                      |
| 10   | Escape: row still highlighted        | yes                            | not asked                       | not asked                      |
| 11   | Shift + right-click a row            | the browser's own menu         | not asked                       | not asked                      |

**Note in the product owner's words:** "Pressing and releasing a row brings up the SchedulePoint menu
only if it's on the Gantt bit. If it's on the text bit it brings up a browser menu."

## What the answers decide

| Decision (plan)                                   | Rule                                               | Result                                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1-T1 gating (tap first, then drag)               | items 1–3                                          | **Confirmed as built**: an unselected bar scrolls, a tapped one moves, in both postures.                                                                                     |
| M1-T1 stylus default (gated like touch)           | revisit if a stylus drag already moves a bar       | **Default stands**: the stylus scrolls an unselected bar, like a finger. No change to `use-bar-pointer-drag.ts`.                                                             |
| M1-T2 hold route (native `contextmenu` only)      | revisit if item 4 shows no `contextmenu` on a hold | **Holds on the chart side; fails on the table side.** See the finding below.                                                                                                 |
| M1-T2 keyboard and Shift escape                   | items 9–11                                         | **Confirmed**: one menu, the row keeps its highlight, Shift + right-click reaches the browser.                                                                               |
| M2-T1 selected bar's edge zones                   | dropped if ≥ 8 / 10 edge hits by finger in tablet  | **Dropped**: 10 / 10.                                                                                                                                                        |
| M2-T3 sort headers fill their cell                | dropped if ≥ 8 / 10 header hits in tablet          | **Dropped**: 0 misses, so 10 / 10.                                                                                                                                           |
| M2-T2 disclosure chevron                          | dropped only if M0 refutes P4 (≥ 24)               | **Still owed.** M0 confirmed P4 (12 × 12). The device's 10 / 10 hit rate is evidence for a spacing exemption, not a ruling on §2.5.8; that is accessibility-reviewer's call. |
| M2-T4 gates and close-out (ADR-0177 D4, Accepted) | owed whenever any M1 or M2 task lands              | **Owed.**                                                                                                                                                                    |

## Finding: a hold on the table side opens the browser's menu

On the Gantt's table half a press-and-hold opens the browser's own menu; on the chart half it opens
SchedulePoint's. The row handler (`GanttPanel.tsx`, `onContextMenu`) is one handler for the whole row, so
the difference is not a missing listener. The likeliest cause, **not yet reproduced**, is that a hold on
selectable text is taken by Windows as a text-selection gesture, so the browser shows its selection menu
rather than delivering the `contextmenu` the row handles. M1's record names this case as the trigger for
its fallback ("revisit when item 4 shows no `contextmenu` on a touch hold"): extract a `useLongPress` on
the tooltip precedent, or stop text selection in the grid's cells under touch. Either is a design choice
for M2's scope, not a fix to make silently; recorded as `docs/TECH_DEBT.md` #464.
