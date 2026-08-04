import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsIn, IsOptional } from 'class-validator';

import { ListAuditEventsQueryDto, toArray } from './list-audit-events-query.dto';

/**
 * The one thing `include` can ask for today (ADR-0073 C2.3).
 *
 * An enum of one rather than a boolean `includeAttempts`, because the next thing this read has to
 * fold in — and there will be one, since `/me` is where every actor-less row aimed at a person has
 * to surface — would otherwise arrive as a second boolean, and two booleans do not compose into a
 * vocabulary. `include=attempts&include=…` does.
 */
export const SELF_AUDIT_INCLUDES = ['attempts'] as const;

export type SelfAuditInclude = (typeof SELF_AUDIT_INCLUDES)[number];

/**
 * The `/me` read's query contract: the shared filter, plus the opt-in projection that widens what
 * "your events" means (ADR-0073 C2.3).
 *
 * **Opt-in, and that is the parity argument.** With `include` absent the `where` is exactly what it
 * was before this existed — `actorUserId = me` — so the response is byte-identical and no flag is
 * needed to protect the old behaviour. The web surface asks for the projection behind
 * `VITE_AUDIT_SELF_SECURITY`; the server half cannot be flagged, because a `VITE_` constant is a
 * client build-time value (ADR-0060 M0).
 *
 * **Why an opt-in rather than always widening.** These rows are a different KIND of fact. Every
 * other row on this screen is something the reader did; an attempt row is something somebody else
 * did **to** them, and it is anonymous. Mixing the two silently would make the actor column's
 * meaning depend on the row, which is how "Not signed in" gets read as "you, signed out".
 */
export class ListSelfAuditEventsQueryDto extends ListAuditEventsQueryDto {
  @ApiPropertyOptional({
    enum: SELF_AUDIT_INCLUDES,
    isArray: true,
    maxItems: SELF_AUDIT_INCLUDES.length,
    description:
      'Widen the feed beyond your own actions (repeat the param). `attempts` adds failed ' +
      'sign-ins against your email address — rows with no actor, which nobody else can read. ' +
      'Omit it and the response is exactly what it was before this parameter existed.',
    example: ['attempts'],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @ArrayMaxSize(SELF_AUDIT_INCLUDES.length)
  @IsIn(SELF_AUDIT_INCLUDES, {
    each: true,
    message: 'include must be one of the documented projections.',
  })
  include?: SelfAuditInclude[];
}
