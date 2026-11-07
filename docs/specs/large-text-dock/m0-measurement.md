# Large-text dock, M0: measurement record

- **Date:** 2026-11-07. **Tree:** `feat/569-large-text-dock-m0` from `origin/main` (web 0.201.0).
- **Harness:** `apps/web/measure-toolbar/large-text-dock-m0.spec.ts`, run by `playwright.measure-toolbar.config.ts` (not in CI,
  ADR-0081 §3). Real sign-up, real API, real Chromium in this container, so fonts differ from CI and from the owner's machines
  (ADR-0128). **Headless Chromium draws overlay scrollbars**, so no reading here can see a classic scrollbar's 15 to 17 px of
  lost width. Where that matters this record reads `scrollHeight` against `clientHeight` and says so.
- **Method:** every reading is the shipped DOM. Candidates are **injected `<style>` rules**, applied to the same page one after
  another and removed, so base and candidate share every layout input. They are not code patches.
  - **R1 at 12 rem and at 15 rem:** row 3 `minmax(min(100dvh, F), 1fr)`, shell `overflow-x: hidden; overflow-y: auto`, restated
    under the `squat` media rule so `squat` keeps precedence.
  - **R2 (the plan's fallback), two forms:** `r2_literal` is the plan's text (`container-type: size` on the shell's parent and
    an `@container` rule that copies `squat`); `r2` also gives that parent `height: 100dvh`. See "Corrections".
- **Text states:** 100 %; **CDP 200 %** (`Page.setFontSizes`, 32 px, what a browser's own text setting does); **inline 200 %**
  (`documentElement.style.fontSize = '200%'`). The root size was read back in every cell and was `16px` / `32px` / `32px` as
  asserted in every cell (no mismatch).
- **Cells:** 1024 × 600, **fine and coarse** (`hasTouch`), Diagram (panel collapsed), Diagram (panel expanded) and Gantt.
  Viewport notice acknowledged (ADR-0179) so the banner row adds no height.
- **Fixture:** three activities, `Pour slab` placed before its logic allows, so the selection bar carries a conflict remedy.
- **Strips read:** the touch tip (2 controls) and the selection bar (11 controls in the Diagram, 9 in the Gantt). **Not read:**
  the armed-tool statement (see "Corrections"), and the selection bar with the panel expanded (it is not shown there).
- **Probe:** `elementFromPoint` at the centre and four corners of every control. The corner inset **scales with the root size**
  (4 px at 16 px, 8 px at 32 px): the buttons are `rounded-md`, a rem length, so a point 4 px in on the diagonal lies outside
  the arc at a 32 px root and a fixed 4 px reports a false cover. A leftover tooltip is made `pointer-events: none` before a probe.
- **Raw readings:** `m0-readings.fine.json` and `m0-readings.coarse.json` (every cell, every variant, the whole sweep).
  Screenshots are in `photos/` (Diagram, tip and selection bar, 100 % / CDP / inline, both pointers).

## Result table

| Question                                                                    | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Consequence                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **H1.** CDP 200 %: is every strip control self-hit once scrolled into view? | **Holds.** Fine and coarse, Diagram, Diagram with the panel expanded and Gantt, tip and selection bar: 10/10, 55/55 (Diagram) and 45/45 (Gantt) points self-hit, 0 outside the window, 0 covered by anything outside the strip. At rest the foot row is below the window (`footTop` 670 to 824 against 600), so it is reachable only by scrolling                                                                                                                                                                                                                                           | The faithful route already works. #569 as filed was measured with the other route                                                                                                                                                                                                          |
| **H2.** Inline 200 %: is the strip covered at rest and after scrolling?     | **Holds.** `main` is **0 px** high, the band is **707 px** (fine) and **931 px** (coarse) in a 600 px window, and after `scrollIntoView` every probed point is **outside the window**: 0/10 (tip), 0/55 and 0/45 (selection bar), both pointers, all three views                                                                                                                                                                                                                                                                                                                            | #569 reproduces under the inline route, and only there                                                                                                                                                                                                                                     |
| **H3 at 15 rem.** Equal to base at 100 % in every sweep cell?               | **Fails, coarse only.** At 1024 × 500 (a cell `e2e-minimap/viewport-cluster.spec.ts` runs) the 100 % body is **237 px**, under the 240 px floor: `main` 237 → 240, shell `scrollHeight` 500 → 503. A 3 px overflow, which is a scrollbar                                                                                                                                                                                                                                                                                                                                                    | 15 rem is out by the rule                                                                                                                                                                                                                                                                  |
| **H3 at 12 rem.** Equal to base at 100 % in every sweep cell?               | **Holds on the rule's own tests.** 98 readings per pointer (49 cells × plan and organisation landing): every band, `main` and foot-row rect is equal to base, and `scrollHeight` equals `clientHeight` wherever it did before; 0 differences. Smallest non-squat 100 % body: **329 px fine** (320 × 568), **237 px coarse** (1024 × 500), so the floor is 192 px against margins of **137 px** and **45 px**. **But see the next row**                                                                                                                                                      | The rule says 12 rem. The next row says the rule is not enough                                                                                                                                                                                                                             |
| **A finding the rule does not test: the shell already overflows at 100 %.** | **On the organisation landing, in every 1024 to 1408 px wide window up to 720 px high, and in every window under 1024 wide, `scrollHeight` is 793 px (fine) and 797 px (coarse) against a `clientHeight` of 500 to 720** (833 to 1098 px under 1024 wide). That is 73 to 297 px of content, which the shell's `overflow-hidden` clips today. The bisect on one such page put it under the Explorer rail's column; the sweep did not attribute it further. R1's `overflow-y: auto` turns it into a **visible scrollbar on every landing page at 100 %** (classic scrollbars; invisible here) | **R1 changes 100 % on a classic-scrollbar machine.** SC-4's own risk row ("a 1 px overflow would steal about 17 px of width on the owner's Windows machines") applies, and the rule's `scrollHeight == clientHeight` test passes only because it compares R1 with base, and base overflows |
| **R2 (container query) with the window's height on its container**          | **Equal to base at 100 % in every fine cell and in every coarse cell but one pair** (two readings differ only by a `position: fixed` 159 × 26 px box present in the R2 reading and not the base one, no band, `main` or foot rect moved). Under inline 200 %: `main` 600 (the window), every strip control reachable by scrolling the strip, **including the coarse selection bar, which R1 cannot reach** (below). Shell overflow semantics at 100 % unchanged (`hidden`)                                                                                                                  | R2 passes where R1 does not. It needs the container to be sized                                                                                                                                                                                                                            |
| **R2 exactly as the plan wrote it**                                         | **Fails.** `container-type: size` on an auto-height block makes it 0 px high, so `height <= 26rem` is true in every window narrower than 64 rem: `main` becomes `100dvh` at 640 × 480, 320 × 720, 320 × 568 and 320 × 640 (fine and coarse), and the shell gains 143 to 275 px of scroll at 100 %                                                                                                                                                                                                                                                                                           | The plan's R2 needs `height: 100dvh` on the container                                                                                                                                                                                                                                      |
| **The coarse selection bar under R1, inline 200 %**                         | The foot row is **667 px** (Diagram) and **571 px** (Gantt), taller than R1's body (384 px at 12 rem, 480 at 15 rem). Scrolling the strip as a whole leaves **12** (12 rem) and **4** (15 rem) of its 55 points below the window; scrolling each control to the top works. R2's 600 px body takes all of it                                                                                                                                                                                                                                                                                 | A residual for R1 that R2 does not have                                                                                                                                                                                                                                                    |
| **SC-5.** CDP 200 % unchanged by R1?                                        | **Yes.** Every CDP cell, all strips, both pointers, both floors, both R2 forms: `main`, foot row, shell scroll equal to base (`squat` governs)                                                                                                                                                                                                                                                                                                                                                                                                                                              | Holds                                                                                                                                                                                                                                                                                      |
| **Does a dock strip's height change with text?**                            | Tip 109 → 213 (CDP) → 317 (inline), fine; selection bar 187 → 371 → 515. Coarse: 105 → 221 → 357, and 207 → 411 → 667 (Diagram) / 571 (Gantt)                                                                                                                                                                                                                                                                                                                                                                                                                                               | Why a floor in rem has to be read against the strip, not only the stage                                                                                                                                                                                                                    |

### The decision rule, applied

1. **H1 holds**, so the stop rule "the faithful route is broken too" does not fire.
2. **H3 fails at 15 rem** (coarse 1024 × 500) and **holds at 12 rem on the rule's tests.** Taken literally the rule picks **R1 at 12 rem**.
3. **The rule's `scrollHeight == clientHeight` test is not the harm it was written to catch.** It compares R1 with base, and
   base already overflows on the organisation landing, hidden by `overflow-hidden`. R1 makes that overflow scrollable. The stop
   condition the brief names ("no candidate leaves 100 % exactly unchanged") is read here by what a user sees, not by rects an
   overlay-scrollbar browser cannot get wrong: **R1 at either floor changes the landing page for anyone with a classic scrollbar.**
   M1 was therefore **not built**. The orchestrator and the product owner decide between:
   - **R2 with a sized container** (`height: 100dvh` on the shell's parent, plus the `@container` rule). It passes every reading
     above, keeps `overflow-hidden` at 100 %, and reaches the coarse selection bar. It puts `container-type: size` on the app's
     root wrapper, which is a broad side effect (containing block for fixed descendants, stacking context) that the readings do
     not show moving anything, and which **ui-architect** has not reviewed.
   - **R1 at 12 rem, plus a fix to the Explorer rail so the shell stops overflowing at 100 %.** That is a product change outside
     this epic's scope, and it leaves the coarse selection bar's residual.

### Foot row below the window at rest (#570's condition)

In **every** 200 % state, both routes and both pointers, the foot row is below the window at rest (`footBelowWindow` true; fine
`footTop` 670 to 1005, coarse 702 to 1261, against 600). The same is true today under CDP 200 %, which the product ships. With
Q2 = A, #570 is filed with a trigger.

## Readings

### 1. Heights, base layout, 1024 × 600 (px)

The band is the grid's second row. Status was 0 px high in every cell. The panel-expanded rows have no selection-bar reading.

| Pointer | View                    | Text         | `squat` / `lg` | Band | `main` | Foot, no strip | Foot, tip | Foot, selection | Shell `scrollHeight` / `clientHeight` | Foot top at rest | Below window |
| ------- | ----------------------- | ------------ | -------------- | ---- | ------ | -------------- | --------- | --------------- | ------------------------------------- | ---------------- | ------------ |
| fine    | Diagram                 | 100 %        | no / yes       | 139  | 461    | 51             | 109       | 187             | 600 / 600                             | 549              | no           |
| fine    | Diagram                 | CDP 200 %    | yes / no       | 283  | 600    | 99             | 213       | 371             | 883 / 600                             | 784              | yes          |
| fine    | Diagram                 | inline 200 % | no / yes       | 707  | 0      | 163            | 317       | 515             | 767 / 600                             | 723              | yes          |
| fine    | Diagram, panel expanded | 100 %        | no / yes       | 139  | 461    | 51             | 109       | n/a             | 600 / 600                             | 549              | no           |
| fine    | Diagram, panel expanded | CDP 200 %    | yes / no       | 283  | 600    | 99             | 213       | n/a             | 883 / 600                             | 784              | yes          |
| fine    | Diagram, panel expanded | inline 200 % | no / yes       | 707  | 0      | 163            | 317       | n/a             | 1086 / 600                            | 1005             | yes          |
| fine    | Gantt                   | 100 %        | no / yes       | 139  | 461    | 51             | 109       | 187             | 600 / 600                             | 549              | no           |
| fine    | Gantt                   | CDP 200 %    | yes / no       | 283  | 600    | 99             | 213       | 371             | 883 / 600                             | 784              | yes          |
| fine    | Gantt                   | inline 200 % | no / yes       | 707  | 0      | 163            | 317       | 515             | 767 / 600                             | 723              | yes          |
| coarse  | Diagram                 | 100 %        | no / yes       | 263  | 337    | 51             | 105       | 207             | 600 / 600                             | 549              | no           |
| coarse  | Diagram                 | CDP 200 %    | yes / no       | 323  | 600    | 99             | 221       | 411             | 923 / 600                             | 824              | yes          |
| coarse  | Diagram                 | inline 200 % | no / yes       | 931  | 0      | 163            | 357       | 667             | 987 / 600                             | 947              | yes          |
| coarse  | Diagram, panel expanded | 100 %        | no / yes       | 263  | 337    | 51             | 105       | n/a             | 600 / 600                             | 549              | no           |
| coarse  | Diagram, panel expanded | CDP 200 %    | yes / no       | 323  | 600    | 99             | 221       | n/a             | 923 / 600                             | 824              | yes          |
| coarse  | Diagram, panel expanded | inline 200 % | no / yes       | 931  | 0      | 163            | 357       | n/a             | 1342 / 600                            | 1261             | yes          |
| coarse  | Gantt                   | 100 %        | no / yes       | 263  | 337    | 51             | 105       | 207             | 600 / 600                             | 549              | no           |
| coarse  | Gantt                   | CDP 200 %    | yes / no       | 323  | 600    | 99             | 221       | 411             | 923 / 600                             | 824              | yes          |
| coarse  | Gantt                   | inline 200 % | no / yes       | 931  | 0      | 163            | 357       | 571             | 987 / 600                             | 947              | yes          |

`scrollTop` at rest was 0 in every cell. The 100 % bodies (461 fine, 337 coarse) match ADR-0180's 365 and 329 to within the
fixture's own differences (this plan has no banner row and a shorter header).

### 2. Self-hit points of every strip control (self / points, outside the window, covered from outside the strip)

"At rest" is before any scroll; "each" is after scrolling each control into view on its own. The coarse selection bar at **100 %**
already reads 51/55 and 41/45 with 4 points covered from outside the strip (the corners of `open-logic` and
`clear-visual-placement` meet an `absolute z-10 inset-y-0` span): a **pre-existing** condition, unchanged by text size or by any
candidate, and the reason a literal "55/55" cannot be the criterion for that strip.

| Pointer | View | Text         | Strip     | Base at rest                     | Base each                | R1 12 rem each                                     | R1 15 rem each | R2 (sized) each |
| ------- | ---- | ------------ | --------- | -------------------------------- | ------------------------ | -------------------------------------------------- | -------------- | --------------- |
| fine    | any  | CDP 200 %    | tip       | 0/10, out 10                     | 10/10, out 0             | 10/10                                              | 10/10          | 10/10           |
| fine    | any  | CDP 200 %    | selection | 15/55 (Gantt 15/45), out 40 (30) | 55/55 (45/45)            | 55/55 (45/45)                                      | 55/55 (45/45)  | 55/55 (45/45)   |
| fine    | any  | inline 200 % | tip       | 0/10, out 10                     | **0/10, out 10**         | 10/10                                              | 10/10          | 10/10           |
| fine    | any  | inline 200 % | selection | 0/55 (0/45), out all             | **0/55 (0/45), out all** | 55/55 (45/45)                                      | 55/55 (45/45)  | 55/55 (45/45)   |
| coarse  | any  | CDP 200 %    | tip       | 0/10, out 10                     | 10/10                    | 10/10                                              | 10/10          | 10/10           |
| coarse  | any  | CDP 200 %    | selection | 12/55 (Gantt 15/45), out 43 (30) | 55/55 (45/45)            | 55/55 (45/45)                                      | 55/55 (45/45)  | 55/55 (45/45)   |
| coarse  | any  | inline 200 % | tip       | 0/10, out 10                     | **0/10, out 10**         | 10/10                                              | 10/10          | 10/10           |
| coarse  | any  | inline 200 % | selection | 0/55 (0/45), out all             | **0/55 (0/45), out all** | 49/55 (39/45), out 0, 6 from the pre-existing span | same           | same            |

(Gantt figures in brackets. "any" is Diagram, Diagram with the panel expanded and Gantt, which read the same; the panel-expanded
view has the tip only.) The per-strip rows with the strip scrolled **as a whole** differ from "each" in one place: the coarse
selection bar under R1, 12 rem, leaves 12 of 55 points below the window (4 at 15 rem; 0 under R2).

### 3. Body and stage height by candidate, inline 200 %, 1024 × 600, no strip

| Pointer | View                    | Base `main` / stage | R1 12 rem | R1 15 rem | R2 (sized) |
| ------- | ----------------------- | ------------------- | --------- | --------- | ---------- |
| fine    | Diagram                 | 0 / 200             | 384 / 200 | 480 / 261 | 600 / 381  |
| fine    | Diagram, panel expanded | 0 / 0 (panel)       | 384 / 0   | 480 / 0   | 600 / 0    |
| fine    | Gantt                   | 0 / 118             | 384 / 118 | 480 / 118 | 600 / 118  |
| coarse  | Diagram                 | 0 / 200             | 384 / 200 | 480 / 261 | 600 / 381  |
| coarse  | Gantt                   | 0 / 118             | 384 / 118 | 480 / 118 | 600 / 118  |

### 4. The SC-4 sweep at 100 % (both pointers; plan = Diagram, and the organisation landing)

Widths 1024 to 1912 in 128 px steps (1024, 1152, 1280, 1408, 1536, 1664, 1792, 1912) at heights 600, 720, 800, 948 and 1097,
plus 640 × 480, 640 × 360, 640 × 300, 320 × 720, 320 × 256, 1280 × 520, and 1024 × 500, 320 × 568, 320 × 640 (the last three
from `e2e-minimap` and `e2e-staff`; `e2e-netpoint-grammar/nodes.spec.ts` sets no viewport and `e2e-audit/rail-1024.spec.ts`
runs at 1024 × 600). 49 cells, 98 readings per pointer.

| Candidate    | Fine: rect differences / new overflow                      | Coarse: rect differences / new overflow                                                                            |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| R1 12 rem    | **0 / 0**                                                  | **0 / 0**                                                                                                          |
| R1 15 rem    | 0 / 0                                                      | **1 / 1**: plan 1024 × 500, `main` 237 → 240, `scrollHeight` 500 → 503                                             |
| R2 (literal) | 8 / 4 (plan and landing at 640 × 480, 320 × 720, 568, 640) | 8 / 4                                                                                                              |
| R2 (sized)   | **0 / 0**                                                  | 2 / 0, both a `position: fixed` 159 × 26 px box present only in the R2 reading, no band, `main` or foot rect moved |

Smallest 100 % body, non-squat cells: **329 px fine** (320 × 568), **237 px coarse** (1024 × 500). Squat cells (`width < 64 rem`,
`height <= 26 rem`) take row 3 from `squat`, so a floor on row 3 never applies there.

Cells where the shell's `scrollHeight` exceeds its `clientHeight` **in base**: the three squat plan cells (640 × 360, 640 × 300,
320 × 256, by design: `squat:overflow-y-auto`), and **the landing page** at 1024 to 1408 wide up to 720 high (793 px fine, 797 px coarse) and in every cell under 1024 wide
(833 to 1098 px). Widths from 1536 up and windows 800 px or higher do not overflow.

## Corrections to the spec

1. **§0 "Why the inline route covers the dock" is now measured, and the geometry is worse than the mechanism suggested:** the band
   is 707 px (fine) and 931 px (coarse) tall at 1024 × 600, 118 % and 155 % of the window, and `main` is 0 px.
2. **§4.6 "the floor is 15 rem" does not hold.** `CANVAS_MIN_HEIGHT` in rem is 240 px, and the coarse 100 % body at 1024 × 500 is
   237 px. The spec's "smallest recorded body at the floor (329 coarse)" was ADR-0180's 1024 × 600 reading of a different fixture;
   the sweep finds a smaller one. 12 rem (192 px) clears it by 45 px.
3. **§4.6 and SC-4 "the shell's `scrollHeight` equals its `clientHeight` wherever it did before" is the wrong guard.** Base
   overflows at 100 % on the landing page and `overflow-hidden` hides it, so the comparison passes for R1 while R1 makes the
   overflow visible. The guard needs to be "the shell does not overflow at 100 % in any cell, or the overflow is fixed first".
4. **§4.8 R2 as written does not work** (`container-type: size` on an auto-height parent is zero high). With `height: 100dvh` on the
   container it does.
5. **§0 "every dock strip" and the plan's third strip, "the armed Add-tool statement", does not exist as a strip with controls.**
   The `adding` statement is withdrawn (`TsldPanel.tsx`, "withdrawing three of its six statements"); the idle linking statement
   is gone too, and the one that remains ("Linking FS from X · click the successor") needs a predecessor picked on the canvas,
   which the harness did not manage in two attempts. It is a text strip with no buttons, in the same outlet as the two read.
6. **The journey's 4 px corner inset is wrong at 200 % text.** `probeStrip` uses `x + 4`; at a 32 px root the buttons' radius is
   16 px and a point 4 px in lies outside the arc, so the journey would fail on a correct layout the moment its pointer hit-test
   is restored. The inset has to scale with the root size (as the harness's does).
7. **The selection bar is not shown with the activities panel expanded**, in either pointer, so ADR-0180's swap has no
   selection-bar reading. Its tip strip reads the same as the collapsed view in every cell.
8. **Reachability is "after scrolling each control into view", not "after scrolling the strip".** A strip taller than the body
   (the coarse selection bar, 571 to 667 px) cannot be wholly in view under R1; the planner scrolls to the control they want.

## What M1 needs from the owner

M1 is not built. The readings leave two builds, and the choice is the owner's: R2 with a sized container (passes every reading,
a broad CSS side effect, ui-architect not yet run), or R1 at 12 rem **and** a fix to the rail's overflow on the landing page
(a product change outside this epic, and the coarse selection bar's residual stays). Whichever is chosen, the journey change in
spec §4.6 stands and needs the scaled corner inset (correction 6).

## M1: the built frame against M0's R2

The owner's choice above was settled after this record: ui-architect picked **R2** (spec §4.6, ADR-0213), and M1 built it. The two
readings below are evidence, not a gate (ADR-0142): they say the built `.shell-frame` is what M0 injected, and that no overlay moved.

### The equivalence reading (plan T1.1 step 6)

The M0 harness, unchanged, on the M1 tree: `LTD_VARIANTS=base LTD_SUFFIX=.m1`, both pointers, 1024 × 600 and the SC-4 sweep. The
`base` reading of this run is the built frame (no injected style). It was compared field by field against M0's `r2` reading
(`m0-readings.fine.json` and `m0-readings.coarse.json`): every band, `main` and foot-row rect, every shell `overflow-y`, `shellRows`,
scroll extent, probe tally and setup-error field, in all 27 cells and all 98 sweep rows of each pointer.

**Result: 4 differences in 2 × (27 + 98) readings, every one a `[data-tooltip]`.**

| Where                                            | M0 `r2`                                  | M1 built frame                                      | What it is                                             |
| ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| coarse, plan sweep 320 × 720, `fixed` list       | three fixed elements, one `DIV 159 × 26` | two (the two closed dialogs)                        | the tooltip, `position: fixed`, `data-tooltip=""`      |
| coarse, plan sweep 320 × 568, `fixed` list       | three, one `DIV 159 × 26`                | two                                                 | the same tooltip                                       |
| coarse, Diagram, inline 200 %, selection: covers | `span.absolute.z-10.inset-y-0`: 6 points | the same span 5, `div.border-border.bg-popover…`: 1 | one probed point lands on the tooltip, not on the span |
| (the same pair, the span count)                  | 6                                        | 5                                                   | the same point, counted on the other side              |

The 159 × 26 box is the tooltip of whichever control has focus when the harness reads: `tooltip.tsx:514-531` portals a
`position: fixed` `<div data-tooltip="">` to the body, outside the frame, and opens it on focus or a long press. M0's own table already
recorded it as the one box present in an R2 reading and not in `base`, so it shows up in whichever reading the focus happened to be on
when it opened: here it is in M0's `r2` and absent in M1's, and, in the selection cell, absent in M0's and present in M1's. Which tooltip is open depends on which control held focus when the read ran, so it is not a property of the layout: it is outside the
frame and cannot be moved by it. (Why that tooltip was not made inert before this one point was counted was not investigated; the
conclusion rests on its being the tooltip's element and class, not on a second run.) The reading's `parent` field names `div.shell-frame` now and `#root` in M0, as
intended, and was left out of the comparison.

### The overlay reading (plan T1.1 step 7, SC-6)

A short test in the same harness file (`large-text-dock M1 overlays`, both pointers) at 1024 × 600, 100 % text, reads each overlay's
`getBoundingClientRect()` twice on the same page: as built, and with `.shell-frame{container-type:normal}` injected, which restores
today's containment state (`squat` is off at 1024 × 600 either way). Rects are `[top, left, width, height]`.

| Overlay                                       | Fine, built = without container | Coarse, built = without container |
| --------------------------------------------- | ------------------------------- | --------------------------------- |
| Activity editor `Dialog`                      | `[32, 64, 896, 536]`            | `[32, 64, 896, 536]`              |
| View ▾ popover                                | `[92, 161, 704, 366]`           | `[104, 213, 704, 402]`            |
| Row `Menu` in the Explorer                    | `[211, 243, 160, 106]`          | `[303, 227, 160, 142]`            |
| Tooltip (hover on fine, long press on coarse) | `[94, 760, 256, 42]`            | `[106, 760, 256, 42]`             |
| Explorer `Sheet` at 1000 × 600                | `[0, 0, 320, 600]`              | `[0, 0, 320, 600]`                |

**All ten pairs are equal**: no overlay is inside the containing block the frame creates. Raw readings:
`apps/web/measure-output/large-text-dock-m1-overlays.{fine,coarse}.json` (not committed; reproduce with
`playwright.measure-toolbar.config.ts --grep "M1 overlays"`).
