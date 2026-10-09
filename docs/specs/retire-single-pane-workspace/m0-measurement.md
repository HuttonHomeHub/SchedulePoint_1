# M0 — Measurement record: retiring the below-`md` single-pane workspace

Evidence for [`implementation-plan.md`](implementation-plan.md) M0 (ADR-0113, ADR-0142). Nothing here changes
the product. **Two premises of the spec do not survive these readings** (§0), so M1 is not started and the plan
needs a decision from the product owner before it is.

## How the readings were taken

- **Date:** 2026-10-09. **Browser:** the container's Chromium (`/opt/pw-browsers/chromium-1194`), driven by
  Playwright's library API against the real API and the Vite dev server. **Layout only**: not target hardware, no
  frame-rate claim. Fine pointer throughout (the coarse axis is ADR-0118's).
- **Fixture:** a fresh organisation, client, project and plan, twelve activities seeded through the public REST API
  (one per lane, 3 d each), recalculated, then (for the revisions pickers only) two baselines captured. The viewport
  notice was acknowledged by `localStorage` before first paint. Every cell is a fresh context at the stated size, read
  after 1.2 s.
- **Harness:** throwaway Node scripts outside the committed tree, **not committed**. No source file was edited.
- **"Today"** is the shipped layout. **"Target"** is the layout with the branch removed, **emulated without editing
  source**: an init script makes `matchMedia('(min-width: 48rem)')` answer `matches: true`, which is the only thing
  `isWide` reads (`plan-workspace-toolbar.tsx:579`; `MD_QUERY` at `:157` is used nowhere else). It is the wide branch
  at a narrow width, which is exactly what deleting the narrow branch produces. It does **not** include any M1 change
  (no dock cap, no `inert`, no foot-row wrap), which is the point: these are the "before M1" readings.
- **"Hit-testable rows"** is `<tbody>` rows of non-zero height whose centre is inside the viewport and the table region
  and where `elementFromPoint` resolves to the row. "Reachable" is `elementFromPoint` at the control's centre.
- The `DataTable` "with the `md:` prefix dropped" figure is a style injection (`min-height: 8rem` on the region).

## 0. What contradicts the spec

| #   | Spec says                                                                                                                                                                 | Measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Success criterion: at 640 × 300, 640 × 360 and 640 × 480 with the panel expanded, "the table shows at least one row under the short-screen swap" (AC-3.2, M1-T8)          | **0 rows at all three, today and in the target layout.** The shell's chrome (header 88 + the wrapped command band 248, so `<main>` starts at **y = 355** at 640 wide, **y = 603 at 320**) leaves a workspace body of 117 px at 640 × 480 (target) and **0 px at 640 × 360 and 640 × 300**. ADR-0180's swap hands the panel "the whole body", but the body is smaller than the panel's own fixed parts (`PANEL_MIN_OPEN` = 249). See §3.                                                                                                                          |
| 2   | AC-3.2 / M1-T5: if the window cannot hold chrome + foot row, `<main>` scrolls vertically rather than clipping Expand and Recalculate; M0 reads whether this already holds | **It does not hold.** At 640 × 360, 640 × 300 and 320 × 256 `<main>` is 0–5 px tall (`clientHeight` 0, `scrollHeight` 8). Expand and Recalculate sit **below the viewport** (y = 370 / 380 at 640 × 300 and 360) and are not pointer-reachable; scrolling `<main>` moves them by 3–8 px. The conditional remedy in M1-T5 ("a minimum height on the workspace body equal to the foot row") is therefore **needed**, and by itself it is not enough: a 0 px `<main>` has nothing to scroll inside. The shell, not the workspace body, would have to give the area. |
| 3   | M1-T6: "Expand and Recalculate stay `shrink-0`"                                                                                                                           | **Expand is not `shrink-0` today.** It is 40 × 40 at 700 and up, **26 × 40 at 640 and 16 × 40 at 320** (the 582 px facts block beside it is the `shrink-0` one). At 320 it is also at x = 606, off-screen. M1-T6 must add `shrink-0` to Expand, not only `flex-wrap` to the row.                                                                                                                                                                                                                                                                                 |

Everything else the spec predicted held: the revisions defect is real (§1), the revisions dock at 640 leaves a
259 px stage, the notes dock leaves 359, a dock at 320 overflows (§4), and the foot row overflows by 302 px at 320 (§2).

## 1. M0-T1 — Compare revisions below 768 px: **confirmed**

At 700 × 900 after Continue anyway, in today's layout: Analysis → **Compare revisions…**, read after 1 s.

- `getByRole('region', { name: 'Compare revisions' })`: **0**. Any element with the text "Compare revisions": **0**.
  The menu closes, the workspace is unchanged, no dock is in the DOM.
- The state **was** set: widening the same page to 1280 × 900 without any other action renders the region
  (count 1). So the toggle works and the narrow branch renders nothing for it, as the spec read from code.
- Same action in the target layout: the region renders (count 1), dock 380 px wide, stage 319 px at 700.

Same result at 767 × 1024, 640 × 844, 640 × 480: no region. (At 640 × 360 and below nothing of the workspace is on
screen to look at; see §3.)

## 2. Readings, collapsed (no dock, panel collapsed)

Heights in CSS px. "Chrome" is the y at which `<main>` starts. Body is `[data-testid="workspace-body"]`. Canvas row is
the stage-plus-docks row. Ruler is `[data-testid="tsld-ruler"]`. Foot is `[data-activities-bar]`; "sx" is its
`scrollWidth − clientWidth`. In today's layout there is no foot row below `md` (the facts and Recalculate render in
the shell status row), so the Expand column is empty there.

