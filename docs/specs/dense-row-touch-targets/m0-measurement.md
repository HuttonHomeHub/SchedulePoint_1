# M0 — Measurement record: dense-row touch targets

Evidence for [`implementation-plan.md`](implementation-plan.md) M0 (ADR-0113, ADR-0142), against the predictions
committed first in [`m0-falsification.md`](m0-falsification.md). Nothing here changes the product.

## How the readings were taken

- **Date:** 2026-10-08. **Browser:** the container's Chromium (`/opt/pw-browsers/chromium-1194`), driven by
  Playwright against the real API and the Vite dev server. **Emulation, layout only**: not the Surface
  (ADR-0128), no frame-rate or finger-feel claim. The M4 device sheet is the arbiter.
- **Fixture:** a fresh organisation per cell, through the real sign-up, client, project and plan journey. Plan
  seeded with 30 activities through the REST API, the pen taken. 41 extra clients (one named
  "Extraordinarily Long Client Name Holdings International Limited (Northern Division)") so the tree overflows
  every height. Explorer at its default width (276). Activities panel opened with the real **Expand activities
  panel** control. Read after settling.
- **Harness:** a throwaway Playwright spec and config, **not committed** (a committed config is an ADR-0105
  trigger). Coarse cells use a context with `hasTouch: true`. `matchMedia('(pointer: coarse)')` was asserted
  first in every cell (`coarse` for touch, `fine` for mouse).
- **"Fully visible"** means a row's box lies inside its scroller's box. **"Hit-testable"** means
  `elementFromPoint` at the row's centre (clamped to 60 px from its left edge) returns the row, so it also
  excludes rows below the viewport's fold.
- **Three figures are emulated by injecting CSS into the harness page only**, and are labelled "emulated":
  the 44 px activities `⋯`, the 44 px tree row and `⋯`. They answer geometry questions and are not a reading of
  the shipped change.

## 1. Predictions against readings

| ID  | Prediction                                              | Reading                                                                                                                                                                                               | Verdict                                                                                                                 |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| P1  | List rows are >= 44 on coarse.                          | Clients, Calendars, Projects, Plans rows are **60.5 / 61** on coarse (1912 x 1104, 1646 x 1097 and 1024 x 600). On fine they are **48.5 / 49**. The `⋯` is 28 x 28 under both.                        | **Holds.** Resources had no rows in the fixture, so it is not read.                                                     |
| P2  | Activities rows with a `⋯` are 45 on both pointers.     | **45 on both** at 1912 wide (touch and mouse). At 1024 wide they are **57**, on touch as well: the row is width-keyed (wrapped cells), not pointer-keyed.                                             | **Holds at 1912, the width the spec quotes.** At the floor the figure is 57, so "45" is not a floor figure.             |
| P3  | Tree rows visible at 1912 x 1104 coarse are 19 +- 3.    | **20 fully visible** (plus 1 partly), in a 577 px scroller.                                                                                                                                           | **Holds**, inside 16..22. The spec's 549 px worked tree height was 28 px low (577 measured).                            |
| P4  | The fine spine's destinations overflow its content box. | **Confirmed with a mouse.** Spine 34 px wide, 33 px client width. The six links are 36 x 36, inside a 44 px wrapper (`p-1`), so each sits 1.5 px outside the box on the left and 0.5 px on the right. | **Holds.** `scrollWidth` 39 against `clientWidth` 33 on the panel. This is a fine-pointer defect, as the spec expected. |

## 2. Rows visible per surface

Heights in CSS px. "Full" is rows fully inside the scroller. The 44 px column is **arithmetic**
(`floor((scroller - 8) / 44)` for the tree, whose scroller has `py-1`), not a reading.

### Explorer tree (rows are 28 on every cell, both pointers)

| Cell              | Scroller | Rows full (today) | Hit-testable | Rows at 44 (arithmetic) | Change |
| ----------------- | -------- | ----------------- | ------------ | ----------------------- | ------ |
| 1912 x 1104 touch | 577      | **20**            | 20           | 12                      | -40 %  |
| 1646 x 1097 touch | 570      | **20**            | 20           | 12                      | -40 %  |
| 1912 x 948 mouse  | 517      | **18**            | 18           | 18 (unchanged)          | none   |
| 1024 x 600 touch  | 128      | **4**             | 4            | 2                       | -50 %  |

Whole-row flooring makes the real loss 40 % and 50 %, not the 36 % that 1 - 28/44 gives for a continuous height.

### Activities table (the panel's own scroller)

| Cell              | Panel | Scroller | Row today | Full | Hit-testable | Row with 44 px `⋯` (emulated) |
| ----------------- | ----- | -------- | --------- | ---- | ------------ | ----------------------------- |
| 1912 x 1104 touch | 280   | 172      | 45        | 3    | 3            | **61**                        |
| 1646 x 1097 touch | 280   | 172      | 45        | 3    | 3            | **61**                        |
| 1912 x 948 mouse  | 280   | 176      | 45        | 3    | 3            | not read (mouse is unchanged) |
| 1024 x 600 touch  | 140   | 128      | **57**    | 1    | **0**        | **61**                        |

- 45 to 61 at 1912, confirmed by emulation: 3 rows become 2 in the same 172 px scroller.
- At 1024 x 600 the row is already 57 (wrapped cells), so a 44 px `⋯` costs 4 px per row there, not 16. The
  scroller sits at y 497..625 on a 600 px viewport, so **no row is hit-testable at the floor today**, which
  agrees with the spec.

### Gantt body (stays 28, CQ-1; read so the cost of growing it can be quoted)

