import type { ActivityType as FixtureActivityType } from '@repo/engine-conformance';
import type { ActivityType, ConstraintType } from '@repo/types';

/**
 * Pure fixture→engine vocabulary mapping for the conformance harness (ADR-0034).
 *
 * The conformance fixture speaks **P6 vocabulary** (`TASK_DEPENDENT`,
 * `START_ON_OR_AFTER`, …); SchedulePoint's engine speaks its own domain enums
 * (`TASK`, `SNET`, …). This module is the **single seam** where the two are
 * translated, and — crucially — it is **honest about what today's engine cannot
 * represent**: an unsupported value returns `{ supported: false, reason }` rather
 * than being silently coerced into a lookalike. The adapter (`adapter.ts`) turns
 * those "unsupported" verdicts into skipped rows + a report, never fabricated
 * dates (ADR-0034 §2, §3).
 *
 * As capability milestones land (M1/M4/M5), values move from unsupported to
 * mapped here, in the same PR that flips the matrix row.
 */

/** A translation that either yields an engine value or explains why it can't. */
export type MapResult<T> = { supported: true; value: T } | { supported: false; reason: string };

/**
 * The fixture's P6 activity types that today's day-granular engine can schedule.
 * `RESOURCE_DEPENDENT` (resource-calendar driven, ADR-0035 §23), `LEVEL_OF_EFFORT`
 * (span-derived, §21) and `WBS_SUMMARY` (roll-up, §24) are **not** — they are
 * excluded with a reason until their owning milestone builds them.
 */
export function mapActivityType(type: FixtureActivityType): MapResult<ActivityType> {
  switch (type) {
    case 'TASK_DEPENDENT':
      return { supported: true, value: 'TASK' };
    case 'START_MILESTONE':
      return { supported: true, value: 'START_MILESTONE' };
    case 'FINISH_MILESTONE':
      return { supported: true, value: 'FINISH_MILESTONE' };
    case 'RESOURCE_DEPENDENT':
      return {
        supported: false,
        reason: 'resource-dependent scheduling is not implemented (ADR-0035 §23, M5)',
      };
    case 'LEVEL_OF_EFFORT':
      return {
        supported: false,
        reason: 'level-of-effort span derivation is not implemented (ADR-0035 §21, M5)',
      };
    case 'WBS_SUMMARY':
      return {
        supported: false,
        reason: 'WBS-summary roll-up is not implemented (ADR-0035 §24)',
      };
  }
}

/**
 * The fixture's P6 constraint vocabulary → the engine's constraint kinds. The
 * four moderate "on-or-after / on-or-before" kinds map 1:1; `*_ON` map to the
 * engine's mandatory-equivalent pins (`MSO`/`MFO`); the two hard mandatory kinds
 * pass through (the engine currently **parks** them as `MSO`/`MFO`, ADR-0023 §6,
 * un-parked by ADR-0035 §7 in M4). `AS_LATE_AS_POSSIBLE` is **not** a date
 * constraint the engine models yet (ADR-0035 §11, M6) — dropped with a reason.
 */
export function mapConstraintType(type: string): MapResult<ConstraintType> {
  switch (type) {
    case 'START_ON_OR_AFTER':
      return { supported: true, value: 'SNET' };
    case 'START_ON_OR_BEFORE':
      return { supported: true, value: 'SNLT' };
    case 'FINISH_ON_OR_AFTER':
      return { supported: true, value: 'FNET' };
    case 'FINISH_ON_OR_BEFORE':
      return { supported: true, value: 'FNLT' };
    case 'START_ON':
      return { supported: true, value: 'MSO' };
    case 'FINISH_ON':
      return { supported: true, value: 'MFO' };
    case 'MANDATORY_START':
      return { supported: true, value: 'MANDATORY_START' };
    case 'MANDATORY_FINISH':
      return { supported: true, value: 'MANDATORY_FINISH' };
    case 'AS_LATE_AS_POSSIBLE':
      return {
        supported: false,
        reason: 'as-late-as-possible is not a modelled constraint (ADR-0035 §11, M6)',
      };
    default:
      return { supported: false, reason: `unknown constraint type "${type}"` };
  }
}

/**
 * The fixture stores dates as site-local ISO datetimes (`2026-03-02T08:00:00`);
 * the engine's calendar port works in `YYYY-MM-DD` days. Take the date part —
 * the **time-of-day is discarded**, which is exactly the fidelity ADR-0036 (M1)
 * restores. Callers record this as an approximation in their report.
 */
export function toCalendarDay(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}
