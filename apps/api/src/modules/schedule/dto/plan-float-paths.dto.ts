import { ApiProperty } from '@nestjs/swagger';
import type { PlanFloatPath, PlanFloatPaths } from '@repo/types';

/**
 * One float path into the target activity (M6-F6, ADR-0035 §19): a contiguous driving chain, ranked
 * by the float it carries above the driving path. `index` 0 is the driving path; `activityIds` are
 * target-first; `relativeFloat` is in working days.
 */
export class PlanFloatPathDto implements PlanFloatPath {
  @ApiProperty({
    description: '0 = the driving path (relative float 0); higher = increasingly floaty.',
  })
  index!: number;

  @ApiProperty({
    description:
      "Working days of total float above the driving path (the entry activity's total float minus the target's). Path 0 is 0; branch paths are non-decreasing, and can be negative when a branch is more critical than a floating target.",
  })
  relativeFloat!: number;

  @ApiProperty({
    type: [String],
    description: "The chain's activity ids, target-first (target … driving root).",
  })
  activityIds!: string[];
}

/**
 * The ranked contiguous float paths into a target activity — a read-only analysis over the
 * live-computed schedule (P6 "multiple float paths", ADR-0035 §19). `paths` is ordered by
 * non-decreasing `relativeFloat`; path 0 is the target's own driving chain, bounded by `maxPaths`.
 */
export class PlanFloatPathsDto implements PlanFloatPaths {
  @ApiProperty({ format: 'uuid', description: 'The requested target activity.' })
  targetActivityId!: string;

  @ApiProperty({ type: [PlanFloatPathDto], description: 'Ranked float paths into the target.' })
  paths!: PlanFloatPathDto[];

  static from(result: PlanFloatPaths): PlanFloatPathsDto {
    return {
      targetActivityId: result.targetActivityId,
      paths: result.paths.map((p) => ({
        index: p.index,
        relativeFloat: p.relativeFloat,
        activityIds: p.activityIds,
      })),
    };
  }
}
