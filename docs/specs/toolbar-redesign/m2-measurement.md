# Toolbar redesign — M2 measurement record

Taken 2026-10-09 on the M2 build by `apps/web/measure-toolbar/toolbar-redesign-m2.spec.ts` (a harness, not a
gate; ADR-0081 §3), fine and coarse pointers, the container's Chromium. Nothing here is projected: M0 cloned and
mutated the deck, M2 reads the real one. Zoom, Fit and the Minimap are still on the deck until M4.

## 1. What this changes in the plan's premises

1. **Apply levelled dates… as `'roomy'` costs a line on touch at exactly 1280 (79 rem).** Coarse 1280 × 800: LOOK
   misses by 123.4 px now (zoom is still on it; M4 removes about 190 px, leaving it fitting) and **DO misses by 97.3
   px, entirely the label's 143.3 px** (item 44 → 187.3). M0 §10.3 recorded coarse DO at the first stage as "46 free"; that
   figure had no label on this control. So coarse 1280 is **3 lines after M4** (LOOK 1, DO 2), inside SC-3's "≤ 3" and
   not its "expected 2". Fine 1280 is unaffected (DO has 98.7 px spare with the label). **Decided by the owner,
   2026-10-09: touch does not pay the line.** `apply-levelling` is now `labelVisibility: 'roomy-fine'` — the word
   shows for a mouse from 79 rem and never under a coarse pointer, so touch keeps its DO row at one line (the
   143.3 px is no longer spent). The reading above is the one that led to the decision, not the shipped state; coarse
   1280 should come out at 2 lines after M4 and this note should be re-taken then.
2. **The cycling conflict read-out is longer than the idle chip by about 132 px** (chip capped at 14 rem), and it
   is what breaks LOOK at the floor. Fine 1024 × 600, LOOK spare/(miss) — base +26.0, "1 conflict" (70.3), cycling
   (202.0). Removing zoom at M4 frees about 146 px, so the idle chip then fits (+75.7) and **cycling still misses by
   about 56 px** (not under the 20 px exit rule, so not a stop). It will wrap LOOK to two lines in that one state
   at M4 unless the chip is allowed to shrink or the reason is truncated harder. Recorded for M4.
3. **Fine 1366 × 768 with a "1 conflict" chip misses by 1.7 px.** Outside the floor, so not the stop rule, but the
   closest miss anywhere. Cause: 1366 is 85 rem, so the roomy labels show while zoom is still on the row.

## 2. Deck lines (fine pointer; L/D = LOOK/DO lines)

| State                  | 1024 | 1280 | 1366 | 1440 | 1912 | 2560 |
| ---------------------- | ---- | ---- | ---- | ---- | ---- | ---- |
| base, selection, dock… | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  |
| peer holds the pen     | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  |
| "1 conflict"           | 2/1  | 2/1  | 2/1  | 1/1  | 1/1  | 1/1  |
| cycling read-out       | 2/1  | 2/1  | 2/1  | 2/1  | 1/1  | 1/1  |

Unused width, natural vs available, fine, base: LOOK 26.0 / 8.6 / 94.6 / 168.6 / 568.6 / 1216.6 px and DO 52.3 /
98.7 / 184.7 / 258.7 / 730.7 / 1378.7 px at 1024 / 1280 / 1366 / 1440 / 1912 / 2560. The band is 139 px and the
canvas 362 px at 1024 × 600 in every state without a conflict (183 / 318 with one). **The base state is already two
lines at the floor on a mouse** — LINES[1024] is still asserted at 4 until M4, as planned.

Coarse: 1024 and 1280 are 4 lines (2/2) in every state, 1440 is 2 lines in the base state and 3 with a conflict, 1912
is 2. The coarse 1024 bound `{ max: 4 }` (OD-2) holds.

## 3. View ▾ at 1024 × 600 (SC-13, target ≤ 420)

| State                  | Before M2 | After M2 (default, folded) |
| ---------------------- | --------- | -------------------------- |
| Diagram, fine          | 584 / 600 | **366**                    |
| Diagram, coarse        | 584 / 600 | **390**                    |
| Gantt (Columns folded) | 584 / 600 | ≤ 420 (journey-asserted)   |

The first draft (one section per column) measured **593 px** in the third column: Insight overlays alone is colour-by,
four toggles and three lenses that each show their own hint or reason in words (ADR-0082/0122), which wrap to
several lines in a 213 px column. No assignment of whole sections reaches 420, so Insight spans two columns and
splits inside (what changes how bars are drawn on the left, the three lenses on the right). The Gantt's Columns
group is 681 px on its own and starts folded. Unfolding grows the panel; before the overlay fix it then ran off the
bottom of a 600 px window with its last controls unreachable (found by the journey; `useMeasuredBox` now follows
the panel's size).

## 4. Tooltips (hover and focus both show; Escape dismisses with focus unmoved)

Plan summary, Edit plan details, Baseline overlay, Comments, Settings…, Resource view and Apply levelled dates… all
mount a tooltip on both pointers and both paths; Legend is a labelled control and has none. Comments reads "Show the
plan's comments beside the diagram"; a shaded Baseline overlay reads "No active baseline. Set one in Analysis → Baselines… to draw it beside
each bar".

## 5. No tool is lost — before and after

| Tool                                              | Before                      | After                                           | Evidence                                                                             |
| ------------------------------------------------- | --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Summary                                           | deck, Plan                  | header "Plan details" toolbar, "Plan summary"   | `moved-tools.structural.test.ts`, command-surface identity journey                   |
| Edit plan                                         | header pencil, unregistered | same toolbar, "Edit plan details", writers only | same                                                                                 |
| Float paths                                       | deck, Find                  | selection bar and Gantt row menu                | `tsld-toolbar-float-paths.test.tsx`, `float-paths.spec.ts`, `object-actions.spec.ts` |
| Legend                                            | deck, View                  | deck, Panels                                    | `moved-tools.structural.test.ts`                                                     |
| Resource view                                     | deck, View                  | deck, Panels                                    | same                                                                                 |
| Comments                                          | deck, Plan                  | deck, Panels                                    | same                                                                                 |
| Structure toggles, Markers toggles, Gantt columns | open in View ▾              | folded in View ▾, one click                     | `tsld-toolbar.test.tsx`, `unfoldViewSections`                                        |

The computed manifest (SC-14/SC-19) is M5-T1's; this table is the M2 slice of it.
