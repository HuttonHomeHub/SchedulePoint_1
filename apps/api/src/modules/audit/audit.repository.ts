import { Injectable } from '@nestjs/common';
import { type AuditEvent, Prisma } from '@prisma/client';
import type { AuditAction, AuditOutcome } from '@repo/types';

import { PrismaService } from '../../prisma/prisma.service';

/** A page of events, newest first, with the cursor to continue from. */
export interface AuditEventPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

/**
 * The optional narrowing both reads accept (ADR-0073 Decision 4). Every field absent ⇒ the
 * unfiltered page, byte-identical to the pre-filter behaviour.
 *
 * Validated at the DTO; this shape is what survives it, so the repository builds a `where` from
 * values it can trust rather than re-checking them.
 */
export interface AuditEventFilter {
  // Explicitly `| undefined` rather than merely optional: `exactOptionalPropertyTypes` is on, and
  // the caller builds this by reading four optional DTO fields straight through. Requiring it to
  // omit each absent key instead would be four conditional spreads for no expressive gain — "the
  // key is absent" and "the filter is absent" mean the same thing to `whereFrom`.
  actions?: AuditAction[] | undefined;
  outcomes?: AuditOutcome[] | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

/**
 * Translate the filter into Prisma `where` fragments.
 *
 * **These go into the WHERE, never a post-filter over a fetched page.** Filtering after the query
 * would silently break pagination: `take: limit + 1` would count rows the caller never sees, so a
 * page could come back short — or empty — while `hasMore` claimed otherwise, and the bug would only
 * appear on selective filters, which is to say the useful ones.
 */
function whereFrom(filter: AuditEventFilter | undefined): Prisma.AuditEventWhereInput {
  if (!filter) return {};

  const occurredAt =
    filter.from !== undefined || filter.to !== undefined
      ? {
          // Both bounds inclusive: the DTO documents them that way, and an exclusive upper bound
          // would drop the newest event whenever a caller pastes an exact timestamp from a row.
          ...(filter.from !== undefined ? { gte: new Date(filter.from) } : {}),
          ...(filter.to !== undefined ? { lte: new Date(filter.to) } : {}),
        }
      : undefined;

  return {
    ...(filter.actions?.length ? { action: { in: filter.actions } } : {}),
    ...(filter.outcomes?.length ? { outcome: { in: filter.outcomes } } : {}),
    ...(occurredAt ? { occurredAt } : {}),
  };
}

/**
 * Data access for the audit log (ADR-0072).
 *
 * **There is no update and no delete, and there never will be** — the table's trigger raises on
 * both, so a method offering them could only ever throw. Their absence here is the API-level
 * expression of the same rule, so a caller does not have to reach the database to learn it.
 *
 * Reads are keyset-paginated newest-first on `(occurred_at DESC, id DESC)`, matching the two
 * partial indexes exactly. `id` breaks the tie because two events can share a millisecond, and a
 * cursor on time alone would either skip or repeat rows at a page boundary.
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert one event. Takes an optional transaction client so the row is written **inside** the
   * caller's transaction — the property that makes an action and its record atomic.
   */
  async create(
    data: Prisma.AuditEventUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AuditEvent> {
    return (tx ?? this.prisma).auditEvent.create({ data });
  }

  /** One organisation's events. Org-scoped in the WHERE — never filtered after the fact. */
  async listForOrganization(
    organizationId: string,
    limit: number,
    cursor?: string,
    filter?: AuditEventFilter,
  ): Promise<AuditEventPage> {
    // The org scope is spread LAST so no caller-supplied fragment can displace it. `whereFrom`
    // only ever emits `action`/`outcome`/`occurredAt`, but the ordering makes the tenant boundary
    // hold structurally rather than by that fact staying true.
    return this.page({ ...whereFrom(filter), organizationId }, limit, cursor);
  }

  /**
   * One principal's own events, across every organisation and including the org-less
   * authentication rows.
   *
   * The actor id is a **parameter of the caller's identity**, never of the request — the endpoint
   * that uses this takes no user id of any kind, so there is no value a caller could tamper with
   * to read somebody else's history.
   */
  async listForActor(
    actorUserId: string,
    limit: number,
    cursor?: string,
    filter?: AuditEventFilter,
  ): Promise<AuditEventPage> {
    return this.page({ ...whereFrom(filter), actorUserId }, limit, cursor);
  }

  private async page(
    where: Prisma.AuditEventWhereInput,
    limit: number,
    cursor?: string,
  ): Promise<AuditEventPage> {
    // Over-fetch by one to learn whether another page exists without a second COUNT query.
    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    return { events, nextCursor: hasMore ? (events.at(-1)?.id ?? null) : null };
  }
}
