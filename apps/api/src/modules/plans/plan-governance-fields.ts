import type { UpdatePlanDto } from './dto/update-plan.dto';

/**
 * The plan fields whose change is **other people's business** (ADR-0073 family E).
 *
 * Every member of this set alters how the plan **computes** — the data date it schedules from, the
 * calendar it schedules on, the definition of critical, whether levelling runs. Change one and
 * every activity in the plan can re-date, including work owned by people who did not make the
 * change and are not told. That is the blast-radius test, and it is why an ordinary update earns
 * an audit row here when it does not elsewhere.
 *
 * **`name` and `description` are deliberately absent.** A rename changes how nothing computes, and
 * `updated_by` already records who did it. Emitting a governance row for it would put noise in the
 * one feed a reader turns to when "everything moved overnight" needs an explanation.
 *
 * `status` is in, and that is a judgement rather than an obvious call: it does not feed
 * `computeSchedule`, but moving a plan to or from `ACTIVE` changes what the programme it belongs
 * to reports, which is the same class of fact.
 *
 * **One `const` in one place**, read by the producer, the OpenAPI description and the test — the
 * ADR-0065 rule. Two copies of this list would drift, and the drift would be invisible: a field
 * dropped from the producer's copy simply stops being recorded, and nothing says so.
 */
export const PLAN_GOVERNANCE_FIELDS = [
  'plannedStart',
  'schedulingMode',
  'calendarId',
  'status',
  'progressRecalcMode',
  'criticalPathDefinition',
  'criticalFloatThresholdMinutes',
  'totalFloatMode',
  'makeOpenEndsCritical',
  'useExpectedFinishDates',
  'levelResources',
  'levelWithinFloatOnly',
  'ignoreExternalRelationships',
  'eacMethod',
  'currencyCode',
] as const satisfies readonly (keyof UpdatePlanDto)[];

export type PlanGovernanceField = (typeof PLAN_GOVERNANCE_FIELDS)[number];

/**
 * The subset of `before`/`after` that a governance field actually **moved**.
 *
 * Diffs by VALUE, not by presence: a client that resends the whole form — which the plan settings
 * dialog does — sends every field on every save, so keying on "was it in the DTO?" would write a
 * row saying fifteen things changed each time somebody edited one. The audit row must describe
 * what happened, and the honest answer is usually one field.
 *
 * Returns `null` when nothing governance-relevant moved, so the caller writes no row at all rather
 * than an empty one. A name-only PATCH lands here.
 *
 * Dates are compared by their epoch value, because two `Date` objects for the same instant are
 * never `!==`-equal and the naive comparison would report a data-date change on every save.
 */
export function diffGovernanceFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};

  for (const field of PLAN_GOVERNANCE_FIELDS) {
    const was = before[field];
    const now = after[field];
    if (now === undefined || sameValue(was, now)) continue;
    from[field] = was ?? null;
    to[field] = now;
  }

  return Object.keys(to).length === 0 ? null : { before: from, after: to };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  // `null` and `undefined` both mean "not set" on this DTO — `currencyCode: null` clears to the
  // organisation default, and an absent value is the same state. Treating them as different would
  // record a change nobody made.
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  return a === b;
}
