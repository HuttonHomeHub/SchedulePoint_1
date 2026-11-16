import { describe, expect, it, vi } from 'vitest';

import type { AuthInstance } from './better-auth';
import { PasswordResetCheckService } from './password-reset-check.service';

const FUTURE = new Date(Date.now() + 60_000);
const PAST = new Date(Date.now() - 60_000);

function harness(
  verification: { value: string; expiresAt: Date } | null,
  user: object | null = { id: 'u1' },
) {
  const internalAdapter = {
    findVerificationValue: vi.fn().mockResolvedValue(verification),
    findUserById: vi.fn().mockResolvedValue(user),
    consumeVerificationValue: vi.fn(),
    deleteVerificationByIdentifier: vi.fn(),
  };
  const auth = { $context: Promise.resolve({ internalAdapter }) } as unknown as AuthInstance;
  return { service: new PasswordResetCheckService(auth), internalAdapter };
}

describe('PasswordResetCheckService', () => {
  it('is false when no row exists', async () => {
    const { service, internalAdapter } = harness(null);
    await expect(service.isUsable('t')).resolves.toBe(false);
    expect(internalAdapter.findVerificationValue).toHaveBeenCalledWith('reset-password:t');
    expect(internalAdapter.findUserById).not.toHaveBeenCalled();
  });

  it('is false when the row has expired', async () => {
    const { service } = harness({ value: 'u1', expiresAt: PAST });
    await expect(service.isUsable('t')).resolves.toBe(false);
  });

  it('is false when the account is gone', async () => {
    const { service, internalAdapter } = harness({ value: 'u1', expiresAt: FUTURE }, null);
    await expect(service.isUsable('t')).resolves.toBe(false);
    expect(internalAdapter.findUserById).toHaveBeenCalledWith('u1');
  });

  it('is true for a live row and an existing account, and consumes nothing', async () => {
    const { service, internalAdapter } = harness({ value: 'u1', expiresAt: FUTURE });
    await expect(service.isUsable('t')).resolves.toBe(true);
    expect(internalAdapter.consumeVerificationValue).not.toHaveBeenCalled();
    expect(internalAdapter.deleteVerificationByIdentifier).not.toHaveBeenCalled();
  });

  it('rethrows an adapter failure without the token in the message', async () => {
    const { service, internalAdapter } = harness(null);
    internalAdapter.findVerificationValue.mockRejectedValue(new Error('db down'));
    const failure = await service.isUsable('secret-token').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain('secret-token');
  });
});
