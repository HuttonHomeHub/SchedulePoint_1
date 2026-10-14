import type { Prisma } from '@prisma/client';

import type { ExpiryScope } from './hierarchy-expiry.runner';

/**
 * **Which soft-deleted roots are past their period, and what each one owns** — the single answer to
 * "what would the clear-out remove?", called by the hourly sweep and by the operator's preview
 * (`src/cli/clear-out-preview.ts`). Two derivations of one question drift apart without anybody
 * noticing, and here the drift would be a preview that promises less than the sweep deletes
 * (ADR-0121's rule; the pairing test in `test/hierarchy-expiry.e2e-spec.ts` is the gate).
 *
 * **Read-only by construction.** The reader is a `Pick` of the three finders this needs, and the
 * structural spec forbids every write accessor in this file, so a caller handing in a read-only
 * session cannot be surprised by it.
 */

export type ExpiryKind = 'client' | 'project' | 'plan';

/** What the sweep and the preview both need to know about a root, and nothing about its contents. */
export interface ExpiryRoot {
  kind: ExpiryKind;
  id: string;
  name: string;
  organizationId: string;
  deletedAt: Date;
  deleteBatchId: string | null;
}

/** The three finders the selector uses; a transaction client, the service and a bare client all fit. */
export type ExpiryReader = Pick<Prisma.TransactionClient, 'client' | 'project' | 'plan'>;

// The run budgets live here, not in the service, so the preview can state how many runs a backlog
// needs from the very numbers the sweep spends — importing the service would boot Nest.

/**
 * Activities permanently deleted per run before the sweep stops and waits for the next tick.
 *
 * **Measured in ACTIVITIES, not batches**, because a batch is one activity or forty thousand and a
 * batch count therefore bounds nothing. At ~59 µs/activity with the FK indexes in place, 20,000 is
 * about 1.1 s of database work an hour.
 *
 * **No cap bounds the largest single batch, and that is stated rather than promised away.** A batch
 * cannot be split — expiring half of one leaves an unrestorable remnant — so a 200,000-activity
 * client cascade extrapolates to roughly 12 s in one transaction. The cap limits how many batches
 * follow it, never how big the first one is.
 */
export const ACTIVITY_BUDGET_PER_RUN = 20_000;

/**
 * The most scopes one run will expire, however small each one is.
 *
 * The activity budget bounds the **big-batch** case and says nothing about the mirror one, which is
 * the shape a real backlog actually has: hundreds of ordinary deletions carrying no activities at
 * all. Measured at ~10.2 ms per empty plan-scope (one transaction, one audit insert, the real
 * client) — so 100,000 of them would run for about **17 minutes** with the activity budget never
 * moving, on a job whose interval can be configured down to five. That is the case D3 guarantees
 * happens on every installation's first armed tick.
 *
 * 2,000 scopes is about 20 s. The remainder is not lost — the next tick takes it — and the two caps
 * are deliberately different quantities rather than one fudged number, because they bound different
 * failure modes. Found by the ADR-0096 backend-performance review.
 */
export const SCOPE_BUDGET_PER_RUN = 2_000;

/** Rows per page when a caller asks for no limit. Arbitrary; it bounds memory per round trip only. */
const PAGE_SIZE = 1_000;

interface ScannedRow {
  id: string;
  name: string;
  organizationId: string;
  deletedAt: Date | null;
  deleteBatchId: string | null;
}

/**
 * Pull the roots past `cutoff`, oldest first, at most `limit` of them — or all of them, paged,
 * when `limit` is omitted (the preview must list the whole backlog; the sweep must not
 * materialise it, see `CANDIDATE_SCAN_LIMIT`).
 */
