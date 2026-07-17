import { ApiProperty } from '@nestjs/swagger';
// The runtime Prisma enum is the single source of truth for the OpenAPI `enum` (mirrors
// PlanResponseDto), so the documented values can never drift from a hand-copied literal array.
import { EacMethod } from '@prisma/client';
import type { EarnedValueActivity, EarnedValueMetrics, PlanEarnedValue } from '@repo/types';

/**
 * The P6 Earned-Value metric set for one level (an activity, a WBS summary, or the plan total) —
 * EV2b, ADR-0042 §2 / ADR-0035 §29. Money fields are **integer minor units** in the plan's
 * {@link PlanEarnedValueDto.currencyCode}; the index ratios (`spi`/`cpi`/`tcpi`) are 4-dp floats, null
 * when their divisor is zero (never `Infinity`). This shape is returned ONLY by the `cost:read`-gated
 * Earned-Value endpoint — never by the general schedule/entity reads.
 */
export class EarnedValueMetricsDto implements EarnedValueMetrics {
  @ApiProperty({ description: 'Budget at Completion (minor units).' })
  bac!: number;

  @ApiProperty({ description: 'Planned Value / BCWS (minor units), time-phased to the data date.' })
  pv!: number;

  @ApiProperty({ description: 'Earned Value / BCWP (minor units) = BAC × performance %.' })
  ev!: number;

  @ApiProperty({ description: 'Actual Cost / ACWP (minor units).' })
  ac!: number;

  @ApiProperty({ description: 'Schedule Variance EV − PV (minor units).' })
  sv!: number;

  @ApiProperty({ description: 'Cost Variance EV − AC (minor units).' })
  cv!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Schedule Performance Index EV / PV (4 dp); null when PV = 0.',
  })
  spi!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Cost Performance Index EV / AC (4 dp); null when AC = 0.',
  })
  cpi!: number | null;

  @ApiProperty({
    description: 'Estimate at Completion (minor units), per the plan’s eacMethod; always defined.',
  })
  eac!: number;

  @ApiProperty({ description: 'Estimate to Complete EAC − AC (minor units).' })
  etc!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'To-Complete Performance Index (BAC − EV) / (BAC − AC) (4 dp); null when BAC = AC.',
  })
  tcpi!: number | null;

  @ApiProperty({ description: 'Variance at Completion BAC − EAC (minor units).' })
  vac!: number;
}

/**
 * One activity's Earned-Value row (EV2b, ADR-0042): the {@link EarnedValueMetricsDto} set plus its id
 * and the performance % that earned its EV. Every non-deleted activity — including WBS summaries —
 * appears in {@link PlanEarnedValueDto.activities}.
 */
export class EarnedValueActivityDto extends EarnedValueMetricsDto implements EarnedValueActivity {
  @ApiProperty({ format: 'uuid', description: 'The activity this row is for.' })
  activityId!: string;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    description: 'The performance % (0–100) that earned this row’s EV.',
  })
  performancePercent!: number;
}

/**
 * A plan's Earned-Value analysis (EV2b, ADR-0042 §2) — the shape the `cost:read`-gated
 * `GET …/schedule/earned-value` endpoint returns. A pure read over the persisted CPM dates plus the
 * cost / %-complete inputs as of `dataDate`; it schedules nothing and persists nothing. Money is
 * integer minor units in `currencyCode` (null = inherit the org default).
 */
export class PlanEarnedValueDto implements PlanEarnedValue {
  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'The EV status date (the plan’s data date); null when the plan has no start date.',
  })
  dataDate!: string | null;

  @ApiProperty({
    enum: EacMethod,
    description: 'The EAC forecast method used for every level.',
  })
  eacMethod!: EacMethod;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The plan’s ISO-4217 currency code; null = inherit the org default.',
  })
  currencyCode!: string | null;

  @ApiProperty({
    description:
      'True when any leaf activity lacked a cost-baseline budget, so PV used the live-budget fallback.',
  })
  costBaselineMissing!: boolean;

  @ApiProperty({
    description:
      'The count of leaf activities showing booked actual cost/units while apparently not started ' +
      '(ADR-0035 §29, N24) — a read-time data-quality warning, never a reject.',
  })
  costWarningCount!: number;

  @ApiProperty({
    type: [EarnedValueActivityDto],
    description: 'Per-activity rows (incl. WBS summaries), in plan order.',
  })
  activities!: EarnedValueActivityDto[];

  @ApiProperty({
    type: EarnedValueMetricsDto,
    description: 'The plan-total metric set (the sum over top-level rows).',
  })
  total!: EarnedValueMetricsDto;

  static from(result: PlanEarnedValue): PlanEarnedValueDto {
    return {
      dataDate: result.dataDate,
      eacMethod: result.eacMethod,
      currencyCode: result.currencyCode,
      costBaselineMissing: result.costBaselineMissing,
      costWarningCount: result.costWarningCount,
      activities: result.activities.map((a) => ({ ...a })),
      total: { ...result.total },
    };
  }
}