| Viewport   | Layout | Chrome | Body | Canvas row | Stage w | Ruler | Foot h | Foot sx | Expand (w×h @ x,y)             | Recalculate       | Doc sx |
| ---------- | ------ | ------ | ---- | ---------- | ------- | ----- | ------ | ------- | ------------------------------ | ----------------- | ------ |
| 767 × 1024 | today  | 355    | 708  | 646        | 767     | 40    | —      | —       | —                              | (388, 998) yes    | 0      |
| 767 × 1024 | target | 355    | 741  | 690        | 767     | 40    | 51     | 0       | 40×40 @ 719,980 yes            | (518, 990) yes    | 0      |
| 700 × 900  | today  | 355    | 544  | 482        | 700     | 40    | —      | —       | —                              | (388, 874) yes    | 0      |
| 700 × 900  | target | 355    | 577  | 526        | 700     | 40    | 51     | 0       | 40×40 @ 652,856 yes            | (451, 866) yes    | 0      |
| 640 × 844  | today  | 355    | 448  | 386        | 640     | 40    | —      | —       | —                              | (388, 818) yes    | 0      |
| 640 × 844  | target | 355    | 481  | 430        | 640     | 40    | 51     | 0       | **26**×40 @ 606,800 yes        | (404, 810) yes    | 0      |
| 640 × 480  | today  | 355    | 84   | 22         | 640     | 40    | —      | —       | —                              | (388, 454) yes    | 0      |
| 640 × 480  | target | 355    | 117  | 66         | 640     | 40    | 51     | 0       | 26×40 @ 606,436 yes            | (404, 446) yes    | 0      |
| 640 × 360  | today  | 355    | 0    | 0          | 640     | 40    | —      | —       | —                              | (388, 362) **no** | 0      |
| 640 × 360  | target | 355    | 0    | 0          | 640     | 40    | 51     | 0       | 26×40 @ 606,370 **no**         | (404, 380) **no** | 0      |
| 640 × 300  | today  | 355    | 0    | 0          | 640     | 40    | —      | —       | —                              | (388, 362) **no** | 0      |
| 640 × 300  | target | 355    | 0    | 0          | 640     | 40    | 51     | 0       | 26×40 @ 606,370 **no**         | (404, 380) **no** | 0      |
| 320 × 720  | today  | 603    | 76   | 14         | 320     | 40    | —      | —       | —                              | (388, 694) **no** | 0      |
| 320 × 720  | target | 603    | 109  | 58         | 320     | 40    | 51     | **302** | **16**×40 @ **606**,676 **no** | (404, 686) **no** | 0      |
| 320 × 256  | today  | 603    | 0    | 0          | 320     | 40    | —      | —       | —                              | (388, 610) **no** | 0      |
| 320 × 256  | target | 603    | 0    | 0          | 320     | 40    | 51     | **302** | **16**×40 @ **606**,618 **no** | (404, 628) **no** | 0      |

