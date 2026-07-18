import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResourceKind } from '@prisma/client';
import { DECIMAL_18_4_MAX } from '@repo/types';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { UUID_REGEX } from '../../../common/validation/uuid';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for updating a resource (ADR-0039). `version` is required for
 * optimistic locking (echo the value from the last read). Every field is optional;
 * send only what changes. `code`/`description` may be set to an empty string to clear
 * them, and `calendarId` to null to inherit the plan default.
 */
export class UpdateResourceDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ResourceKind })
  @IsOptional()
  @IsEnum(ResourceKind)
  kind?: ResourceKind;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      "The resource's own calendar; null to inherit the plan default. Validated service-side.",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(UUID_REGEX, { message: 'calendarId must be a valid UUID.' })
  calendarId?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    description:
      'Capacity ceiling in units per working hour (ADR-0041 §2), or null to clear (uncapped). ' +
      'Exact numeric (>= 0, N21). Capped at DECIMAL_18_4_MAX — a value above it is a clean 422, not a ' +
      'Decimal(18,4) overflow 500 (TECH_DEBT #40a).',
  })
  @IsOptional()
  // Allow an explicit null (clear to uncapped); validate the shape only for a value.
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(DECIMAL_18_4_MAX)
  maxUnitsPerHour?: number | null;

  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    description:
      'Planned cost rate in minor units per unit of work (EV1, ADR-0042), or null to clear (no cost). ' +
      'A rate coefficient stored as DECIMAL(18,4); exact numeric (>= 0, N22). Capped at DECIMAL_18_4_MAX ' +
      '— a value above it is a clean 422, not a Decimal(18,4) overflow 500 (TECH_DEBT #40a).',
  })
  @IsOptional()
  // Allow an explicit null (clear to no cost); validate the shape only for a value.
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(DECIMAL_18_4_MAX)
  costPerUnit?: number | null;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
