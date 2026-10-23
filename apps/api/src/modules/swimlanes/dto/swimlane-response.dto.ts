import { ApiProperty } from '@nestjs/swagger';
import type { Swimlane } from '@prisma/client';

/** Public representation of a swimlane (swimlanes spec §4.12). */
export class SwimlaneResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Zero-based order key; read as ORDER BY position, id.' })
  position!: number;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(swimlane: Swimlane): SwimlaneResponseDto {
    return {
      id: swimlane.id,
      planId: swimlane.planId,
      name: swimlane.name,
      position: swimlane.position,
      version: swimlane.version,
      createdAt: swimlane.createdAt.toISOString(),
      updatedAt: swimlane.updatedAt.toISOString(),
    };
  }
}
