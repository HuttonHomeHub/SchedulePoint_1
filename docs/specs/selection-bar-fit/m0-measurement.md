# Selection bar fit, M0: measurement record

- **Date:** 2026-10-11. **Tree:** `fix/selection-bar-fit` from `origin/docs/outstanding-items-specs` (web 0.184.0, api 0.88.1).
- **Harness:** `apps/web/measure-toolbar/selection-bar-fit-m0.spec.ts` (not in CI, ADR-0081 §3). Real sign-up, real API,
  real Chromium 1194 in this container (so fonts differ from CI and from the owner's machines, ADR-0128).
- **Method:** each reading is the shipped DOM. Candidates are **injected `<style>` rules and CSS `order`**, applied to the same
  page one after another and removed, so base and candidate share every layout input. They are not code patches.
  C1 caps both outlet floors (`min(18rem, 100%)`, `min(36rem, 100%)`). C2 extends the `data-dock-wide` floor to fine pointers at
  30, 36 and 40 rem (capped). C3 puts the Activity-actions group before the Find group (`order`; it measures lines and positions,
  **not** the roving order).
- **Canvas height caveat:** the canvas is sized by a `ResizeObserver` in JS, so it does not follow an injected style inside one
  synchronous read. Every canvas delta below is therefore the **foot-row delta** (the canvas is the body minus the foot row).
- **Fixture:** the `conflict-reason-m1` plan. States read: unflagged unplaced (Plain), unflagged placed (Sitework), `constraintViolated`
  route, unplaced (Steel beam), `barAction` (Pour slab, earlier than logic), `visualLaterThanBound` route (Roof), two flags (Frame).
  **Not read:** WBS summary, zero-duration task, pen not held, peer holds the pen, and the coarse 1912 x 1114 at DPR 1.5 cell
  (coarse 1912 x 948 at DPR 1 stands in). Skipped for time, not because they were clean.

## Result table

| Question                                                  | Answer                                                                                                                                                                                                                                                                                                  | Consequence                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| #487: does 200 % text clip the bar? (faithful route, CDP) | **No.** Fine and coarse, 1024 x 600, three states: 0 controls outside the viewport, 0 obscured, `scrollWidth == clientWidth` (1024 / 1024, foot row 1024)                                                                                                                                               | #487 as filed does not reproduce                                                                         |
| #487: under the synthetic route (root `font-size: 200%`)  | **Coarse: yes, horizontally.** `sm` still matches, the outlet's floor is 1152 px (36 rem at 32 px) in a 747 px row, foot row `scrollWidth` 1168 > 747, `edit` is off-screen. Fine: no horizontal overflow (floor 576 < 715)                                                                             | The mechanism (H1) is real; the route is not the common one                                              |
| #487: does C1 remove the overflow?                        | **Yes.** Coarse foot `scrollWidth` 1168 -> 747, outlet 1152 -> 715, nothing off-screen horizontally                                                                                                                                                                                                     | M1 builds the cap as a defensive fix                                                                     |
| C1 at 100 % text                                          | **Byte-identical**: lines and foot height equal to base in all 60 diagram readings (both pointers) and the 224 sweep readings                                                                                                                                                                           | The cap costs nothing                                                                                    |
| #489: does C2 (floor on fine) give the gain?              | **At 1024-1040 only**: plain 167 -> 127 (-40 px, 4 lines -> 2); Roof and Frame 227 -> 187                                                                                                                                                                                                               |                                                                                                          |
| #489: does C2 lose canvas anywhere?                       | **Yes.** C2 at 36 rem: 13 of 224 sweep readings gain 40 px of foot row (1200-1248 px). At 30 rem: 10 of 224 (1120-1152). At 40 rem: the 1280 cell loses 40                                                                                                                                              | **Stop rule trips. M2 is cancelled.**                                                                    |
| #485: does C3 change any line count?                      | **No.** Lines and foot height are equal to base in every diagram cell on both pointers, and in the Gantt                                                                                                                                                                                                | SC-3 holds                                                                                               |
| #485: is the remedy on the first control line under C3?   | **Yes in every route state and cell**; at base it is on line 2 in every cell except fine 1912 x 948 with one flag (Steel beam), where the whole bar is one line and the remedy is on it, after the Find group                                                                                           | M3 builds                                                                                                |
| #486: triangles in the bar                                | **Not established by this harness.** Its selector found at most 1 `svg.lucide-triangle-alert` under the bar's parent (0 for plain), where caption + remedy should read 2, so the reader's scope or class name is wrong. The code reading in spec §0.2 stands, and M3's unit test (SC-5) is the observer | Triangle half closes on the code reading and the 1912 photograph; the harness reading is a recorded null |
| #486: the Gantt dock                                      | Float paths is the **sole** control in the Find group: a lone glyph at the leading edge, a hairline, then the Activity actions (`m0-gantt-fine-1912x948-Frame.png`)                                                                                                                                     | R1 moves it to the trailing edge; see M3                                                                 |
| First Tab stop today                                      | `zoom-to-selection` (Diagram), `float-paths` (Gantt), in every cell and state                                                                                                                                                                                                                           | Changes in M3 (Q1 accepted)                                                                              |

## Readings

### #487: the two text routes (1024 x 600, `Frame` = two flags)

| Route             | Pointer | `sm` matches | Floor       | Foot row W | Foot `scrollWidth` | Outlet W | Controls outside / obscured       |
| ----------------- | ------- | ------------ | ----------- | ---------- | ------------------ | -------- | --------------------------------- |
| CDP default font  | fine    | no           | 576 px      | 1024       | 1024               | 992      | 0 / 0                             |
| CDP default font  | coarse  | no           | 576 px      | 1024       | 1024               | 992      | 0 / 0                             |
| root `200%` style | fine    | yes          | 576 px      | 747        | 747                | 715      | 0 / all (vertical, below)         |
| root `200%` style | coarse  | yes          | **1152 px** | 747        | **1168**           | 1152     | `progress` outside, rest obscured |

**The "obscured" column under the root-style route is a second finding, not a result for #487.** With media queries still at 16 px
the shell does not take its small-window scrolling form, so the 200 % command band fills the window and the foot row sits below it
and is clipped vertically (see `m0-text200-coarse-root-font-size-Frame.png`). That is the band-at-large-text territory of #483, and
it hides every control in fine **and** in coarse, base **and** C1, so the vertical clip says nothing about the floor. The floor is
read from `scrollWidth` and the horizontal rects, which is why M1's journey asserts the horizontal axis only. The CDP route is the
one the repository's `narrow-shell` journey already uses and is what a real text-size setting does to rem media queries; it reads clean.

Raw: coarse root-style `Plain`: base foot 443 / `scrollWidth` 1168 / outlet 1152; C1 foot 635 / 747 / 715 (one wrapped line more in a
row that is now 747 wide, nothing hidden by width). So C1 trades the sideways scroll for lines, which is the right trade (CLAUDE.md
§13: reflow, never a lost control) in a state that, per the table above, only a synthetic text route reaches.

### #489: the sweep (fine, 1024 to 1912 in 16 px steps, 4 states, 224 readings)

| Candidate | Gains (foot row shorter)                                          | Losses (foot row 40 px taller) | Unchanged |
| --------- | ----------------------------------------------------------------- | ------------------------------ | --------- |
| C1        | 0                                                                 | 0                              | 224       |
| C2 30 rem | 5                                                                 | 10 (1120-1152)                 | 209       |
| C2 36 rem | 6                                                                 | 13 (1200-1248)                 | 205       |
| C2 40 rem | at the 1280 cell, 5 states lose 40 px; the 1024 gain is unchanged |                                |           |

At 1024 on a fine pointer the plain selection really does drop from 167 to 127 px (4 lines to 2), as the spec estimated. But the
floor moves the width at which the facts leave the bar's line, and the widths just above it (1120-1250, depending on the floor) take
a taller foot row than today. **The stop rule (no state or width loses canvas) is not met by any of 30, 36 or 40 rem, so M2 is not
built** and #489 closes with this table. At 1646 and 1912 every candidate equals base.

### #485: C3 against base (Diagram, fine; coarse is the same in every cell)

| Cell      | State        | Base lines / foot | C3 lines / foot | Remedy line at base -> C3            |
| --------- | ------------ | ----------------- | --------------- | ------------------------------------ |
| 1024x600  | Steel beam   | 4 / 187           | 4 / 187         | 2 -> 1                               |
| 1024x600  | Frame        | 5 / 227           | 5 / 227         | 2 -> 1                               |
| 1280x800  | Frame        | 3 / 147           | 3 / 147         | 2 -> 1                               |
| 1440x900  | Frame        | 3 / 147           | 3 / 147         | 2 -> 1                               |
| 1646x1097 | Frame        | 2 / 107           | 2 / 107         | 2 -> 1                               |
| 1912x948  | Roof / Frame | 2 / 107           | 2 / 107         | 2 -> 1                               |
| 1912x948  | Steel beam   | 1 / 67            | 1 / 67          | 1 -> 1 (first control only after C3) |

Plain and unplaced-unflagged states and the `barAction` state (Pour slab) are unchanged by C3 in lines and foot, as predicted: the
remedy is not rendered for `barAction` and Clear visual start keeps its place after Delete.

The spec's §0.2 said the 1912 bar is two lines with the remedy at the start of line 2. Confirmed for Roof and Frame (two flags);
Steel beam and Pour slab (one flag) fit on one line at 1912 (67 px), where the remedy is already on line 1 but after the Find group.

### The Gantt dock (`m0-gantt-*.png`, readings in the JSON)

Base order is `float-paths, [conflict-remedy], open-logic, notes, progress, resources, edit, duplicate, delete, [clear-visual-placement]`
in every cell. C3 changes lines in none of them. At 1024 fine the Gantt bar is 4-5 lines in a 347 px column (foot 167-227), like the
Diagram; at 1024 coarse it is 1-3 lines (foot 95-207) because coarse already owns the line. Float paths is a lone glyph at the
leading edge before the hairline, which is what #486's second half describes. After R1 it is the trailing control.

### SC-4 (the 120 px stage floor)

Not re-read as a number in this milestone: C1 and C3 change no foot-row height in any reading, so the stage is unchanged by
construction, and M2 (the only candidate that could move it) is cancelled. `viewport-cluster.spec.ts:515` is re-run after M1 and M3.

## Corrections to the spec

- §0.2 #487: the clip is **not** reproduced by a text-only 200 % (CDP) at 1024 x 600 on either pointer. It reproduces on **coarse**
  only under a synthetic root-size route where `sm` still matches. H1 (the floor) is the mechanism there; H2 (which route) is the
  deciding variable, in the direction the spec gave as the second possibility.
- §0.2 #489: the symptom (167 px, 4 lines) and the arithmetic (about 40 px for a plain selection, nothing for flagged) hold; **the
  "state-dependent, loses at some widths" risk the spec named is what the sweep found**, which is why the stop rule exists.
- §0.2 #486: the Gantt photograph confirms the lone leading glyph. The triangle count was **not** measured successfully (see the table); it rests on the code reading.
- §0.2 #485: confirmed, and the line counts hold under the reorder in every measured cell.
