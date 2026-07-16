import type { ConformanceFixture } from '@repo/engine-conformance';

import { computeSchedule } from '../engine';
import type { EngineOutput } from '../engine';

import { adaptFixture } from './adapter';
import { toCalendarDay } from './type-map';

/**
 * Scenario representability for the **differential tier** (ADR-0034 §2). Each
 * fixture scenario flips exactly one scheduling option; the differential proof is
 * "flip it and the dates must change — a scenario whose output equals S02's means
 * that option isn't wired up." Today's engine ingests **no progress and exposes
 * none of these options**, so only the unprogressed baseline (S01) runs; the rest
 * are recorded as `todo` with the milestone that will make them runnable.
 *
 * This registry is the **living scaffold** ADR-0034 §8 describes: as a milestone
 * lands an option, its scenario flips from `todo` to a runnable differential in
 * the same PR, and the assertion becomes "differs from the S02 baseline."
 */

export interface ScenarioSupport {
  /** Runnable against today's engine (only the unprogressed baseline is). */
  runnable: boolean;
  /** Why it can't run yet + the milestone that unlocks it (empty when runnable). */
  reason: string;
}

/** Every fixture scenario id → whether today's engine can execute it, and why not. */
export const SCENARIO_SUPPORT: Record<string, ScenarioSupport> = {
  S01_BASELINE_UNPROGRESSED: { runnable: true, reason: '' },
  S02_PROGRESSED_RETAINED_LOGIC: {
    runnable: false,
    reason: 'needs progress ingestion + data-date floor + retained logic (ADR-0035 §1–§2, M2)',
  },
  S03_PROGRESS_OVERRIDE: {
    runnable: false,
    reason: 'needs the progress-override recalc mode (ADR-0035 §1, M2)',
  },
  S04_ACTUAL_DATES: {
    runnable: false,
    reason: 'needs the actual-dates recalc mode (ADR-0035 §1, M2)',
  },
  S05_LAG_CALENDAR_SUCCESSOR: {
    // M5 (ADR-0037) lands per-activity calendars, so a relationship's lag can resolve on the
    // SUCCESSOR's calendar (distinct from the predecessor's / the plan's) — the differential is
    // now runnable: turning per-activity calendars + successor-lag on moves dates vs the baseline.
    runnable: true,
    reason: '',
  },
  S06_LAG_CALENDAR_24H: {
    // M3 wired the 24-Hour (elapsed) per-relationship lag calendar (ADR-0036 §6).
    runnable: true,
    reason: '',
  },
  S07_LONGEST_PATH: {
    runnable: false,
    reason: 'needs the longest-path critical definition (ADR-0035 §17, M6)',
  },
  S08_OPEN_ENDS_CRITICAL: {
    runnable: false,
    reason: 'needs the make-open-ends-critical option (ADR-0035 §20, M6)',
  },
  S09_IGNORE_EXTERNAL: {
    runnable: false,
    reason: 'needs an external/multi-project relationship model (not on the current ladder)',
  },
  S10_LEVELLED: {
    runnable: false,
    reason: 'needs resource levelling (ADR-0035 §21–§23, M7 — deferred)',
  },
  S11_MULTIPLE_FLOAT_PATHS: {
    runnable: false,
    reason: 'needs multiple-float-path analysis (ADR-0035 §19, M6)',
  },
  S12_EXPECTED_FINISH_OFF: {
    runnable: false,
    reason: 'needs expected-finish handling on progressed activities (ADR-0035 §9, M4)',
  },
  S13_TOTAL_FLOAT_START: {
    runnable: false,
    reason: 'needs the total-float-as-start/smallest option (ADR-0035 §18, M6)',
  },
};

/** A scenario run: the engine output when runnable, else the reason it is deferred. */
export type ScenarioRun =
  | { ran: true; scenarioId: string; output: EngineOutput }
  | { ran: false; scenarioId: string; todo: string };

/**
 * Run a scenario if today's engine can represent it, else return its `todo`. Only
 * S01 runs: it strips actuals and anchors the data date at the project's planned
 * start, so the progress-free engine sees a clean unprogressed network.
 */
export function runScenario(fixture: ConformanceFixture, scenarioId: string): ScenarioRun {
  const support = SCENARIO_SUPPORT[scenarioId];
  if (!support) return { ran: false, scenarioId, todo: `unknown scenario "${scenarioId}"` };
  if (!support.runnable) return { ran: false, scenarioId, todo: support.reason };

  // Anchor at planned start (S01's override sets data_date = planned_start and strips all
  // actuals — which the adapter does by construction, since the engine ignores progress).
  const dataDate = toCalendarDay(fixture.project.planned_start);
  // Each differential flips exactly one option vs the S01 baseline (all-plan-calendar), so
  // `resultsDiffer(Sx, S01)` proves that option is wired (ADR-0034 §2):
  //   S06 → the 24-Hour per-relationship lag calendar (elapsed lag).
  //   S05 → per-ACTIVITY calendars + relationship lag resolved on the SUCCESSOR's calendar (M5).
  const honorLagCalendars = scenarioId === 'S06_LAG_CALENDAR_24H';
  const honorActivityCalendars = scenarioId === 'S05_LAG_CALENDAR_SUCCESSOR';
  const relationshipLagCalendar =
    scenarioId === 'S05_LAG_CALENDAR_SUCCESSOR' ? ('SUCCESSOR' as const) : ('PLAN' as const);
  const { activities, edges, options } = adaptFixture(fixture, {
    dataDate,
    honorLagCalendars,
    honorActivityCalendars,
    relationshipLagCalendar,
  });
  return { ran: true, scenarioId, output: computeSchedule(activities, edges, options) };
}

/**
 * Whether two engine outputs assign **different dates** to any shared activity —
 * the differential predicate ("flip an option, dates must move"). Compares the
 * pure early/late dates per activity id; ignores activities absent from either
 * side. Used once a second scenario becomes runnable (M2+).
 */
export function resultsDiffer(a: EngineOutput, b: EngineOutput): boolean {
  const index = new Map(b.results.map((r) => [r.activityId, r]));
  for (const left of a.results) {
    const right = index.get(left.activityId);
    if (!right) continue;
    if (
      left.earlyStart !== right.earlyStart ||
      left.earlyFinish !== right.earlyFinish ||
      left.lateStart !== right.lateStart ||
      left.lateFinish !== right.lateFinish
    ) {
      return true;
    }
  }
  return false;
}