Reading it:

- **The document never scrolls sideways** (`Doc sx` 0 everywhere), in either layout. The foot row's own sx is 0 down
  to 640 and **302 at 320**: the facts block is a fixed 582 px (the spec's estimate was about 465) and Expand, the
  trailing item, is pushed to x = 606, outside a 320 px body and clipped by its `overflow-hidden`. AC-3.3 is real and
  is exactly as predicted. Recalculate, which sits in the same block, is off-screen at 320 too (x = 404).
- **Today's Recalculate is also unreachable at 320** (x = 388) and at heights of 360 and below. That is the shell
  status row clipping, not the branch, and it is the same fault as in the target layout.
- **The ruler band is 40 px** in every cell. That is the collapsed-state `inert` floor for spec AC-2.4 "Height"
  (a constant with this reading in its docblock, per ADR-0151). Every cell at 640 × 360 and below is already under it
  (canvas row 0), and 640 × 480 is above it (66 in the target layout) by 26 px.
- **Chrome is 355 px at 640 and 603 px at 320** (header 88 / 136 plus the wrapped band 248 / 448, with `<main>`
  beginning at the sum). Neither branch, ADR-0180 nor this plan touches that, and it decides everything below.
- Body height with the panel collapsed is the viewport minus chrome, plus the foot (target) or minus the shell status
  row (today): 481 at 640 × 844, 117 at 640 × 480, 0 below.

### Short bodies: `<main>` does not scroll (premise 2)

| Viewport (target) | `<main>` client h | `<main>` scroll h | Expand y before / after scrolling `<main>` to its end | After `scrollIntoView` on Expand |
| ----------------- | ----------------- | ----------------- | ----------------------------------------------------- | -------------------------------- |
| 640 × 480         | 125               | 125               | 436 / 436 (in view)                                   | 436                              |
| 640 × 360         | 5                 | 8                 | 370 / 367 (viewport is 360)                           | 329 (centre not hit-testable)    |
| 640 × 300         | 0                 | 8                 | 370 / 362 (viewport is 300)                           | 264 (centre not hit-testable)    |
| 320 × 256         | 0                 | 8                 | 618 / 610 (viewport is 256)                           | 220 (centre not hit-testable)    |

A pointer or wheel user cannot reach the foot row at these sizes. Only a programmatic scroll of an `overflow-hidden`
ancestor (focus, `scrollIntoView`) moves it, and then the page chrome is scrolled out of the way (header at y = −134
at 640 × 300). The same is true of today's Recalculate.

## 3. Readings, panel expanded, and ADR-0180's swap at every width

`ROW_PX` 61, `PANEL_MIN_OPEN` 249, `PANEL_USEFUL_MIN` 371 and the 611 line were confirmed against
`use-activity-panel-prefs.ts:34-48`. The swap (`swapped = isWide && !collapsed && short`, `:621`) is the wide branch's;
in the target layout it applies at every width. Rows are hit-testable rows (§ above). "Region" is the `DataTable`
scroll region; "with 128 floor" is the same cell with `min-height: 8rem` forced on it (the `md:` prefix dropped).

| Viewport   | Layout | Body | Canvas row    | Panel body | Region h | Rows hit / rendered | Region with 128 floor / rows |
| ---------- | ------ | ---- | ------------- | ---------- | -------- | ------------------- | ---------------------------- |
| 767 × 1024 | today  | 708  | hidden (pane) | 573        | 557      | 12 / 12             | —                            |
| 767 × 1024 | target | 741  | 460           | 192        | 176      | 3 / 12              | 176 / 3                      |
| 700 × 900  | today  | 544  | hidden        | 409        | 393      | 8 / 12              | —                            |
| 700 × 900  | target | 577  | hidden (swap) | 489        | 473      | 10 / 12             | 473 / 10                     |
| 640 × 844  | today  | 448  | hidden        | 313        | 297      | 6 / 12              | —                            |
| 640 × 844  | target | 481  | hidden (swap) | 393        | 377      | 8 / 12              | 377 / 8                      |
| 640 × 480  | today  | 84   | hidden        | 16         | 0        | **0** / 12          | —                            |
| 640 × 480  | target | 117  | hidden (swap) | 29         | 13       | **0** / 12          | 128 / **0**                  |
| 640 × 360  | target | 0    | hidden (swap) | 161        | 145      | **0**               | 145 / **0**                  |
| 640 × 300  | target | 0    | hidden (swap) | 161        | 145      | **0**               | 145 / **0**                  |
| 320 × 720  | today  | 76   | hidden        | 16         | 0        | **0** / 12          | —                            |
| 320 × 720  | target | 109  | hidden (swap) | 16         | 0        | **0** / 12          | 128 / **0**                  |
| 320 × 256  | target | 0    | hidden (swap) | 161        | 145      | **0**               | 145 / **0**                  |

(The 640 × 360, 640 × 300 and 320 × 256 expanded cells could only be read by clicking Expand from the DOM, because the
control is below the viewport. The panel then lays out at its 161 px minimum inside a 0 px body that clips it.)

- **The swap is correct where the body can hold it and delivers nothing where it cannot.** At 640 × 844 it gives 8
  rows (today's single pane gives 6). At 700 × 900, 10 rows. At 767 × 1024 the body (741) is over the 611 line, so no
  swap and 3 rows beside the diagram, which is the same figure as ADR-0180's 1024 × 600 reading.
- **Below ≈ 604 px of viewport height at 640 wide (355 + 249) no layout shows a row.** Today's pane shows 0 rows at
  640 × 480 and 320 × 720 as well, so this is not a regression the retirement causes. It does make the plan's
  criterion for 640 × 300 / 360 / 480 unreachable by the plan's own changes (premise 1).
- **Dropping `md:` from `min-h-32` (AC-3.4) changes nothing that is visible** at 640 × 844, 700 × 900 and 767 × 1024
  (the region is already 176–473 px). At 640 × 480 and 320 × 720 it makes the region 128 px inside a 13–0 px area, which
  moves the scroll to the panel body and still shows 0 rows. Its cost is nil and its benefit there is nil.
- **A dock and Expand, target layout** (comments and Health, `aria-pressed` read on Comments):
  - Dock open, then Expand, on a swapped body (700 × 900, 640 × 844, 640 × 480, 320 × 720): the dock **closes**, Comments' `aria-pressed` goes `false`, the panel takes the body. ADR-0180 D5 holds
    at narrow widths. On a body that does not swap (767 × 1024) Expand leaves the dock open beside the panel (D5's
    other half).
  - Expand, then open a dock: the **panel collapses first** and the dock takes the row, at every swapped size.
  - Dock open, then **Fit** (the `fit` item): **the dock stays open** and the toggle stays pressed. That is today's
    pre-M1 behaviour (no `withDiagram` width case yet); recorded as the "before" for M1-T4's journey, not a defect.
  - At 640 × 360, 640 × 300 and 320 × 256 the Expand control is below the viewport and the click did not take effect
    (the panel stayed collapsed, Comments stayed pressed), so those cells have no reading for this behaviour.

## 4. Docks

### Widths, stage width, and whether the stage is reachable (target layout, before M1)

"dock / stage" in CSS px. Nothing is `inert` and no cap exists yet, so these are what M1 starts from. Dock widths are
the shipped defaults (notes 280, Health 340, revisions 380 minimum, Float paths 300) as clamped by
`max(MIN, bodyWidth − 360)`.

| Viewport   | Comments  | Health      | Revisions   | Float paths |
| ---------- | --------- | ----------- | ----------- | ----------- |
| 767 × 1024 | 360 / 406 | 400 / 366   | 407 / 359   | 380 / 386   |
| 700 × 900  | 340 / 359 | 340 / 359   | 380 / 319   | 340 / 359   |
| 640 × 844  | 280 / 359 | 340 / 299   | 380 / 259   | 300 / 339   |
| 640 × 480  | 280 / 359 | 340 / 299   | 380 / 259   | — / 339     |
| 320 × 720  | 280 / 39  | 340 / **0** | 380 / **0** | — / 19      |

(Dock rows below 640 × 480 are not readable because the body is 0 px high.)

- **At 640 every dock leaves the stage under 360**, not only the two the spec named: Health 299, Float paths 339,
  Comments 359, revisions 259. `squeezed` (spec AC-2.4: `bodyWidth − min − 1 < 360`) fires for all four at 640, and at
  700 for Comments (359), Health (359) and revisions (319). So at 640 and below **every dock takes the whole row**; the
  side-by-side layout survives only from about 740 px (revisions) and 700 px (the others).
- **The existing clamp is one pixel short, and the plan's `dockBounds` repeats it.** At 767 revisions renders 407 px and
  leaves a 359 px stage: `max(MIN, body − 360)` forgets the 1 px splitter. M1-T3's `width` expression
  (`min(stored, max(min, bodyWidth − CANVAS_MIN_WIDTH), cap)`) has the same arithmetic, and its `squeezed` is
  `767 − 380 − 1 = 386 ≥ 360`, so at 767 the stage is 359, under the floor, and not flagged. Use
  `bodyWidth − CANVAS_MIN_WIDTH − SPLITTER_WIDTH` in the width and the two will agree.
- **At 320 a dock overflows its body**, as predicted: Comments 280, Health 340 and revisions 380 are all wider than
  the 320 px body and are clipped by its `overflow-hidden`. The stage is 39 / 0 / 0 / 19 px. Nothing makes the stage
  `inert`.

### Reflow of dock content (AC-2.3)

Each dock was opened at 1440 and its width then forced to 420, 380, 340, 319, 300, 280 and 260 px. Read: the dock's
`scrollWidth − clientWidth`, every descendant whose right edge is past the dock's, any inner element scrolling
sideways.

- **Comments, Health check, Float paths:** sideways overflow **0**, descendants past the right edge **0**, inner
  sideways scrollers **0**, at every width down to 260.
- **Compare revisions**, with the plan's two baselines so the pickers render (without baselines the panel shows only
  its empty state, which proves nothing about reflow): overflow **0** at every width. The **Earlier revision** and
  **This plan's side** pickers are a **single column** at every width from 420 down (grid template `387px` at 420,
  `347px` at 380, `286px` at 319, `227px` at 260), select width = the column. The `@sm` stack
  (`RevisionComparePanel.tsx:361`) holds at 380 and below, as the spec said.
