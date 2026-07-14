import { ApiProperty } from '@nestjs/swagger';
import { ActivityStatus, ActivityType, ConstraintType, type Activity } from '@prisma/client';
import type { ActivitySummary } from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';

/**
 * Public representation of an activity (the leaf of Client → Project → Plan →
 * Activity). Calendar-day fields (constraint date, actuals, CPM early/late
 * dates) are serialised as `YYYY-MM-DD`; the CPM output fields are engine-owned
 * and null/false until the CPM engine slice computes them.
 */
export class ActivityResponseDto implements ActivitySummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The parent plan.' })
  planId!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Human-facing code (unique per plan).',
  })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: ActivityType })
  type!: ActivityType;

  @ApiProperty({ description: 'Working days (milestones are 0).' })
  durationDays!: number;

  @ApiProperty({ enum: ConstraintType, nullable: true })
  constraintType!: ConstraintType | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  constraintDate!: string | null;

  @ApiProperty({ description: 'Graphical y-lane for the TSLD canvas.' })
  laneIndex!: number;

  @ApiProperty({ enum: ActivityStatus })
  status!: ActivityStatus;

  @ApiProperty({ minimum: 0, maximum: 100 })
  percentComplete!: number;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  actualStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  actualFinish!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  earlyStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  earlyFinish!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  lateStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  lateFinish!: string | null;

  @ApiProperty({ nullable: true, type: Number, description: 'CPM total float (engine-owned).' })
  totalFloat!: number | null;

  @ApiProperty({ description: 'CPM critical flag (engine-owned).' })
  isCritical!: boolean;

  @ApiProperty({ description: 'CPM near-critical flag (engine-owned).' })
  isNearCritical!: boolean;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'Visual-Planning placement (ADR-0033): hand-placed start, or null if unplaced.',
  })
  visualStart!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Effective-Visual start (engine-owned, ADR-0033): where the bar renders in VISUAL mode.',
  })
  visualEffectiveStart!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'Effective-Visual finish (engine-owned).',
  })
  visualEffectiveFinish!: string | null;

  @ApiProperty({
    description: 'True when the placement is before the earliest feasible start (engine-owned).',
  })
  visualConflict!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Working-day drift of the placement from early start (signed, engine-owned).',
  })
  visualDriftDays!: number | null;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: Activity): ActivityResponseDto {
    const day = (value: Date | null): string | null => (value ? formatCalendarDate(value) : null);
    return {
      id: entity.id,
      planId: entity.planId,
      code: entity.code,
      name: entity.name,
      description: entity.description,
      type: entity.type,
      durationDays: entity.durationDays,
      constraintType: entity.constraintType,
      constraintDate: day(entity.constraintDate),
      laneIndex: entity.laneIndex,
      status: entity.status,
      percentComplete: entity.percentComplete,
      actualStart: day(entity.actualStart),
      actualFinish: day(entity.actualFinish),
      earlyStart: day(entity.earlyStart),
      earlyFinish: day(entity.earlyFinish),
      lateStart: day(entity.lateStart),
      lateFinish: day(entity.lateFinish),
      totalFloat: entity.totalFloat,
      isCritical: entity.isCritical,
      isNearCritical: entity.isNearCritical,
      visualStart: day(entity.visualStart),
      visualEffectiveStart: day(entity.visualEffectiveStart),
      visualEffectiveFinish: day(entity.visualEffectiveFinish),
      visualConflict: entity.visualConflict,
      visualDriftDays: entity.visualDriftDays,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
