import { ApiProperty } from '@nestjs/swagger';
import { ActivityStatus, ActivityType, type Activity } from '@prisma/client';

import { formatCalendarDate } from '../../../common/validation/calendar-date';
import { minutesToDays, type WithDayFactor } from '../../activities/day-factor';

/** Day↔minute factor (ADR-0036 §4.2): storage is minutes, the public field stays days. */
/**
 * Day-denominated fields use the activity's effective calendar's working day (ADR-0068), attached
 * by the service — the same factor the member-facing DTO uses, so the two can never report a
 * different number of days for the same activity.
 */

/**
 * Guest read DTO for an activity (ADR-0051 §4, F-M3; widened by ADR-0163) — a DELIBERATELY
 * field-stripped, READ-ONLY projection for the session-less External-Guest surface. It exposes
 * ONLY the schedule + progress fields the guest scope allows: identity (id/code/name/type), the
 * computed CPM dates, the PLACED span (where the bar is drawn — ADR-0163), duration/float/
 * critical, lane position, and the progress trio.
 *
 * EXCLUDED BY CONSTRUCTION (must NEVER appear — no `from` copies them), each for a reason ADR-0163
 * §4.5/§4.6 states rather than assumes:
 * - `visualStart` — the authoring INPUT (which bars a person pinned by hand), not reliably
 *   reconstructible from the effective span (an unplaced successor pushed by a placed predecessor
 *   also draws later than its early start).
 * - `visualConflict`/`visualConflictReason` — the planner's working notes about WHY a placement is
 *   contentious, never shown to a guest; `LATER_THAN_BOUND` would also reveal that a constraint
 *   exists, and constraints are out.
 * - `visualDriftDays`/`remainingFloat` — a float is analysis, not the schedule a share link exists
 *   to show (a guest can only ESTIMATE these from the exposed fields).
 * - cost / Earned-Value / money (budgetedExpense, actualExpense, percentCompleteType,
 *   physicalPercentComplete, accrualType); resources / assignments; baseline / variance; notes;
 *   the levelling overlay (leveled*, levelingPriority, selfOverAllocated); the constraint /
 *   external / expected-finish / duration-type authoring fields; the calendar and WBS parent ids;
 *   audit columns (createdBy/updatedBy/version/createdAt/updatedAt/deletedAt); and any user
 *   identity. See `guest-dto.spec.ts` for the exclusion assertions.
 */
export class GuestActivityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Human-facing code (unique per plan).',
  })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ActivityType })
  type!: ActivityType;

  @ApiProperty({
    description:
      'Working days on the calendar this activity SCHEDULES on (ADR-0068, corrected by #86), ' +
      'rounded from the stored minutes (milestones are 0). For a RESOURCE_DEPENDENT activity that ' +
      'is its driving resource’s calendar rather than its own, and WHICH calendar that is, is ' +
      'deliberately not exposed to a guest (ADR-0051 keeps resources out of the guest scope) — so ' +
      'this description is the whole account a guest gets, which is why it states the rule rather ' +
      'than naming a field. A sub-day activity reads back here as 0 — read `durationMinutes`.',
  })
  durationDays!: number;

  @ApiProperty({
    description:
      'Working MINUTES — what is stored and what the engine scheduled on (ADR-0036). In scope ' +
      'because it is the exact form of a field already exposed: without it a guest sees a ' +
      'four-hour activity as `durationDays: 0` and cannot tell it apart from a milestone.',
  })
  durationMinutes!: number;

  @ApiProperty({ description: 'Graphical y-lane / vertical position on the TSLD canvas.' })
  laneIndex!: number;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM early start.' })
  earlyStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM early finish.' })
  earlyFinish!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM late start.' })
  lateStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM late finish.' })
  lateFinish!: string | null;

  @ApiProperty({ nullable: true, type: Number, description: 'CPM total float (working days).' })
  totalFloat!: number | null;

  @ApiProperty({ description: 'CPM critical flag.' })
  isCritical!: boolean;

  @ApiProperty({ enum: ActivityStatus })
  status!: ActivityStatus;

  @ApiProperty({ minimum: 0, maximum: 100 })
  percentComplete!: number;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'Actual start.' })
  actualStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'Actual finish.' })
  actualFinish!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Where the bar is drawn: the plan as the planner laid it out (ADR-0148). Equals the ' +
      'logic-earliest start for an activity nobody has placed. Null until the plan has been ' +
      'calculated.',
  })
  visualEffectiveStart!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Where the bar is drawn: the plan as the planner laid it out (ADR-0148). Equals the ' +
      'logic-earliest finish for an activity nobody has placed. Null until the plan has been ' +
      'calculated.',
  })
  visualEffectiveFinish!: string | null;

  /** Map an activity row to the guest shape — copying ONLY the whitelisted scope fields. */
  static from(entity: WithDayFactor<Activity>): GuestActivityDto {
    const day = (value: Date | null): string | null => (value ? formatCalendarDate(value) : null);
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      type: entity.type,
      // Stored in working-minutes (ADR-0036); both forms are exposed, the exact one and the
      // day-rounded one a reader expects to see on a bar.
      durationDays: minutesToDays(entity.durationMinutes, entity.dayFactorMinutes),
      durationMinutes: entity.durationMinutes,
      laneIndex: entity.laneIndex,
      earlyStart: day(entity.earlyStart),
      earlyFinish: day(entity.earlyFinish),
      lateStart: day(entity.lateStart),
      lateFinish: day(entity.lateFinish),
      totalFloat: entity.totalFloat,
      isCritical: entity.isCritical,
      status: entity.status,
      percentComplete: entity.percentComplete,
      actualStart: day(entity.actualStart),
      actualFinish: day(entity.actualFinish),
      visualEffectiveStart: day(entity.visualEffectiveStart),
      visualEffectiveFinish: day(entity.visualEffectiveFinish),
    };
  }
}