- So AC-2.3 needs **no reflow work** down to 260. The dock work in M1 is the width cap and `inert` only.

### Zero-size focusable elements with a dock open

Counted two ways in every dock cell: visible, non-`inert` focusable elements with a zero-width or zero-height box; and
a 24-press Tab walk starting from the page, recording each landing's box.

- **None of the zero-size elements is the squeezed stage's content.** The stage (259 px at 640 revisions) still has
  non-zero focusables. The zero-size elements are:
  - the dock's `PanelResizer` handle (`Resize notes / health check / float paths / revision comparison panel`), zero
    in the cells where the canvas row has no height (640 × 480 and below, and 320 × 720): 1 in the static count, 2
    Tab landings per cell;
  - two that exist **in today's layout too** and are not the branch's: the visually-hidden **Skip to main content**
    link, and the **breadcrumb link "Riverside"** at 320 (zero-size in the collapsed state, with no dock).
  - In today's layout at 640 × 480 and 320 × 720 the **expanded** pane has one more, the `Activities` region (a
    zero-height table region).
- Tab landings in a dock cell that were not hit-testable (centre covered or off-screen) are 2–10 per cell in the target
  layout from 640 down and 2 at 700–767, versus 0–2 in today's layout at the same widths; the 24-press walk
  includes the shell chrome, so only the order of magnitude is meaningful.
