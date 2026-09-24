# NetPoint grammar — M0-T4: the tiers of detail, and the accessibility rulings

**Status:** measured and ruled 2026-09-24. The tier thresholds are committed in
`apps/web/src/features/tsld/render/geometry.ts` (`LOD_WORKING_MIN_PX_PER_DAY`,
`LOD_DETAIL_MIN_PX_PER_DAY`, `lodTier`). The function lands dark: M3 is its first consumer (spec §4.13
A5).

## The tiers, measured

Produced by `apps/web/scripts/measure-netpoint-lod.ts` (`pnpm exec tsx scripts/measure-netpoint-lod.ts`
from `apps/web`). Its docblock says what each column measures and where it uses a proxy.

**The first version of the script was wrong, and the correction is recorded rather than smoothed.**
It judged dates with `dateLabelSlot` alone, and it reported the reference plan at 50 % of dates
withheld at every zoom. The cause is a shared node (one bar ending where the next begins): that rule
counts it as two dates, and one of them can never fit. The painter has handled that case since #379
by writing the node once. Dates are now counted from the real painter's recorded output.

## NetPoint reference — 58 activities, 68 links

| px/day | dates withheld | gap labels withheld | lag plates withheld |
| ------ | -------------- | ------------------- | ------------------- |
| 0.5    | 13%            | 55%                 | 100%                |
| 0.75   | 5%             | 23%                 | 100%                |
| 1      | 4%             | 9%                  | 75%                 |
| 1.5    | 3%             | 0%                  | 0%                  |
| 2      | 3%             | 0%                  | 0%                  |
| 3      | 0%             | 0%                  | 0%                  |
| 4      | 0%             | 0%                  | 0%                  |
| 6      | 0%             | 0%                  | 0%                  |
| 8      | 0%             | 0%                  | 0%                  |
| 12     | 0%             | 0%                  | 0%                  |
| 18     | 0%             | 0%                  | 0%                  |
| 24     | 0%             | 0%                  | 0%                  |
| 40     | 0%             | 0%                  | 0%                  |
| 60     | 0%             | 0%                  | 0%                  |

First zoom below one half: dates 0.5, gap labels 0.75, lag plates 1.5.

## Unit 300 — 144 activities, 188 links

| px/day | dates withheld | gap labels withheld | lag plates withheld |
| ------ | -------------- | ------------------- | ------------------- |
| 0.5    | 84%            | 62%                 | 100%                |
| 0.75   | 78%            | 55%                 | 97%                 |
| 1      | 75%            | 51%                 | 94%                 |
| 1.5    | 72%            | 42%                 | 90%                 |
| 2      | 68%            | 34%                 | 81%                 |
| 3      | 61%            | 24%                 | 81%                 |
| 4      | 46%            | 15%                 | 52%                 |
| 6      | 25%            | 6%                  | 42%                 |
| 8      | 14%            | 4%                  | 10%                 |
| 12     | 7%             | 4%                  | 3%                  |
| 18     | 2%             | 4%                  | 0%                  |
| 24     | 1%             | 4%                  | 0%                  |
| 40     | 1%             | 0%                  | 0%                  |
| 60     | 0%             | 0%                  | 0%                  |

First zoom below one half: dates 4, gap labels 1.5, lag plates 6.

## Tier thresholds (the larger of the two plans, per layer)

- working tier (dates and gap labels): 4 px/day
- detail tier (lag plates): 6 px/day

**Committed thresholds:**

- **Working tier from 4 px/day.** Unit 300's dates bind: 46 % withheld at 4, 58 % at 3. The
  reference plan's dates clear one half at every zoom measured.
- **Detail tier from 6 px/day.** Unit 300's lag plates bind: 42 % withheld at 6, 52 % at 4.

At 1646 px the zoom presets land near 117, 55, 18, 4.5 and 1.5 px/day for Day, Week, Month, Quarter
and Year (spec G11). So:

- Day, Week and Month are **detail**;
- Quarter is **working**;
- Year and Fit are **overview**.

**P3, the overview ceiling on direction marks:** at the overview tier the per-link cap stays at
today's six (`CHEVRON_MAX_PER_LINK`). That bounds the layer at **6 × visible links per frame**, exactly
today's bound. The raised cap (spec G5's ~40 px spacing) applies at the working and detail tiers only.

## The accessibility rulings

The accessibility reviewer ruled with X3's two premises established from the code.

**The ruler exists on screen and not on paper:**

- the workspace has the date ruler (`TsldCanvas.tsx:184-187`, `RULER_HEIGHT = 40`), always shown;
- the guest view has it too (`GuestPlanView.tsx` mounts `TsldPanel`, which renders `TsldCanvas`);
- the exported raster and the browser-print image carry **no** month or year labels
  (`render-export-image.ts:254-310`).

**Rulings:**

| Question                                    | Ruling                                                                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CQ-1 on the canvas scope (screen and guest) | **Accept the quiet dashed grid.** The ruler carries position at every tier, including overview                                                                                                                                         |
| CQ-1 on paper                               | **Require ≥ 3:1**, through tokens of paper's own (`--print-grid-month`, `--print-grid-year`), whatever the zoom tier. On paper the grid is the only position channel, so it must never inherit the screen's quiet value                |
| Does the split satisfy X3?                  | **Yes.** X3's premises are per surface, so the remedy is per surface. The paper pair needs its own red-first gate                                                                                                                      |
| R7, the canvas label without the code       | **The accessible name leads with the visible text: "name, code".** Checked: search by code builds its own haystack (`lenses.ts:82`), and `chainNeighbour` only speaks the label (`a11y.ts:609`). So nothing relies on the code leading |

The paper pair is in `token-contrast.test.ts`'s NetPoint block, verified red by giving paper the
screen's quiet month value (1 case failed).
