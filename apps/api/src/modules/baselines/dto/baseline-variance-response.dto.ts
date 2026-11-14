import { ApiProperty } from '@nestjs/swagger';
import type { BaselineVarianceRow, PlanVarianceSummary, VarianceBasis } from '@repo/types';

/**
 * One row of the plan variance read model (ADR-0025). Variance is in working days on the
 * plan's calendar, signed so **positive = current later than baseline (behind)**. Dates
 * are calendar days (`YYYY-MM-DD`); the mapped shape matches {@link BaselineVarianceRow},
 * so the service's rows are returned as-is (this class exists for OpenAPI).
 *
 * **Every dated field and both variance fields below are on the read's `meta.basis`**
 * (`placement-baseline-variance`, amending ADR-0025) — see
 * {@link PlanVarianceSummaryResponseDto.basis}. `currentTotalFloat`/`baselineTotalFloat`/
 * `floatVarianceDays` are total float, not dates.
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

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'current − baseline total float in whole days, derived from `floatVarianceMinutes` on the ' +
      'baseline’s frozen working day (ADR-0214). Null when not comparable, never 0.',
  })
  floatVarianceDays!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'current − baseline total float in working minutes, exact. Null when the activity is not in ' +
      'the baseline, was removed, or either side’s float was never calculated.',
  })
  floatVarianceMinutes!: number | null;
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

  @ApiProperty({
    enum: ['PLACED'],
    nullable: true,
    description:
      'Which dates this read compared (placement-baseline-variance, amending ADR-0025). ' +
      "null only when baselineId is null (no active baseline). 'PLACED': the frozen placed " +
      'span vs the live placed span (where the bars are drawn, ADR-0148) — the only value ' +
      "since 1.1.0 ('NETWORK' was removed, ADR-0215 D6). Every row’s dated fields and " +
      'start/finish variances are on this basis.',
  })
  basis!: VarianceBasis | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'The latest frozen placed finish across every row of the active baseline, on `basis`, ' +
      'falling back to the row’s frozen early finish where it has no placed one (as the live side ' +
      'falls back to `earlyFinish`). Null when there is no active baseline or no row carries a placed finish.',
  })
  baselineProjectFinish!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'The latest live placed finish — `COALESCE(visualEffectiveFinish, earlyFinish)` over the ' +
      'plan’s live activities, the same value the schedule summary’s `projectFinish` states. Null ' +
      'when there is no active baseline or the plan was never calculated.',
  })
  currentProjectFinish!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'How far the plan’s finish has moved against the baseline, in working days on the plan ' +
      'calendar and the baseline’s frozen day length (positive = later). A slip under half a ' +
      'working day rounds to 0. Null when either finish is null. Unlike `worstFinishSlipDays` ' +
      '(the largest single activity), this is the plan’s finish, so it also counts activities ' +
      'added or removed since capture.',
  })
  projectFinishVarianceDays!: number | null;
}
