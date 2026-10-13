# M5 measurement: what the Gantt's divider strip covers (#494)

Taken 2026-10-13 on `main` at `13899b5` (before) and on this branch (after), by
`apps/web/measure-toolbar/gantt-divider-m5.spec.ts`, which drives the real plan workspace in
Chromium (`playwright.measure-toolbar.config.ts`, no `VITE_` pins). It reads the strip's own painted
box (the separator's inner span, not an assumed 25 px), each control's overlap with it in px, and what
`elementFromPoint` returns 2 px inside the control's left edge, which is the press the journey makes.
Five cells: fine pointer at 1024 x 600, 1646 x 1097 and 1912 x 948; coarse at 1024 x 600 and 1646 x 1097.
The plan is the harness's own: two activities, default columns, no baseline.

## Before

Identical at every cell, because the pane is 746 px at all of them (the seed) and nothing in the grid
is viewport-relative.

| Control                                   | Box (x)   | Strip (x) | Overlap | A press 2 px in from its left edge meets |
| ----------------------------------------- | --------- | --------- | ------- | ---------------------------------------- |
| Float left sort button                    | 809 - 853 | 846 - 871 | 7 px    | the strip (fine); itself (coarse)        |
| `Actions for …` (both rows, each 28 wide) | 861 - 889 | 846 - 871 | 10 px   | the strip, at every cell                 |

The pinned block ends at x = 861 and the strip's left edge is 15 px inside it (25 px wide, centred
2.5 px inside the block's border). The `⋯` begins at 861: **it is not in the pinned block at all.**
The columns sum to the pane exactly (`ganttColumnWidth`), the `⋯` cell is appended after them with
`shrink-0`, so it hangs 28 px past the block's edge, over the chart's first bars. That is why the plan's
framing (a 12 px gutter on the grid's trailing edge) is not enough: a gutter on the columns clears the
Float left button and does nothing for the `⋯`, which is on the chart side of the line.

(The register row's figures, 9.5 and 7.5 px, were taken against a ±12.5 px model of the strip; the
painted box reads 10 and 7. Under a coarse pointer a press 2 px inside Float left meets the button
itself, as the table says, so the Float left half of the defect is a fine-pointer one; why the coarse
strip differs there was not investigated, and the `⋯` is covered under both.)

## The options

| Option                                                           | Result                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) a trailing gutter, as the plan words it (12 px)              | Fails on the arithmetic. The strip starts 15 px inside the block, so 12 leaves Float left under it by 3 px, and the `⋯` (outside the block) is untouched.                                                                                                                         |
| (a') the gutter at 16 px, and the `⋯` made a column of the block | **Chosen.** The `⋯` ends at 889 and the strip begins at 890; Float left (button ends 853) is now 37 px clear: 0 px under it for both. No header narrows (Activity, the elastic column, absorbs the 44 px; its seeded width is unchanged at 180).                                  |
| (b) controls stacked above the strip                             | Not buildable in `GanttPanel` alone. The pinned block is `sticky z-10`, a stacking context, so a control inside it cannot rise above the strip's z-30 wrapper; raising the block would instead cover the strip's whole left half. Would also cost the divider 10 px at every row. |
| (c) a chart-only strip                                           | Needs a `PanelResizer` prop (a component public-contract change) and would still cover the `⋯`, which is in the chart half of the strip.                                                                                                                                          |

## After (option a')

Identical at all five cells.

| Control                           | Box (x)                                                                         | Strip (x) | Overlap | A press 2 px in meets |
| --------------------------------- | ------------------------------------------------------------------------------- | --------- | ------- | --------------------- |
| Float left (header cell ends 861) | 809 - 853, no longer within 30 px of the strip, so the harness stops listing it | 890 - 915 | 0 px    | itself                |
| `Actions for …` (both rows)       | 861 - 889                                                                       | 890 - 915 | 0 px    | itself                |

The pinned block grew from 746 to 790 px (+28 for the `⋯` column, +16 for the gutter), so the chart
begins 44 px further right at the seeded width; Activity is the same 180 px, so no column loses width.
The chart no longer has a `⋯` hanging over its first 28 px, so its usable width falls by 16, not 44.
The strip is still 25 px and the divider's centre line is unchanged relative to the block's edge.

## Side finding

With a baseline showing, the `vs baseline` cell sat after the `⋯` cell in each row, so every row's
variance value was 28 px right of its header, over the chart. Giving the `⋯` a column of the block
(and a width on the `Actions` header) aligns them. **Read from the layout code, not measured**: the
harness plan has no baseline. The baseline journey (`column-widths.spec.ts`, "with a baseline") runs
`chartMeetsGrid`, which now includes the `Actions` header in the pinned columns.