async function scan<T extends ScannedRow>(
  limit: number | undefined,
  page: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
): Promise<T[]> {
  if (limit !== undefined) return page({ take: limit });
  const out: T[] = [];
  for (;;) {
    const last = out[out.length - 1];
    const rows = await page(
      last === undefined
        ? { take: PAGE_SIZE }
        : { take: PAGE_SIZE, cursor: { id: last.id }, skip: 1 },
    );
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

/**
 * The roots to expire, in the order the sweep takes them: clients, then projects, then plans, each
 * oldest-deleted first.
 *
 * **All three levels, not just clients.** A plan deleted on its own never had a deleted client
 * above it, so a client-only scan would leave it in the bin forever while its countdown said
 * otherwise — a screen that lies rather than a sweep that misses.
 *
 * A descendant whose ancestor is ALSO expiring is left out: the ancestor's own pass takes it, and
 * selecting both would attempt the same rows twice. The second attempt is harmless (the rows are
 * gone) but the counts a reader sees would be wrong.
 *
 * Strictly older than the cutoff: a row deleted at exactly `cutoff` is kept.
 */
export async function selectExpiryCandidates(
  reader: ExpiryReader,
  options: { cutoff: Date; limit?: number },
): Promise<ExpiryRoot[]> {
  return (await selectExpiryCandidatesBounded(reader, options)).roots;
}

/**
 * {@link selectExpiryCandidates}, also saying whether a scan stopped at `limit` — so a caller that
 * counts (the boot log) can say "at least N" instead of presenting a truncated count as exact.
 */
export async function selectExpiryCandidatesBounded(
  reader: ExpiryReader,
  options: { cutoff: Date; limit?: number },
): Promise<{ roots: ExpiryRoot[]; truncated: boolean }> {
  const { cutoff, limit } = options;
  const where = { deletedAt: { lt: cutoff } };
  // `id` breaks ties so a cursor page and a limited scan agree on the order of equal timestamps.
  const orderBy = [{ deletedAt: 'asc' as const }, { id: 'asc' as const }];
  const select = {
    id: true,
    name: true,
    organizationId: true,
    deletedAt: true,
    deleteBatchId: true,
  };

  const [clients, projects, plans] = await Promise.all([
    scan(limit, (page) => reader.client.findMany({ where, select, orderBy, ...page })),
    scan(limit, (page) =>
      reader.project.findMany({
        where,
        select: { ...select, clientId: true },
        orderBy,
        ...page,
      }),
    ),
    scan(limit, (page) =>
      reader.plan.findMany({
        where,
        select: { ...select, projectId: true },
        orderBy,
        ...page,
      }),
    ),
  ]);

  const expiringClients = new Set(clients.map((c) => c.id));
  const expiringProjects = new Set(projects.map((p) => p.id));

  const toRoot = (kind: ExpiryKind, row: ScannedRow): ExpiryRoot => ({
    kind,
    id: row.id,
    name: row.name,
    organizationId: row.organizationId,
    // `lt` above guarantees a value; the type does not know.
    deletedAt: row.deletedAt as Date,
    deleteBatchId: row.deleteBatchId,
  });

  return {
    roots: [
      ...clients.map((c) => toRoot('client', c)),
      ...projects.filter((p) => !expiringClients.has(p.clientId)).map((p) => toRoot('project', p)),
      ...plans.filter((p) => !expiringProjects.has(p.projectId)).map((p) => toRoot('plan', p)),
    ],
    truncated:
      limit !== undefined &&
      (clients.length >= limit || projects.length >= limit || plans.length >= limit),
  };
}

/**
 * The rows `root` owns, resolved separately from the scan so the sweep spends this lookup only on
 * roots its budgets reach — resolving every root up front would do work the budget never spends.
 *
 * soft-delete: any-state — takes every project and plan beneath the root, active ones included,
 * because the expiry deletes by ownership scope rather than by deletion state (ADR-0096 D5).
 */
export async function resolveExpiryScope(
  reader: ExpiryReader,
  root: Pick<ExpiryRoot, 'kind' | 'id'>,
): Promise<ExpiryScope> {
  if (root.kind === 'plan') return { clientIds: [], projectIds: [], planIds: [root.id] };

  if (root.kind === 'project') {
    const planRows = await reader.plan.findMany({
      where: { projectId: root.id },
      select: { id: true },
    });
    return { clientIds: [], projectIds: [root.id], planIds: planRows.map((p) => p.id) };
  }

  const projectRows = await reader.project.findMany({
    where: { clientId: root.id },
    select: { id: true },
  });
  const projectIds = projectRows.map((p) => p.id);
  const planRows =
    projectIds.length === 0
      ? []
      : await reader.plan.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true },
        });
  return { clientIds: [root.id], projectIds, planIds: planRows.map((p) => p.id) };
}
