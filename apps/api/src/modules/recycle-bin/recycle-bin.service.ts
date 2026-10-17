import { Injectable } from '@nestjs/common';
import type { DeletedItem, DeletedItemsMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/app-config.service';
import { OrganizationsService } from '../organizations/organizations.service';

import { decodeDeletedCursor, encodeDeletedCursor } from './recycle-bin.cursor';
import { RecycleBinRepository } from './recycle-bin.repository';

const MS_PER_DAY = 86_400_000;

/**
 * Read model for the recycle bin — an organisation's soft-deleted clients, projects, plans,
 * resources and calendars in one deletion-time-ordered, cursor-paginated list (see
 * docs/DECISIONS.md, 2026-07-10, and ADR-0195). Reading is a hierarchy read (any member);
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
  ): Promise<{ items: DeletedItem[]; meta: DeletedItemsMeta }> {
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
    // ordered top `limit + 1` across all five tables, so there is nothing to merge
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
        subtype: row.subtype,
        // Served per row, never assumed from the kind (ADR-0195 D4): a resource and an ORG calendar
        // have no timer, and a PROJECT calendar goes with its project's. The period is read here,
        // from the same config the sweep reads, so the two cannot drift.
        expiresAt:
          row.expiryBasis === null
            ? null
            : new Date(
                row.expiryBasis.getTime() + this.appConfig.retentionHierarchyDays * MS_PER_DAY,
              ).toISOString(),
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
