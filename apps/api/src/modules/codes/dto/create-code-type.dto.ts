import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { CODE_NAME_MAX } from '../codes.constants';

import { NO_CONTROL_CHARACTERS, trim } from './code-text';

/** Request body for creating a code type on a plan (p6-activity-codes spec §4.7). */
export class CreateCodeTypeDto {
  @ApiProperty({
    minLength: 1,
    maxLength: CODE_NAME_MAX,
    description:
      'The code type name ("Area", "Trade"), trimmed, 1–80 characters, no control characters. ' +
      "Unique among the plan's live code types, ignoring case.",
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CODE_NAME_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'name must not contain control characters' })
  name!: string;
}
