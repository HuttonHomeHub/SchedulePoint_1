import { ApiProperty } from '@nestjs/swagger';
import type { PlanScheduleSummary } from '@repo/types';

/**
 * Public representation of a plan's computed schedule roll-up — the result of a
 * recalculation and the shape of the read summary (C1). Dates are calendar days
 * (`YYYY-MM-DD`); `projectFinish` is null until the plan has been calculated (or
 * for an empty plan); `dataDate` is null when the plan has no start date.
 */
export class PlanScheduleSummaryDto implements PlanScheduleSummary {
  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: "The data date (the plan's start); null if unset.",
  })
  dataDate!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'The latest computed finish across the plan; null if not yet calculated.',
  })
  projectFinish!: string | null;

  @ApiProperty({ description: 'Active activities considered in the schedule.' })
  activityCount!: number;

  @ApiProperty({ description: 'Activities on the critical path (total float ≤ 0).' })
  criticalCount!: number;

  @ApiProperty({ description: 'Near-critical activities (0 < total float ≤ 5 working days).' })
  nearCriticalCount!: number;

  @ApiProperty({
    description:
      'Activities where a mandatory pin (MANDATORY_START/FINISH) drove the start earlier than logic allowed — produced as pinned and flagged (ADR-0035 §7).',
  })
  constraintViolationCount!: number;

  @ApiProperty({
    description:
      'Soft constraint warnings — today the N15 case: a Start-No-Earlier-Than dated before the data date (honoured, but cannot pull work before it). ADR-0035 §12.',
  })
  constraintWarningCount!: number;

  static from(summary: PlanScheduleSummary): PlanScheduleSummaryDto {
    return {
      dataDate: summary.dataDate,
      projectFinish: summary.projectFinish,
      activityCount: summary.activityCount,
      criticalCount: summary.criticalCount,
      nearCriticalCount: summary.nearCriticalCount,
      constraintViolationCount: summary.constraintViolationCount,
      constraintWarningCount: summary.constraintWarningCount,
    };
  }
}
