import { Injectable } from '@nestjs/common';
import { Prisma, type Client } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The `name` term for a `?q=` search, or `{}` when there is no search.
 *
 * Prisma's `contains` + `mode: 'insensitive'` compiles to `name ILIKE '%q%'`. Two properties of
 * that are worth knowing at the call site rather than discovering from a support question:
 * `%` and `_` in the term are **not escaped**, so a client literally named `50%` cannot be found
 * by searching for it (`docs/TECH_DEBT.md` #337, inherited verbatim from the library searches);
 * and the match is case-insensitive while `uq_clients_org_name` is case-**sensitive**, so `Acme`
 * and `acme` can both exist and one search returns both.
 */
function clientSearchWhere(search: string | undefined): Prisma.ClientWhereInput {
  if (search === undefined) return {};
  return { name: { contains: search, mode: 'insensitive' } };
}

/**
 * Data-access for clients (ADR-0008). Centralises the soft-delete filter so no
 * read forgets `deletedAt: null`; write methods accept an optional transaction
 * client. Delete/restore are handled by the shared HierarchyLifecycleService
 * (cascade), so this repository only covers create/read/update.
 */
@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ClientWhereInput = {}): Prisma.ClientWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ClientUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Client> {
    return db.client.create({ data });
  }

  /** An active client scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Client | null> {
    return db.client.findFirst({ where: this.active({ id, organizationId }) });
  }

  /** A client in an organisation in ANY state (active or soft-deleted) — used to
   * scope a restore to the caller's org before reactivating it. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Client | null> {
    return db.client.findFirst({ where: { id, organizationId } });
  }

  /**
   * A page of an organisation's active clients (keyset cursor by id), optionally narrowed by a
   * case-insensitive substring of the name.
   *
   * **The search is a spreadable fragment, not an `OR`** — the same shape as
   * `calendarSearchWhere`, and for the same reason: it has to compose with `this.active(…)`
   * without either clobbering the other.
   *
   * **No index, and that is a measured decision rather than an omission.** The term compiles to a
   * leading-wildcard `name ILIKE $1`, which no btree can serve — but the leading equality on
   * `organization_id` bounds the candidate set to one tenant in cursor order and the `ILIKE` is a
   * recheck over that bounded set. Measured at ADR-0053's own 5,000-row ceiling: **3.6 ms** for a
   * term matching nothing (the worst case, because `LIMIT` can never stop early), against
   * CLAUDE.md §15's 200 ms p95 budget. That is a tenant roughly 190× larger than this whole
   * installation. A candidate partial composite was measured too and saves ~0 ms for 1,768 kB.
   *
   * **Escalate** if a single organisation passes ~2,000 active clients, or the list's p95 passes
   * ~20 ms: `CREATE EXTENSION pg_trgm` then a GIN index on **`name`** — not `lower(name)`, which
   * cannot serve this predicate at all (`docs/TECH_DEBT.md` #336).
   */
  findManyActiveByOrg(params: {
    organizationId: string;
    take: number;
    cursor?: string;
    search?: string;
  }): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: {
        ...this.active({ organizationId: params.organizationId }),
        ...clientSearchWhere(params.search),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still
   * matches. Returns rows changed — `0` means a version conflict or the row is
   * gone, which the service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: { name?: string; description?: string | null },
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.client.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }
}
