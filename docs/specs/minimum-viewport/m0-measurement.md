# M0 — Measurement record and payoff list

Evidence for [`implementation-plan.md`](implementation-plan.md) M0 (ADR-0113, ADR-0142): the workspace at
the floor is read before a number is written into the rules, and what the narrow obligation has cost the
wide layout is listed. Nothing here changes the product.

## How the readings were taken

- **Date:** 2026-10-08. **Browser:** the container's Chromium, driven by Playwright, against the real API
  and the Vite dev server. **This measures layout only.** It is not the target hardware and makes no
  frame-rate claim (M0-T1's own risk).
- **Fixture:** a fresh organisation, client, project and plan (`Riverside Quarter - Phase 2 Substructure`),
  two activities seeded through the public REST API (`Site setup` 12 d on lane 0, `Excavate to formation`
  18 d on lane 1), recalculated, then the pen taken. Nothing selected, no WBS summary, the activities panel
  collapsed (its default). The command-surface gate's fixture also seeds a WBS summary, so the two are
  close but not identical (see "What these numbers are not").
- **Harness:** a throwaway Playwright spec outside the committed tree, in the `measure-gantt` tradition but
  **not committed**, because a committed one needs its own Playwright config, and that is an ADR-0105
  trigger this record does not carry. It was run twice (the second after correcting a labelling bug in its
  output keys), and the two runs agreed on every layout figure in every one of the 40 cells.
- **Cells:** 1024 × 600, 1024 × 640 and 1272 × 588, each at `pointer: fine` and `pointer: coarse` (a
  context created with `hasTouch: true`; `matchMedia('(pointer: coarse)')` was read in every cell and was
  `false` for the fine context and `true` for the coarse one), with the Explorer at its default width
  (276), its maximum (420) and folded (the 34 px spine), each with the right dock **closed** and **open**
  (Analysis → Health check). One further reading at 911 × 424 (a 1366 laptop at 150 % zoom), Explorer
  default, both pointers, dock closed and open.
- **What was read per cell:** the shell header, the chrome above the workspace, the deck's height and its
  line count per declared row, the activities foot, the diagram section and its canvas, the open dock, the
  stage (`main`) width, document overflow, and **every pointer target** on the page (buttons, links,
  inputs, menu items, tree items, tabs). A target is reported when its centre is outside the viewport,
  when `elementFromPoint` at its centre does not return it, or when an `overflow: hidden` ancestor clips
  it; one inside a scrolling list's fold is counted separately and not treated as a defect.
- **Explorer widths** were set by writing `schedulepoint-explorer` (`{ size, collapsed }`, the key in
  `use-explorer-prefs.ts:21`) and reloading.
- **Not yet taken:** the plan asks the product owner for one `/pointer-check.html` reading on any laptop to
  hand. It is **owed** and is not in this record. Height never triggers the notice, so nothing here waits
  on it.

## 1. The floor, fine pointer

Heights in CSS px. "Chrome" is everything above the workspace (the shell header plus the command deck). The
canvas is the `<canvas>` element; the diagram section is the canvas plus a 40 px view-controls strip above
it.

| Viewport   | Header | Deck (lines)          | Chrome | Foot | Diagram section | **Canvas height** | Stage width at Explorer 276 / 420 / folded |
| ---------- | ------ | --------------------- | ------ | ---- | --------------- | ----------------- | ------------------------------------------ |
| 1024 × 600 | 88     | 168 (4: look 2, do 2) | 275    | 51   | 266             | **226**           | 747 / 603 / 990                            |
| 1024 × 640 | 88     | 168 (4: look 2, do 2) | 275    | 51   | 306             | **266**           | 747 / 603 / 990                            |
| 1272 × 588 | 40     | 168 (4: look 2, do 2) | 227    | 51   | 302             | **262**           | 995 / 851 / 1238                           |

- **Canvas height does not depend on the Explorer width or the dock.** Every Explorer state and both dock
  states give the same height in a row; only the width changes.
- **At 1024 × 600 the chrome takes 275 of 600 px (46 %) and the canvas gets 226 (38 %).** The deck alone is
  168 (28 %). At 1272 × 588 the header drops to one row and the canvas gains 36 px despite 12 fewer pixels
  of window.
- **The header wraps at 1024 and not at 1272** (88 against 40 px). At 1024 the organisation switcher (a
  192 px select) and the account chip sit on a second row at y = 56, beneath an identity group that ends at
  x = 604 and a view switch at x = 838–1008. The extra row costs the diagram **48 px** at the floor.
- **Deck line count is 4 at all three viewports** (two declared rows of two lines each), with 6 of 26
  visible deck items icon-only. The command-surface gate bounds the deck at 3 lines at 1280 and 1440
  (`command-surface.spec.ts`, the `LINES` table in the band test); this reading is 4 at 1272, 8 px
  narrower, on a fixture without that spec's WBS summary. **The two are not reconciled here** and this
  record does not claim the gate is wrong. M2 runs the gate at 1024 × 600 and will say.

### Dock open (fine)

Opening the Health dock splits the canvas row; the dock is always the full height of the row.

| Viewport   | Explorer | Canvas (w × h) | Dock (w × h) |
| ---------- | -------- | -------------- | ------------ |
| 1024 × 600 | 276      | 359 × 226      | 387 × 266    |
| 1024 × 600 | 420      | **262** × 226  | 340 × 266    |
| 1024 × 600 | folded   | 589 × 226      | 400 × 266    |
| 1024 × 640 | 276      | 359 × 266      | 387 × 306    |
| 1024 × 640 | 420      | **262** × 266  | 340 × 306    |
| 1272 × 588 | 276      | 594 × 262      | 400 × 302    |
| 1272 × 588 | 420      | 450 × 262      | 400 × 302    |

- **The plan's risk is real.** `DOCK_MIN_HEIGHT` is 360 (`use-activity-panel-prefs.ts:34`), but it only
  reserves height inside the activities-panel clamp (`plan-workspace-toolbar.tsx:793-805`); nothing stops
  the row itself being shorter. An open dock is **266 px tall at 1024 × 600** and 302 at 1272 × 588, both
  under the 360 the constant names. It is recorded as an M4 input and does not block.
- **At 1024 with the Explorer at its 420 maximum and a dock open, the diagram is 262 px wide.** With the
  Explorer folded it is 589. That is the number M4-T1 chooses between.

## 2. The floor, coarse pointer

Controls grow to the 44 px house size (ADR-0118), which costs the diagram height directly.

| Viewport   | Header | Deck (lines)          | Chrome | Foot | Diagram section | **Canvas height** | Diagram change against fine |
| ---------- | ------ | --------------------- | ------ | ---- | --------------- | ----------------- | --------------------------- |
| 1024 × 600 | 100    | 200 (4: look 2, do 2) | 319    | 55   | 218             | **200**           | −26                         |
| 1024 × 640 | 100    | 200 (4: look 2, do 2) | 319    | 55   | 258             | **218**           | −48                         |
| 1272 × 588 | 44     | 200 (4: look 2, do 2) | 263    | 55   | 262             | **222**           | −40                         |

Stage widths and dock widths are the same as fine in every Explorer state; the dock heights are the
diagram-section heights above (218, 258 and 262).

## 3. Clipped or unreachable controls

**Fine pointer: none, in any of the 20 cells.** The only entries are the skip link (24 × 16, invisible
until focused, so correctly not a target), the breadcrumb crumb `Riverside` (58 × 20, a known
ADR-0118 D1 exception) and, with the dock open, the Health dock's finding rows (`Missing logic` and the
like, 273–333 × 20; found at every width, so not specific to the floor, and outside the command-surface
sweep's scope). Document overflow is nil at every cell (`scrollHeight` equals the window height,
`scrollWidth` equals its width).

