import { ApiProperty } from '@nestjs/swagger';
import type { Client } from '@prisma/client';
import type { ClientSummary } from '@repo/types';

/** Public representation of a client. */
export class ClientResponseDto implements ClientSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

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

  static from(entity: Client): ClientResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
