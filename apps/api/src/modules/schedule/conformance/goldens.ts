import { allMinutesWorkCalendar, buildWorkingTimeCalendar, fullDayWeek } from '../engine';
import type { ComputeOptions, EngineActivity, EngineEdge } from '../engine';

/**
 * **First-principles golden networks** (ADR-0034 §3). Small, hand-authored CPM
 * networks whose correct output is knowable *without* an external oracle: the
 * offsets and inclusive dates are computed by hand from the arithmetic in
 * ADR-0023, so these are a self-contained regression floor for the engine's
 * forward/backward pass, float, criticality, and constraint clamping.
 *
 * Why they matter for M1: ADR-0036 rewrites the engine from working-**days** to
 * working-**minutes**. For these whole-day, single-calendar networks the *dates*
 * are invariant across that rework (5 working days is the same Friday whether
 * measured in days or minutes), so the date assertions here are exactly the
 * regression net ADR-0036 §3 names — a green diff on M1 means dates held; a red
 * one is a reviewed re-baseline, not a silent drift.
 *
 * Dates use `allMinutesWorkCalendar` (every calendar day works, 1440 min/day) except
 * the two calendar cases, which use a Monday–Friday calendar anchored on Monday
 * 2026-01-05 to exercise weekend skipping.
 */

/** The expected pure-CPM output for one activity (dates are inclusive display days). */
export interface GoldenExpectation {
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  totalFloat: number;
  isCritical: boolean;
}

export interface GoldenCase {
  name: string;
  description: string;
  activities: EngineActivity[];
  edges: EngineEdge[];
  options: ComputeOptions;
  /** Per-activity expected schedule, keyed by activity id. */
  expected: Record<string, GoldenExpectation>;
  /** Expected inclusive project-finish display date. */
  projectFinish: string;
}

const ALL_DAYS_DATA_DATE = '2026-06-01';
/** Monday 2026-01-05 — the anchor for the weekday-mask cases (so weekend skips are visible). */
const MONDAY_DATA_DATE = '2026-01-05';
const monFri = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