**Coarse pointer: the Project Explorer does not fit.** The shell is `h-dvh overflow-hidden`
(`app-shell.tsx:134`), so anything past the window's bottom edge cannot be reached, even by scrolling.

| Viewport (coarse) | Explorer box    | Tree scroller | `Recently deleted` link                | Version footer |
| ----------------- | --------------- | ------------- | -------------------------------------- | -------------- |
| 1024 × 600        | y 319, 281 tall | **0 px**      | y 602–646: **wholly below the window** | y 654: below   |
| 1024 × 640        | y 319, 321 tall | **8 px**      | y 602–646: **6 px clipped**            | y 654: below   |
| 1272 × 588        | y 263, 325 tall | **8 px**      | y 546–590: **2 px clipped**            | in view        |

- The Explorer is a header (40 fine / 44 coarse), a flexible tree, a `shrink-0` destinations block
  (`org-destinations.tsx:115`) and a version footer. The destinations block is **219 px at fine and 291 at
  coarse**, and the footer 33, so they take what the tree should have.
- **At fine pointer the tree gets 33 px at 1024 × 600, 73 at 1024 × 640 and 69 at 1272 × 588.** That is
  one tree row at the floor, for a three-row hierarchy whose content is 92 px tall. At coarse it gets 0 to
  8 px. The Explorer's problem at the floor is **vertical**, not only the width question the plan
  carries at M4-T1.
