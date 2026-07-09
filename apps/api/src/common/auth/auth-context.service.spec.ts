import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';

import { AuthContextService } from './auth-context.service';
import type { AuthInstance } from './better-auth';
import { OrganizationRole, Principal } from './principal';

/**
 * Unit tests for the authentication seam. The Better Auth instance and Prisma
 * are mocked; we assert how a resolved session + memberships map to a
 * {@link Principal} (secure by default: no session → null).
 */
function makeService(
  session: unknown,
  memberships: { organizationId: string; role: OrganizationRole }[] = [],
): AuthContextService {
  const auth = { api: { getSession: vi.fn().mockResolvedValue(session) } };
  const prisma = { orgMember: { findMany: vi.fn().mockResolvedValue(memberships) } };
  return new AuthContextService(
    auth as unknown as AuthInstance,
    prisma as unknown as PrismaService,
  );
}

const request = { headers: {} } as unknown as Request;

describe('AuthContextService', () => {
  it('resolves a Principal with hydrated memberships and permissions', async () => {
    const service = makeService({ user: { id: 'user-1' }, session: {} }, [
      { organizationId: 'org-1', role: OrganizationRole.ORG_ADMIN },
      { organizationId: 'org-2', role: OrganizationRole.VIEWER },
    ]);

    const principal = await service.resolve(request);

    expect(principal).toBeInstanceOf(Principal);
    expect(principal?.userId).toBe('user-1');
    expect(principal?.isMemberOf('org-1')).toBe(true);
    // Org Admin can invite in org-1 but a Viewer cannot in org-2 (scope + role).
    expect(principal?.can('member:invite', 'org-1')).toBe(true);
    expect(principal?.can('member:invite', 'org-2')).toBe(false);
    expect(principal?.can('organization:read', 'org-2')).toBe(true);
  });

  it('resolves a Principal with no memberships for a brand-new user', async () => {
    const service = makeService({ user: { id: 'user-1' }, session: {} }, []);
    const principal = await service.resolve(request);
    expect(principal?.memberships).toEqual([]);
  });

  it('returns null when there is no session (unauthenticated)', async () => {
    const service = makeService(null);
    expect(await service.resolve(request)).toBeNull();
  });

  it('returns null when the session carries no user', async () => {
    const service = makeService({ user: undefined, session: {} });
    expect(await service.resolve(request)).toBeNull();
  });
});
