import { ApiProperty } from '@nestjs/swagger';
import type { ActivityStep as ActivityStepEntity } from '@prisma/client';
import type { ActivityStep } from '@repo/types';

/**
 * Public representation of an activity step (M7 rung 5, ADR-0044 §2). `weight` is stored as a
 * `DECIMAL(18,4)` (a Prisma `Decimal`) and rendered as a JSON `number` at this boundary — the public
 * contract in `@repo/types` (`ActivityStep.weight: number`). `percentComplete` is a `SMALLINT` integer.
 */
export class ActivityStepResponseDto implements ActivityStep {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  activityId!: string;

  @ApiProperty({ description: 'Server-assigned contiguous 1-based ordering within the activity.' })
  seq!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    description: 'Relative weight in the weighted-mean physical % (exact numeric, >= 0).',
  })
  weight!: number;

  @ApiProperty({ minimum: 0, maximum: 100, description: 'The step’s own completion (0–100).' })
  percentComplete!: number;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  /** Map a step entity to its public shape (Decimal → number at the API boundary). */
  static from(entity: ActivityStepEntity): ActivityStepResponseDto {
    return {
      id: entity.id,
      activityId: entity.activityId,
      seq: entity.seq,
      name: entity.name,
      weight: entity.weight.toNumber(),
      percentComplete: entity.percentComplete,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
