import { ApiProperty } from '@nestjs/swagger';
import type { ProgrammeSchedulePlanResult, ProgrammeScheduleResult } from '@repo/types';

import { PlanScheduleSummaryDto } from './plan-schedule-summary.dto';

/** One plan's slot in a programme recalculation — its id plus the single-plan summary it produced. */
class ProgrammeSchedulePlanResultDto implements ProgrammeSchedulePlanResult {
  @ApiProperty({ format: 'uuid', description: 'The recalculated plan’s id.' })
  planId!: string;

  @ApiProperty({
    type: PlanScheduleSummaryDto,
    description: 'The single-plan CPM summary the ADR-0022 recalc produced for this plan.',
  })
  summary!: PlanScheduleSummaryDto;
}

/** The programme-level roll-up over the recalculated closure. */
class ProgrammeScheduleRollupDto {
  @ApiProperty({
    description:
      'Plans recalculated (the target’s upstream cross-plan closure size); 1 for a plan with no cross-plan edges.',
  })
  planCount!: number;

  @ApiProperty({
    description:
      'Summed N32 warnings across the closure (ADR-0035 §30.5): cross-plan edges whose upstream had never been calculated, so they contributed no derived bound. Never an error; 0 on the byte-parity path.',
  })
  crossPlanUpstreamMissingCount!: number;
}

/**
 * Public representation of a **programme recalculation** result (ADR-0045 §4) — the per-plan summaries
 * (in recalculation order, upstream-first, the target last) plus the programme roll-up. A programme with
 * no cross-plan edges returns a single-element `plans` array (just the target), identical to a single-plan
 * recalc.
 */
export class ProgrammeScheduleResultDto implements ProgrammeScheduleResult {
  @ApiProperty({
    type: ProgrammeSchedulePlanResultDto,
    isArray: true,
    description:
      'One entry per plan in the target’s upstream closure, in recalculation order (upstream-first, the target last).',
  })
  plans!: ProgrammeSchedulePlanResultDto[];

  @ApiProperty({ type: ProgrammeScheduleRollupDto })
  programme!: ProgrammeScheduleRollupDto;

  static from(result: ProgrammeScheduleResult): ProgrammeScheduleResultDto {
    return {
      plans: result.plans.map((p) => ({
        planId: p.planId,
        summary: PlanScheduleSummaryDto.from(p.summary),
      })),
      programme: {
        planCount: result.programme.planCount,
        crossPlanUpstreamMissingCount: result.programme.crossPlanUpstreamMissingCount,
      },
    };
  }
}
