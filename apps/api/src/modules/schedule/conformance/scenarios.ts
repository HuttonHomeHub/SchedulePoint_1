import type { ConformanceFixture } from '@repo/engine-conformance';

import { computeSchedule } from '../engine';
import type { EngineOutput, ProgressMode } from '../engine';

import { adaptFixture, computeLeveledSchedule } from './adapter';
import { toCalendarDay } from './type-map';

/**
 * The progressed scenarios (M2, ADR-0035 §1) and the recalc mode each flips. Presence in this map
 * is what makes a scenario feed the fixture's actuals at the data date; the others run the clean
 * unprogressed network at the planned start.
 */
const PROGRESS_MODE_BY_SCENARIO: Record<string, ProgressMode> = {
  S02_PROGRESSED_RETAINED_LOGIC: 'RETAINED_LOGIC',
  S03_PROGRESS_OVERRIDE: 'PROGRESS_OVERRIDE',
  S04_ACTUAL_DATES: 'ACTUAL_DATES',
  // S12 runs the same progressed Retained-Logic network as S02, but with the Expected-Finish option
  // ON — so `resultsDiffer(S12, S02)` isolates exactly that option (ADR-0035 §9, M4).
  S12_EXPECTED_FINISH_OFF: 'RETAINED_LOGIC',
};

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
  // M2 (ADR-0035 §1–§2) landed progress ingestion + the data-date floor + the three recalc modes,
  // so the progressed scenarios run as differentials: each feeds the fixture's actuals at the data
  // date (2026-03-02) and flips one recalc mode, moving dates vs the unprogressed S01 baseline.
  S02_PROGRESSED_RETAINED_LOGIC: { runnable: true, reason: '' },
  S03_PROGRESS_OVERRIDE: { runnable: true, reason: '' },
  S04_ACTUAL_DATES: { runnable: true, reason: '' },
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
    // M6-F2 (ADR-0035 §17–§20) landed the Longest-Path critical definition. S07 runs the same
    // unprogressed network as S01 but with `criticalDefinition: LONGEST_PATH`, so the DATES are
    // identical while the CRITICAL SET differs (the fixture's open-ended negative-float A12700 is
    // critical under TF ≤ 0 but not on the longest path) — a criticality-only differential.
    runnable: true,
    reason: '',
  },
  S08_OPEN_ENDS_CRITICAL: {
    // M6-F4 (ADR-0035 §20) landed the make-open-ends-critical option. S08 runs the same unprogressed
    // network as S01 with `makeOpenEndsCritical: true`, so the DATES are identical while the CRITICAL
    // SET gains the open ends (the fixture's A9500/A3900/A12700) — a criticality-only differential.
    runnable: true,
    reason: '',
  },
  S09_IGNORE_EXTERNAL: {
    runnable: false,
    reason: 'needs an external/multi-project relationship model (not on the current ladder)',
  },
  S10_LEVELLED: {
    // M7 (ADR-0041 / ADR-0035 §28) landed the opt-in resource-levelling second pass. S10 runs the
    // same unprogressed network as S01 with levelling ON, so the pure early/late/float layer is
    // byte-identical while over-allocations (NL-CRANE600 A6100/A6200, NL-HYDROPUMP A7700/A7730) are
    // serialised into a leveled overlay — a leveled-date differential (assert on the overlay, not
    // `resultsDiffer`, which compares only the untouched pure layer).
    runnable: true,
    reason: '',
  },
  S11_MULTIPLE_FLOAT_PATHS: {
    // M6-F6 (ADR-0035 §19) landed `computeFloatPaths`. S11 runs the plain unprogressed network like
    // S01; the float-path analysis into the target (A12500) is a SEPARATE read-only pass asserted for
    // its path-SHAPE (contiguous chains, path 0 driving, non-decreasing relative float) in the spec.
    runnable: true,
    reason: '',
  },
  S12_EXPECTED_FINISH_OFF: {
    // M4 (ADR-0035 §9) landed Expected Finish: an incomplete activity's remaining work is resized to
    // its expected finish when the option is on. S12 runs the S02 progressed network with the option
    // ON, so it differs from S02 (the fixture's A6200 lands on its expected finish, not its logic finish).
    runnable: true,
    reason: '',
  },
  S13_TOTAL_FLOAT_START: {
    // The total-float MODE option is implemented (M6-F3, ADR-0035 §18) and changes a **progressed**
    // activity's float. But S13's specific divergence does NOT reproduce here — and by design: it
    // measures total float on the activity's OWN calendar (ADR-0037 §4, P6-total-float), where
    // advancing both the start and finish by the duration preserves the working-time gap, so start-
    // and finish-float coincide for every UNPROGRESSED activity (verified: 0/4 of the fixture's named
    // activities diverge). P6's start-vs-finish split comes from measuring the two sides on different
    // NEIGHBOUR calendars — a multi-calendar-measurement artefact we deliberately don't reproduce.
    runnable: false,
    reason:
      "own-calendar float (ADR-0037 §4) makes start-float == finish-float for unprogressed work, so S13's mixed-calendar divergence doesn't reproduce (documented semantic difference, ADR-0035 §18, M6-F3)",
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

  // The progressed scenarios (M2) run AT THE FIXTURE'S DATA DATE with the actuals fed in; the rest
  // anchor at the planned start on the clean unprogressed network (S01's convention).
  const progressMode = PROGRESS_MODE_BY_SCENARIO[scenarioId];
  const honorProgress = progressMode !== undefined;
  const dataDate = toCalendarDay(
    honorProgress ? fixture.project.data_date : fixture.project.planned_start,
  );
  // Each differential flips exactly one option vs the S01 baseline (all-plan-calendar), so
  // `resultsDiffer(Sx, S01)` proves that option is wired (ADR-0034 §2):
  //   S06 → the 24-Hour per-relationship lag calendar (elapsed lag).
  //   S05 → per-ACTIVITY calendars + relationship lag resolved on the SUCCESSOR's calendar (M5).
  //   S02/S03/S04 → progress ingestion at the data date + the retained/override/actual-dates mode (M2).
  const honorLagCalendars = scenarioId === 'S06_LAG_CALENDAR_24H';
  const honorActivityCalendars = scenarioId === 'S05_LAG_CALENDAR_SUCCESSOR';
  const relationshipLagCalendar =
    scenarioId === 'S05_LAG_CALENDAR_SUCCESSOR' ? ('SUCCESSOR' as const) : ('PLAN' as const);
  // S12 flips the Expected-Finish option on (ADR-0035 §9, M4); every other scenario leaves it off.
  const useExpectedFinishDates = scenarioId === 'S12_EXPECTED_FINISH_OFF';
  // S07 flips the critical DEFINITION to Longest Path (ADR-0035 §17–§20, M6-F2). It changes only which
  // activities are flagged critical, never the dates — so it is asserted with `criticalSetDiffers`.
  const criticalDefinition =
    scenarioId === 'S07_LONGEST_PATH' ? ('LONGEST_PATH' as const) : undefined;
  // S08 flips make-open-ends-critical on (ADR-0035 §20, M6-F4). Like S07 it changes only the critical
  // set (the open ends), never the dates — asserted with `criticalSetDiffers`.
  const makeOpenEndsCritical = scenarioId === 'S08_OPEN_ENDS_CRITICAL' ? true : undefined;
  // S10 flips resource levelling on (ADR-0041, M7): the adapter builds the demand model and
  // `computeLeveledSchedule` runs the opt-in second pass after the network pass. Off for every other
  // scenario (the byte-identical parity path).
  const honorLevelling = scenarioId === 'S10_LEVELLED';
  const network = adaptFixture(fixture, {
    dataDate,
    honorLagCalendars,
    honorActivityCalendars,
    honorProgress,
    relationshipLagCalendar,
    useExpectedFinishDates,
    honorLevelling,
  });
  if (honorLevelling) {
    // The levelling pass consumes the network output and merges its additive overlay; S10 needs none of
    // the other one-option flips, so the adapted options carry through unchanged.
    return { ran: true, scenarioId, output: computeLeveledSchedule(network) };
  }
  return {
    ran: true,
    scenarioId,
    output: computeSchedule(network.activities, network.edges, {
      ...network.options,
      ...(progressMode ? { progressMode } : {}),
      ...(criticalDefinition ? { criticalDefinition } : {}),
      ...(makeOpenEndsCritical ? { makeOpenEndsCritical } : {}),
    }),
  };
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

/**
 * Whether two engine outputs flag a **different set of critical activities** — the criticality-only
 * differential (M6). Some options (S07 Longest Path, S08 open-ends) change only which activities are
 * critical, not their dates, so `resultsDiffer` (dates) would miss them. This is kept SEPARATE from
 * the date predicate (ADR-0034 §2, F2.T3) so a real date regression can never be masked by a
 * criticality change: a wired criticality option asserts `criticalSetDiffers && !resultsDiffer`.
 */
export function criticalSetDiffers(a: EngineOutput, b: EngineOutput): boolean {
  const index = new Map(b.results.map((r) => [r.activityId, r]));
  for (const left of a.results) {
    const right = index.get(left.activityId);
    if (!right) continue;
    if (left.isCritical !== right.isCritical) return true;
  }
  return false;
}

/**
 * Whether the resource-levelling overlay moved any activity off its pure-network position — the
 * **levelling differential** ("flip levelling on, the leveled dates must move"). `resultsDiffer`
 * compares only the pure `early*`/`late*` layer, which levelling **never recomputes** (ADR-0041 §3 / Q2),
 * so on a leveled output it correctly reports NO difference; this predicate instead compares each
 * participant's `leveledStart`/`leveledFinish` against its `earlyStart`/`earlyFinish`. Kept separate for
 * the same reason `criticalSetDiffers` is (ADR-0034 §2) — a date regression can never mask it.
 */
export function leveledResultsDiffer(output: EngineOutput): boolean {
  return output.results.some(
    (r) =>
      r.leveledStart != null &&
      (r.leveledStart !== r.earlyStart || r.leveledFinish !== r.earlyFinish),
  );
}
