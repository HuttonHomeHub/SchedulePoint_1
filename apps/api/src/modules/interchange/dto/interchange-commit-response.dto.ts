import { ApiProperty } from '@nestjs/swagger';
import type { InterchangeReport } from '@repo/interchange';

import { InterchangeReportResponseDto } from './interchange-report-response.dto';

/**
 * The result of a **committed** interchange import (ADR-0050, C2, Task 1.5): the id of the plan that was
 * created from the uploaded file, plus the same interchange {@link InterchangeReportResponseDto} the
 * planner reviewed on the dry-run (re-derived here from the re-uploaded file — `importXer` is pure and
 * deterministic, so the graph committed equals the one reviewed). The report is returned so the client
 * can surface exactly what was approximated / repaired / dropped alongside the new plan.
 */
export class InterchangeCommitResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The id of the plan created in the target project from the imported file.',
  })
  planId!: string;

  @ApiProperty({
    type: InterchangeReportResponseDto,
    description: 'The interchange report for the committed import (mapped counts + findings).',
  })
  report!: InterchangeReportResponseDto;

  /** Assemble the commit response from the new plan id and the pure-pipeline report. */
  static from(planId: string, report: InterchangeReport): InterchangeCommitResponseDto {
    return { planId, report: InterchangeReportResponseDto.from(report) };
  }
}
