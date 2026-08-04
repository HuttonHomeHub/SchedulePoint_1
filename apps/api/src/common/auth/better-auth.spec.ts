import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';
import { hashToken } from '../tokens/token';

import { createAuth, type CreateAuthOptions } from './better-auth';

/**
 * Pins the two security-critical keys in {@link createAuth}'s options object (ADR-0074 M0).
 *
 * **Why a unit test at all, when both are also proven end to end.** The e2e proves the behaviour
 * against a real database and is the honest proof; this one exists because the options object is
 * large, densely commented, and edited whenever anything about auth changes. A key deleted or
 * renamed in a refactor would be invisible in review — and, crucially, both failures are **silent**:
 * a lost `verification` key writes cleartext tokens with no error anywhere, and a lost
 * `revokeSessionsOnPasswordReset` leaves sessions alive with a reset that still reports success.
 * Neither would fail any other test in the repository.
 *
 * It asserts the hasher is **this app's own** rather than merely present, because Better Auth's
 * `'hashed'` shorthand would also pass a presence check while quietly introducing a second hashing
 * convention (ADR-0074 §1).
 */
describe('createAuth security options', () => {
  const prisma = {} as PrismaService;

  const options: CreateAuthOptions = {
    secret: 'test-secret-value-long-enough-for-better-auth',
    baseURL: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:5173'],
    trustedProxies: [],
    isProduction: false,
    requireEmailVerification: false,
    sendVerificationEmail: () => Promise.resolve(),
    recordAuthEvent: () => Promise.resolve(),
    findUserIdByEmail: () => Promise.resolve(null),
  };

  it('revokes every session on a completed password reset (B2)', () => {
    const auth = createAuth(prisma, options);

    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it('hashes verification identifiers at rest, with this app’s own hasher (B1)', async () => {
    const auth = createAuth(prisma, options);

    const storeIdentifier = auth.options.verification?.storeIdentifier;
    // Not `'plain'`, not absent, and not the string shorthand — an object carrying a hash function.
    expect(typeof storeIdentifier).toBe('object');

    const hash = (storeIdentifier as { hash: (identifier: string) => Promise<string> }).hash;
    const identifier = 'reset-password:a-token-that-must-never-be-stored-raw';

    // The identity that matters: what gets stored is what `common/tokens/token.ts` would store.
    await expect(hash(identifier)).resolves.toBe(hashToken(identifier));
    // And it is not the input, which is the whole point.
    await expect(hash(identifier)).resolves.not.toBe(identifier);
  });
});
