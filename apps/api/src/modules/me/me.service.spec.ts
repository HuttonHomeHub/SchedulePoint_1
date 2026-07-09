import type { User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { OrganizationRole, Principal } from '../../common/auth/principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';

import { MeService } from './me.service';

const USER: User = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeService(found: User | null): MeService {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(found) } };
  return new MeService(prisma as unknown as PrismaService);
}

describe('MeService', () => {
  it('returns the profile with memberships mapped from the principal', async () => {
    const service = makeService(USER);
    const principal = new Principal('user-1', [
      { organizationId: 'org-1', role: OrganizationRole.PLANNER, permissions: ['client:read'] },
    ]);

    const result = await service.getProfile(principal);

    expect(result.user).toMatchObject({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    expect(result.memberships).toEqual([
      { organizationId: 'org-1', role: 'PLANNER', permissions: ['client:read'] },
    ]);
  });

  it('exposes no memberships for a user who belongs to no organisation', async () => {
    const service = makeService(USER);
    const result = await service.getProfile(new Principal('user-1', []));
    expect(result.memberships).toEqual([]);
  });

  it('throws NotFoundError when the session user has no profile row', async () => {
    const service = makeService(null);
    await expect(service.getProfile(new Principal('ghost', []))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