- **The coarse 1024 × 600 cell with the Explorer at its default is the cell the plan's M2-T1 adds to the
  coarse sweep.** It will report `Recently deleted` as unreachable. That is a real finding for M2, not a
  harness artefact: the link's centre is 24 px below the window.
- Folding the Explorer to its spine clears it at every viewport (the spine keeps the destinations as
  icons, 34 px wide).

## 4. 911 × 424 (a 1366 laptop at 150 % zoom)

Below the floor in width, so this is the cell the notice's "Continue anyway" delivers a reader into. The
Explorer is an off-canvas sheet (`0 × 0` while closed).

| Pointer | Header | Chrome | `main` | Diagram section | Visible diagram (section − 40 strip) |
| ------- | ------ | ------ | ------ | --------------- | ------------------------------------ |
| fine    | 88     | 275    | 149    | 90              | **50**                               |
| coarse  | 100    | 319    | 105    | 42              | **2**                                |

- The canvas element is 200 px tall (its minimum) inside a section 90 or 42 px tall, so it is clipped by
  its pane. A reader after Continue gets a workspace whose diagram is a 50 px sliver (fine) or nothing
  (coarse), with no document scroll to reach more of it (`scrollHeight` 424).
- **Height does not trigger the notice**, by design (spec §3.2), so nothing in the notice's design changes.
  It is recorded as the cost of height not being a trigger: the notice's page tells a reader to zoom out
  or widen the window, and at this size that advice also gives the diagram its height back.

## 5. What these numbers are not

- **Layout only, in container Chromium.** Text metrics, scrollbar widths and the OS chrome differ on the
  real devices.
- **One fixture.** Two activities and a collapsed activities panel. A busier plan changes the deck's
  enabled set, the foot's facts and the Explorer's tree length, but not the chrome heights above.
- **The Gantt view was not read.** Its pinned grid is 584 px by default, which leaves a chart of about
  163 px at the 747 px stage (derived: 747 − 584, **not measured**); #437 carries it.
- **The `/pointer-check.html` laptop reading is owed** (above).

## M0-T2 — The payoff list

Each compromise made for a width under 1024 that is visible at 1024 or above, with where it lives, what
it costs at 1024–1440 and who takes it. **Measured** means a figure in sections 1–4; **derived** or **not
measured** says so. Line numbers were read on 2026-10-08.

