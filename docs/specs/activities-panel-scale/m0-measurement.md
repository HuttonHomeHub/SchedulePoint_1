# M0 measurement — the activities panel at plan scale

- **Taken:** 2026-09-28, in the dev container (headless Chromium 141.0.7390.37,
  `hardwareConcurrency` 4), against a production build served by `vite preview` and a built API
  (`node dist/main.js`, `RATE_LIMIT_LIMIT` raised for this instance only, `CORS_ORIGINS` naming the
  preview origin). Commit `cc773224`. Plans: seed-catalogue `scale-500` (540 rows) and `scale-2000`
  (2,160 rows), recalculated. Seven repeats per judged limb.
- **Verdict rule and bars:** `m0-conditions.md`, committed before the harness existed.

## Readings (1× CPU, judged)

| Plan  | Viewport       | E1 expand                       | S1 scroll     | I2 checkbox            | I3 row menu                 | I4 select (expanded)      |
| ----- | -------------- | ------------------------------- | ------------- | ---------------------- | --------------------------- | ------------------------- |
| 500   | 1646 @ DPR1.75 | 488 ms [400, 528] INDETERMINATE | 59.0 fps PASS | 120 ms PASS            | 72 ms PASS                  | 112 ms PASS               |
| 500   | 1920 @ DPR1    | 472 ms [424, 512] **FAIL**      | 58.6 fps PASS | 96 ms PASS             | 72 ms PASS                  | 88 ms PASS                |
| 2,000 | 1646 @ DPR1.75 | 1664 ms [1608, 1968] INDETERM.  | 51.3 fps PASS | 288 ms [256, 344] FAIL | 176 ms [152, 240] INDETERM. | 15 ms [15, 464] INDETERM. |
| 2,000 | 1920 @ DPR1    | not taken (see below)           |               |                        |                             |                           |

Bars: E1/I2/I3/I4 ≤ 200 ms; S1 ≥ 45 fps at 500 and ≥ 30 fps at 2,000.

**Read E1 plainly:** every one of the 7 repeats at 2,000 rows was 8× over the 200 ms bar, and at
500 rows every repeat was over 2×. It is `INDETERMINATE` only by the spread limb (spread 360 ms

> 50% of the bar), not because the repeats disagree about which side of the bar they sit. Opening
> the panel is slow at this scale; the container cannot say by exactly how much.

Reported only (4× CPU): E1 ≈ 2.1 s at 500 rows, S1 28–35 fps, I2 ≈ 410–430 ms.

## What stopped the run

At 2,000 rows, 1646 @ 4× CPU (a reported-only pass), the harness's non-vacuity check counted 3
rendered rows against 2,160 and aborted: at 4× the table had not finished rendering when it was
counted. The judged 2,000-row 1920 pass therefore never ran. That is a harness timing defect, not a
product finding, and it does not change the decision below: the table keys on 2,000 rows, and one
judged 2,000-row viewport is already INDETERMINATE.

Three other harness defects were found and fixed on the way, each on the first real run (commits
`b59e5175`, `20545630`): the API refused the preview origin (`CORS_ORIGINS` is now a documented
prerequisite), the activity list refused `limit=200` (the ceiling is 100), and the measuring
contexts were not signed in. Seeding `scale-2000` also found a product defect, filed as
`docs/TECH_DEBT.md` #407.

**And measuring found a real regression in M1 before it shipped:** with a row selected, the
bulk-assign bar squeezed the contained region to 50 px at the default panel height, leaving the
header and no rows. Fixed in `cc773224`, pinned by a journey case red-verified against the old
layout (0 rows painted).

## Decision (the committed table, applied mechanically)

Row "Any judged limb INDETERMINATE" applies: **M1 only, then stop. CQ-A goes to the product owner
with these numbers.** Had E1 been judged FAIL rather than INDETERMINATE, the table would arm M3
(windowing, ADR first, CQ-B), and I2's FAIL at 2,000 would arm M2 as well.

## CQ-A, answered

**Product owner, 2026-09-28: treat it as a fail.** Every repeat sat over the bar, so the direction
is not in doubt. So the table's E1-FAIL row applies: **M3 is armed** (windowing, ADR first, with
CQ-B put to the product owner with these numbers), and **M2 as well** because I2 fails at 2,000
rows. Both are a follow-up after the release that ships M1; `docs/TECH_DEBT.md` #334 stays open
for them.
