import { ApiProperty } from '@nestjs/swagger';
import { ActivityStatus, ActivityType, type Activity } from '@prisma/client';

import { formatCalendarDate } from '../../../common/validation/calendar-date';

/** Day↔minute factor (ADR-0036 §4.2): storage is minutes, the public field stays days. */
const MINUTES_PER_DAY = 1440;

/**
 * Guest read DTO for an activity (ADR-0051 §4, F-M3) — a DELIBERATELY field-stripped,
 * READ-ONLY projection for the session-less External-Guest surface. It exposes ONLY the
 * schedule + progress fields the guest scope allows: identity (id/code/name/type), the
 * computed CPM dates, duration/float/critical, lane position, and the progress trio.
 *
 * EXCLUDED BY CONSTRUCTION (must NEVER appear — no `from` copies them): cost / Earned-Value
 * / money (budgetedExpense, actualExpense, percentCompleteType, physicalPercentComplete,
 * accrualType); resources / assignments; baseline / variance; notes; the levelling overlay
 * (leveled*, levelingPriority, selfOverAllocated); the visual-planning fields (visual*);
 * the constraint / external / expected-finish / duration-type authoring fields; the calendar
 * and WBS parent ids; audit columns (createdBy/updatedBy/version/createdAt/updatedAt/
 * deletedAt); and any user identity. See `guest-dto.spec.ts` for the exclusion assertions.
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

  @ApiProperty({ description: 'Working days (milestones are 0).' })
  durationDays!: number;

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

  /** Map an activity row to the guest shape — copying ONLY the whitelisted scope fields. */
  static from(entity: Activity): GuestActivityDto {
    const day = (value: Date | null): string | null => (value ? formatCalendarDate(value) : null);
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      type: entity.type,
      // Stored in working-minutes (ADR-0036); the public field stays whole working days.
      durationDays: Math.round(entity.durationMinutes / MINUTES_PER_DAY),
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
    };
  }
}
