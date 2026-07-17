import type { DurationType, EditedField } from '@repo/types';

import { resolveTriad } from '../duration-type/resolve-triad';
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
  /** Optional free-float assertion (M6-F1/F5); compared only when a case specifies it. */
  freeFloat?: number;
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

/** A Level-of-Effort hammock (ADR-0035 §21): duration 0 (the engine derives its span from SS/FF ties). */
const loe = (id: string, calendar?: EngineActivity['calendar']): EngineActivity => ({
  id,
  durationMinutes: 0,
  type: 'LEVEL_OF_EFFORT',
  ...(calendar ? { calendar } : {}),
});

/**
 * A resource-dependent activity (ADR-0035 §23 / ADR-0039): identical to a TASK for logic, scheduled on
 * the port the adapter/service resolves from its DRIVING resource's calendar. Here the port stands in
 * for that resolved driving-resource calendar.
 */
const resourceDependent = (
  id: string,
  durationDays: number,
  calendar: NonNullable<EngineActivity['calendar']>,
): EngineActivity => ({
  id,
  durationMinutes: durationDays * 1440,
  type: 'RESOURCE_DEPENDENT',
  calendar,
});

/**
 * Resolve a driving assignment's `{budgetedUnits, unitsPerHour}` into a whole-minute duration through
 * the SAME pure `resolveTriad` the write paths + the conformance adapter use (ADR-0040 / ADR-0035 §26).
 * These goldens build their activities from its output so the derived duration reaches the engine
 * exactly as production would — the engine reads `durationMinutes`, never a `durationType` (§6).
 * Throws on the N20 zero-rate reject (a golden must never wire an infeasible triad).
 */