| Cell              | Body scroller | Row heights | Rows full (today) |
| ----------------- | ------------- | ----------- | ----------------- |
| 1912 x 1104 touch | 656           | 28 (and 34) | 21                |
| 1646 x 1097 touch | 649           | 28 (and 34) | 20                |
| 1912 x 948 mouse  | 520           | 28 (and 34) | 16                |
| 1024 x 600 touch  | 188           | 28 (and 34) | 3                 |

The treegrid is 584 px wide in every cell. Growing the rows to 44 would cost about 36 % of these (656 / 44 is
about 14 rows at 1912 x 1104), by arithmetic only.

### List tables (`RowActionsMenu`)

Rows are 60.5 / 61 on coarse and 48.5 / 49 on fine, in the Clients list (42 rows), Calendars, Projects and
Plans (one row each). Growing the `⋯` from 28 to 44 on coarse needs a 44 px button plus the row's padding inside
a 61 px row, so the rows do not grow (the spec's claim, consistent with the `Edit` button next to it being 44).

## 3. The collapsed spine

Spine panel `[data-panel-border]`, collapsed, border-box width **34** (1 px right border, no padding).

| Pointer | Controls                                                   | Panel `scrollWidth` / `clientWidth` | Inside the spine's box?                                                               |
| ------- | ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Fine    | "Show Project Explorer" 28 x 28; six links **36 x 36**     | 39 / 33                             | Show: yes. **Links: no**, L -1.5, R -0.5 (their `p-1` wrapper is 44 wide in a 33 box) |
| Coarse  | "Show Project Explorer" **28 x 28**; six links **44 x 44** | 43 / 33                             | Show: yes. **Links: no**, L -5.5, R -4.5 (the wrapper is 52 wide)                     |

- So the spine **does overflow with a mouse** (P4), and with touch by 10 px.
- Today's coarse "Show Project Explorer" is 28 x 28, below the house rule. M3's `icon-row` fixes it.
- **The width a coarse spine needs is 53** (44 + 2 x 4 for the wrapper's `p-1` + 1 for the border), which matches
  the spec's "around 53". The fine fit would be 45 (36 + 8 + 1).
- The panel's computed `overflow-x` was **not read**, so whether the overflow scrolls or is clipped is not
  established. The `scrollWidth > clientWidth` reading is what the M3 assertion would use.

### Stage widths (baseline for M3)

Widths of `main` (the canvas is the same width in the diagram) with the Explorer expanded (276 wide) and collapsed
(34 wide):

| Cell              | Expanded | Collapsed | Gain from collapsing |
| ----------------- | -------- | --------- | -------------------- |
| 1912 x 1104 touch | 1635     | 1878      | 243                  |
| 1912 x 948 mouse  | 1635     | 1878      | 243                  |
| 1646 x 1097 touch | 1369     | 1612      | 243                  |
| 1024 x 600 touch  | 747      | 990       | 243                  |

A 53 px coarse spine would take 19 px from the collapsed stage (1878 to 1859 at 1912 wide). The Gantt's treegrid is
584 wide in every cell, unaffected by the spine.

## 4. Truncation beside an always-visible 44 px `⋯`, Explorer at 200 (the minimum)

The long-named client row at 200 px (row 199 px wide):

| State                                    | Row | Name box | Truncated | `⋯`             | Overlap |
| ---------------------------------------- | --- | -------- | --------- | --------------- | ------- |
| Today, coarse (always visible)           | 28  | 101      | yes       | 28 x 28         | 0       |
| Emulated 44 px row and `⋯`, always shown | 44  | **85**   | yes       | 44 x 44, in row | 0       |

The name still truncates and does not meet the `⋯`; 16 px of the name box is spent. Fine, today: the `⋯` is
`opacity: 0` until hover or focus, as the code says.

## 5. Indent and icons in a 44 px row

Screenshots (kept outside the repository, in the harness output): the tree at 200 px with today's 28 px rows and
with the emulated 44 px rows and 44 px `⋯`. In the 44 px version the 16 px level indent, the 16 px kind icons, the
disclosure chevrons and the 16 px `⋯` glyph still read as one hierarchy. Rows are airier and the `⋯` glyph sits
centred in a larger box; nothing overlaps or clips. A judgement from the images, not a measurement.

## 6. What contradicts the spec

None of these changes a decision (CQ-1..3 stand). Recorded so the spec's figures are corrected, not silently
adjusted.

1. **The tree at 1024 x 600 shows 4 rows, not "about 0"** (spec §1, §4.3, plan M2's risk list citing
   `minimum-viewport/m0-measurement.md:113`). The tree's scroller is 128 px high at y 307..435, inside the 600 px
   viewport, and all 4 rows are hit-testable. At 44 px it would show 2. So the floor does pay for the tree
   change (4 to 2 rows), where the spec says 0 to 0.
2. **Tree height at 1912 x 1104 coarse is 577**, not the worked-out 549. The row count is 20, not 19, still
   inside P3.
3. **Activities rows at the floor are 57, not 45**, and a 44 px `⋯` takes them to 61. The "45 to 61, 26 % fewer"
   figure is the 1912-wide one. At 1024 it is 57 to 61.
4. **A fine-pointer row on the list pages is 48.5 / 49**, not given in the spec. Coarse is the 60.5 / 61 it quoted.
5. **The 36 % figure is continuous.** Whole-row flooring gives 40 % (tree at 1912) and 50 % (tree at the floor).
6. **Today's coarse spine contains a 28 px "Show Project Explorer"**, not a 44 px one. Not a premise of the spec,
   but US-3's "all >= 44" is currently false for it as well as for the links.

Premises that held: the spine overflows with a mouse (P4); a coarse link needs a 53 px spine; list rows are

> = 44 on coarse; activities rows are 45 at 1912; the long name truncates beside a 44 px `⋯` with no overlap.