- Reading for M1-T4's keyboard assertion: "Tab from the dock never lands on a zero-size element" would fail today on
  the resizer handle, **not** on the stage, and would also trip on the two pre-existing elements unless it is scoped to
  the dock's own controls.

## 5. Other readings the plan listed

- **Selection bars in the foot row.** Selecting an activity (needed to enable **Float paths**) docks its action bar in
  the foot row's outlet. In the target layout the foot row goes from 51 px to **167 px at 1280 × 900**, to **367 px at
  1024 × 768, 767 × 1024, 640 × 844 and 320 × 720**. The outlet column is 349 px at 1280, **93 px at 1024, 113 px at
  767 and 0 px at 640 and 320** wide, because the 582 px facts block beside it is `shrink-0`; its text wraps one word
  per line (356 px tall). So **the 1024 designed floor already has a 367 px foot row when an activity is selected**,
  independent of this epic; the retirement carries the same row to every narrower width. M1-T6's `flex-wrap` on the foot
  row is what would give the outlet a full-width line. Worth a ux-reviewer look; it is not a number the spec has.
- **#466** (row `⋯` under a bar at 320). At 320 × 1300 (tall enough for the table to show rows) the row `⋯` buttons are
  at x = 419–447, i.e. outside a 320 px viewport, in **both** layouts; the table is a scrolling region and the `⋯`
  column is beyond its right edge until it is scrolled. I did not reproduce "under the pane's own bar for a pointer":
  there is no bar over them in the target layout. This reading neither closes #466 nor moves it; it says the symptom
  the row describes is not what a browser shows today.