function resolveTriadDurationMinutes(
  type: DurationType,
  edited: EditedField,
  durationMinutes: number,
  budgetedUnits: number,
  unitsPerHour: number,
): number {
  const r = resolveTriad(type, edited, { durationMinutes, budgetedUnits, unitsPerHour });
  if (!r.ok) throw new Error(`golden setup: unexpected ${r.reason}`);
  return r.durationMinutes;
}

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
  {
    name: 'secondary-constraint-snet-fnlt',
    description:
      'A5200-style: A(2) carries a SNET primary (forward) + FNLT secondary (backward), both provably active, alongside a longer parallel B(5). SNET moves A’s early start; the FNLT tightens A’s late finish below the slack B would otherwise allow, taking A’s float to zero (ADR-0035 §10).',
    activities: [
      {
        id: 'A',
        durationMinutes: 2880,
        type: 'TASK',
        constraintType: 'SNET',
        constraintDate: '2026-06-03',
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-06-04',
      },
      task('B', 5),
    ],
    edges: [],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      // Forward: SNET(06-03) pushes ES to offset 2 days (06-03); EF inclusive offset 3 = 06-04.
      // Backward: without the secondary A would float to B’s finish (offset 5); FNLT(06-04) clamps the
      // late finish to offset 4 (inclusive 06-04), so LS = 06-03 and A’s float is 0 (both active).
      A: {
        earlyStart: '2026-06-03',
        earlyFinish: '2026-06-04',
        lateStart: '2026-06-03',
        lateFinish: '2026-06-04',
        totalFloat: 0,
        isCritical: true,
      },
      // B is the longest pole and drives the project finish (offset 5 → inclusive 06-05).
      B: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-05',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-05',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-06-05',
  },
  {
    name: 'alap-display-only',
    description:
      'A9400-style: A(2) flagged As-Late-As-Possible floats against a 5-day B. ALAP is display-only (ADR-0035 §11) — A’s pure early/late/float are unchanged, but as an ALAP placement its FREE FLOAT is 0 (M6-F5).',
    activities: [
      { id: 'A', durationMinutes: 2880, type: 'TASK', scheduleAsLateAsPossible: true },
      task('B', 5),
    ],
    edges: [],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      // ES 06-01, EF inclusive 06-02; floats 3 days against B → LS offset 3 (06-04), LF inclusive 06-05.
      A: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-02',
        lateStart: '2026-06-04',
        lateFinish: '2026-06-05',
        totalFloat: 4320,
        isCritical: false,
        // ALAP placement consumes its slack → free float 0 (M6-F5), though total float stays 3 days.
        freeFloat: 0,
      },
      B: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-05',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-05',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-06-05',
  },
  {
    name: 'expected-finish-resize',
    description:
      'A6200-style: a not-started A(3d) carries an expected finish of 06-08 and the plan option is ON — its full duration is recomputed so the finish lands on 06-08 (not its 3-day plan) (ADR-0035 §9).',
    activities: [{ id: 'A', durationMinutes: 4320, type: 'TASK', expectedFinish: '2026-06-08' }],
    edges: [],
    options: {
      dataDate: ALL_DAYS_DATA_DATE,
      calendar: allMinutesWorkCalendar,
      useExpectedFinishDates: true,
    },
    expected: {
      // ES data date 06-01; the remaining is resized to land the finish on 06-08 (offset 8 → inclusive 06-08).
      A: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-08',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-08',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-06-08',
  },
  {
    name: 'loe-spans-project',
    description:
      'A1010-style: an LOE hammock H hangs off the A→B chain by SS-from-A + FF-to-B. Its span is derived from A’s start to B’s finish; it never drives, is never critical, and carries a non-negative 0 float (ADR-0035 §21).',
    activities: [task('A', 5), task('B', 3), loe('H')],
    edges: [
      { id: 'e1', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 0 },
      { id: 'e2', predecessorId: 'A', successorId: 'H', type: 'SS', lagMinutes: 0 },
      { id: 'e3', predecessorId: 'H', successorId: 'B', type: 'FF', lagMinutes: 0 },
    ],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      // The A→B critical chain is byte-identical to fs-chain — the LOE hangs off it, never bounds it.
      A: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-05',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-05',
        totalFloat: 0,
        isCritical: true,
      },
      B: {
        earlyStart: '2026-06-06',
        earlyFinish: '2026-06-08',
        lateStart: '2026-06-06',
        lateFinish: '2026-06-08',
        totalFloat: 0,
        isCritical: true,
      },
      // H spans A’s start (06-01) to B’s finish (06-08); late is pinned to early ⇒ float 0, free float 0,
      // never critical.
      H: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-08',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-08',
        totalFloat: 0,
        isCritical: false,
        freeFloat: 0,
      },
    },
    // The LOE never carries the project finish; B does (06-08).
    projectFinish: '2026-06-08',
  },
  {
    name: 'loe-cross-calendar',
    description:
      'A1030-style: the span ends A→B run on a Mon–Fri calendar (B starts after the weekend), while the LOE H runs on a 7-day calendar. H’s dates are pinned to the span-end INSTANTS regardless of its own calendar — it spans A’s Monday start to B’s finish across the weekend (ADR-0035 §21 on the activity’s own calendar, ADR-0037).',
    activities: [task('A', 5), task('B', 3), loe('H', allMinutesWorkCalendar)],
    edges: [
      { id: 'e1', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 0 },
      { id: 'e2', predecessorId: 'A', successorId: 'H', type: 'SS', lagMinutes: 0 },
      { id: 'e3', predecessorId: 'H', successorId: 'B', type: 'FF', lagMinutes: 0 },
    ],
    options: { dataDate: MONDAY_DATA_DATE, calendar: monFri },
    expected: {
      // A: Mon 01-05 → Fri 01-09 (5 working days). B: FS-after A skips the weekend, Mon 01-12 → Wed 01-14.
      A: {
        earlyStart: '2026-01-05',
        earlyFinish: '2026-01-09',
        lateStart: '2026-01-05',
        lateFinish: '2026-01-09',
        totalFloat: 0,
        isCritical: true,
      },
      B: {
        earlyStart: '2026-01-12',
        earlyFinish: '2026-01-14',
        lateStart: '2026-01-12',
        lateFinish: '2026-01-14',
        totalFloat: 0,
        isCritical: true,
      },
      // H (7-day calendar) starts at A’s Monday-start instant (01-05) and finishes at B’s finish instant
      // (Wed 01-14) — its span crosses the weekend the span ends skip. Late pinned to early ⇒ float 0.
      H: {
        earlyStart: '2026-01-05',
        earlyFinish: '2026-01-14',
        lateStart: '2026-01-05',
        lateFinish: '2026-01-14',
        totalFloat: 0,
        isCritical: false,
        freeFloat: 0,
      },
    },
    projectFinish: '2026-01-14',
  },
  {
    name: 'resource-calendar-drives',
    description:
      'A8300-style: a RESOURCE_DEPENDENT activity R is driven by a 24/7 crew calendar while a plain TASK T runs on the Mon–Fri plan — same 7-day duration, both from Monday 2026-01-05. R works through the weekend and finishes on its resource calendar (01-11); T waits the weekend out (01-13). The driving resource’s calendar demonstrably drives R’s dates (ADR-0035 §23 / ADR-0039); R is not on the critical path (T is the longer pole).',
    activities: [task('T', 7), resourceDependent('R', 7, allMinutesWorkCalendar)],
    edges: [],
    options: { dataDate: MONDAY_DATA_DATE, calendar: monFri },
    expected: {
      // T (Mon–Fri): 7 working days from Mon 01-05 → skips one weekend → inclusive finish Tue 01-13.
      T: {
        earlyStart: '2026-01-05',
        earlyFinish: '2026-01-13',
        lateStart: '2026-01-05',
        lateFinish: '2026-01-13',
        totalFloat: 0,
        isCritical: true,
      },
      // R (24/7 driving crew): 7 ELAPSED days from Mon 01-05 → inclusive finish Sun 01-11 (worked the
      // weekend). It floats to the project finish; its slack is measured on ITS OWN 24/7 calendar =
      // 2 elapsed days (2880 min), so it is not critical.
      R: {
        earlyStart: '2026-01-05',
        earlyFinish: '2026-01-11',
        lateStart: '2026-01-07',
        lateFinish: '2026-01-13',
        totalFloat: 2880,
        isCritical: false,
        freeFloat: 2880,
      },
    },
    // T — scheduled on the plan calendar — is the longer pole and carries the project finish (01-13).
    projectFinish: '2026-01-13',
  },
  {
    name: 'fixed-units-derives-duration',
    description:
      'A7100-style: a FIXED_UNITS activity U DERIVES its duration from its driving assignment (U=240 units ÷ R=5 units/working-hour = 48 h = 2 days), fed to the engine via resolveTriad — not the placeholder duration it was entered with. It drives a 3-day successor W; the derivation reaching the engine is what puts W’s finish on 06-05 (ADR-0040 / ADR-0035 §26).',
    activities: [
      {
        id: 'U',
        // The 10-day placeholder is DELIBERATELY WRONG: resolveTriad overwrites it with U/R = 48 h.
        // A naive reading (leaving the entered 10 days, or treating 240 units as anything but ÷ rate)
        // would finish U on a different day — the golden pins the derivation, not a coincidence.
        durationMinutes: resolveTriadDurationMinutes(
          'FIXED_UNITS',
          'UNITS_PER_HOUR',
          10 * 1440,
          240,
          5,
        ),
        type: 'TASK',
      },
      task('W', 3),
    ],
    edges: [{ id: 'e1', predecessorId: 'U', successorId: 'W', type: 'FS', lagMinutes: 0 }],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      // U: derived 2 days (48 working hours on the 24/7 calendar). ES 06-01, EF inclusive offset 1 = 06-02.
      U: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-02',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-02',
        totalFloat: 0,
        isCritical: true,
      },
      // W (3 days) FS after U: ES offset 2 = 06-03, EF inclusive offset 4 = 06-05.
      W: {
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
    name: 'fixed-duration-units-holds-duration',
    description:
      'A7400-style: a FIXED_DURATION_AND_UNITS activity H holds its ENTERED duration (3 days) when its units are edited — the rate absorbs, the duration is untouched. resolveTriad returns the entered 4 320 minutes unchanged, so the engine schedules 3 days; a type that wrongly derived would land a different finish (ADR-0040 / ADR-0035 §26).',
    activities: [
      {
        id: 'H',
        // Editing Units on a FIXED_DURATION_AND_UNITS activity recomputes the RATE and HOLDS the
        // duration: resolveTriad returns exactly the entered 3 days (4 320 min). Had it derived
        // (D := U/R = 900/2 = 450 h ≈ 18.75 d) the finish would move — the held value is the point.
        durationMinutes: resolveTriadDurationMinutes(
          'FIXED_DURATION_AND_UNITS',
          'UNITS',
          3 * 1440,
          900,
          2,
        ),
        type: 'TASK',
      },
    ],
    edges: [],
    options: { dataDate: ALL_DAYS_DATA_DATE, calendar: allMinutesWorkCalendar },
    expected: {
      // Held 3 days: ES 06-01, EF inclusive offset 2 = 06-03.
      H: {
        earlyStart: '2026-06-01',
        earlyFinish: '2026-06-03',
        lateStart: '2026-06-01',
        lateFinish: '2026-06-03',
        totalFloat: 0,
        isCritical: true,
      },
    },
    projectFinish: '2026-06-03',
  },
];
