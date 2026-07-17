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

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: Resource): ResourceResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      code: entity.code,
      description: entity.description,
      kind: entity.kind,
      calendarId: entity.calendarId,
      // Decimal → number at the API boundary (the DB column is DECIMAL(18,4)); null = uncapped.
      maxUnitsPerHour: entity.maxUnitsPerHour === null ? null : entity.maxUnitsPerHour.toNumber(),
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
