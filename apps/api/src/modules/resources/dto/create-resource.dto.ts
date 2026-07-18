import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResourceKind } from '@prisma/client';
import { DECIMAL_18_4_MAX } from '@repo/types';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
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
 * Request body for creating a resource in the org-scoped resource library (ADR-0039).
 * The organisation is taken from the route scope, never from the body (anti-IDOR). The
 * engine-owned `resource_driver_missing` flag lives on the activity, not here, and is
 * never accepted from input.
 */
export class CreateResourceDto {
  @ApiProperty({ minLength: 1, maxLength: 200, description: 'Display name of the resource.' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    maxLength: 32,
    description: 'Optional short human handle (e.g. "CR600"); unique per org among active rows.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Optional free-text description.' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    enum: ResourceKind,
    description: 'LABOUR (crew/trade), EQUIPMENT (plant/machinery) or MATERIAL (a consumable).',
  })
  @IsEnum(ResourceKind)
  kind!: ResourceKind;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      "The resource's own working-time calendar (ADR-0039) — must be an active calendar in the " +
      'same organisation. Omit or null to inherit the plan default at schedule time. Validated service-side.',
  })
  @IsOptional()
  // Allow an explicit null (inherit); validate the shape only for a value. @Matches(UUID_REGEX),
  // not @IsUUID, because our ids are UUID v7 which some class-validator versions reject.
  @ValidateIf((_, value) => value !== null)
  @Matches(UUID_REGEX, { message: 'calendarId must be a valid UUID.' })
  calendarId?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Capacity ceiling — the maximum units available per working hour (ADR-0041 §2). Exact numeric ' +
      '(>= 0, N21); omit for uncapped (no ceiling). Read by the levelling pass when the plan opts in. ' +
      'Capped at DECIMAL_18_4_MAX — a value above it is a clean 422, not a Decimal(18,4) overflow 500 (TECH_DEBT #40a).',
  })
  @IsOptional()
  @Type(() => Number)
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 422).
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(DECIMAL_18_4_MAX)
  maxUnitsPerHour?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Planned cost rate in minor units per unit of work (EV1, ADR-0042). A rate coefficient stored as ' +
      'DECIMAL(18,4) (may carry fractional minor units); exact numeric (>= 0, N22); omit for no cost. ' +
      'Read by the EV read (EV2b) when it derives assignment budgets. Capped at DECIMAL_18_4_MAX — a ' +
      'value above it is a clean 422, not a Decimal(18,4) overflow 500 (TECH_DEBT #40a).',
  })
  @IsOptional()
  @Type(() => Number)
  // DECIMAL(18,4) storage: reject more than 4 fractional digits at the boundary (a clean 422).
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(DECIMAL_18_4_MAX)
  costPerUnit?: number;
}
