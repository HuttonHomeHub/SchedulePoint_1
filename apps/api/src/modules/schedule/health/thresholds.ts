import type { HealthMetricId, HealthThreshold } from '@repo/types';
import { HEALTH_METRIC_IDS } from '@repo/types';

/**
 * The fourteen metrics' display identity, in DCMA ordinal order. Derived from the id tuple so the
 * two cannot disagree about membership or order — only about names, which the totality test pins.
 */
export const HEALTH_METRICS: readonly {
  id: HealthMetricId;
  ordinal: number;
  name: string;
}[] = HEALTH_METRIC_IDS.map((id, i) => ({
  id,
  ordinal: i + 1,
  name: (
    {
      MISSING_LOGIC: 'Missing logic',
      LEADS: 'Leads',
      LAGS: 'Lags',
      RELATIONSHIP_TYPES: 'Relationship types',
      HARD_CONSTRAINTS: 'Hard constraints',
      HIGH_FLOAT: 'High float',
      NEGATIVE_FLOAT: 'Negative float',
      HIGH_DURATION: 'High duration',
      INVALID_DATES: 'Invalid dates',
      RESOURCES: 'Resources',
      MISSED_ACTIVITIES: 'Missed activities',
      CRITICAL_PATH_TEST: 'Critical Path Test',
      CPLI: 'Critical Path Length Index',
      BEI: 'Baseline Execution Index',
    } as const
  )[id],
}));

/**
 * The single table of thresholds — the ONE place a judging number is stated (G3: the web feature
 * carries no threshold literal; the payload carries these). Total by the compiler: adding a metric
 * without deciding its threshold is a typecheck failure, not a metric that renders blank.
 *
 * `null` is a decision, not an absence: metric 10 is INFORMATIONAL (DCMA reports it with no
 * pass/fail) and metric 12 is an integrity test with no numeric bar. Neither may carry a
 * number-shaped thing that is not a number.
 *
 * Sources, per metric (DCMA 14-Point Assessment, the public de-facto standard):
 * 1 missing logic ≤ 5 % · 2 leads = 0 · 3 lags ≤ 5 % · 4 FS ≥ 90 % · 5 hard constraints ≤ 5 % ·
 * 6 float > 44 working days ≤ 5 % · 7 negative float = 0 · 8 remaining duration > 44 working days
 * ≤ 5 % · 9 invalid dates = 0 · 11 missed ≤ 5 % (DCMA states 5 %) · 13 CPLI ≥ 0.95 · 14 BEI ≥ 0.95.
 *
 * The two "44 working days" metrics compare against SchedulePoint's own day semantics:
 * `activities.total_float` is stored in whole working days on the activity's OWN calendar
 * (schedule.repository.ts converts from engine minutes at write time — confirmed by observation in
 * M0-T1 against a mixed-calendar plan), so metric 6/7 are direct integer comparisons; metric 8
 * converts remaining MINUTES with each activity's own day factor (ADR-0068), never a constant.
 */
export const THRESHOLDS: Readonly<Record<HealthMetricId, HealthThreshold | null>> = {
  MISSING_LOGIC: { kind: 'MAX_PERCENT', value: 5 },
  LEADS: { kind: 'MAX_COUNT', value: 0 },
  LAGS: { kind: 'MAX_PERCENT', value: 5 },
  RELATIONSHIP_TYPES: { kind: 'MIN_PERCENT', value: 90 },
  HARD_CONSTRAINTS: { kind: 'MAX_PERCENT', value: 5 },
  HIGH_FLOAT: { kind: 'MAX_PERCENT', value: 5 },
  NEGATIVE_FLOAT: { kind: 'MAX_COUNT', value: 0 },
  HIGH_DURATION: { kind: 'MAX_PERCENT', value: 5 },
  INVALID_DATES: { kind: 'MAX_COUNT', value: 0 },
  RESOURCES: null,
  MISSED_ACTIVITIES: { kind: 'MAX_PERCENT', value: 5 },
  CRITICAL_PATH_TEST: null,
  CPLI: { kind: 'MIN_RATIO', value: 0.95 },
  BEI: { kind: 'MIN_RATIO', value: 0.95 },
};

/**
 * What "hard" means for metric 5, stated rather than assumed, because SchedulePoint's constraint
 * enum is richer than DCMA's vocabulary (ADR-0023/ADR-0035): a pin (`MSO`/`MFO`), a mandatory pin
 * that breaks logic (`MANDATORY_*`), and a late bound (`SNLT`/`FNLT`) all remove the schedule's
 * freedom to move work later, which is what the metric is about. `SNET`/`FNET` are SOFT — an early
 * bound yields to logic pushing work later — and are deliberately excluded. The SECONDARY slot
 * counts too (ADR-0035 §10): an FNLT hidden there is exactly as hard.
 */
export const HARD_CONSTRAINT_TYPES: ReadonlySet<string> = new Set([
  'MSO',
  'MFO',
  'MANDATORY_START',
  'MANDATORY_FINISH',
  'SNLT',
  'FNLT',
]);

/** DCMA 6/8's bar, in working days on the activity's own calendar. */
export const HIGH_FLOAT_DAYS = 44;
export const HIGH_DURATION_DAYS = 44;

/**
 * Offenders listed per metric before truncation. Travels in the payload as `offenderCap` (the G3
 * rule — the client renders "showing {cap} of {offenderCount}" from the payload, never from a
 * literal of its own).
 */
export const OFFENDER_CAP = 50;

/** Metric 1's decided exclusion rule (CQ-3, 2026-08-27), named in the payload so it is auditable. */
export const MISSING_LOGIC_EXCLUSION_RULE = 'SUMMARIES_AND_TERMINAL_MILESTONES';

/** Metric 10's decided narrowing (spec §3.2), named in the payload for the same reason. */
export const RESOURCES_NARROWING = 'RESOURCE_ASSIGNMENT_ONLY';
