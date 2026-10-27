import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { CODE_NAME_MAX } from '../codes.constants';

import { MAX_VERSION, NO_CONTROL_CHARACTERS, trim } from './code-text';

/** Request body for renaming a code type. The version is the caller's last read; stale is a 409. */
export class UpdateCodeTypeDto {
  @ApiProperty({
    minLength: 1,
    maxLength: CODE_NAME_MAX,
    description: 'The new name (trimmed, 1–80 characters, no control characters).',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CODE_NAME_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'name must not contain control characters' })
  name!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION)
  version!: number;
}
