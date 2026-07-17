import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResourceKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
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
}
