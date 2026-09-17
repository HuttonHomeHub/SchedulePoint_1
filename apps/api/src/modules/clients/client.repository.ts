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

  /**
   * Active projects directly under one client.
   *
   * **Settled independently by the caller**, so a count that fails is ABSENT rather than zero
   * (ADR-0126 — `0` is a claim) and never takes the detail read down with it.
   *
   * **No new index, and that is a measured decision rather than an omission.** `docs/DATABASE.md`'s
   * soft-delete convention gives every level of the hierarchy a partial unique on
   * `(parent_id, name) WHERE deleted_at IS NULL`, so that a name is reusable after deletion — and a
   * soft-delete-aware child count wants exactly `(parent_id) WHERE deleted_at IS NULL` with **no
   * payload column**. The leading key matches, the predicate matches, and `COUNT(*)` needs nothing
   * from the heap, so `uq_projects_client_name` and `uq_plans_project_name` already serve both of
   * these. The uniqueness rule bought the index; nothing here has to.
   *
   * ADR-0144's refusal does not transfer, and it is worth saying why rather than citing it: that
   * decision declined an index **faster at every shape**, because any index making its aggregate
   * index-only had to contain `early_finish`, which `writeResults` rewrites on every recalculation
   * — HOT 28.4% to 0.0%, index growth +92% to +447%. The mechanism is specifically about a
   * **payload column**. A `COUNT(*)` has none, and the columns it does touch (the parent FK, the
   * `deleted_at` predicate) are not written by any recalculation. There is nothing to trade.
   *
   * **Three things here must not be tidied away.**
   *
   * 1. **No `organizationId` in either predicate.** It is a natural defence-in-depth reflex and it
   *    is measured in this repository at **62%** (`20260818220000_overview_recently_changed_indexes`,
   *    note 1) — the column is not in the index, so the predicate forces a heap fetch per row. The
   *    scope is already enforced twice over: the caller has resolved this client in the caller's
   *    organisation (404 otherwise) before either count is issued, and `plans.project_id` is an
   *    enforced foreign key. A count keyed on this client's own id cannot reach another
   *    organisation's rows.
   * 2. **`deletedAt: null` appears verbatim on both sides.** Same note: dropping it does not error,
   *    it silently falls back to a wider index and scans the whole set.
   * 3. This one is bounded by its subject, which is the property its withdrawn sibling lost — see
   *    the note below `findActiveByIdInOrg`.
   */
  countActiveProjects(clientId: string): Promise<number> {
    return this.prisma.project.count({ where: { clientId, deletedAt: null } });
  }

  /*
   * **A `countActivePlans` was built here and WITHDRAWN by measurement.** A count of plans across a
   * client's projects plans as a `Seq Scan on projects` once the client holds a substantial share
   * of that table — 500 of 2,000 measured at 4.12 ms, and O(projects in the installation) rather
   * than O(this client). FC-9(b) refuses that shape whatever the timing says, and the shape is what
   * predicts the cost as the estate grows.
   *
   * Do not add it back without re-running `apps/web/scripts/measure-detail-counts.mjs`: the two
   * remedies (resolve the project ids first and pass them as an array; or a candidate
   * `projects (client_id) INCLUDE (id) WHERE deleted_at IS NULL` index, which unlike ADR-0144's
   * rejected one would NOT spend the HOT exemption) both have costs of their own, and an index goes
   * through `database-architect` (CLAUDE.md §19.3).
   */

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
   * leading-wildcard `name ILIKE $1`, which no btree can serve. Measured at ADR-0053's own
   * 5,000-row ceiling: **3.6 ms** for a term matching nothing (the worst case, because `LIMIT` can
   * never stop early), against CLAUDE.md §15's 200 ms p95 budget — a tenant roughly **40×** larger
   * than this whole installation, which holds 124 clients across 2 organisations. A candidate
   * partial composite was measured too and saves ~0 ms for 1,768 kB.
   *
   * **What bounds the cost is the escalation trigger below, NOT a guaranteed plan shape**, and this
   * paragraph said otherwise until the M8 gate: it claimed a bitmap scan bounded to one tenant,
   * inheriting a sentence from ADR-0053 M4 whose own table composition (target tenant at 20.8% of
   * the table) made it true there and does not hold here. Re-measured independently, Postgres
   * **seq-scans the whole table** while the tenant is a majority share and switches to the
   * org-bound bitmap plan only below roughly 25–33% — and the deployed database is in the
   * seq-scan regime today (one org holds 123 of 124 clients). The number survives in both regimes,
   * 2.3–7.0 ms across the sweep, because the table stays proportional to the tenant's own ceiling;
   * the trigger is phrased on that ceiling for exactly this reason.
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
