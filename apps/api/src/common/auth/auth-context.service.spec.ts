import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AuthContextService } from './auth-context.service';
import type { AuthInstance } from './better-auth';
import { Principal } from './principal';

/**
 * Unit tests for the authentication seam. The Better Auth instance is mocked;
 * we assert only how a resolved session maps to a {@link Principal} (secure by
 * default: no session → null).
 */
function makeService(session: unknown): AuthContextService {
  const auth = { api: { getSession: vi.fn().mockResolvedValue(session) } };
  return new AuthContextService(auth as unknown as AuthInstance);
}

const request = { headers: {} } as unknown as Request;

describe('AuthContextService', () => {
  it('resolves a Principal for a valid session (no memberships yet)', async () => {
    const service = makeService({ user: { id: 'user-1' }, session: {} });
    const principal = await service.resolve(request);
    expect(principal).toBeInstanceOf(Principal);
    expect(principal?.userId).toBe('user-1');
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
