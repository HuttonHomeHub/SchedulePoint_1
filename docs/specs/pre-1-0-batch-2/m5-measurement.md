# M5 measurement: do the Gantt's month labels overprint or clip at 200 % text? (#501)

**Measured 2026-10-13** by `apps/web/measure-gantt/month-labels-200pc.spec.ts` (run: `pnpm exec playwright test
--config playwright.measure-gantt.config.ts month-labels-200pc` from `apps/web`). Chromium 1194 headless, Desktop
Chrome profile, a fresh plan with a 120-day and a 200-day activity, text-only 200 % through CDP `Page.setFontSizes`
(standard 32 px; the spec asserts the root reads 32 px before reading anything). The viewport notice is
pre-acknowledged because 200 % text makes a 1280 px window 40 rem wide. At each framing the spec reads every label
span in the Gantt ruler (the Timeline header's `.relative.h-full`), takes the glyph box of each (a `Range` over the
text, so padding is not counted), sorts by x and counts adjacent pairs whose glyph boxes intersect. "Label bottom" is
the ruler row's bottom edge minus the lowest glyph bottom: negative means the glyph box hangs below the 34 px row.

The brief named 1280 x 800. The spec also reads the **1024 x 600 design floor** (ADR-0179), because the presets frame
the chart by the room the window leaves it, so a narrower window gives a smaller pitch. That second window is where
the defect is.

## Result

