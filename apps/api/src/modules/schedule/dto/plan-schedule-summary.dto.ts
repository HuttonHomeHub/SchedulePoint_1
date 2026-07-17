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

  @ApiProperty({
    description:
      'Level-of-Effort activities with no resolvable span (missing an SS predecessor or FF successor) — produced at a fallback placement and flagged (N12, ADR-0035 §21).',
  })
  loeNoSpanCount!: number;

  @ApiProperty({
    description:
      'RESOURCE_DEPENDENT activities with no driving resource assignment — produced-and-flagged, scheduled on the fallback calendar (ADR-0035 §23 / ADR-0039).',
  })
  resourceDriverMissingCount!: number;

  @ApiProperty({
    description:
      'Activities the opt-in resource-levelling pass delayed to resolve over-allocation (levelingDelay > 0); 0 when the plan does not level (ADR-0041 / ADR-0035 §28).',
  })
  leveledActivityCount!: number;

  @ApiProperty({
    description:
      'Activities levelling pushed past a resource’s availability window — produced-and-flagged (ADR-0041 §6); 0 when the plan does not level.',
  })
  levelingWindowExceededCount!: number;

  @ApiProperty({
    description:
      'Activities carrying an unfixable single-activity over-allocation (own demand exceeds a resource’s capacity) — produced-and-flagged (ADR-0041 §2); 0 when the plan does not level.',
  })
  selfOverAllocatedCount!: number;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'The inclusive leveled project finish — the latest finish under levelling; null when the plan does not level (ADR-0041).',
  })
  leveledProjectFinish!: string | null;

  static from(summary: PlanScheduleSummary): PlanScheduleSummaryDto {
    return {
      dataDate: summary.dataDate,
      projectFinish: summary.projectFinish,
      activityCount: summary.activityCount,
      criticalCount: summary.criticalCount,
      nearCriticalCount: summary.nearCriticalCount,
      constraintViolationCount: summary.constraintViolationCount,
      constraintWarningCount: summary.constraintWarningCount,
      loeNoSpanCount: summary.loeNoSpanCount,
      resourceDriverMissingCount: summary.resourceDriverMissingCount,
      leveledActivityCount: summary.leveledActivityCount,
      levelingWindowExceededCount: summary.levelingWindowExceededCount,
      selfOverAllocatedCount: summary.selfOverAllocatedCount,
      leveledProjectFinish: summary.leveledProjectFinish,
    };
  }
}
