import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUDIT_ACTIONS, type AuditAction } from '@repo/types';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsIn, IsOptional, Validate } from 'class-validator';

import { toArray } from '../../../common/dto/to-array';

import { AUDIT_FILTER_MAX_ACTIONS, ListAuditEventsQueryDto } from './list-audit-events-query.dto';
import { NotAnOrganizationlessAction } from './not-an-organizationless-action.validator';

/**
 * The organisation read's query contract: the shared filter, plus the one narrowing this route
 * cannot honour (ADR-0073).
 *
 * An `auth.*` row carries **no `organizationId`** — authentication happens before an organisation
 * is known — and this endpoint filters on exactly that column, so naming one here can only ever
 * return an empty page. The first version of this DTO **documented** that in a description and
 * accepted the request anyway, which is the defect the rest of the file exists to prevent: a filter
 * that silently matches nothing, answered 200, on the one screen where "nothing" reads as evidence.
 * It is refused instead.
 *
 * There is a second, measured reason. A filter combination that matches nothing is also the most
 * expensive query this table can be asked: with no index on `action`, Postgres walks the whole
 * organisation partition to prove the absence. Measured on Postgres 17 at 1M rows (909k in one
 * organisation), a zero-match combination cost **681–954 ms** against **0.35 ms** for the
 * unfiltered page. So the cheapest way for a caller to reach the worst case in the system was the
 * one combination we had already established could never return a row.
 *
 * `action` is redeclared rather than inherited because a subclass cannot add a constraint to an
 * inherited property — `class-validator` reads decorators per declaring class, so an override that
 * omitted the base rules would silently drop them.
 */
export class ListOrganizationAuditEventsQueryDto extends ListAuditEventsQueryDto {
  @ApiPropertyOptional({
    enum: AUDIT_ACTIONS,
    isArray: true,
    maxItems: AUDIT_FILTER_MAX_ACTIONS,
    description:
      'Narrow to one or more actions (repeat the param). Omit for every action. An unknown value ' +
      'is rejected with 422, and so is any `auth.*` action: those rows carry no organisation and ' +
      'could only ever produce an empty page here. Read your own sign-ins on `/me/audit-events`.',
    example: ['member.role_changed', 'plan.deleted'],
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @ArrayMaxSize(AUDIT_FILTER_MAX_ACTIONS)
  @IsIn(AUDIT_ACTIONS, {
    each: true,
    message: 'action must be one of the documented audit actions.',
  })
  @Validate(NotAnOrganizationlessAction)
  // The explicit initializer is required, not stylistic: under `useDefineForClassFields` a
  // re-declared field without one is TS2612, and `declare` cannot carry decorators. `undefined` is
  // what an absent filter already means, and `plainToInstance` assigns after construction, so the
  // "no filter field materialises unless the caller sent one" property is unchanged.
  override action?: AuditAction[] = undefined;
}
