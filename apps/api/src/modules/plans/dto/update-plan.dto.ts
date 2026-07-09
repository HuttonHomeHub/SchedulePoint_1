import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for updating a plan. `version` is required for optimistic
 * locking (echo the value from the last read). Every field is optional; send
 * only what changes. `description` may be `""` to clear it; `plannedStart` may
 * be `null` to clear it.
 */
export class UpdatePlanDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    example: '2026-05-01',
    description: 'Calendar day (YYYY-MM-DD), or null to clear.',
  })
  @IsOptional()
  // Allow an explicit null (clear the date); validate the format only for a value.
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  plannedStart?: string | null;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
