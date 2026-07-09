import { ApiProperty } from '@nestjs/swagger';
import type { Project } from '@prisma/client';
import type { ProjectSummary } from '@repo/types';

/** Public representation of a project (scoped to a client). */
export class ProjectResponseDto implements ProjectSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The parent client.' })
  clientId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: Project): ProjectResponseDto {
    return {
      id: entity.id,
      clientId: entity.clientId,
      name: entity.name,
      description: entity.description,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
