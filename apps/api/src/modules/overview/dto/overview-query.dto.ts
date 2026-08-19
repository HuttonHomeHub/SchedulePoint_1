import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsOptional, IsUUID } from 'class-validator';

import { toArray } from '../../../common/dto/to-array';

/**
 * How many plan ids one request may name — the browser's own cap (`RECENT_PLANS_CAP`), restated
 * here because the API cannot trust a client to hold to it.
 *
 * It is a bound on predicate size rather than on work: an `IN` over five ids is a primary-key
 * lookup either way. What it stops is a convenience parameter becoming an arbitrary id-probe with
 * no ceiling.
 */
export const MAX_RECENT_PLAN_IDS = 5;

/**
 * Query params for the organisation overview.
 *
 * **`recentPlanIds` is a resolution request, not a filter, and it cannot be an oracle.** The
 * browser remembers ids only (ADR-0098 §4.9 D10b) and asks the server for their current names on
 * every load, so a rename corrects itself and a deleted plan vanishes. That means the server is
 * being handed ids the caller may have no right to — and the four ways an id can fail (deleted,
 * another organisation's, one the caller cannot read, never existed) must produce an **identical**
 * response, because any difference between them tells the caller something about a plan they are
 * not entitled to know exists. There is deliberately no `reason` field, no partial-failure list and
 * no count of what was dropped: an id that does not resolve is simply absent, and the API e2e suite
 * asserts the four causes are indistinguishable.
 *
 * A malformed id is the one case that IS reported (422), because a client sending something that
 * is not a UUID has a bug rather than a permission problem — nothing about the organisation's
 * contents is disclosed by saying so.
 */
export class OverviewQueryDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_RECENT_PLAN_IDS,
    description:
      'Plan ids this browser remembers the caller opening (repeat the param). Resolved within ' +
      'the caller’s own organisation and returned as `recentPlans` in the order given. Anything ' +
      'the caller cannot read is omitted silently and indistinguishably, whatever the reason.',
    example: ['018f2c1e-0000-7000-8000-000000000001'],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @ArrayMaxSize(MAX_RECENT_PLAN_IDS)
  @IsUUID('all', { each: true, message: 'recentPlanIds must each be a UUID.' })
  recentPlanIds?: string[];
}
