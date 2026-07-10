import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_WORKING_WEEKDAYS_MASK, MIN_WORKING_WEEKDAYS_MASK } from '@repo/types';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for updating a calendar. `version` is required for optimistic
 * locking (echo the value from the last read). Name, working pattern and
 * description are each optional; send only what changes. Description may be set
 * to an empty string to clear it.
 */
export class UpdateCalendarDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    minimum: MIN_WORKING_WEEKDAYS_MASK,
    maximum: MAX_WORKING_WEEKDAYS_MASK,
    description: '7-bit working-weekday mask (1–127); see WorkingWeekdays in @repo/types.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_WORKING_WEEKDAYS_MASK)
  @Max(MAX_WORKING_WEEKDAYS_MASK)
  workingWeekdays?: number;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
