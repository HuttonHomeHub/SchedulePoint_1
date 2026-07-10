import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/** The three hierarchy levels a deleted row can belong to. */
export type DeletedKind = 'client' | 'project' | 'plan';

/** A soft-deleted row, with enough context to order and restore it. */
export interface DeletedRow {
  kind: DeletedKind;
  id: string;
  name: string;
  deletedAt: Date;
  /** True when the row's parent is active (or it is a client) — i.e. restorable now. */
  parentActive: boolean;
}

/** Keyset position in the merged deleted stream: `(deletedAt, id)`. */
export interface DeletedCursor {
  deletedAt: Date;
  id: string;
}

/**
 * Data-access for the recycle bin. Reads soft-deleted rows across all three
 * hierarchy tables. The ordering `(deletedAt desc, id asc)` is a total order over
 * the union (ids are globally-unique uuids), and — because a cascade stamps a
 * whole batch with one `deletedAt` — the id tiebreaker keeps a batch grouped and
 * safe to keyset-page. Each table is fetched for its own top `take` after the
 * cursor; the service merges and slices (see {@link RecycleBinService}).
 */
@Injectable()
export class RecycleBinRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDeletedPage(params: {
    organizationId: string;
    take: number;
    cursor?: DeletedCursor;
  }): Promise<DeletedRow[]> {
    const { organizationId, take, cursor } = params;
    // Rows strictly after the cursor in `(deletedAt desc, id asc)` order.
    const after = cursor
      ? {
          OR: [
            { deletedAt: { lt: cursor.deletedAt } },
            { deletedAt: cursor.deletedAt, id: { gt: cursor.id } },
          ],
        }
      : {};

    const [clients, projects, plans] = await Promise.all([
      this.prisma.client.findMany({
        where: { organizationId, deletedAt: { not: null }, ...after },
        select: { id: true, name: true, deletedAt: true },
        orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
        take,
      }),
      this.prisma.project.findMany({
        where: { organizationId, deletedAt: { not: null }, ...after },
        select: { id: true, name: true, deletedAt: true, client: { select: { deletedAt: true } } },
        orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
        take,
      }),
      this.prisma.plan.findMany({
        where: { organizationId, deletedAt: { not: null }, ...after },
        select: { id: true, name: true, deletedAt: true, project: { select: { deletedAt: true } } },
        orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
        take,
      }),
    ]);

    const rows: DeletedRow[] = [];
    for (const c of clients) {
      // A client's parent is its (always-active) organisation, so it is always
      // restorable. `deletedAt` is non-null by the `where` filter; guard to narrow.
      if (c.deletedAt) {
        rows.push({
          kind: 'client',
          id: c.id,
          name: c.name,
          deletedAt: c.deletedAt,
          parentActive: true,
        });
      }
    }
    for (const p of projects) {
      if (p.deletedAt) {
        rows.push({
          kind: 'project',
          id: p.id,
          name: p.name,
          deletedAt: p.deletedAt,
          parentActive: p.client.deletedAt === null,
        });
      }
    }
    for (const p of plans) {
      if (p.deletedAt) {
        rows.push({
          kind: 'plan',
          id: p.id,
          name: p.name,
          deletedAt: p.deletedAt,
          parentActive: p.project.deletedAt === null,
        });
      }
    }
    return rows;
  }
}
