# Selection bar fit, M4: measurement record

- **Date:** 2026-10-11. **Tree:** `fix/selection-bar-fit` after M3 (web 0.184.0). Real sign-up, real API, real Chromium 1194 in
  this container (fonts differ from CI and from the owner's machines, ADR-0128).
- **Harness:** `apps/web/measure-toolbar/selection-bar-fit-m4.spec.ts` (not in CI, ADR-0081 §3). It reads the shipped bar in five
  cells (1024 x 600, 1280 x 800, 1440 x 900, 1646 x 1097, 1912 x 948), both pointers, Diagram (five states) and Gantt (three
  states), on two trees: the shipped one (`nolabel`) and one with the `float-paths` item's `labelVisibility` edited to `'always'`
  (`label`). 80 readings per tree. The coarse pointer is `hasTouch` at the cell's own size, as in M0 (not DPR 1.5).
- **Not read:** the coarse 1912 x 1114 cell at DPR 1.5, WBS summary, zero-duration task, pen not held.

## Result table

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                                     | Consequence                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Does a visible "Float paths" label fit (review follow-up 5)? | **No, not without costing canvas.** It adds a line in 8 of 80 readings: fine Diagram at 1024 x 600 in all five states (+40 px), fine Diagram plain at 1646 x 1097 (51 -> 87 px, +36), coarse Gantt plain at 1024 x 600 and 1440 x 900 (+48 px each)                                                                                        | **Not built.** The label stays off; see below                                                                                     |
| Does the label break the 1646 guarantee?                     | **Yes.** `dock.spec.ts` asserts that a selection costs the canvas nothing at 1646. Fine, plain: foot row 51 px unselected-equivalent -> 87 px with the label                                                                                                                                                                               | A shipped equality (ADR-0115) is lost for a glyph's caption                                                                       |
| Any width where the label costs nothing?                     | Fine Gantt: none of the 15 readings change. Diagram and coarse Gantt: cost in the cells above, nothing elsewhere                                                                                                                                                                                                                           | A Gantt-only label would need the label to depend on context, which is a `ToolbarItem` contract change, so it is not offered here |
| Can a divider start a wrapped line **alone** (UX open Q)?    | **No.** Across 80 readings (both pointers, Diagram and Gantt) the Find group wraps to a new line in 65 (fine 31, coarse 34), and its left hairline then starts that line, **but a control is always on that line**: 3 on the Diagram (Zoom, Isolate, Float paths), 1 on the Gantt (Float paths). 0 readings with a hairline and no control | No remedy needed. A leading hairline on a wrapped group is the group boundary, as ADR-0185 accepts                                |
| First Tab stop, every reading                                | `open-logic` for an unflagged or `barAction` selection, `conflict-remedy` for a route conflict, in both views and both pointers                                                                                                                                                                                                            | Matches ADR-0187 D1                                                                                                               |
| Foot row horizontal overflow (SC for #487, 100 % text)       | `scrollWidth == clientWidth` in every reading                                                                                                                                                                                                                                                                                              | Unchanged by M1                                                                                                                   |

## The label, and why it is not shipped

The label was tried because the UX review asked for it (spec US-4 offers it): after M3 Float paths is the last control, and on a
wrapped Gantt bar it can sit alone on the final line with the Find group's hairline. At 1024 x 600 coarse in the Gantt
(`photos/m4-gantt-nolabel-coarse-1024x600-Frame.png`) it is a single glyph on its own line after a hairline, which is the thing the
review disliked, and the label would not remove the line.

Cost, from the JSON (`lines` and foot row in px, nolabel -> label):

| Pointer | View    | Cell        | State           | Lines  | Foot row  |
| ------- | ------- | ----------- | --------------- | ------ | --------- |
| fine    | Diagram | 1024 x 600  | all five states | 4 -> 5 | +40       |
| fine    | Diagram | 1646 x 1097 | Plain           | 1 -> 2 | 51 -> 87  |
| coarse  | Gantt   | 1024 x 600  | Plain           | 1 -> 2 | 95 -> 143 |
| coarse  | Gantt   | 1440 x 900  | Plain           | 1 -> 2 | 51 -> 99  |

Every other reading is identical in lines and foot row. The 1646 row is the owner's Surface cell and the width `dock.spec.ts`
holds as an equality, so a change that moves it is not a margin to spend. **Decision for the owner:** the label can be had
(one word in `selection-actions.tsx`, `labelVisibility: 'always'`) at those costs; it is not built here because it trades a
shipped guarantee for a caption. The 1912 and 1646 Gantt cells, where the bar is one or two lines, read fine without it.

## Corrections

- The UX reviewer's "no divider can start a wrapped line alone" holds: a divider leads a wrapped line in most narrow cells, and a
  control is always beside it.

## The device checklist

`docs/specs/gantt-coarse-pointer/device-checklist.md` was read in full for a step that names the selection bar's order, its first
control or Float paths (`grep -n -i` for "float paths", "selection bar", "first control", "zoom to", "Tab "): none does. Its "bar"
steps (1, 2, 3, 7) are about dragging a Gantt **chart** bar, which this epic does not touch. No line was added.
