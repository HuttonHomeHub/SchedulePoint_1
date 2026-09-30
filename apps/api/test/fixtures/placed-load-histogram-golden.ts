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
    ],
    total: 3,
    hasMore: false,
    curveNormalisedCount: 0,
    series: [
      {
        resourceId: 'Crane',
        values: [6, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4],
        total: 18,
      },
      {
        resourceId: 'Crew',
        values: [4, 4, 4, 6.6666, 2.6667, 2.6667, 0, 0, 0, 0, 0, 0],
        total: 24,
      },
      {
        resourceId: 'Rig',
        values: [0, 0, 0, 3.3, 8.2, 7.3, 1.2, 0, 0, 0, 0, 0],
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
        values: [20, 0],
        total: 20,
      },
    ],
  },
} as const;
