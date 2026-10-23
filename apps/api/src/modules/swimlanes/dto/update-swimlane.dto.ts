import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

import { NO_CONTROL_CHARACTERS, SWIMLANE_NAME_MAX, trim } from './create-swimlane.dto';

/** Request body for renaming a swimlane. The version is the caller's last read; stale is a 409. */
export class UpdateSwimlaneDto {
  @ApiProperty({
    minLength: 1,
    maxLength: SWIMLANE_NAME_MAX,
    description: 'The new name (trimmed, 1–80 characters, no control characters).',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SWIMLANE_NAME_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'name must not contain control characters' })
  name!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
