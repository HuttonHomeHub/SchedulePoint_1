import { ApiPropertyOptional } from '@nestjs/swagger';
import type { Project } from '@prisma/client';
import type { ProjectDetail } from '@repo/types';

import { ProjectResponseDto } from './project-response.dto';

/**
 * A project's detail read — `ProjectResponseDto` plus the child counts.
 *
 * A SEPARATE class for the reason `ClientDetailResponseDto`'s docblock gives in full: the list and
 * the detail read share one DTO, so a count added to it would land on the list route uninvited, at
 * a measured 425x. This class is what the list cannot return.
 */
export class ProjectDetailResponseDto extends ProjectResponseDto implements ProjectDetail {
  @ApiPropertyOptional({
    description:
      'Active plans directly under this project. Absent when the count could not be taken — never ' +
      'zero, which would be a claim that there are none.',
  })
  planCount?: number;

  @ApiPropertyOptional({
    description:
      "Active activities ACROSS this project's plans — a two-level count, and it counts EVERY " +
      'activity row: WBS summaries, levels of effort and milestones as well as tasks. Absent when ' +
      'the count could not be taken.',
  })
  activityCount?: number;

  static fromDetail(
    entity: Project,
    counts: { planCount?: number; activityCount?: number },
  ): ProjectDetailResponseDto {
    return {
      ...ProjectResponseDto.from(entity),
      ...(counts.planCount === undefined ? {} : { planCount: counts.planCount }),
      ...(counts.activityCount === undefined ? {} : { activityCount: counts.activityCount }),
    };
  }
}
