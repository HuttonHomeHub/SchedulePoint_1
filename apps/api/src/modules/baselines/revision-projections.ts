import type {
  ActivityType,
  ConstraintType,
  DependencyType,
  LagCalendarSource,
  SwimlaneLaneBasis,
} from '@prisma/client';
import type { RevisionGhostFrozenLane } from '@repo/types';

import { formatCalendarDate } from '../../common/validation/calendar-date';

import type { RevisionEdge, RevisionRow } from './revision-delta';
import type { FrozenGhostCode, FrozenGhostSwimlanes } from './revision-ghosts';

/**
 * **The four projections that put a frozen side and a live side into ONE shape**, extracted so that
 * both comparison routes read the same definition.
 *
 * `computeRevisionDelta`'s own docblock records that it cannot tell which side came from
 * `baseline_activities` and which from `activities` — and that property is what made
 * baseline-vs-baseline free at ADR-0125 and what makes a cross-plan comparison a change of the
 * correlation key and nothing else. It is a property of THESE FUNCTIONS: the delta cannot tell the
 * sides apart precisely because these mappings converge before it is called.
 *
 * **They were closures inside `ScheduleService.revisionCompare`**, which was correct while it was
 * the only caller. A second caller would have copied them, and the copy would drift — the ADR-0065
 * `routeOrthogonal` argument, whose sharp half is that **the drift would be invisible**: each
 * projection looks right alone, and only a reader comparing a same-plan report against a cross-plan
 * one over the same activity would ever see one side missing a field the other carries. That is
 * exactly the class of defect ADR-0125's own M8 review found here once already. A structural test
 * asserts there is one definition.
 *
 * **Pure.** `computeSchedule` is not called, not imported and not reachable from this module's
 * graph — ADR-0125 D1's strong form, and the reason this file is named `revision-*`:
 * `revision-sources.ts` derives its roster by that prefix, so both structural gates cover it the
 * moment it exists, with no roster to edit and therefore no roster to forget.
 */

/** A calendar-day (or null) as a `YYYY-MM-DD` string — what both tables persist. */
export const revisionDate = (value: Date | null): string | null =>
  value ? formatCalendarDate(value) : null;

/** The columns a snapshot row must carry for {@link frozenRevisionSide} to project it. */
export interface FrozenRevisionRowInput {
  readonly sourceActivityId: string;
  readonly code: string | null;
  readonly name: string;
  readonly type: ActivityType;
  readonly durationMinutes: number;
  readonly isCritical: boolean;
  readonly totalFloat: number | null;
  readonly totalFloatMinutes: number | null;
  readonly placedStart: Date | null;
  readonly placedFinish: Date | null;
  readonly laneIndex: number;
  readonly parentId: string | null;
  readonly calendarId: string | null;
  readonly constraintType: ConstraintType | null;
  readonly constraintDate: Date | null;
  readonly secondaryConstraintType: ConstraintType | null;
  readonly secondaryConstraintDate: Date | null;
  readonly percentComplete: number;
  readonly actualStart: Date | null;
  readonly actualFinish: Date | null;
  /** The activity's own swimlane at capture (schema-design §13.3); null means "none". */
  readonly swimlaneId: string | null;
}

/** One `baseline_activity_swimlane_lanes` row, as {@link frozenGhostSwimlanes} projects it. */
export interface FrozenLaneInput {
  readonly sourceActivityId: string;
  readonly basis: SwimlaneLaneBasis;
  readonly swimlaneId: string | null;
  readonly summaryActivityId: string | null;
  readonly wbsLevel: number | null;
  readonly laneIndex: number;
  readonly laneUpdatedAt: Date;
}

/** The columns a live activity row must carry for {@link liveRevisionSide} to project it. */
export interface LiveRevisionRowInput {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly type: ActivityType;
  readonly durationMinutes: number;
  readonly isCritical: boolean;
  readonly totalFloat: number | null;
  readonly totalFloatMinutes: number | null;
  readonly earlyStart: Date | null;
  readonly earlyFinish: Date | null;
  readonly visualEffectiveStart: Date | null;
  readonly visualEffectiveFinish: Date | null;
  readonly laneIndex: number;
  readonly parentId: string | null;
  readonly calendarId: string | null;
  readonly constraintType: ConstraintType | null;
  readonly constraintDate: Date | null;
  readonly secondaryConstraintType: ConstraintType | null;
  readonly secondaryConstraintDate: Date | null;
  readonly percentComplete: number;
  readonly actualStart: Date | null;
  readonly actualFinish: Date | null;
}

/**
 * A **frozen** side — a baseline's snapshot rows. The dates are the frozen PLACED span: the bar as
 * it was drawn at capture (ADR-0148).
 */
export const frozenRevisionSide = (rows: readonly FrozenRevisionRowInput[]): RevisionRow[] =>
  rows.map((r) => ({
    activityId: r.sourceActivityId,
    code: r.code,
    name: r.name,
    type: r.type,
    durationMinutes: r.durationMinutes,
    isCritical: r.isCritical,
    totalFloatDays: r.totalFloat,
    totalFloatMinutes: r.totalFloatMinutes,
    // `earlyStart`/`earlyFinish` carry the PLACED dates, and the read states so in `datesBasis`.
    // Renaming these to basis-neutral names is the intended follow-up (`docs/TECH_DEBT.md` #405).
    earlyStart: revisionDate(r.placedStart),
    earlyFinish: revisionDate(r.placedFinish),
    laneIndex: r.laneIndex,
    parentId: r.parentId,
    calendarId: r.calendarId,
    constraintType: r.constraintType,
    constraintDate: revisionDate(r.constraintDate),
    secondaryConstraintType: r.secondaryConstraintType,
    secondaryConstraintDate: revisionDate(r.secondaryConstraintDate),
    percentComplete: r.percentComplete,
    actualStart: revisionDate(r.actualStart),
    actualFinish: revisionDate(r.actualFinish),
  }));

