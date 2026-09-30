/**
 * The resource histogram of an UNPLACED plan, recorded against the code BEFORE any #413 change
 * (`docs/specs/placed-load-basis/`, M0-T0.2, case H2) and committed as a literal. A plan with no
 * placement must read byte-identically after M2: nothing here may be regenerated from the new code.
 *
 * The plan (`placed-load-basis.e2e-spec.ts`, `seedUnplacedPlan`): data date 2026-01-05 on an
 * all-days-work calendar; plain tasks, an assignment with a two-day join lag, a BELL curve, a started
 * task (actual start 2026-01-02, before the data date) and a complete task (actuals 2026-01-02 to
 * 2026-01-03) with no successor. Series are keyed by resource NAME because ids are random, and sorted
 * by it; the DAY and WEEK reads are both recorded.
 *
 * Recorded at `e83fc56` (the #421 fix, which is the code the placed-basis parity argument holds on):
 * the test was run with the assertion replaced by a write of the response to a scratch file, and the
 * file was then converted to this literal. Nothing about it was hand-edited.
 *
 * **Re-derived 2026-09-30 (`docs/TECH_DEBT.md` #423), and this is the one sanctioned exception to "never
 * regenerate".** The recording above counted every bar's last day as empty: the histogram was handed
 * the INCLUSIVE display finish and spread `[start, finish)`. Units per resource are unchanged; the
 * load moved onto each bar's last day (one more DAY bucket, 14 Jan; Rig's week-2 share 0.68). The new
 * figures were not recorded from a live API run: the five activities' display dates were read from the
 * old golden, fed to the pure read-model with the old finish (which reproduced the old golden exactly,
 * DAY and WEEK) and then with the corrected one. `pnpm --filter @repo/api test:e2e` is what confirms them.
 */
export const HISTOGRAM_UNPLACED_GOLDEN = {
  day: {
    granularity: 'DAY',
    buckets: [
      {
        start: '2026-01-02',
        end: '2026-01-03',
      },
      {
        start: '2026-01-03',
        end: '2026-01-04',
      },
      {
        start: '2026-01-04',
        end: '2026-01-05',
      },
      {
        start: '2026-01-05',
        end: '2026-01-06',
      },
      {
        start: '2026-01-06',
        end: '2026-01-07',
      },
      {
        start: '2026-01-07',
        end: '2026-01-08',
      },
      {
        start: '2026-01-08',
        end: '2026-01-09',
      },
      {
        start: '2026-01-09',
        end: '2026-01-10',
      },
      {
        start: '2026-01-10',
        end: '2026-01-11',
      },
      {
        start: '2026-01-11',
        end: '2026-01-12',
      },
      {
        start: '2026-01-12',
        end: '2026-01-13',
      },
      {
        start: '2026-01-13',
        end: '2026-01-14',
      },
      {
        start: '2026-01-14',
        end: '2026-01-15',
      },
    ],
    total: 3,
    hasMore: false,
    curveNormalisedCount: 0,
    series: [
      {
        resourceId: 'Crane',
        values: [3, 3, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3],
        total: 18,
      },
      {
        resourceId: 'Crew',
        values: [3.2, 3.2, 3.2, 5.2, 5.2, 2, 2, 0, 0, 0, 0, 0, 0],
        total: 24,
      },
      {
        resourceId: 'Rig',
        values: [0, 0, 0, 2.2, 5.64, 7.12, 4.36, 0.68, 0, 0, 0, 0, 0],
        total: 20,
      },
    ],
  },
  week: {
    granularity: 'WEEK',
    buckets: [
      {
        start: '2026-01-02',
        end: '2026-01-09',
      },
      {
        start: '2026-01-09',
        end: '2026-01-16',
      },
    ],
    total: 3,
    hasMore: false,
    curveNormalisedCount: 0,
    series: [
      {
        resourceId: 'Crane',
        values: [6, 12],
        total: 18,
      },
      {
        resourceId: 'Crew',
        values: [24, 0],
        total: 24,
      },
      {
        resourceId: 'Rig',
        values: [19.32, 0.68],
        total: 20,
      },
    ],
  },
} as const;
