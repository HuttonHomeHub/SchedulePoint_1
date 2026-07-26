import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * Body of an **archive** / **unarchive** action (ADR-0053 §4) — the optimistic-locking
 * `version` and nothing else.
 *
 * `archived_at` is **server-set**: it is a `POST …/archive` | `…/unarchive` action rather than a
 * PATCH field precisely so a client can never supply the instant, and so "retire this" is a
 * distinct, auditable intent rather than a field buried in a general update. The action still
 * rides the same optimistic gate every other write does — archiving a row someone else has just
 * changed is a 409, exactly like a stale PATCH — which is why the body is not empty.
 *
 * Shared by the calendar and resource libraries so the two behave identically.
 */
export class ArchiveActionDto {
  @ApiProperty({
    minimum: 1,
    description: 'The version the client last read; a mismatch is 409 (optimistic locking).',
  })
  @IsInt()
  @Min(1)
  version!: number;
}
