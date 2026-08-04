import { Injectable } from '@nestjs/common';
import { type AuditEvent, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** A page of events, newest first, with the cursor to continue from. */
export interface AuditEventPage {
  events: AuditEvent[];
  nextCursor: string | null;
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
  ): Promise<AuditEventPage> {
    return this.page({ organizationId }, limit, cursor);
  }

  /**
   * One principal's own events, across every organisation and including the org-less
   * authentication rows.
   *
   * The actor id is a **parameter of the caller's identity**, never of the request — the endpoint
   * that uses this takes no user id of any kind, so there is no value a caller could tamper with
   * to read somebody else's history.
   */
  async listForActor(actorUserId: string, limit: number, cursor?: string): Promise<AuditEventPage> {
    return this.page({ actorUserId }, limit, cursor);
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
