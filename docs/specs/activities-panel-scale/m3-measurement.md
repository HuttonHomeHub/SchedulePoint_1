# M3 measurement — the windowed activities panel (SC-7)

- **Taken:** 2026-09-29, in the dev container (headless Chromium, `hardwareConcurrency` 4), against
  a production build served by `vite preview` on :4173 and a built API (`node dist/main.js`,
  `RATE_LIMIT_LIMIT` raised and `CORS_ORIGINS` naming the preview origin for this instance only).
  Tree: the branch at `03fa5d04` (M2 + M3 + the review fixes). Plans: seed-catalogue `scale-500`
  (540 rows) and `scale-2000` (2,160 rows), recalculated. Seven repeats per judged limb.
- **Bars and verdict rule:** unchanged, [`m0-conditions.md`](./m0-conditions.md).
- **Harness changes before this reading, both in the tree and neither touching a bar:**
  1. The non-vacuity probe counts the rows a windowed table **declares** (`aria-rowcount` − 1) and
     skips `aria-hidden` spacer rows. Without it every M3 run throws on repeat 0, because a windowed
     table never renders 2,160 `<tr>`s.
  2. Repeat 0 now waits (up to 120 s) for the full list before that probe runs. This is the timing
     defect that stopped M0's run and the first M3 run at 4× CPU, before their 1920 passes. With it,
     every pass ran for the first time.
  3. Each limb's seven repeats are printed in order, so an outlier can be placed.
- **I2 and I3 pick the middle of the rendered window**, not row N/2 of the plan. Windowed, row N/2
  does not exist until scrolled to. What the limbs measure (the cost of ticking a checkbox or opening
  a row's menu) does not depend on which row it is.
- **Both `scale-2000` plans, M0's and this one, have no WBS hierarchy.** The seeder's single parentage
  request was over the endpoint's 2,000-row ceiling (`docs/TECH_DEBT.md` #418, fixed after this
  reading). So the two readings are comparable with each other, not with a hierarchical plan.

## Readings (1× CPU, judged)

| Plan  | Viewport       | E1 expand (M0 → M3)                      | S1 scroll | I2 checkbox (M0 → M3)         | I3 row menu | I4 select (panel's tax) |
| ----- | -------------- | ---------------------------------------- | --------- | ----------------------------- | ----------- | ----------------------- |
| 500   | 1646 @ DPR1.75 | 488 → **72 ms** [64, 88] **PASS**        | 55.5 PASS | 120 → 48 ms PASS              | 40 ms PASS  | 120 ms PASS (−16 ms)    |
| 500   | 1920 @ DPR1    | 472 → **80 ms** [56, 512] INDETERM.      | 60.0 PASS | 96 → 32 ms PASS               | 24 ms PASS  | 80 ms PASS (−8 ms)      |
| 2,000 | 1646 @ DPR1.75 | 1,664 → **72 ms** [72, 136] **PASS**     | 52.0 PASS | 288 FAIL → **48 ms** **PASS** | 48 ms PASS  | 288 ms INDETERM. (0 ms) |
| 2,000 | 1920 @ DPR1    | not taken → **80 ms** [72, 112] **PASS** | 59.8 PASS | not taken → 40 ms PASS        | 24 ms PASS  | 224 ms INDETERM. (0 ms) |

Repeats, where the verdict needs them:

- **E1, 500 @ 1920:** 104, 80, 80, **512**, 80, 56, 80. One repeat in seven, and not repeat 0. The first
  M3 run (before the harness printed repeats) showed the same shape at 500 rows: medians 64–72 ms with
  one repeat at 480–560 ms. So an occasional ~500 ms open happens at 500 rows in this container, and
  it did not happen in 14 repeats at 2,000 rows.
- **I4, 2,000 @ 1646:** 240, 288, 15, 304, 288, 15, 296. The collapsed control is 288 ms. The panel's
  tax is **0 ms** at both 2,000-row viewports, so this is the diagram's own selection cost, not the
  table's (see below).

## Verdict (SC-7, applied as committed)

The decision table is keyed on **2,000 rows at 1× CPU** (`m0-conditions.md`). The armed limbs were
**E1** (arming M3) and **I2** (arming M2). At 2,000 rows **both PASS at both viewports**, with S1 and
I3 passing beside them. **#334 closes.**

**What stays on the record rather than hidden:**

- **E1 at 500 rows, 1920, is INDETERMINATE** on one 512 ms repeat. It is not the scale the table
  judges, and the medians are 72–80 ms. It is not a pass either, and it is recorded as such.
- **I4 at 2,000 rows is INDETERMINATE and over the bar in most repeats, with or without the panel.**
  I4 was never armed: the panel's tax is what the spec reports, and that is 0. The diagram's own
  selection cost at 2,000 activities (~220–300 ms here, ~0.9–1.3 s at 4× CPU) is filed as
  `docs/TECH_DEBT.md` #419 rather than folded into a row about the table.

## Reported only (4× CPU)

E1 ≈ 344–408 ms at 2,000 rows (M0: ≈ 2.1 s at 500 rows). I2 ≈ 144–160 ms at 2,000 (M0: ≈ 410–430 ms
at 500). S1 ≈ 20–24 fps at 2,000.
