import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** Trim a string value before validation; leave non-strings untouched (the plans/projects pattern). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for editing a note's body (ADR-0046). Only the author may edit (a row-level check the
 * service enforces on top of `note:update`). The body is trimmed before validation (whitespace-only ⇒
 * 422), and the optimistic `version` must match the caller's last-read value or the update is a **409**
 * (the mutable-row convention). `updated_by` is stamped to the actor by the service.
 */
export class UpdateNoteDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 5000,
    description: 'The revised note text (plain text, 1–5000 chars after trimming; no markdown).',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiProperty({
    minimum: 1,
    description: 'The version the caller last read — stale ⇒ 409 (optimistic locking).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
