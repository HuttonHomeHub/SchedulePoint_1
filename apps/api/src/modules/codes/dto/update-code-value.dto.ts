import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CODE_DESCRIPTION_MAX, CODE_SHORT_CODE_MAX } from '../codes.constants';

import { MAX_VERSION, NO_CONTROL_CHARACTERS, trim, trimToNull } from './code-text';

/**
 * Request body for editing a code value. A partial update: an omitted field is left alone, and
 * `description: null` (or a blank string) clears it. At least one field must be sent; the service
 * refuses an empty edit rather than spend a version on it.
 */
export class UpdateCodeValueDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: CODE_SHORT_CODE_MAX,
    description: 'The new short code (trimmed, 1–80 characters, no control characters).',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CODE_SHORT_CODE_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'shortCode must not contain control characters' })
  shortCode?: string;

  @ApiPropertyOptional({
    maxLength: CODE_DESCRIPTION_MAX,
    nullable: true,
    description:
      'The new description (trimmed, up to 255 characters, no control characters). Blank or null ' +
      'clears it.',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MinLength(1)
  @MaxLength(CODE_DESCRIPTION_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'description must not contain control characters' })
  description?: string | null;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION)
  version!: number;
}
