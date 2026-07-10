import { ApiProperty } from '@nestjs/swagger';

import type { PlanScheduleSummaryResult } from '../schedule.service';

/**
 * Public representation of a plan's computed schedule roll-up — the result of a
 * recalculation and the shape of the read summary (C1). Dates are calendar days
 * (`YYYY-MM-DD`); `projectFinish` is null until the plan has been calculated (or
 * for an empty plan).
 */
export class PlanScheduleSummaryDto {
  @ApiProperty({ format: 'date', description: "The data date (the plan's start)." })
  dataDate!: string;

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
    description: 'Mandatory constraints treated as their moderate equivalents (MSO/MFO).',
  })
  parkedConstraintCount!: number;

  static from(summary: PlanScheduleSummaryResult): PlanScheduleSummaryDto {
    return {
      dataDate: summary.dataDate,
      projectFinish: summary.projectFinish,
      activityCount: summary.activityCount,
      criticalCount: summary.criticalCount,
      nearCriticalCount: summary.nearCriticalCount,
      parkedConstraintCount: summary.parkedConstraintCount,
    };
  }
}
