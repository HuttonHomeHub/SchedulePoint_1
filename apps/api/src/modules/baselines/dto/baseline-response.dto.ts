import { ApiProperty } from '@nestjs/swagger';
import type {
  ActivityType,
  Baseline,
  BaselineActivity,
  PlacementSnapshotLevel as PrismaPlacementSnapshotLevel,
} from '@prisma/client';
import type {
  BaselineActivitySnapshot,
  BaselineDetail,
  BaselineSummary,
  PlacementSnapshotLevel,
} from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';
import { minutesToDays } from '../../activities/day-factor';

/** Day↔minute factor (ADR-0036 §4.2): the frozen duration is minutes, exposed as whole days. */
/**
 * Day-denominated fields use the factor CAPTURED AT FREEZE (ADR-0068 §5), carried on the parent
 * baseline row — never the live calendar's, or a calendar edit would rewrite what a two-year-old
 * baseline reports as its captured durations.
 */

/** A baseline plus a count of its frozen activity rows — the list/summary source shape. */
export type BaselineWithCount = Baseline & { activityCount: number };
/** A baseline with its frozen activity rows embedded — the single-baseline (GET one) source shape. */
export type BaselineWithActivities = Baseline & { activities: BaselineActivity[] };

/** Public representation of a baseline (list shape — no snapshot rows embedded). */
export class BaselineResponseDto implements BaselineSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "Whether this is the plan's active comparison baseline." })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', description: 'When the snapshot was frozen.' })
  capturedAt!: string;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: "The plan's start (YYYY-MM-DD) at capture, or null.",
  })
  dataDate!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: "The plan's latest inclusive finish (YYYY-MM-DD) at capture, or null.",
  })
  capturedProjectFinish!: string | null;

  @ApiProperty({ description: 'How many activity snapshots the baseline froze.' })
  activityCount!: number;

  @ApiProperty({
    enum: ['NONE', 'FULL'],
    description:
      'What this capture froze of the placement (placement-baseline-variance, amending ' +
      "ADR-0025). 'NONE' for every baseline captured before api-v0.70.0 — the pure-network " +
      "dates only. 'FULL' after — plus placedStart/placedFinish/visualStart on each snapshot " +
      'row. Decides which dates GET …/baselines/variance compares against this baseline; see ' +
      'that route’s `meta.basis`.',
  })
  placementSnapshotLevel!: PlacementSnapshotLevel;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: Baseline, activityCount: number): BaselineResponseDto {
    return {
      id: entity.id,
      planId: entity.planId,
      name: entity.name,
      isActive: entity.isActive,
      capturedAt: entity.capturedAt.toISOString(),
      dataDate: entity.dataDate ? formatCalendarDate(entity.dataDate) : null,
      capturedProjectFinish: entity.capturedProjectFinish
        ? formatCalendarDate(entity.capturedProjectFinish)
        : null,
      activityCount,
      placementSnapshotLevel: entity.placementSnapshotLevel,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/** Public representation of one frozen activity snapshot inside a baseline. */
export class BaselineActivitySnapshotResponseDto implements BaselineActivitySnapshot {
  @ApiProperty({ format: 'uuid', description: 'The activity this row was captured from.' })
  sourceActivityId!: string;

  @ApiProperty({ nullable: true, type: String })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  type!: ActivityType;

  @ApiProperty()
  durationDays!: number;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  baselineStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  baselineFinish!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  lateStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  lateFinish!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  totalFloat!: number | null;

  @ApiProperty()
  isCritical!: boolean;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'The frozen placed span — where the bar actually sat at capture (placement-baseline-' +
      "variance). Meaningful only when the parent baseline's placementSnapshotLevel is FULL; " +
      'a null there means the plan had not been calculated at capture. On a NONE baseline ' +
      'this is null because nothing was recorded. Read the level; never infer it from the null.',
  })
  placedStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  placedFinish!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      "The planner's own frozen hand-placement, distinct from placedStart/placedFinish: this " +
      'is the input the planner gave, those are the engine’s output from it plus the ' +
      'network. Null on a FULL baseline means the activity was never hand-placed at capture ' +
      '— the common case. Null on a NONE baseline means “not recorded”.',
  })
  visualStart!: string | null;

  /**
   * `hoursPerDayMinutes` is the PARENT baseline's frozen factor (ADR-0068 §5), passed in rather
   * than read from the live calendar — a snapshot whose reported durations move when someone edits
   * a calendar is not a snapshot.
   */
  static from(
    entity: BaselineActivity,
    hoursPerDayMinutes: number,
  ): BaselineActivitySnapshotResponseDto {
    return {
      sourceActivityId: entity.sourceActivityId,
      code: entity.code,
      name: entity.name,
      type: entity.type,
      // Frozen in working-minutes (ADR-0036); the public field stays whole working days.
      durationDays: minutesToDays(entity.durationMinutes, hoursPerDayMinutes),
      baselineStart: entity.baselineStart ? formatCalendarDate(entity.baselineStart) : null,
      baselineFinish: entity.baselineFinish ? formatCalendarDate(entity.baselineFinish) : null,
      lateStart: entity.lateStart ? formatCalendarDate(entity.lateStart) : null,
      lateFinish: entity.lateFinish ? formatCalendarDate(entity.lateFinish) : null,
      totalFloat: entity.totalFloat,
      isCritical: entity.isCritical,
      // The frozen PLACEMENT (placement-baseline-variance). All three null is the commonest
      // real capture, not an empty placeholder — see the field docblocks above.
      placedStart: entity.placedStart ? formatCalendarDate(entity.placedStart) : null,
      placedFinish: entity.placedFinish ? formatCalendarDate(entity.placedFinish) : null,
      visualStart: entity.visualStart ? formatCalendarDate(entity.visualStart) : null,
    };
  }
}

/** A baseline with its frozen activity snapshots embedded (the single-baseline read). */
export class BaselineDetailResponseDto extends BaselineResponseDto implements BaselineDetail {
  @ApiProperty({ type: BaselineActivitySnapshotResponseDto, isArray: true })
  activities!: BaselineActivitySnapshotResponseDto[];

  static fromDetail(entity: BaselineWithActivities): BaselineDetailResponseDto {
    return {
      ...BaselineResponseDto.from(entity, entity.activities.length),
      activities: entity.activities.map((a) =>
        BaselineActivitySnapshotResponseDto.from(a, entity.hoursPerDayMinutes),
      ),
    };
  }
}

/**
 * Lock-step check (`schema.prisma`'s own `PlacementSnapshotLevel` docblock demands it "when
 * the comparison surfaces it" — `placement-baseline-variance` is that moment): Prisma's
 * generated enum and `@repo/types`'s union must describe exactly the same set of values.
 * `MutuallyAssignable` evaluates to `false` the moment either side gains a member the other
 * lacks, and assigning `true` to a `false`-typed const then fails to compile — never
 * silently, and never only at runtime. Exported (rather than a bare unread local) so
 * `noUnusedLocals` does not itself have to be told to look away from the one line whose job
 * is to be looked at.
 */
type MutuallyAssignable<A, B> = A extends B ? (B extends A ? true : false) : false;
export const _placementSnapshotLevelLockStep: MutuallyAssignable<
  PrismaPlacementSnapshotLevel,
  PlacementSnapshotLevel
> = true;
