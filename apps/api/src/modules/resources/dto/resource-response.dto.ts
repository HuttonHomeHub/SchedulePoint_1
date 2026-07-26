import { ApiProperty } from '@nestjs/swagger';
import { ResourceKind } from '@prisma/client';
import type { Resource } from '@prisma/client';
import type { ResourceSummary } from '@repo/types';

/** Public representation of a resource (list + detail share one shape — no children embedded). */
export class ResourceResponseDto implements ResourceSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  code!: string | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: ResourceKind })
  kind!: ResourceKind;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'The parent GROUP in the resource tree (ADR-0053 §3); null = top level. Returned on every ' +
      'resource so a client can nest the flat list itself — the tree is acyclic, same-org and at ' +
      'most 10 deep by service invariant, so no separate tree endpoint is needed.',
  })
  parentId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  calendarId!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Capacity ceiling in units per working hour (ADR-0041 §2), or null when uncapped. Read by the ' +
      'levelling pass when the plan opts in.',
  })
  maxUnitsPerHour!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Cost rate — money per unit of work, minor currency units (EV1/EV4a, ADR-0042). Conditionally ' +
      'included: the real rate is returned ONLY to a caller holding `cost:read` (Planner/Org Admin) in ' +
      'this resource’s org; every other caller (Viewer/Contributor) sees null (fail-closed). Null thus ' +
      'means unset OR not-permitted.',
  })
  costPerUnit!: number | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description:
      'When this resource was archived (ADR-0053 §4); null = active. An archived resource ' +
      'keeps every existing assignment — which still schedules, levels, loads the histogram ' +
      'and earns value identically — and is hidden from pickers; only a NEW assignment is ' +
      'refused (422 RESOURCE_ARCHIVED).',
  })
  archivedAt!: string | null;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  /**
   * Map a resource to its public shape. `canReadCost` is the caller's org-scoped `cost:read`
   * decision (EV4a, ADR-0042), computed in the service from the resolved organisation — the money
   * `costPerUnit` is included ONLY when it is true, otherwise null (fail-closed, no cross-tenant leak).
   */
  static from(entity: Resource, canReadCost: boolean): ResourceResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      code: entity.code,
      description: entity.description,
      kind: entity.kind,
      parentId: entity.parentId,
      calendarId: entity.calendarId,
      // Decimal → number at the API boundary (the DB column is DECIMAL(18,4)); null = uncapped.
      maxUnitsPerHour: entity.maxUnitsPerHour === null ? null : entity.maxUnitsPerHour.toNumber(),
      // Cost rate is gated on `cost:read` (EV4a): null unless the caller may read cost AND it is set.
      costPerUnit:
        canReadCost && entity.costPerUnit !== null ? entity.costPerUnit.toNumber() : null,
      archivedAt: entity.archivedAt === null ? null : entity.archivedAt.toISOString(),
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