Label type is `text-micro` (`rem`): 10 px at 100 %, 20 px at 200 %. The widest label ("Sept 2027" in en-GB; "Sep
2026" in the plan's dates) is 49.6 px at 100 % and 99.1 px at 200 %. The pitch rule is a constant 64 px.

Each cell is shown before the fix -> after the fix where it changed.

### 1280 x 800

| Text  | Framing | Labels | Min pitch (px) | Widest glyph (px) | Overlapping pairs | Label bottom vs 34 px ruler (px) |
| ----- | ------- | ------ | -------------- | ----------------- | ----------------- | -------------------------------- |
| 100 % | arrival | 3 -> 3 | 92.5 -> 92.5   | 47.0              | 0 -> 0            | +17 -> +19                       |
| 100 % | Day     | 9 -> 9 | 742 -> 742     | 49.6              | 0 -> 0            | +17 -> +19                       |
| 100 % | Week    | 9 -> 9 | 346.3 -> 346.3 | 49.6              | 0 -> 0            | +17 -> +19                       |
| 100 % | Month   | 9 -> 9 | 114.2 -> 114.2 | 49.6              | 0 -> 0            | +17 -> +19                       |
| 100 % | Quarter | 3 -> 3 | 92.5 -> 92.5   | 47.0              | 0 -> 0            | +17 -> +19                       |
| 100 % | Year    | 1 -> 1 | n/a -> n/a     | 44.7              | 0 -> 0            | +17 -> +19                       |
| 200 % | arrival | 4 -> 3 | 108.3 -> 161.5 | 99.1 -> 94.1      | 0 -> 0            | -1 -> +3                         |
| 200 % | Day     | 9 -> 9 | 1296 -> 1296   | 99.1              | 0 -> 0            | -1 -> +3                         |
| 200 % | Week    | 9 -> 9 | 604.8 -> 604.8 | 99.1              | 0 -> 0            | -1 -> +3                         |
| 200 % | Month   | 9 -> 9 | 199.4 -> 199.4 | 99.1              | 0 -> 0            | -1 -> +3                         |
| 200 % | Quarter | 4 -> 3 | 108.3 -> 161.5 | 99.1 -> 94.1      | 0 -> 0            | -1 -> +3                         |
| 200 % | Year    | 1 -> 0 | n/a -> n/a     | 89.3 -> 0         | 0 -> 0            | -1 -> n/a                        |

### 1024 x 600

| Text  | Framing | Labels | Min pitch (px) | Widest glyph (px) | Overlapping pairs | Label bottom vs 34 px ruler (px) |
| ----- | ------- | ------ | -------------- | ----------------- | ----------------- | -------------------------------- |
| 100 % | arrival | 1 -> 1 | n/a -> n/a     | 44.7              | 0 -> 0            | +17 -> +19                       |
| 100 % | Day     | 9 -> 9 | 230 -> 230     | 49.6              | 0 -> 0            | +17 -> +19                       |
| 100 % | Week    | 9 -> 9 | 107.3 -> 107.3 | 49.6              | 0 -> 0            | +17 -> +19                       |
| 100 % | Month   | 4 -> 4 | 77.1 -> 77.1   | 49.6              | 0 -> 0            | +17 -> +19                       |
| 100 % | Quarter | 1 -> 1 | n/a -> n/a     | 44.7              | 0 -> 0            | +17 -> +19                       |
| 100 % | Year    | 1 -> 1 | n/a -> n/a     | 44.7              | 0 -> 0            | +17 -> +19                       |
| 200 % | arrival | 4 -> 1 | 65.5 -> n/a    | 99.1 -> 89.3      | **3 -> 0**        | -1 -> +3                         |
| 200 % | Day     | 9 -> 9 | 784 -> 784     | 99.1              | 0 -> 0            | -1 -> +3                         |
| 200 % | Week    | 9 -> 9 | 365.9 -> 365.9 | 99.1              | 0 -> 0            | -1 -> +3                         |
| 200 % | Month   | 9 -> 9 | 120.6 -> 120.6 | 99.1              | 0 -> 0            | -1 -> +3                         |
| 200 % | Quarter | 4 -> 1 | 65.5 -> n/a    | 99.1 -> 89.3      | **3 -> 0**        | -1 -> +3                         |
| 200 % | Year    | 1 -> 0 | n/a -> n/a     | 89.3 -> 0         | 0 -> 0            | -1 -> n/a                        |

The 100 % "label bottom" moves from +17 to +19 because the label's line height is now its font size
(`leading-none`), which lifts the glyph 2 px; the label's top inset is unchanged.

**Verdict: reproduced, at the design floor and not at 1280 x 800.** At 1280 x 800 nothing overlaps at any framing
(the closest is 108.3 px between 99.1 px labels). At 1024 x 600 and 200 % text the arrival framing and the Quarter
preset put 65.5 px between labels that are 99.1 px wide: 3 of 3 adjacent pairs overprint. The fixed 64 px floor is
about 35 px short of the label at 200 % (99.1 px plus the 4 px `left-1` inset plus a gap), so it is reached whenever the
chart's room lands the step's pitch between 64 and about 113 px. At 100 % nothing overlaps anywhere.

**A vertical clip is also reproduced, at both windows.** At 200 % the glyph box ends 1 px below the 34 px ruler row
and the label's line box 2 px below it: the 20 px label at `top-1` (8 px at 200 %) on a 28 px line is 36 px tall in a
34 px row. Nothing is clipped away (no ancestor has `overflow: hidden`), but the descender of "May" and "Sep" crosses
the ruler's bottom border onto the first bar row. At 100 % the label ends 17 px inside the row.

## What the fix changed

- `buildRulerTicks` takes an optional `minLabelPitchPx` (default `MONTH_LABEL_MIN_PITCH_PX`, 64). The printed
  document passes nothing, and a unit test pins its ticks equal to the default's at six zoom levels.
- `GanttRuler` holds a hidden probe with every month's label in the same type and reads its width through a
  `ResizeObserver` (on mount and when the text size changes, not per render); the pitch is that width plus 14 px,
  never below 64.
- The label's line height is its font size (`leading-none`), which puts the 200 % glyph box 3 px inside the row.
- One consequence to know: at 200 % the Year preset of a one-year plan now has no label, because the only labelled
  step that fits is "every January" and no January falls in view. The month lines are still drawn. Before the fix that
  cell showed one label that could not overlap anything.

Held by `apps/web/e2e-gantt/month-labels.spec.ts` (1024 x 600, 200 % text, arrival and every preset: 0 overlapping
pairs and the label inside the ruler), which failed on the unfixed ruler with 3 overlapping pairs.
