import { Injectable } from '@nestjs/common';
import type { DeletedHierarchyItem, DeletedItemsMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/app-config.service';
import { OrganizationsService } from '../organizations/organizations.service';

import { decodeDeletedCursor, encodeDeletedCursor } from './recycle-bin.cursor';
import { RecycleBinRepository } from './recycle-bin.repository';

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
    private readonly appConfig: AppConfigService,
    @InjectPinoLogger(RecycleBinService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: DeletedHierarchyItem[]; meta: DeletedItemsMeta }> {
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

    // The repository's `UNION ALL … ORDER BY … LIMIT` already returns the globally
    // ordered top `limit + 1` across all three tables, so there is nothing to merge
    // here — only the standard over-fetch-by-one has-more probe (TECH_DEBT #22).
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
        deleteBatchId: row.deleteBatchId,
        blockedBy: row.blockedBy,
      })),
      meta: {
        nextCursor,
        hasMore,
        // Served rather than assumed: the period is an operator override, so a client constant
        // would be silently wrong on any host that changed it (ADR-0096 D2/B9).
        retentionDays: this.appConfig.retentionHierarchyDays,
        retentionActive: this.appConfig.retentionHierarchyEnabled,
      },
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