const task = (id: string, durationMinutes: number): EngineActivity => ({
  id,
  durationMinutes: durationMinutes * 1440,
  type: 'TASK',
});

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'fs-chain',
    description: 'A(5) → B(3) finish-to-start, lag 0 — the canonical critical chain.',
    activities: [task('A', 5), task('B', 3)],
    edges: [{ id: 'e1', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 0 }],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      // ES 0, EF 5 → inclusive finish offset 4 = 06-05.
      A: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-05',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-05',
        totalFloat: 0,
        isCritical: true,
      },
      // ES 5 (= EF_A), EF 8 → inclusive finish offset 7 = 06-08.
      B: {
        earlyStart: '2026-06-06',
        earlyFinish: '2026-06-08',
        lateStart: '2026-06-06',
        lateFinish: '2026-06-08',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-06-08',
  },
  {
    name: 'ss-ff-lag',
    description:
      'A(10) drives B(4) via SS+2 and C(4) via FF+1 — start-to-start and finish-to-finish arithmetic with a floating branch.',
    activities: [task('A', 10), task('B', 4), task('C', 4)],
    edges: [
      { id: 'e1', predecessorId: 'A', successorId: 'B', type: 'SS', lagMinutes: 2880 },
      { id: 'e2', predecessorId: 'A', successorId: 'C', type: 'FF', lagMinutes: 1440 },
    ],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      // ES 0, EF 10 → inclusive 9 = 06-10.
      A: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-10',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-10',
        totalFloat: 0,
        isCritical: true,
      },
      // SS+2: ES 2, EF 6 → inclusive 5 = 06-06. LS 7 (float 5 days = 7200 min).
      B: {
        earlyStart: '2026-06-03',
        earlyFinish: '2026-06-06',
        lateStart: '2026-06-08',
        lateFinish: '2026-06-11',
        totalFloat: 7200,
        isCritical: false,
      },
      // FF+1: ES = EF_A + 1 − 4 = 7, EF 11 → inclusive 10 = 06-11. Critical.
      C: {
        earlyStart: '2026-06-08',
        earlyFinish: '2026-06-11',
        lateStart: '2026-06-08',
        lateFinish: '2026-06-11',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-06-11',
  },
  {
    name: 'sf-arithmetic',
    description:
      'A(5) → B(3) start-to-finish, lag 5 — SF sets EF(succ) from ES(pred); ES(succ) = EF − duration (ADR-0035 §15).',
    activities: [task('A', 5), task('B', 3)],
    edges: [{ id: 'e1', predecessorId: 'A', successorId: 'B', type: 'SF', lagMinutes: 7200 }],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      A: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-05',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-05',
        totalFloat: 0,
        isCritical: true,
      },
      // SF+5: bound = ES_A(0) + 5 − dur(3) = 2. ES 2, EF 5 → inclusive 4 = 06-05.
      // (A mis-implementation without the −duration term would put ES at 5 = 06-06.)
      B: {
        earlyStart: '2026-06-03',
        earlyFinish: '2026-06-05',
        lateStart: '2026-06-03',
        lateFinish: '2026-06-05',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-06-05',
  },
  {
    name: 'calendar-weekend-skip',
    description:
      'A(5) → B(3) FS on a Mon–Fri calendar from Monday 2026-01-05 — the finish skips the weekend (Fri → Mon).',
    activities: [task('A', 5), task('B', 3)],
    edges: [{ id: 'e1', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 0 }],
    options: { dataDate: MONDAY_DATA_DATE, calendar: monFri },
    expected: {
      // ES Mon 01-05; 5 working days → inclusive offset 4 = Fri 01-09.
      A: {
        earlyStart: '2026-01-05',
        earlyFinish: '2026-01-09',
        lateStart: '2026-01-05',
        lateFinish: '2026-01-09',
        totalFloat: 0,
        isCritical: true,
      },
      // ES offset 5 days = Mon 01-12 (the weekend is skipped); EF → inclusive last working day = Wed 01-14.
      // The start lands exactly on the Fri-close gap; the engine displays it as the next WORKING day
      // (Mon 01-12), not the empty weekend instant — the date-invariant holds under days→minutes.
      B: {
        earlyStart: '2026-01-12',
        earlyFinish: '2026-01-14',
        lateStart: '2026-01-12',
        lateFinish: '2026-01-14',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-01-14',
  },
  {
    name: 'snet-constraint-clamp',
    description:
      'A(2) → B(2) FS with a Start-No-Earlier-Than on B — the constraint pushes B past its logic start and floats A (ADR-0023 §6).',
    activities: [
      task('A', 2),
      {
        id: 'B',
        durationMinutes: 2880,
        type: 'TASK',
        constraintType: 'SNET',
        constraintDate: '2026-01-12',
      },
    ],
    edges: [{ id: 'e1', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 0 }],
    options: { dataDate: MONDAY_DATA_DATE, calendar: monFri },
    expected: {
      // ES Mon 01-05, EF inclusive offset 1 = Tue 01-06. SNET floats A by 3 (LS offset 3 = Thu 01-08).
      A: {
        earlyStart: '2026-01-05',
        earlyFinish: '2026-01-06',
        lateStart: '2026-01-08',
        lateFinish: '2026-01-09',
        totalFloat: 4320,
        isCritical: false,
      },
      // Logic start offset 2 days, but SNET(01-12) clamps it to Mon 01-12; the start lands on the
      // Fri-close gap and displays as the next working day (Mon 01-12), EF inclusive → Tue 01-13.
      B: {
        earlyStart: '2026-01-12',
        earlyFinish: '2026-01-13',
        lateStart: '2026-01-12',
        lateFinish: '2026-01-13',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-01-13',
  },
];