| #   | Compromise                                                                                                                                                                                  | Where                                                                                         | Cost at 1024–1440                                                                                                                                                                                                                          | Taken by                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | The shell header is a wrapping flex row, so that at 390 px `Gantt` and `Stop editing` stay on screen (ADR-0112 D4, ADR-0118 M3).                                                            | `app-header.tsx:127`; `chrome-slot.tsx:133-141`; `plan-workspace-toolbar.tsx:2137`            | **Measured:** the header is two rows at 1024 (88 px fine, 100 coarse) and one at 1272 (40 / 44). 48 px (fine) to 56 px (coarse) of the diagram at the floor.                                                                               | **M4-T3** (the 1024 sweep reports it)                                                                         |
| 2   | The deck wraps rather than fits (ADR-0109), a rule defended down to narrow rows (`UX_STANDARDS.md`, "Give-way order", `:367-399`).                                                          | `Deck.tsx:120` (`DECK_ROWS`), `:311` (the row `flex-wrap`); `command-surface.spec.ts` `LINES` | **Measured:** 4 lines at 1024 and 1272, so 168 px fine / 200 coarse, **28 % of a 600 px window**. The largest single block of chrome.                                                                                                      | **M4-T2**                                                                                                     |
| 3   | Group order and sub-groups were fixed against the narrowest row (ADR-0118 M3/M4's 390 repairs).                                                                                             | `Deck.tsx:97-100` (the four groups); ADR-0118 `:184`, `:235`                                  | Not separable from #2: the order decides which items share a line. Re-deriving it from 1024 up is the way the 4 lines become 3 or 2.                                                                                                       | **M4-T2**                                                                                                     |
| 4   | `showLabel` / `ICON_ONLY` drops the label from six deck items to save width; `apply-levelling` is named in its own comment as dropped "because the deck's DO row has a budget of one line". | `Deck.tsx:137-148`; `:433`; `:478` (`min-w-9` / `min-w-12`)                                   | **Measured:** 6 of 26 visible items are icon-only. The one-line budget the comment cites does not hold at the floor (the row is 2 lines), so the reason for the least obvious omission has gone, and a labelled `apply-levelling` is free. | **M4-T2**                                                                                                     |
| 5   | The Explorer's destinations block is `shrink-0` and sized for no particular height, with the tree taking whatever remains.                                                                  | `org-destinations.tsx:115` (open), `:152` (spine); `explorer-column.tsx`                      | **Measured:** the tree is 33 px at 1024 × 600 fine (one row of a three-row tree), 0 to 8 px coarse; coarse also pushes `Recently deleted` and the footer below the window (section 3). Vertical, not width.                                | **M4-T1** (extended: the vertical budget as well as width)                                                    |
| 6   | The Explorer may be dragged to 420, a maximum set when the stage had no floor.                                                                                                              | `use-explorer-prefs.ts:23-25`                                                                 | **Measured:** stage 603 at 1024 (against 747 at default); with a dock open the diagram is 262 px wide. The plan's M4-T1 option (a) or (b).                                                                                                 | **M4-T1**                                                                                                     |
| 7   | A dock takes the whole canvas-row height, and `DOCK_MIN_HEIGHT` 360 reserves space only inside the activities-panel clamp.                                                                  | `use-activity-panel-prefs.ts:23`, `:34`; `plan-workspace-toolbar.tsx:793-805`                 | **Measured:** an open dock is 266 px tall at 1024 × 600 (302 at 1272 × 588), under the 360 the constant names; the Health review panel scrolls in a box shorter than its content.                                                          | **M4-T3** (input; may become a follow-up if the fix is a primitive)                                           |
| 8   | The coarse 44 px house size applies at every width (ADR-0118), which is right for a Surface and costs the diagram height.                                                                   | `globals.css:1157-1159` (`--control-h` under `pointer: coarse`)                               | **Measured:** 26 px (1024 × 600), 48 px (1024 × 640) and 40 px (1272 × 588) of diagram, against fine. Not a phone rule, so it **stays**; listed because the floor makes its cost visible.                                                  | **Stays** (ADR-0118 D1); M4-T2 may spend the deck half                                                        |
| 9   | A breadcrumb crumb is exempt from 24 px because a truncated crumb has no width to give (ADR-0118 D1); the exemption was granted at 390.                                                     | `breadcrumbs.tsx:73-94`; `UX_STANDARDS.md` ("a breadcrumb crumb")                             | **Measured:** the crumb is 58 × 20 at 1024 and 1272, untruncated. At and above the floor the width exists. Not measured: whether a 24 px crumb costs a row.                                                                                | **Follow-up** (trigger: next change to `breadcrumbs.tsx`)                                                     |
| 10  | The workspace swaps to a single-pane Diagram / Activities toggle below `md`, because "a phone can't usefully split canvas + table" (ADR-0030).                                              | `plan-workspace-toolbar.tsx:156`, `:668-670`; outlet gating behind ADR-0110 and ADR-0114      | **Zero at 1024 and above** (the branch is not entered). Cost is upkeep: two of ADR-0110 / ADR-0114's defects lived only here. Its reason is now zoom.                                                                                      | **Done** — retired by ADR-0181 (2026-10-09)                                                                   |
| 11  | `PageGrid` is two columns from `md`; the landing's cards are cramped at 1024–1280 (#333).                                                                                                   | `page-grid.tsx:54`                                                                            | **Not measured** in this M0 (a page, not the workspace). #333 carries the reading.                                                                                                                                                         | **Follow-up** (#333, landing two columns from `xl`)                                                           |
| 12  | The activity editor swaps its context rail for a strip below `md`.                                                                                                                          | `ActivityEditorSession.tsx:677`                                                               | **Zero at 1024 and above.** A literal drifting from the breakpoints module (spec §3.2).                                                                                                                                                    | **Follow-up** (optional tidy)                                                                                 |
| 13  | The activities table hides the constraint and late-date columns below `lg`, and early dates below `md`, "to keep narrow screens legible".                                                   | `ActivitiesTable.tsx:831-833`, `:902-905`, `:932-935`                                         | **Not measured.** All columns show from 1024; whether they fit the 747 px stage with the Explorer open is a question for the table, not this record.                                                                                       | **Follow-up** (no trigger yet)                                                                                |
| 14  | `DataTable`'s `contained` region takes `md:min-h-32` only, because at 390 the single pane left the body ~89 px.                                                                             | `data-table.tsx:604-606`                                                                      | **Zero at 1024 and above** (the floor applies).                                                                                                                                                                                            | **Done** — `md:` dropped by ADR-0181; it existed only for the single pane, so it is not a fallback that stays |
| 15  | The Gantt's pinned grid is 584 px by default and its start is sized for the planner's column widths (#437).                                                                                 | `GanttPanel.tsx:433-436`                                                                      | **Derived, not measured:** about 163 px of chart at the 747 px stage (1024, Explorer default).                                                                                                                                             | **Follow-up** (#437, optional)                                                                                |
| 16  | Dialog form rows pair fields from a container `@sm` (384 px), chosen "against" a `md` dialog and a phone.                                                                                   | `form-layout.tsx:183`                                                                         | **Zero** (a container query, not a window one) and a reflow rule that the 320 px checks keep.                                                                                                                                              | **None** (kept; the comment is history)                                                                       |

**M4 takes #1–#7** (and #8's deck half, if M4-T2 can). **Follow-ups** are #9–#13 and #15, each with a
trigger above or already named in the plan's "Next in line". #14 and #16 are reflow rules and stay.

## Things found wrong in the spec or the plan

- **The spec's M4-T1 frames the Explorer's problem as width (a 604 px stage at the 420 maximum). The
  vertical budget is the larger problem at the floor.** At 1024 × 600 the Explorer's tree is 33 px
  (fine) or 0 (coarse) tall, because its destinations block takes 219 / 291 px. M4-T1 should carry the
  vertical budget in its description.
- **M2-T1's "Explorer at default" coarse cell will go red**, on `Recently deleted` below the window (section
  3). The plan already says a finding is fixed inside M2, so this is a heads-up that M2 has real work
  in it, not that the plan is wrong. The fix is most likely the same one M4-T1 wants, so M2 and M4-T1
  should be sequenced knowing that.
- **The deck is 4 lines at 1272, where the command-surface gate allows 3 at 1280** (section 1). Not
  reconciled; M2 will settle it by running the gate at the floor.
