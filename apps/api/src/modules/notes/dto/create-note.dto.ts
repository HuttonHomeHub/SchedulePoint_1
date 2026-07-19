import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Trim a string value before validation; leave non-strings untouched (the plans/projects pattern). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for creating a note (ADR-0046). The **body is the only client field** — the
 * organisation, entity type, plan id and (for an activity note) activity id are all DERIVED
 * server-side from the resolved parent, never trusted from input (the `Activity`/`ActivityDependency`
 * denormalised-scope invariant). The body is trimmed BEFORE validation (`@Transform`) so a
 * whitespace-only entry collapses to `''` and fails `@MinLength(1)` → 422; the service trims-and-
 * validates again (defence in depth) and the DB `ck_notes_body_length` CHECK is the final backstop.
 * Plain text only — no markdown (Q1 default).
 */
export class CreateNoteDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 5000,
    description: 'The note text (plain text, 1–5000 chars after trimming; no markdown).',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