/**
 * The code half of a ghost's frozen facts. Passed ONLY for a baseline whose frozen source was
 * `ACTIVITY_CODE` and whose `code_snapshot_level` is `SWIMLANE_TYPE`; its absence is the "count, do
 * not draw" case for every other baseline. An activity with no placement row froze no value and no
 * lane, which the entry says as nulls rather than leaving the code absent.
 */
export interface FrozenCodeInput {
  readonly typeId: string;
  readonly placements: readonly {
    readonly sourceActivityId: string;
    readonly codeValueId: string | null;
    readonly codeLaneIndex: number | null;
  }[];
}

/**
 * **A baseline's frozen swimlane facts, for the ghosts of removed work** (schema-design §13.6).
 *
 * Every row of an activity is carried (one per basis) and none is chosen: the choice depends on the
 * plan's source today, which is the client's derivation, not a fact this seam may freeze.
 */
export const frozenGhostSwimlanes = (
  rows: readonly FrozenRevisionRowInput[],
  lanes: readonly FrozenLaneInput[],
  codes?: FrozenCodeInput,
): FrozenGhostSwimlanes => {
  const lanesByActivity = new Map<string, RevisionGhostFrozenLane[]>();
  for (const l of lanes) {
    const list = lanesByActivity.get(l.sourceActivityId) ?? [];
    list.push({
      basis: l.basis,
      swimlaneId: l.swimlaneId,
      summaryActivityId: l.summaryActivityId,
      wbsLevel: l.wbsLevel,
      laneIndex: l.laneIndex,
      laneUpdatedAt: l.laneUpdatedAt.toISOString(),
    });
    lanesByActivity.set(l.sourceActivityId, list);
  }
  const codesByActivity = new Map<string, FrozenGhostCode>(
    codes === undefined
      ? []
      : codes.placements.map((p) => [
          p.sourceActivityId,
          { typeId: codes.typeId, valueId: p.codeValueId, laneIndex: p.codeLaneIndex },
        ]),
  );
  return new Map(
    rows.map((r) => [
      r.sourceActivityId,
      {
        swimlaneId: r.swimlaneId,
        lanes: lanesByActivity.get(r.sourceActivityId) ?? [],
        ...(codes === undefined
          ? {}
          : {
              code: codesByActivity.get(r.sourceActivityId) ?? {
                typeId: codes.typeId,
                valueId: null,
                laneIndex: null,
              },
            }),
      },
    ]),
  );
};

/**
 * A **live** side — the plan's own persisted columns: the effective-Visual span, which is where
 * the bar is drawn (ADR-0148), falling back to the earliest date only for a row no recalculation
 * has written one for.
 */
export const liveRevisionSide = (rows: readonly LiveRevisionRowInput[]): RevisionRow[] =>
  rows.map((r) => ({
    activityId: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    durationMinutes: r.durationMinutes,
    isCritical: r.isCritical,
    totalFloatDays: r.totalFloat,
    totalFloatMinutes: r.totalFloatMinutes,
    earlyStart: revisionDate(r.visualEffectiveStart ?? r.earlyStart),
    earlyFinish: revisionDate(r.visualEffectiveFinish ?? r.earlyFinish),
    laneIndex: r.laneIndex,
    parentId: r.parentId,
    calendarId: r.calendarId,
    constraintType: r.constraintType,
    constraintDate: revisionDate(r.constraintDate),
    secondaryConstraintType: r.secondaryConstraintType,
    secondaryConstraintDate: revisionDate(r.secondaryConstraintDate),
    percentComplete: r.percentComplete,
    actualStart: revisionDate(r.actualStart),
    actualFinish: revisionDate(r.actualFinish),
  }));

/** The columns a snapshot dependency must carry. The frozen side names its columns `source_*`. */
export interface FrozenRevisionEdgeInput {
  readonly sourceDependencyId: string;
  readonly sourcePredecessorId: string;
  readonly sourceSuccessorId: string;
  readonly type: DependencyType;
  readonly lagMinutes: number;
  readonly lagCalendar: LagCalendarSource;
}

/** The columns a live dependency must carry. */
export interface LiveRevisionEdgeInput {
  readonly id: string;
  readonly predecessorId: string;
  readonly successorId: string;
  readonly type: DependencyType;
  readonly lagMinutes: number;
  readonly lagCalendar: LagCalendarSource;
}

/**
 * Both sides' edges project to ONE shape, exactly as their activities do. The frozen side names its
 * columns `source_*` and the live side does not; that is the whole difference.
 */
export const frozenRevisionEdges = (rows: readonly FrozenRevisionEdgeInput[]): RevisionEdge[] =>
  rows.map((e) => ({
    dependencyId: e.sourceDependencyId,
    predecessorId: e.sourcePredecessorId,
    successorId: e.sourceSuccessorId,
    type: e.type,
    lagMinutes: e.lagMinutes,
    lagCalendar: e.lagCalendar,
  }));

export const liveRevisionEdges = (rows: readonly LiveRevisionEdgeInput[]): RevisionEdge[] =>
  rows.map((e) => ({
    dependencyId: e.id,
    predecessorId: e.predecessorId,
    successorId: e.successorId,
    type: e.type,
    lagMinutes: e.lagMinutes,
    lagCalendar: e.lagCalendar,
  }));
