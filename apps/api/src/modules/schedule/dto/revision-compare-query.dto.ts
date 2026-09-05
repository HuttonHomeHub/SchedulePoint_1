import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

import { LIVE_REVISION } from '../schedule.service';

/**
 * Query params for the revision comparison (revision M1).
 *
 * `to` is a **union of a UUID and one literal**, which `class-validator` has no single decorator
 * for — so it is one `Matches` over both alternatives rather than `@IsUUID()` with an escape hatch.
 * The alternative considered and rejected was two optional params (`toBaseline` / `toLive`), which
 * makes "both supplied" and "neither supplied" two more states the service has to answer for, to
 * spare one regular expression.
 */
const UUID_V4 = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

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
  @Matches(new RegExp(`^(${LIVE_REVISION}|${UUID_V4})$`), {
    message: 'to must be a baseline id or the literal "live".',
  })
  to: string = LIVE_REVISION;
}
