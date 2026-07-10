import { Injectable } from '@nestjs/common';
import type { DeletedHierarchyItem, PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { OrganizationsService } from '../organizations/organizations.service';

import { decodeDeletedCursor, encodeDeletedCursor } from './recycle-bin.cursor';
import { RecycleBinRepository, type DeletedRow } from './recycle-bin.repository';

/** Total order over the union: `deletedAt` descending, then `id` ascending. */
function byDeletedAtDescThenId(a: DeletedRow, b: DeletedRow): number {
  const delta = b.deletedAt.getTime() - a.deletedAt.getTime();
  if (delta !== 0) return delta;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Read model for the recycle bin — an organisation's soft-deleted clients,
 * projects and plans in one deletion-time-ordered, cursor-paginated list
 * (see docs/DECISIONS.md, 2026-07-10). Reading is a hierarchy read (any member);
 * restoring stays on the per-entity, writer-only `.../{id}/restore` endpoints.
 */
@Injectable()
export class RecycleBinService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly repo: RecycleBinRepository,
    @InjectPinoLogger(RecycleBinService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: DeletedHierarchyItem[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    // Representative hierarchy-read permission — reads are granted together, so
    // any member who can browse the tree can see what's been removed from it.
    this.assertCan(principal, 'client:read', organization.id);

    const cursor = query.cursor ? decodeDeletedCursor(query.cursor) : undefined;
    const rows = await this.repo.findDeletedPage({
      organizationId: organization.id,
      take: query.limit + 1,
      ...(cursor ? { cursor } : {}),
    });

    // Each table returned its own top `limit + 1`; the global top `limit + 1` is
    // a subset of their union, so merge-sort then slice yields the correct page.
    rows.sort(byDeletedAtDescThenId);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeDeletedCursor(last) : null;

    return {
      items: page.map((row) => ({
        kind: row.kind,
        id: row.id,
        name: row.name,
        deletedAt: row.deletedAt.toISOString(),
        canRestore: row.parentActive,
      })),
      meta: { nextCursor, hasMore },
    };
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
