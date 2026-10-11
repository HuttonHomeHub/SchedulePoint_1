# M0 measurement: the a11y and touch sweep's readings

- **Status:** Taken 2026-10-11, before any product change. Predictions are in
  [`m0-falsification.md`](./m0-falsification.md), committed first.
- **Instrument:** `apps/web/measure-toolbar/a11y-touch-sweep-m0.spec.ts` (run with
  `pnpm --filter @repo/web measure:toolbar`; it writes `apps/web/measure-output/a11y-touch-sweep-m0.json`,
  git-ignored). A harness, not a gate (ADR-0081 §3). Real Chromium 1194 in this container, a real API
  and a real database, the real sign-up to plan journey. Fonts here differ slightly from CI's (HANDOFF
  environment notes), so widths are the container's; the Surface sheet is the arbiter (ADR-0128).
- **Fixture:** a project named "Riverside Quarter — Phase 2 Substructure" and a plan named "Level 2 slab
  and core walls — Package B"; two tasks, a WBS summary with one child; pen held. A Planner seat. **No
  Viewer seat was read** (see #470).

## Verdicts

| #   | Prediction                                                | Verdict                  | Reading                                                                                                                                         |
| --- | --------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | A no-`⋯` row grows 45 to 60 with a 44 px label            | **Overturned**           | Every row has a `⋯`, so no row grows. The header row grows (see §1).                                                                            |
| P2  | Fine row heights do not move                              | Held                     | The label grows under `pointer-coarse:` only (asserted in M1's test).                                                                           |
| P3  | Today's Explorer strip overlaps the tree `⋯`              | **Overturned**           | The strip never reaches a `⋯` centre. Its right half is dead (the stage paints over it), so it is 13 px live, not 25.                           |
| P4  | A symmetric 44 px strip steals nothing on a dock          | **Overturned**           | It overlaps the inner 5 px of the viewport corner's buttons and 4 px of the notes textarea.                                                     |
| P5  | A symmetric strip on the Gantt divider covers neighbours  | Held                     | It would cover 25 px of "Float left", 19 px of "Timeline" and 19 px of each 28 px row `⋯`. And today's 25 px already covers 9.5 px of each `⋯`. |
| P6  | The activities panel's divider can take a symmetric strip | **Overturned**           | It overlaps the bottom 5 px of the four 44 px viewport buttons that sit 17 px above it.                                                         |
| P7  | `region` finds the splitter and nothing else              | **Overturned on a plan** | The overview and a list page: only the splitter wrapper. A plan page also flags `div[data-chrome-slot="rows"]` (see §3).                        |
| P8  | Row labels are the only sub-44 control in the table       | Not read                 | The existing sweep covers the table's `⋯`; the labels are measured at 24 x 24 on both pointers. M1's sweep covers the rest.                     |
| P9  | The crumb is below a readable floor at 200 % text         | **Overturned**           | Under the browser's own text size the crumb is 123 to 337 px at 1024 to 1440 (§4).                                                              |
| P10 | The inline-root method gives a smaller crumb              | Held                     | 0 px at 1024 and 1280, 28.8 px at 1440 (§4).                                                                                                    |
| P11 | The crumb is readable at 1912 x 948                       | Held                     | 524 px (browser text size), 148 px (inline root).                                                                                               |
| P12 | Remedy (a) is enough                                      | **Moot**                 | There is nothing to remedy under the faithful method (§4).                                                                                      |
| P13 | One header line at 100 %                                  | Held                     | 1 line, 48 px band, at all four cells.                                                                                                          |
| P14 | Finger jitter under 4 px                                  | Not obtainable           | A container has no finger. 4 px is the default; Surface-sheet step 26 records the finger's reading.                                             |

## 1. #470 activities table rows

Row heights (px) for the seeded rows, the label box, and the header row. "44 label" is the same page with a
44 px label injected for the reading.

| Cell               | Rows now | Label now | Header row now | Rows with 44 label  | Header row with 44 label |
| ------------------ | -------- | --------- | -------------- | ------------------- | ------------------------ |
| fine 1912 x 948    | 45       | 24 x 24   | 41             | (fine: not applied) | n/a                      |
| fine 1024 x 600    | 45 to 57 | 24 x 24   | 57             | n/a                 | n/a                      |
| coarse 1912 x 1114 | **61**   | 24 x 24   | 41             | 61                  | **61**                   |
| coarse 1646 x 1097 | **61**   | 24 x 24   | 57             | 61                  | **61**                   |
| coarse 1024 x 600  | **61**   | 24 x 24   | 57             | 61                  | **61**                   |

- **Every row carries a `⋯`**, including the summary row, so the unstated cost the spec worried about (a row
  with a checkbox and no `⋯` growing to 60) does not occur in a Planner's table. The code agrees: the
  comment at `ActivitiesTable.tsx:992-1005` says the no-trigger branch is unreachable today.
- **A Viewer seat was not read.** The same comment says the Actions column renders whenever Logic or Resources
  is available, which holds for a Viewer, so the Viewer table has a `⋯` too. That is reading code, not
  running it; M1's sweep runs on the Planner seat.
- **The cost is in the header row:** a coarse header grows 41 to 61 at 1912 and 57 to 61 elsewhere (+4 to +20 px
  of table head). Accepted: it is the same 44 px trade ADR-0183 D4 accepted for the `⋯`.
- P2 holds because the change is `pointer-coarse:` only.

## 2. #476 the dividers

The strip today is `-left-3 -right-3` over a 1 px separator, so 25 px. `elementFromPoint` across it, and the
geometric overlap of each neighbouring control with candidate strips (centred 44, grown 44 outward to the
side named, in px of the neighbour's own box):

| Divider (cell 1646 x 1097)                                   | Live today                                      | Neighbours near the line                                                                                                | Centred 44 overlaps                    | Verdict                      |
| ------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------- |
| Explorer (vertical)                                          | -12..0 only. **The right half is the stage's.** | Panel side: `⋯` 44 x 44 ends 5 px short of the line, "Hide Explorer" 13 px, destination links 9 px. Stage side: none.   | 9 to 17 px of the panel's own controls | `outward` (into the stage)   |
| Float, Health, Revisions, Notes docks (vertical; Notes read) | -12..12                                         | Stage side: Minimap button ends 17 px short. Dock side: textarea starts 18 px away.                                     | 5 px of Minimap, 4 px of the textarea  | `both`, with the 5 px stated |
| Activities panel (horizontal)                                | -12..12                                         | Above: Zoom out, Zoom in, Fit to plan, Minimap, 44 x 44, bottom edge 17 px above the line. Below: nothing within 30 px. | 5 px of each of the four buttons       | `both`, with the 5 px stated |
| Gantt grid (vertical)                                        | -12..12                                         | "Float left" header and its button, "Timeline" header, four 28 px row `⋯` starting 3 px from the line.                  | 25, 19, 19 px                          | **`none`** (named exception) |

- **The Explorer's right half is dead today.** At every sample from +1 to +26 the hit is the stage's canvas, not
  the separator. The strip paints before `main`, and `main`'s positioned content wins. Growing it to the right
  therefore needs the strip to stack above the stage; that is part of M2.
- **No 44 px strip fits on a dock or the activities panel without touching a neighbour.** The gaps either side are
  17 and 18 px, so a centred 44 px strip reaches 5 px into a 44 px button. The first prediction (P4/P6) was that
  it would not. M2 takes the trade and states it: the strip is 44 px, the contested pixels go to the divider,
  and the neighbour keeps at least 39 of its 44 px. The alternative (shrinking the strip to the 35 px gap) leaves
  the divider under the house rule on exactly the device the rule is for.
- **A finding the spec did not ask for:** the Gantt's existing 25 px strip already covers 9.5 px (a third) of each
  row `⋯` and 7.5 px of the "Float left" sort button (`overlapCurrentPx`). That is the reason the Gantt keeps
  `none` and the reason it is not widened. It is not fixed here (the strip is not the subject of the row).
- 1024 x 600: the Explorer and the Notes dock read the same as above; the activities panel has **no separator**
  at the floor (ADR-0180 swaps the body), so there is nothing to size there.

## 3. #473 axe `region`

With the Explorer docked, mouse, 1646 x 1097, `region` enabled:

| Page         | Findings                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| Overview     | `.contents` (the splitter's wrapper). Nothing else.                                                           |
| Clients list | `.contents`. Nothing else.                                                                                    |
| A plan       | `.contents` **and `div[data-chrome-slot="rows"]`** (the command band's slot, a toolbar outside any landmark). |

The second finding on a plan is a separate defect: no journey runs `region` on a plan, so it has never been
gated. It is **not part of #473** (the row's scope is the Explorer splitter and the overview gate) and is filed
as a new register row in M5 rather than widened into this change.

## 4. #483 the breadcrumb at enlarged text

Crumb widths in px (project / plan; full text width in brackets 525 / 510 at 200 %, 262 / 255 at 100 %):

| Cell       | 100 % (root 16)     | Browser text size 200 % (`Page.setFontSizes`, root asserted 32 px) | Inline-root `200%` (the register row's method) |
| ---------- | ------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| 1024 x 600 | 91.5 / 88.9, 1 line | **126 / 123**, 3 lines, header 176 px, `lg` off                    | **0 / 0**, 3 lines, `lg` on                    |
| 1280 x 800 | 156 / 152, 1 line   | **256 / 249**, 3 lines, `lg` off                                   | **0 / 0**, 3 lines                             |
| 1440 x 900 | 197 / 191, 1 line   | **337 / 328**, 3 lines, `lg` off                                   | **28.8 / 28**, 3 lines                         |
| 1912 x 948 | 262 / 255, 1 line   | **524 / 510**, unclipped, 3 lines                                  | 148.5 / 144, 2 lines                           |

- **#483 does not reproduce under the browser's own text size.** At every cell the crumb is wider than it is at
  100 % (123 to 337 px against 89 to 197), because under `Page.setFontSizes` `64rem` becomes 2,048 px, the
  `lg:max-w-1/2` cap is off, and the header stacks. The "R… / P" collapse is the inline-root method's: `lg`
  stays on, the cap stays on, and every rem width doubles.
- **The inline-root `200%` is a real configuration only through a user stylesheet** (`html { font-size: 200% }`);
  no browser setting produces it. It is recorded here as the residual and not built for: the approved method is
  the browser's own text size.
- **What a reader sees under the faithful method is a header that is three lines (176 px) tall.** That is the
  stacking ADR-0179 D2 expects below the floor in rem terms, with no scroll sideways (`pageScrollsSideways`
  false at every cell) and the project link a 40 px-tall box.
- **Decision (M4):** no remedy is built. #483 closes with these readings. The two stale comments beside it are
  corrected (the "ONLY route" premise and the "fixed-height band" premise), because they are wrong whatever the
  crumb does.

## 5. What changes in the plan

- M1 #470: change both labels under `pointer-coarse:`; the header row's growth is in the changeset.
- M1 #473: hoist as planned. The plan page's `data-chrome-slot="rows"` finding is a new row, not this change.
- M2 #476: Explorer `outward` and the strip stacks above the stage; docks and the activities panel `both`
  (5 px stated); the Gantt `none`.
- M4 #483: comments and the closing record only.
