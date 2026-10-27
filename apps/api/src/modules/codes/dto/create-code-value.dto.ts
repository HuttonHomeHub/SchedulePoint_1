import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { CODE_DESCRIPTION_MAX, CODE_SHORT_CODE_MAX } from '../codes.constants';

import { NO_CONTROL_CHARACTERS, trim, trimToNull } from './code-text';

/** Request body for adding a value to a code type (p6-activity-codes spec §4.7). */
export class CreateCodeValueDto {
  @ApiProperty({
    minLength: 1,
    maxLength: CODE_SHORT_CODE_MAX,
    description:
      'The value’s short code ("L1", "MECH"), trimmed, 1–80 characters, no control characters. ' +
      "Unique among the type's live values, ignoring case.",
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CODE_SHORT_CODE_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'shortCode must not contain control characters' })
  shortCode!: string;

  @ApiPropertyOptional({
    maxLength: CODE_DESCRIPTION_MAX,
    nullable: true,
    description:
      'A longer name for the value ("Level 1 East"), trimmed, up to 255 characters, no control ' +
      'characters. Blank or null means none.',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MinLength(1)
  @MaxLength(CODE_DESCRIPTION_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'description must not contain control characters' })
  description?: string | null;
}