- **Whether `<main>` scrolls with the panel collapsed at 640 × 300:** no (see §2, "Short bodies").
- **Document sideways scroll** at every cell: 0.
- **Health and Float paths at about 300 px:** no overflow (above).

## 6. M0-T3 questions that the code answers

### Every site (grep of `apps`, `scripts`, `packages`, 2026-10-09)

Identifiers (`hostsPlanSlots`, `WorkspacePane`, `setPane`, `WorkspaceViewToggle`, `isWide`, `MD_QUERY`): the sites match
the spec's table, with these line drifts since 2026-10-08 (short-screen landed): the branch condition is now
`plan-workspace-toolbar.tsx:2453`, the narrow pane's toggle `:2667`, its `hostsPlanSlots={false}` panel `:2689`; the
import is `:38`, `MD_QUERY` `:157`, `isWide`/`pane` `:579-580`, and the swap `:621`. `activity-bottom-panel.tsx` has the
prop at `:218`, `:249`, `:409`, `:466`, `:476`, `:544-545`, `:561-574`. **Re-read every line reference in the plan before
M1** (the plan already says so).

Prose sites ("single-pane", "below `md`", "one-pane", "narrow layout") that the spec's table does **not** list:

| Site                                                                                                       | What it says / is                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e-workspace-chrome/activities-panel-scroll.spec.ts:744-751`                                             | A **second** describe, `below md, after Continue anyway`, with a `case 7` titled "keeps the single-…". The plan lists only `:271-306`. This is the short-screen journey's case 7, which the plan's sequencing note says is rewritten in M1.                    |
| `e2e-workspace-chrome/activity-editor-chrome.spec.ts:74`                                                   | A comment about a "sub-768 px narrow layout" that a desktop run permanently used                                                                                                                                                                               |
| `e2e-narrow-shell/narrow-shell.spec.ts:152`, `:370`                                                        | `describe` title "the shell is the existing narrow layout" and the 320 × 256 comment; not in the plan's list (it lists `:196-215` and `:406`)                                                                                                                  |
| `playwright.narrow-shell.config.ts:14`                                                                     | Docblock "under `md`; ADR-0179"                                                                                                                                                                                                                                |
| `measure-toolbar/m0-bands.spec.ts:33`, `:46`, `:67`, `:105`                                                | `hostsDock={false}` for a pane that is `display: none` on the narrow layout (the plan lists `:46-52` only)                                                                                                                                                     |
| `plan-workspace-toolbar.tsx:575`, `:2477`, `:2643-2660`, `:2680`                                           | The "Below `md` the vertical split…" comment, "see the single-pane branch below", the Health/Float/notes narrow comments, "Below `md` the strip rides the Diagram pane" (the plan lists `:247`, `:1084-1085`, `:1715`, `:2364`; the line numbers have drifted) |
| `plan-workspace-toolbar.tsx:1817`                                                                          | "wide right column or the narrow single pane"                                                                                                                                                                                                                  |
| `activity-bottom-panel.tsx:538`                                                                            | A `Below md` comment on the outlet guard                                                                                                                                                                                                                       |
| `activity-bottom-panel.test.tsx:18`, `canvas-dock.test.tsx:128-136`, `plan-workspace-toolbar.test.tsx:397` | Docblocks and the tests the plan already lists                                                                                                                                                                                                                 |

Hits that mention `md` or "single pane" and are **not** this layout, so M1-T9 must not touch them: `brand-panel.tsx`,
`e2e-public/support.ts:197-227` (the public screens' brand band), `page-grid.tsx:49`, `page-header.tsx:33,111,120`,
`page-archetypes.test.tsx`, `tabs.tsx:8` ("a single panel"), `ActivityEditorSession.tsx:674` (the editor's horizon list
below `md`), `tech-debt-278-dock-header-height.spec.ts:23`.

### Does the swap survive the branch deletion?

`const swapped = isWide && !collapsed && short` (`:621`). With `isWide` gone it is `!collapsed && short`; `short`
(`:619`) reads `bodyHeight`, which `bodyRef` observes on the same element in both branches (`:2449`). The swap's hide
(`hidden={swapped}` on the canvas row) and its resizer withholding live inside the wide branch's JSX
(`:2470`, `:2608`), so they move with it. **The one thing that does not move for free** is the `isWide &&`
guard's job of keeping the swap off the narrow layout; deleting it is what turns A1 on below 768.

### The `onCollapse` prop

`ActivityBottomPanel`'s `onCollapse` is documented "Omitted on the mobile single-pane view" (`:250`); the only caller
that omits it is the narrow pane (`:2689`), so after M1 it is always passed in the workspace and stays optional for the
component's tests and the share route is unaffected.

## 7. Verdict

| Premise                                                                    | Result                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Compare revisions renders nothing below 768 px                             | **Confirmed** (§1)                                                              |
| A dock cannot fit at 320                                                   | Confirmed, as predicted (§4); no reflow problem inside a dock                   |
| The foot row overflows at 320 and Expand is clipped                        | Confirmed (§2). Expand is shrinkable, not `shrink-0` (premise 3)                |
| The swap leaves rows at 640 × 300 / 360 / 480                              | **False** (premise 1): 0 rows, because the shell chrome leaves a 0–117 px body  |
| `<main>` scrolls so the foot row is not clipped at 640 × 300               | **False** (premise 2): the foot is below the viewport and `<main>` is 0 px tall |
| Retirement worsens the table at short heights                              | **No.** Today's pane also shows 0 rows at 640 × 480 and 320 × 720               |
| `md:` on `min-h-32` can be dropped with no visible effect where rows exist | Confirmed (§3)                                                                  |

**M1 should not start as written.** The decision is the product owner's: either (a) the 640 × 300 / 360 / 480 criteria
are withdrawn and the ADR records the 355 px / 603 px shell chrome as a pre-existing limit (the plan's risk table
already says the band's short-height crowding is pre-existing, so this is the smaller change), or (b) the shell chrome
at 640 and 320 is brought into scope, which is a new surface and needs its own spec. Premise 3 and the `dockBounds`
off-by-one are fixable inside M1 as it stands.
