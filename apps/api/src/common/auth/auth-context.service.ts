import { Inject, Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';

import { AUTH_INSTANCE, type AuthInstance } from './better-auth';
import { permissionsForRole } from './org-permissions';
import { OrganizationRole, Principal } from './principal';

/**
 * Resolves the {@link Principal} for a request. This is the **authentication
 * seam**: it validates the Better Auth session cookie (ADR-0003) and loads the
 * user's active organisation memberships so authorisation can be evaluated per
 * organisation (ADR-0012, ADR-0016).
 *
 * It is deliberately isolated behind this service so the rest of the app never
 * depends on the auth library, and so tests can supply a principal by overriding
 * this provider. No valid session → `null` → the request is unauthenticated
 * (secure by default).
 */
@Injectable()
export class AuthContextService {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: AuthInstance,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(request: Request): Promise<Principal | null> {
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session?.user) {
      return null;
    }

    // Hydrate the user's active memberships (excluding soft-deleted rows and
    // soft-deleted organisations) so `principal.can(permission, orgId)` works.
    const memberships = await this.prisma.orgMember.findMany({
      where: {
        userId: session.user.id,
        deletedAt: null,
        organization: { deletedAt: null },
      },
      select: { organizationId: true, role: true },
    });

    return new Principal(
      session.user.id,
      memberships.map((membership) => {
        const role = membership.role as OrganizationRole;
        return {
          organizationId: membership.organizationId,
          role,
          permissions: permissionsForRole(role),
        };
      }),
    );
  }
}
