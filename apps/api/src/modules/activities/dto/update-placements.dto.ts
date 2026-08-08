import { ApiProperty } from '@nestjs/swagger';
import { ConstraintType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';

import { IsConstraintPaired } from './activity-validators';

/**
 * One activity's new **placement** — where it goes in time and lane — with the version it was read
 * at (optimistic locking).
 *
 * **Every field is required-but-nullable, deliberately not `@IsOptional()`** — the
 * {@link ActivityParentDto} rule. This is a batch of complete rows, not a PATCH of partial ones:
 * each row states the activity's whole placement. With `@IsOptional()` a client that simply forgot
 * `constraintDate` would pass validation and be treated as an explicit clear, silently unpinning
 * forty activities from a typo. It also inverts the sibling contract, where an omitted field on the
 * single-activity `PATCH` means "unchanged".
 *
 * `laneIndex` is the one field where null carries a meaning other than "clear": a bulk time shift
 * moves bars along the x-axis and must be able to leave the y-axis alone, so **null means the lane
 * is unchanged**. It is still required — the row has to say so — which is the whole point of the
 * rule.
 */
export class ActivityPlacementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({
    enum: ConstraintType,
    nullable: true,
    description:
      'The schedule constraint pinning this activity in time, or null to clear it. Must be ' +
      'present on every row: omitting it is a validation error, not a silent clear. Set together ' +
      'with constraintDate, or both null.',
  })
  @ValidateIf((row: ActivityPlacementDto) => row.constraintType !== null)
  @IsEnum(ConstraintType)
  @IsConstraintPaired()
  constraintType!: ConstraintType | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    example: '2026-05-01',
    description:
      'The constraint’s calendar day (YYYY-MM-DD), or null to clear it. Must be present on every ' +
      'row. Set together with constraintType, or both null.',
  })
  @ValidateIf((row: ActivityPlacementDto) => row.constraintDate !== null)
  @IsCalendarDate()
  @IsConstraintPaired()
  constraintDate!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    example: '2026-05-01',
    description:
      'Visual-Planning placement (ADR-0033): the calendar day to hand-place the start at, or null ' +
      'to clear it (revert to computed). Must be present on every row. Feeds only the ' +
      'effective-Visual pass, never the pure-network pass.',
  })
  @ValidateIf((row: ActivityPlacementDto) => row.visualStart !== null)
  @IsCalendarDate()
  visualStart!: string | null;

  @ApiProperty({
    minimum: 0,
    maximum: 10000,
    nullable: true,
    description:
      'The 0-based lane (y) to move to, or **null to leave the lane unchanged** — a bulk time ' +
      'shift moves bars along x only. Must be present on every row.',
  })
  @ValidateIf((row: ActivityPlacementDto) => row.laneIndex !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  laneIndex!: number | null;
}

/**
 * Request body for the batch **placement** write: move one or more of a plan's activities in time
 * (and optionally lane) in a single all-or-nothing transaction. Every id must belong to the plan
 * and match its `version`, or the whole batch is rejected (409) and nothing moves — so dragging a
 * twelve-activity selection either lands wholesale or not at all, never as a half-shifted fragnet
 * that reads as a deliberate re-plan.
 *
 * The third member of the complete-row batch family, after `positions` (lane only) and `parents`
 * (WBS membership).
 *
 * **Structural**, like `parents`: constraints and `visualStart` feed the CPM engine, so a committed
 * batch leaves the plan's computed dates stale until the next recalculation.
 *
 * **Not a definition PATCH.** It carries placement fields and nothing else — a bulk move must not
 * be able to rename forty activities.
 */
export class UpdatePlacementsDto {
  @ApiProperty({ type: ActivityPlacementDto, isArray: true, minItems: 1, maxItems: 2000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ActivityPlacementDto)
  placements!: ActivityPlacementDto[];
}
