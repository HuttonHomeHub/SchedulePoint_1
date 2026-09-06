import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LIVE_REVISION } from '@repo/types';
import { IsArray, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Query params for the revision comparison (revision M1).
 *
 * `to` is a **union of a UUID and one literal**, which `class-validator` has no single decorator
 * for — so it is one `Matches` over both alternatives rather than `@IsUUID()` with an escape hatch.
 * The alternative considered and rejected was two optional params (`toBaseline` / `toLive`), which
 * makes "both supplied" and "neither supplied" two more states the service has to answer for, to
 * spare one regular expression.
 */
/**
 * The UUID half is the CANONICAL `UUID_REGEX`, unwrapped of its anchors rather than rewritten.
 *
 * The first version hand-rolled its own character-class pattern and named it `UUID_V4`, which was
 * wrong twice: it checked no version or variant nibble at all, and this application's ids are
 * **v7**. Worse, it made `to` looser than `from` on the same DTO for the same underlying type,
 * since `from`'s `@IsUUID()` does enforce version and variant. Reusing the shared matcher is also
 * the existing precedent for a "UUID or literal" field (`list-resources-query.dto.ts`).
 */
const UUID_PATTERN = UUID_REGEX.source.replace(/^\^/, '').replace(/\$$/, '');

/** The opt-in projections this route understands. */
export const REVISION_INCLUDES = ['changes', 'progress'] as const;
export type RevisionInclude = (typeof REVISION_INCLUDES)[number];

export class RevisionCompareQueryDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The OLD side: a baseline of this plan. Required — a comparison needs a thing to compare ' +
      'against, and defaulting it to the active baseline would make the answer depend on a ' +
      'setting the caller did not name.',
  })
  @IsUUID()
  from!: string;

  @ApiPropertyOptional({
    default: LIVE_REVISION,
    description:
      'The NEW side: a baseline of this plan, or the literal `live` for the plan as it stands ' +
      'now. Defaults to `live`, which is the question a planner actually asks.',
  })
  @Matches(new RegExp(`^(${LIVE_REVISION}|${UUID_PATTERN})$`, 'i'), {
    message: 'to must be a baseline id or the literal "live".',
  })
  to: string = LIVE_REVISION;

  /**
   * Opt-in projections. Absent ⇒ the response is **byte-identical** to what it was before the
   * change list existed, which is what lets a new surface land without touching the shipped one —
   * the ADR-0073 C2 `?include=attempts` pattern.
   *
   * `changes` adds the change list (what was added, removed, renamed, re-coded, re-typed,
   * re-durationed, re-dated, and what happened to criticality). `progress` additionally assesses
   * the progress class, which is **deliberately off by default**: progress moves on nearly every
   * activity every week, so included unasked it would bury the classes that explain a date move —
   * in exactly the meeting this feature exists for.
   */
  @ApiPropertyOptional({
    enum: REVISION_INCLUDES,
    isArray: true,
    description:
      'Opt-in projections. Absent ⇒ byte-identical to the delta-only response. `changes` adds ' +
      'the change list; `progress` additionally assesses the progress class, which is off by ' +
      'default because it moves on nearly every activity every week.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(REVISION_INCLUDES, { each: true })
  include?: RevisionInclude[];
}
