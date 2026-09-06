import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LIVE_REVISION } from '@repo/types';
import { IsUUID, Matches } from 'class-validator';

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
}
