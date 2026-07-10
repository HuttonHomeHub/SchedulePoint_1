import { ApiProperty } from '@nestjs/swagger';
import type { BaselineVarianceRow, PlanVarianceSummary } from '@repo/types';

/**
 * One row of the plan variance read model (ADR-0025). Variance is in working days on the
 * plan's calendar, signed so **positive = current later than baseline (behind)**. Dates
 * are calendar days (`YYYY-MM-DD`); the mapped shape matches {@link BaselineVarianceRow},
 * so the service's rows are returned as-is (this class exists for OpenAPI).
 */
export class BaselineVarianceRowResponseDto implements BaselineVarianceRow {
  @ApiProperty({ format: 'uuid' })
  activityId!: string;

  @ApiProperty({ nullable: true, type: String })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Whether the activity existed in the active baseline.' })
  inBaseline!: boolean;

  @ApiProperty({ description: 'Whether a baselined activity is no longer a live activity.' })
  removed!: boolean;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  currentStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  currentFinish!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  currentTotalFloat!: number | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  baselineStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  baselineFinish!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  baselineTotalFloat!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Working days (positive = behind).' })
  startVarianceDays!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Working days (positive = behind).' })
  finishVarianceDays!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'current − baseline float (days).' })
  floatVarianceDays!: number | null;
}

/** The plan-level variance roll-up returned in `meta` (ADR-0025). */
export class PlanVarianceSummaryResponseDto implements PlanVarianceSummary {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  baselineId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  baselineName!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  capturedAt!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Largest positive finish slip (working days).',
  })
  worstFinishSlipDays!: number | null;

  @ApiProperty({ description: 'Activities finishing behind the baseline.' })
  behindCount!: number;

  @ApiProperty({ description: 'Activities added since capture.' })
  addedCount!: number;

  @ApiProperty({ description: 'Baselined activities removed since capture.' })
  removedCount!: number;
}
