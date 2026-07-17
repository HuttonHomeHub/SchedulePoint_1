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

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Planned rate in units per working hour (exact numeric, >= 0), or null when no rate is set. ' +
      'On the driving assignment this feeds the duration-type triad Units = Duration × Units/Time ' +
      '(ADR-0040); null keeps the triad inert.',
  })
  unitsPerHour!: number | null;

  @ApiProperty({ description: 'Whether this is THE driving resource of the activity.' })
  isDriving!: boolean;

  @ApiProperty({
    description: 'Quantity of work actually done (exact numeric, >= 0) — EV1, ADR-0042.',
  })
  actualUnits!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Budgeted cost in minor currency units (EV1/EV4a, ADR-0042). Conditionally included: returned ' +
      'ONLY to a caller holding `cost:read` (Planner/Org Admin) in this org; others see null ' +
      '(fail-closed). Null thus means unset (derive at EV read) OR not-permitted.',
  })
  budgetedCost!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Actual cost in minor currency units (EV1/EV4a, ADR-0042). Conditionally included: returned ONLY ' +
      'to a caller holding `cost:read` (Planner/Org Admin) in this org; others see null (fail-closed).',
  })
  actualCost!: number | null;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  /**
   * Map an assignment to its public shape. `canReadCost` is the caller's org-scoped `cost:read`
   * decision (EV4a, ADR-0042), computed in the service — the money `budgetedCost`/`actualCost` are
   * included ONLY when it is true, otherwise null (fail-closed, no cross-tenant leak).
   */
  static from(entity: ResourceAssignment, canReadCost: boolean): ResourceAssignmentResponseDto {
    return {
      id: entity.id,
      activityId: entity.activityId,
      resourceId: entity.resourceId,
      // Decimal → number at the API boundary (the DB column is DECIMAL(18,4)).
      budgetedUnits: entity.budgetedUnits.toNumber(),
      unitsPerHour: entity.unitsPerHour === null ? null : entity.unitsPerHour.toNumber(),
      isDriving: entity.isDriving,
      actualUnits: entity.actualUnits.toNumber(),
      // Money (BigInt minor units → number) is gated on `cost:read` (EV4a): null unless the caller may
      // read cost. `budgetedCost` is additionally null when unset; `actualCost` is NOT NULL (default 0).
      budgetedCost:
        canReadCost && entity.budgetedCost !== null ? Number(entity.budgetedCost) : null,
      actualCost: canReadCost ? Number(entity.actualCost) : null,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
