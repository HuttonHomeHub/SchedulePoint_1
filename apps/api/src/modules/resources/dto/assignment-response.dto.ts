import { ApiProperty } from '@nestjs/swagger';
import type { ResourceAssignment } from '@prisma/client';
import type { ResourceAssignmentSummary } from '@repo/types';

/**
 * Public representation of a resource assignment (ADR-0039). `budgetedUnits` is stored as
 * a `DECIMAL(18,4)` (a Prisma `Decimal`) and rendered as a JSON `number` at this boundary
 * — the public contract in `@repo/types` (`ResourceAssignmentSummary.budgetedUnits: number`).
 */
export class ResourceAssignmentResponseDto implements ResourceAssignmentSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  activityId!: string;

  @ApiProperty({ format: 'uuid' })
  resourceId!: string;

  @ApiProperty({ description: 'Budgeted quantity of work (exact numeric, >= 0).' })
  budgetedUnits!: number;

  @ApiProperty({ description: 'Whether this is THE driving resource of the activity.' })
  isDriving!: boolean;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: ResourceAssignment): ResourceAssignmentResponseDto {
    return {
      id: entity.id,
      activityId: entity.activityId,
      resourceId: entity.resourceId,
      // Decimal → number at the API boundary (the DB column is DECIMAL(18,4)).
      budgetedUnits: entity.budgetedUnits.toNumber(),
      isDriving: entity.isDriving,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
