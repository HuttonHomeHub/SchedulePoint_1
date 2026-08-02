import { ApiProperty } from '@nestjs/swagger';
import type { PlanFloatPath, PlanFloatPaths } from '@repo/types';

/**
 * One float path into the target activity (M6-F6, ADR-0035 §19): a contiguous driving chain, ranked
 * by the float it carries above the driving path. `index` 0 is the driving path; `activityIds` are
 * target-first; **`relativeFloatMinutes` is the figure to read** — see its description, and the
 * deprecation note on `relativeFloat`.
 */
export class PlanFloatPathDto implements PlanFloatPath {
  @ApiProperty({
    description: '0 = the driving path (relative float 0); higher = increasingly floaty.',
  })
  index!: number;

  @ApiProperty({
    deprecated: true,
    description:
      'DEPRECATED — use relativeFloatMinutes. Working days of float above the driving path, computed as a flat minutes/1440. Total float is measured on the ACTIVITY’S OWN calendar (ADR-0037 §4), so on an eight-hour calendar one working day of relative float (480 minutes) rounds to 0 here — indistinguishable from the driving path — and larger values are understated threefold. Retained so existing readers do not break.',
  })
  relativeFloat!: number;

  @ApiProperty({
    description:
      'Working MINUTES of total float above the driving path (the entry activity’s total float minus the target’s) — the engine’s figure, carried through unconverted. Path 0 is 0; branch paths are non-decreasing, and can be negative when a branch is more critical than a floating target. Convert for display against the calendar you are presenting on, never against a flat 1440.',
  })
  relativeFloatMinutes!: number;

  @ApiProperty({
    type: [String],
    description: "The chain's activity ids, target-first (target … driving root).",
  })
  activityIds!: string[];
}

/**
 * The ranked contiguous float paths into a target activity — a read-only analysis over the
 * live-computed schedule (P6 "multiple float paths", ADR-0035 §19). `paths` is ordered by
 * non-decreasing relative float; path 0 is the target's own driving chain, bounded by `maxPaths`.
 */
export class PlanFloatPathsDto implements PlanFloatPaths {
  @ApiProperty({ format: 'uuid', description: 'The requested target activity.' })
  targetActivityId!: string;

  @ApiProperty({ type: [PlanFloatPathDto], description: 'Ranked float paths into the target.' })
  paths!: PlanFloatPathDto[];

  @ApiProperty({
    description:
      'True when the analysis found more paths than maxPaths returned, so a reader can say “the first N” rather than implying this is every path into the target.',
  })
  hasMorePaths!: boolean;

  static from(result: PlanFloatPaths): PlanFloatPathsDto {
    return {
      targetActivityId: result.targetActivityId,
      paths: result.paths.map((p) => ({
        index: p.index,
        relativeFloat: p.relativeFloat,
        relativeFloatMinutes: p.relativeFloatMinutes,
        activityIds: p.activityIds,
      })),
      hasMorePaths: result.hasMorePaths,
    };
  }
}
