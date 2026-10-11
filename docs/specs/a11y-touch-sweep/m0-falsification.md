# M0 falsification: predictions written before any reading

- **Status:** Written before the readings (ADR-0113, ADR-0142). The readings are in
  [`m0-measurement.md`](./m0-measurement.md).
- **Spec:** [`./spec.md`](./spec.md) §0, §4.6.

Each line is a prediction the spec makes, the cell it is read at, and the reading that overturns it.

| #   | Prediction                                                                                                                  | Cell                               | Overturned by                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| P1  | A row with a checkbox and no `⋯` is about 45 px on a coarse pointer and grows to about 60 once the label is 44 px (#470).   | coarse 1646 × 1097, 1024 × 600     | A no-`⋯` row already at 60 px, or one that stays under 50 px with a 44 px label                |
| P2  | A fine pointer's row heights do not move when only the coarse label grows (#470).                                           | fine 1912 × 948                    | Any fine row height differing before and after                                                 |
| P3  | The Explorer divider's 12 px overhang today overlaps the tree's `⋯` (#476).                                                 | coarse 1646 × 1097                 | `elementFromPoint` at the `⋯` centre returns the `⋯`                                           |
| P4  | A symmetric 44 px strip on a right dock steals nothing, because dock controls sit inside the panel, away from its edge.     | coarse 1646 × 1097                 | A sample point inside the strip that lies on a dock control's own box                          |
| P5  | A symmetric 44 px strip on the Gantt grid divider covers the last grid column's header or the chart's first bars (#476).    | coarse 1646 × 1097                 | Every sample across 44 px lands on the divider or empty space                                  |
| P6  | The activities panel's horizontal divider can take a symmetric strip.                                                       | coarse 1646 × 1097                 | A sample on a control (the panel's collapse button, the table header)                          |
| P7  | axe `region` finds the splitter and nothing else on the overview with the Explorer docked (#473).                           | 1646 × 1097, fine                  | A second `region` node on the overview, a list page or a plan                                  |
| P8  | The row-select "24 px" labels are the only sub-44 control in the activities table on a coarse pointer.                      | coarse 1646 × 1097                 | Another sub-44 control in the table                                                            |
| P9  | Under `Page.setFontSizes` 2x the breadcrumb's current-page crumb is below a readable floor at 1024 and 1280, and at 1440.   | 1024 × 600, 1280 × 800, 1440 × 900 | The crumb at or above 96 px (6 rem at 100 %) at a cell, so no remedy is owed there             |
| P10 | Under the inline-root method (`documentElement.style.fontSize = 200%`) the crumb is smaller than under `Page.setFontSizes`. | the same                           | The crumb equal or larger under the inline method                                              |
| P11 | At 1912 × 948 and 200 % text (either method) the crumb is readable (#483's own report was at a narrower window).            | 1912 × 948                         | The crumb under 96 px                                                                          |
| P12 | Remedy (a), a floor on the current crumb plus a wrapping identity slot, is enough, and (c) is moot under `setFontSizes`.    | all                                | A cell where the identity slot still overflows, or where `lg:max-w-1/2` is on under the method |
| P13 | At 100 % text the header is one line at 1024, 1280, 1440, 1646 and 1912 for a long plan and project name.                   | all                                | A second line at 100 %                                                                         |
| P14 | A tap's press-to-release movement on a finger is under 4 px.                                                                | Surface device sheet               | Not obtainable in a container: recorded as the default, with a device-sheet step to confirm    |

If a prediction is overturned, `m0-measurement.md` says so in that row and the spec's §4.6 or the
remedy changes with it.
