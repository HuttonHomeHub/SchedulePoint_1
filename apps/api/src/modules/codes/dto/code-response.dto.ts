import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CodeType } from '@prisma/client';

import type { ListedCodeValue } from '../code-value.repository';

/** Public representation of a code value (p6-activity-codes spec §4.7). */
export class CodeValueResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  codeTypeId!: string;

  @ApiProperty()
  shortCode!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ description: 'Zero-based order key; read as ORDER BY position, id.' })
  position!: number;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Null on a live value; set only on the deleted rows `?include=deleted` returns.',
  })
  deletedAt!: string | null;

  static from(value: ListedCodeValue): CodeValueResponseDto {
    return {
      id: value.id,
      codeTypeId: value.codeTypeId,
      shortCode: value.shortCode,
      description: value.description,
      position: value.position,
      version: value.version,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
      deletedAt: value.deletedAt === null ? null : value.deletedAt.toISOString(),
    };
  }
}

/** Public representation of a code type (p6-activity-codes spec §4.7). */
export class CodeTypeResponseDto {
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

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Null on a live type; set only on the deleted rows `?include=deleted` returns.',
  })
  deletedAt!: string | null;

  @ApiPropertyOptional({
    type: CodeValueResponseDto,
    isArray: true,
    description:
      "The type's values in order. Present on the list and on a restore; absent on a create or a rename.",
  })
  values?: CodeValueResponseDto[];

  static from(type: CodeType, values?: readonly ListedCodeValue[]): CodeTypeResponseDto {
    return {
      id: type.id,
      planId: type.planId,
      name: type.name,
      position: type.position,
      version: type.version,
      createdAt: type.createdAt.toISOString(),
      updatedAt: type.updatedAt.toISOString(),
      deletedAt: type.deletedAt === null ? null : type.deletedAt.toISOString(),
      ...(values === undefined ? {} : { values: values.map((v) => CodeValueResponseDto.from(v)) }),
    };
  }
}
