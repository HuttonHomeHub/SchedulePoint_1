import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDate } from '../../../common/validation/calendar-date';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for creating a plan. The parent project and organisation are
 * taken from the route/scope, never from the body (anti-IDOR). `status` defaults
 * to `DRAFT`; `plannedStart` is an optional calendar day (`YYYY-MM-DD`).
 */
export class CreatePlanDto {
  @ApiProperty({ minLength: 1, maxLength: 200, description: 'Display name of the plan.' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Optional free-text description.' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: PlanStatus, default: PlanStatus.DRAFT })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-05-01',
    description: 'Planned start as a calendar day (YYYY-MM-DD), date-only.',
  })
  @IsOptional()
  @IsCalendarDate()
  plannedStart?: string;
}
