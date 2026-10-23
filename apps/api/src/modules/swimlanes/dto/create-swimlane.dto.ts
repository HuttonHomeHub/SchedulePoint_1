import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

/** Trim a string value before validation; leave non-strings untouched (the plans/projects pattern). */
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * The same predicate as `ck_swimlanes_name_shape`'s `!~ '[[:cntrl:]]'`: no control character, so a
 * newline or tab is a 422 at the boundary rather than a 500 from the CHECK. Length and trimming are
 * the other two halves of that constraint.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
export const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F-\u009F]*$/;

export const SWIMLANE_NAME_MAX = 80;

/** Request body for creating a swimlane on a plan (swimlanes spec §4.12). */
export class CreateSwimlaneDto {
  @ApiProperty({
    minLength: 1,
    maxLength: SWIMLANE_NAME_MAX,
    description:
      'The swimlane name, trimmed, 1–80 characters, no control characters. Unique among the ' +
      "plan's active swimlanes, ignoring case.",
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SWIMLANE_NAME_MAX)
  @Matches(NO_CONTROL_CHARACTERS, { message: 'name must not contain control characters' })
  name!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Insert directly after this active swimlane of the same plan. Omitted: append at the end.',
  })
  @IsOptional()
  @IsUUID()
  after?: string;
}
