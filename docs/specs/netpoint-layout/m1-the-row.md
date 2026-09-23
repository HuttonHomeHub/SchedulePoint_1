# NetPoint-layout M1: the row

**Status:** Landed 2026-09-23. Spec §4.6; plan "Milestone M1: The row".

This file records what M1 changed, what was measured, and where the build departed from the plan.

## What shipped

- **Pitch 60** (`LANE_HEIGHT` 52 → 60). This answers ADR-0151's owed item 3. The 8 px goes to the
  gutter: `rowSlots`' clear half-band grows 7.5 → 11.5 px, and every text row keeps its size.
- **The name row is identity only.** `RenderActivity.label` is `activityLabel` (`{code} {name}`).
  `activityBarLabel` and its `· 5d` suffix are gone. `centreItemText` in `a11y.ts` replaces it and
  is the only producer of the duration and float wording.
- **The centre item** (layer 3.8). It shows `5d · 3d float left`, or `5d` alone where only that
  fits, or nothing, in that order of preference. It sits in the gap between the dates when both
  dates fit inside the bar, and within the bar's width otherwise. It rides `Labels` and that
  toggle's zoom threshold. Every context write is lazy, so a frame with nothing to print costs no
  write.
- **A milestone draws one date, centred under its diamond**, and no centre item.
- **`Dates` is on by default** (`DEFAULT_VIEW_TOGGLES.dates = true`).
- **Names beside a milestone no longer collide (FC-N6a).** The name layer's half-gap is no longer
  clamped at 0. At 4 px/day a diamond (about 14 px) is wider than its day, so its rect overlaps
  the next bar's even though their spans do not. The clamp then gave both names their whole rect
  width.

## What was measured

| Reading                                          | Result                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden log re-baseline (T1, T2)                  | Checked line by line against a written prediction: only y and height changed (0 violations). A planted x change and a planted text change were both caught. |
| FC-N6a name collisions                           | **0 / 0 / 0 / 0**: Unit 300 (was 9) and `scale-2000` (was 75), at both measured zooms.                                                                      |
| What FC-N6a cost                                 | **9 names suppressed** on Unit 300. A name that would have been printed over its neighbour is now omitted. The listbox still names every activity.          |
| Centre item coverage, Unit 300 at 4 px/day       | Drawn on **122 of 144** bars; the other 22 draw nothing at that zoom (not broken down further).                                                             |
| Dates coverage                                   | None below 6 px/day. That is `DATE_LABEL_MIN_PX_PER_DAY`, which is unchanged, so the level-of-detail rule is ADR-0054 §3's.                                 |
| `canvas-draw.ts` visible-bar table               | Week 196 → 200 and 224 → 218; Fit 311 → 276 and 914 → 812. A 900 px viewport holds 15 lanes at 60 px against 17 at 52.                                      |
| Lane containment                                 | New case "dates and centre item under the bar" (17 cases). Verified red with the below row moved 30 px down.                                                |
| Draw budget (`paint.centre-item-budget.test.ts`) | Adds at most one draw per visible bar, and measures each distinct string at most once. The measure case was verified red with the width memo bypassed.      |

**Paint cost is not measured here.** The plan asks for a pitch-60 harness reading without link
marks, to separate the pitch's cost from M2's. That reading belongs on the product owner's hardware
(ADR-0128), together with M0-T6's. Neither has been taken, and this milestone makes no claim either
way.

## Departures from the plan

- **The journey asserts a difference, not an absence.** The plan's probe was "ink under a known wide
  bar, and none in the name row's former duration position". The first half is kept as ink under
  the bar with `Dates` and `Labels` on, minus the ink with both off. It has to be a difference
  because the band under a bar also crosses the data-date line and other constant ink. With both
  layers mutated off the screen, the residual read 133 on both sides. So "some ink is there" would
  pass against a painter that drew no text at all. The second half is dropped: the name row's
  content is pinned by the unit suites (`paint.test.ts`, `paint.golden.test.ts`), where it can be
  asserted exactly rather than probed.
- **The journey was verified red twice.** With `Dates` defaulting off, it fails at the checkbox.
  With both below-row layers painted 5,000 px lower, it fails at the difference (133 against 133).

## An instrument that had stopped judging

`measure-crossings.mjs` (FC-C1, ADR-0149) opens with a control: at a framing that holds the whole
plan, the painter must draw exactly one link polyline per edge. At M1 it drew **83 against 188** and
refused to judge. The cause was in the harness, not the painter: two framings in `crossing-probe.ts`
sized "the whole plan" as `lanes * 28 + 200`, where 28 was the row pitch two row changes ago. The
harness had not held the whole plan since ADR-0151 moved the row to 52. Run at the commit before
M1, the same control reads **100 against 188**. Nobody re-ran it in between, so the refusal was
never seen.

Both framings now derive from `LANE_HEIGHT`, as the harness's other framings already did. The
control reads **188 against 188** at pitch 60. Found while teaching the recorder the M2 link marks,
which is the only reason it was run.

## Export

The export uses the same painter and the same defaults, so the exported picture gains the dates and
the centre item. `e2e-export` was re-run on this branch: 3 passed.
