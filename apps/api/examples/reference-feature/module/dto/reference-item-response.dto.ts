import { ApiProperty } from '@nestjs/swagger';
import { ReferenceItemStatus, type ReferenceItem } from '@prisma/client';

/**
 * Public representation of a reference item. Internal/audit columns
 * (`deletedAt`, `createdBy`, `updatedBy`) are intentionally NOT exposed.
 */
export class ReferenceItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ReferenceItemStatus })
  status!: ReferenceItemStatus;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  /** Map a persisted entity to its safe API representation. */
  static from(entity: ReferenceItem): ReferenceItemResponseDto {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
