import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUDIT_ACTIONS, AUDIT_OUTCOMES, type AuditAction, type AuditOutcome } from '@repo/types';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsIn, IsISO8601, IsOptional, Validate } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toArray } from '../../../common/dto/to-array';

import { FromIsBeforeTo } from './from-is-before-to.validator';

/**
 * The most actions one request may name: **the vocabulary itself**, derived and never a literal.
 *
 * This is a bound on predicate size, not a bound on work — an `IN` over every action matches
 * everything, which costs about what no filter costs. What it stops is an unbounded array turning
 * a convenience param into an arbitrary predicate builder.
 *
 * It was `20` until C4.1, chosen in C1 as "exactly today's vocabulary size" with the reasoning that
 * the largest single category held nine, so no chip selection could reach it. C3 then added
 * nineteen actions and `deletions` grew to twelve: **Deletions + Access is 21**, two chips offered
 * side by side on the same screen, and an ordinary filter started returning 422. Neither the
 * literal nor its docblock moved with the vocabulary they described, and both reviewers who read
 * this file found it independently — which is why the number is now computed rather than asserted.
 * A cap derived from `AUDIT_ACTIONS` cannot fall behind the next action added to it.
 */
export const AUDIT_FILTER_MAX_ACTIONS = AUDIT_ACTIONS.length;

/**
 * Query params for both audit reads (ADR-0073 Decision 4).
 *
 * **Every filter is optional and omitting all of them returns exactly today's page**, which is what
 * lets this land before the web control exists and lets the flag-off surface stay byte-identical.
 *
 * An unknown `action` or `outcome` is a **422 naming the value**, not an empty page. A filter that
 * silently matches nothing is the `PaginationQueryDto` `order` lesson (TECH_DEBT #19) in a new
 * costume: the caller gets a 200 and the wrong answer, and nothing in the response says the
 * parameter was ignored. This one is worse than `order` was, because an audit log answering "no
 * events" to a misspelled filter reads as evidence that nothing happened.
 *
 * The **API takes actions, never categories.** Categories are a reading aid the web expands into an
 * action list before it builds the request (ADR-0073; `AUDIT_CATEGORIES` in `@repo/types`) — one
 * vocabulary on the wire, so a category renamed for legibility is not a breaking API change.
 */
export class ListAuditEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: AUDIT_ACTIONS,
    isArray: true,
    maxItems: AUDIT_FILTER_MAX_ACTIONS,
    description:
      'Narrow to one or more actions (repeat the param). Omit for every action. An unknown value ' +
      'is rejected with 422 rather than silently matching nothing. `auth.*` actions are valid ' +
      'here — this is the only route that can return them — and are refused on the organisation ' +
      'route, whose rows always carry an organisation.',
    example: ['member.role_changed', 'plan.deleted'],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @ArrayMaxSize(AUDIT_FILTER_MAX_ACTIONS)
  @IsIn(AUDIT_ACTIONS, {
    each: true,
    message: 'action must be one of the documented audit actions.',
  })
  action?: AuditAction[];

  @ApiPropertyOptional({
    enum: AUDIT_OUTCOMES,
    isArray: true,
    maxItems: AUDIT_OUTCOMES.length,
    description:
      'Narrow to one or more outcomes (repeat the param). `DENIED` is a refused permission and ' +
      '`FAILURE` an error — deliberately distinct, so a probing attempt cannot hide inside noise.',
    example: ['DENIED'],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @ArrayMaxSize(AUDIT_OUTCOMES.length)
  @IsIn(AUDIT_OUTCOMES, { each: true, message: 'outcome must be SUCCESS, DENIED or FAILURE.' })
  outcome?: AuditOutcome[];

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Only events at or after this instant (ISO-8601). Inclusive.',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be an ISO-8601 instant.' })
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Only events at or before this instant (ISO-8601). Inclusive, and must not precede `from`.',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be an ISO-8601 instant.' })
  // Declared on `to` rather than `from` so the message lands on the field the caller most likely
  // mistyped, and so an omitted `to` cannot fail a range check it is not part of.
  @Validate(FromIsBeforeTo)
  to?: string;
}
