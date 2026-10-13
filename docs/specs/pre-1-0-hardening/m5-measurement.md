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

| Option                                                                                             | Result                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) a trailing gutter, as the plan words it (12 px)                                                | Fails on the arithmetic. The strip starts 15 px inside the block, so 12 leaves Float left under it by 3 px, and the `⋯` (outside the block) is untouched.                                                                                                                         |
| (a') the gutter (16 px as first built, 20 px after review), and the `⋯` made a column of the block | **Chosen.** The `⋯` ends at 889 and the strip begins at 890; Float left (button ends 853) is now 37 px clear: 0 px under it for both. No header narrows (Activity, the elastic column, absorbs the extra 48 px (28 + 20); its seeded width is unchanged at 180).                  |
| (b) controls stacked above the strip                                                               | Not buildable in `GanttPanel` alone. The pinned block is `sticky z-10`, a stacking context, so a control inside it cannot rise above the strip's z-30 wrapper; raising the block would instead cover the strip's whole left half. Would also cost the divider 10 px at every row. |
| (c) a chart-only strip                                                                             | Needs a `PanelResizer` prop (a component public-contract change) and would still cover the `⋯`, which is in the chart half of the strip.                                                                                                                                          |

## After (option a')

Identical at all five cells.

| Control                           | Box (x)                                                                         | Strip (x) | Overlap | A press 2 px in meets |
| --------------------------------- | ------------------------------------------------------------------------------- | --------- | ------- | --------------------- |
| Float left (header cell ends 861) | 809 - 853, no longer within 30 px of the strip, so the harness stops listing it | 890 - 915 | 0 px    | itself                |
| `Actions for …` (both rows)       | 861 - 889                                                                       | 890 - 915 | 0 px    | itself                |

The pinned block grew from 746 to 794 px (+28 for the `⋯` column, +20 for the gutter), so the chart
begins 48 px further right at the seeded width; Activity is the same 180 px, so no column loses width.
The chart no longer has a `⋯` hanging over its first 28 px, so its usable width falls by 20, not 48.
The strip is still 25 px and the divider's centre line is unchanged relative to the block's edge.

## Side finding

With a baseline showing, the `vs baseline` cell sat after the `⋯` cell in each row, so every row's
variance value was 28 px right of its header, over the chart. Giving the `⋯` a column of the block
(and a width on the `Actions` header) aligns them. **Read from the layout code, not measured**: the
harness plan has no baseline. The baseline journey (`column-widths.spec.ts`, "with a baseline") runs
`chartMeetsGrid`, which now includes the `Actions` header in the pinned columns.

## Review amendments (same day)

- **Gutter 16 to 20.** The margin from the last control to the strip is the gutter less the strip's 15 px
  inset: 1 px at 16, 5 px at 20. The accessibility review found the row menu's focus ring (`ring-2` plus
  `ring-offset-2`, 4 px; the forced-colours outline is 2 px plus 2 px) reached about 3 px under the strip at
  16, and a press 1 to 3 px right of the button grabbed the divider. At 20 the ring clears it. The tables
  above were taken at 16; the re-measurement at 20 is recorded in the last section.
- **Zoom framing.** `barRegionWidth` is `clientWidth - DEFAULT_GRID_WIDTH`, and `DEFAULT_GRID_WIDTH` was
  `defaultGridWidth(COLUMNS, 0)`, read from the columns' default widths alone. It does **not** read
  `pinnedExtraWidth`, which feeds only the host's pane prefs (`useGanttGridPrefs`, the floor and the seed).
  So the first build left `pxPerDay` unchanged while the chart began 48 px further right, and Month's 91 days
  no longer fitted by 48 px (the UX review's reading was right; the component review's was not).
  `DEFAULT_GRID_WIDTH` now adds the same constants (`pinnedExtraWidth(false, hasRowMenus)`; `vs baseline` stays
  out, as before). They are constants of the host, not planner choices, so ADR-0173 D5's "a column change
  cannot rescale bars" still holds. The cost is that every plan's presets frame 48 px less width, so a day is
  narrower by 48 over the room the bars had (the scroller's width less the 584 px of default columns), a larger
  share the narrower the window, which restores the relation between the framing and the visible chart end that existed before this change.
  Said in the changeset.

## After the amendments (gutter 20), re-measured

Same harness, same five cells, identical at all of them. The pane is 794 px; the pinned block ends at x = 909
and the strip is 894 to 919.

| Control                      | Box (x)   | Strip (x) | Overlap | Clearance | A press 2 px in meets |
| ---------------------------- | --------- | --------- | ------- | --------- | --------------------- |
| `Actions for …` (both rows)  | 861 - 889 | 894 - 919 | 0 px    | **5 px**  | itself                |
| Float left (button ends 853) | 809 - 853 | 894 - 919 | 0 px    | 41 px     | not listed (> 30 px)  |

- The new `vs baseline` assertion in the "with a baseline" journey passes (`web:gantt`, 17 passed): the first
  row's variance cell ends where its header does.
- The journey that clicks a Gantt row (`command-surface.spec.ts`, "every object action in the Gantt view…")
  clicked the row's centre, which at 794 px lands on the divider strip on a short plan (Playwright reported
  the strip "intercepts pointer events"). It now clicks the name cell. That is a test that was relying on where
  the centre happened to fall, not a product regression.
