import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReferenceItemStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Request body for updating a reference item. `version` is the expected current
 * version for optimistic locking (see docs/DATABASE.md) — a mismatch yields 409.
 */
export class UpdateReferenceItemDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ReferenceItemStatus })
  @IsOptional()
  @IsEnum(ReferenceItemStatus)
  status?: ReferenceItemStatus;

  @ApiProperty({ minimum: 1, description: 'Expected current version (optimistic locking).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
