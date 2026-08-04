import { Injectable } from '@nestjs/common';
import type { AuditEvent } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Principal } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { OrganizationsService } from '../organizations/organizations.service';

import { AuditRepository } from './audit.repository';

/**
 * Reading the audit log (ADR-0072).
 *
 * Deliberately a **separate service from `AuditService`**. That one is `@Global()` and injected by
 * nine feature modules purely to write; giving it an org resolver and a permission check would put
 * a read surface on an object every producer holds, and the first thing to go wrong with an audit
 * log is somebody reading someone else's.
 */
@Injectable()
export class AuditReadService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly repository: AuditRepository,
    @InjectPinoLogger(AuditReadService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * One organisation's events — Org Admin only (`audit:read`).
   *
   * The org is resolved from the caller's own memberships, so a slug the caller does not belong to
   * 404s before the permission check can 403 (the anti-enumeration order every `:orgSlug` route
   * uses). The organisation id then goes into the WHERE clause, never a post-filter.
   */
  async listForOrganization(
    principal: Principal,
    orgSlug: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: AuditEvent[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    if (!principal.can('audit:read', organization.id)) {
      this.logger.warn(
        { userId: principal.userId, permission: 'audit:read', organizationId: organization.id },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }

    const { events, nextCursor } = await this.repository.listForOrganization(
      organization.id,
      query.limit,
      query.cursor,
    );
    return { items: events, meta: { nextCursor, hasMore: nextCursor !== null } };
  }

  /**
   * The caller's OWN events, across every organisation and including the org-less authentication
   * rows.
   *
   * **No permission check, and that is the design.** There is no permission to check against:
   * the actor id comes from the session and the route accepts no user id of any kind, so the only
   * history reachable is the caller's own. Anti-IDOR by construction rather than by a guard —
   * there is no parameter to tamper with. It also means an ordinary member can see their own
   * sign-in history without an Org Admin having to hand it to them.
   */
  async listForSelf(
    principal: Principal,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: AuditEvent[]; meta: PageMeta }> {
    const { events, nextCursor } = await this.repository.listForActor(
      principal.userId,
      query.limit,
      query.cursor,
    );
    return { items: events, meta: { nextCursor, hasMore: nextCursor !== null } };
  }
}
