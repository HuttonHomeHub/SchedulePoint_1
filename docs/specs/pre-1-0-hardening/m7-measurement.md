# M7 measurement: do the ruler's day labels overprint at 200 % text? (#478)

**Measured 2026-10-13** by `apps/web/measure-toolbar/ruler-days-200pc.spec.ts` (run: `pnpm --filter @repo/web
measure:toolbar -- ruler-days-200pc`). Chromium 1194 headless, 1280 × 800, Desktop Chrome profile, a
fresh plan with two activities (30 and 45 days), text-only 200 % through CDP `Page.setFontSizes`
(standard 32 px), the same way `toolbar-redesign-m3.spec.ts` sets it. The viewport notice is
pre-acknowledged because 200 % text makes the window 40 rem wide. At each framing the spec reads
the visible day spans of `[data-testid="tsld-ruler"]` (its third row), takes the glyph box of each
(a `Range` over the text, so padding is not counted), sorts by x and counts adjacent pairs whose
glyph boxes intersect.

## Result

Ruler type is `text-xs`: 12 px at 100 %, 24 px at 200 %. The widest label ("00" probe) is 14.4 px at
100 % and 28.8 px at 200 %. The day row exists from 18 px per day.

Each cell is shown before the fix -> after the fix where it changed.

| Text  | Framing | Labels   | Min pitch (px) | Widest glyph (px) | Overlapping pairs |
| ----- | ------- | -------- | -------------- | ----------------- | ----------------- |
| 100 % | arrival | 0 -> 0   | n/a -> n/a     | 0                 | 0 -> 0            |
| 100 % | Day     | 18 -> 18 | 71.6 -> 71.6   | 14.4              | 0 -> 0            |
| 100 % | Week    | 34 -> 34 | 33.4 -> 33.4   | 14.4              | 0 -> 0            |
| 100 % | Month   | 0 -> 0   | n/a -> n/a     | 0                 | 0 -> 0            |
| 100 % | Quarter | 0 -> 0   | n/a -> n/a     | 0                 | 0 -> 0            |
| 100 % | Year    | 0 -> 0   | n/a -> n/a     | 0                 | 0 -> 0            |
| 200 % | arrival | 68 -> 34 | 19.9 -> 39.9   | 28.8              | 41 -> 0           |
| 200 % | Day     | 18 -> 18 | 91.4 -> 91.4   | 28.8              | 0 -> 0            |
| 200 % | Week    | 34 -> 34 | 42.7 -> 42.7   | 28.8              | 0 -> 0            |
| 200 % | Month   | 0 -> 0   | n/a -> n/a     | 0                 | 0 -> 0            |
| 200 % | Quarter | 0 -> 0   | n/a -> n/a     | 0                 | 0 -> 0            |
| 200 % | Year    | 0 -> 0   | n/a -> n/a     | 0                 | 0 -> 0            |

**Verdict: reproduced.** At 200 % text the arrival framing (a fit of the plan, 19.9 px per day) put 28.8 px
numbers on a 19.9 px pitch: 41 of 67 adjacent pairs overprinted before the fix. At 100 % text nothing
overlaps at any framing (the arrival fit is under the 18 px floor there, so the row is absent). The Day
and Week presets clear at 200 % (91.4 and 42.7 px) and Month, Quarter and Year drop the row. So the defect
is any pitch from 18 px up to the label width plus gap (31.8 px at 200 %), reached by the arrival fit of
a short plan or a wheel zoom, and not by a preset.

The row's height is also fixed at 14 px at 100 % (28 px reading at 200 %): no vertical clipping was
measured; this is a horizontal problem only.

## What was built

`rulerTicks` takes the measured width and thins by stride 1, 2 or 7 (Mondays); see the ADR-0056
amendment of 2026-10-13. After: 0 overlapping pairs in every cell, 34 labels at the 200 % arrival
framing (39.9 px between them), 100 % cells unchanged.

## Not measured

Frame cost of the new code: the width is read once per computed font on the measure path and not in
the per-frame sync, so no paint measurement was taken (ADR-0128: a frame-rate reading belongs on the
device that can take it). Only Chromium was driven.
