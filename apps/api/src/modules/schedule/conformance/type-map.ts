import type {
  ActivityType as FixtureActivityType,
  FixtureActivity,
} from '@repo/engine-conformance';
import type { ActivityType, ConstraintType, DurationType } from '@repo/types';

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
 * The fixture's P6 activity types that today's engine can schedule. `LEVEL_OF_EFFORT` (span-derived,
 * ADR-0035 §21) and `WBS_SUMMARY` (branch roll-up, §24) are supported (M5-epic F1–F3 / F6–F7).
 * `RESOURCE_DEPENDENT` (resource-calendar driven, §23) is now supported (M7): the engine treats it
 * exactly like a `TASK` for logic, and the adapter resolves its driving resource's calendar as its
 * scheduling calendar (see `adapter.ts`).
 */
export function mapActivityType(type: FixtureActivityType): MapResult<ActivityType> {
  switch (type) {
    case 'TASK_DEPENDENT':
      return { supported: true, value: 'TASK' };
    case 'START_MILESTONE':
      return { supported: true, value: 'START_MILESTONE' };
    case 'FINISH_MILESTONE':
      return { supported: true, value: 'FINISH_MILESTONE' };
    case 'LEVEL_OF_EFFORT':
      // Span-derived hammock (ADR-0035 §21, M5-epic): the engine derives its dates from its SS/FF ties
      // and excludes it from driving/criticality; a no-span LOE is produced-and-flagged (N12).
      return { supported: true, value: 'LEVEL_OF_EFFORT' };
    case 'WBS_SUMMARY':
      // Branch roll-up (ADR-0035 §24, M5-epic F6–F7): a summary carries no logic and the engine derives
      // its dates from the earliest start / latest finish over its `parentId` children, excluding it
      // from driving/criticality/project-finish. The adapter builds the `parentId` tree from `wbs` codes.
      return { supported: true, value: 'WBS_SUMMARY' };
    case 'RESOURCE_DEPENDENT':
      // Resource-calendar driven (ADR-0035 §23 / ADR-0039, M7): identical to a TASK for logic; the
      // adapter substitutes the driving resource's calendar as its scheduling calendar (or flags it
      // driver-missing and falls back), so the type itself maps straight through.
      return { supported: true, value: 'RESOURCE_DEPENDENT' };
  }
}

/**
 * The fixture's P6 duration-type vocabulary → SchedulePoint's `DurationType` (M7 rung 4, ADR-0040).
 * The two enums carry the **same four labels** (`FIXED_DURATION_AND_UNITS_TIME` |
 * `FIXED_DURATION_AND_UNITS` | `FIXED_UNITS` | `FIXED_UNITS_TIME`), so this is a **1:1 total** map — it
 * never fails (unlike `mapActivityType`/`mapConstraintType`, every fixture value is representable). The
 * seam still exists so a future fixture-vs-domain divergence is a typed, single-point change, and so the
 * adapter reads the fixture's `duration_type` through one named vocabulary boundary.
 *
 * Duration types are a **write-boundary** concern (ADR-0040 §3/§6): the engine has no `durationType`
 * field. This mapper feeds the adapter's optional `resolveTriad` derivation (see `adapter.ts`
 * `honorDurationTypes`), which resolves a `durationMinutes` — the engine still reads only that.
 */
export function mapDurationType(type: FixtureActivity['duration_type']): DurationType {
  return type;
}

/**
 * The fixture's P6 constraint vocabulary → the engine's constraint kinds. The
 * four moderate "on-or-after / on-or-before" kinds map 1:1; `*_ON` map to the
 * engine's mandatory-equivalent pins (`MSO`/`MFO`); the two hard mandatory kinds
 * pass through and are honoured as **produce-and-flag** pins (ADR-0035 §7, M4 —
 * no longer parked). `AS_LATE_AS_POSSIBLE` is **not a date constraint** at all: it
 * is a placement preference the adapter maps to the activity's
 * `scheduleAsLateAsPossible` flag (ADR-0035 §11, M4), so it is reported unsupported
 * *as a constraint* here and handled separately in `adapter.ts`.
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
        reason:
          'as-late-as-possible is a placement flag, not a date constraint (mapped to scheduleAsLateAsPossible by the adapter, ADR-0035 §11, M4)',
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
