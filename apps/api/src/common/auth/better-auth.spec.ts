import { describe, expect, it, vi } from 'vitest';

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
    sendPasswordReset: () => Promise.resolve(),
    recordAuthEvent: () => Promise.resolve(),
    findUserIdByEmail: () => Promise.resolve(null),
    log: () => {},
  };

  it('revokes every session on a completed password reset (B2)', () => {
    const auth = createAuth(prisma, options);

    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it('routes the auth library’s own logging into the injected sink (TECH_DEBT #94)', () => {
    // Unconfigured, Better Auth writes `[Better Auth]:` lines to stdout with ANSI colour — outside
    // Pino, outside correlation IDs, outside redaction. That is where a swallowed mail-send failure
    // went, which is the whole reason a broken relay produced silently unusable accounts.
    const lines: { level: string; message: string }[] = [];
    const auth = createAuth(prisma, {
      ...options,
      log: (level, message) => lines.push({ level, message }),
    });

    // Colours off, because the destination is JSON and escape codes would survive into the store.
    expect(auth.options.logger?.disableColors).toBe(true);

    auth.options.logger?.log?.('error', 'a transport failure');
    expect(lines).toEqual([{ level: 'error', message: 'a transport failure' }]);
  });

  it('hashes verification identifiers at rest, with this app’s own hasher (B1)', async () => {
    const auth = createAuth(prisma, options);

    const storeIdentifier = auth.options.verification?.storeIdentifier;
    // Not `'plain'`, not absent, and not the string shorthand — an object carrying a hash function.
    // Asserted as a runtime narrowing rather than a cast, so the test fails loudly if the option's
    // shape ever changes instead of throwing an opaque `undefined is not a function`.
    if (typeof storeIdentifier !== 'object' || !('hash' in storeIdentifier)) {
      throw new Error(`verification.storeIdentifier is not a hasher: ${String(storeIdentifier)}`);
    }

    const { hash } = storeIdentifier;
    const identifier = 'reset-password:a-token-that-must-never-be-stored-raw';

    // The identity that matters: what gets stored is what `common/tokens/token.ts` would store.
    await expect(hash(identifier)).resolves.toBe(hashToken(identifier));
    // And it is not the input, which is the whole point.
    await expect(hash(identifier)).resolves.not.toBe(identifier);
  });

  /**
   * `docs/TECH_DEBT.md` #99: without `advanced.backgroundTasks.handler` configured, Better Auth's
   * `runInBackgroundOrAwait` awaits `sendResetPassword`/`sendVerificationEmail` on the request
   * path, so a known address on `/request-password-reset` answers slower than an unknown one — a
   * timing oracle for an endpoint whose whole design is an identical body either way.
   */
  describe('sends Better Auth mail off the request path (#99)', () => {
    it('configures a background-task handler', () => {
      const auth = createAuth(prisma, options);

      expect(typeof auth.options.advanced?.backgroundTasks?.handler).toBe('function');
    });

    /** Let the handler's own un-awaited `.catch` microtask settle before asserting on it. */
    const settle = async (): Promise<void> => {
      await Promise.resolve();
      await Promise.resolve();
    };

    it('swallows a rejection that escapes the mail adapter’s own catch, and logs it once', async () => {
      // In practice this never fires: both `SmtpMailService` and `LoggingMailService` catch
      // internally and never reject. This proves the handler is a correct backstop anyway, for a
      // future adapter that stops self-catching.
      const logs: { level: string; message: string; args: unknown[] }[] = [];
      const auth = createAuth(prisma, {
        ...options,
        log: (level, message, args) => logs.push({ level, message, args }),
      });
      const handler = auth.options.advanced?.backgroundTasks?.handler;
      if (typeof handler !== 'function') {
        throw new Error('advanced.backgroundTasks.handler is not configured');
      }

      const error = new Error('escaped the adapter’s own catch');
      // Never an unhandled rejection: the handler must attach its own `.catch` synchronously.
      const unhandled = vi.fn();
      process.once('unhandledRejection', unhandled);
      handler(Promise.reject(error));
      await settle();
      process.off('unhandledRejection', unhandled);

      expect(unhandled).not.toHaveBeenCalled();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe('error');
      expect(logs[0]?.args).toEqual([error]);
      // Never restates the mail adapter's own event — a second `mail.send_failed` here would read
      // as the same failure logged twice.
      expect(logs[0]?.message).not.toContain('mail.send_failed');
    });

    it('does nothing when the handed-off promise resolves', async () => {
      const logs: unknown[] = [];
      const auth = createAuth(prisma, { ...options, log: (...args) => logs.push(args) });
      const handler = auth.options.advanced?.backgroundTasks?.handler;
      if (typeof handler !== 'function') {
        throw new Error('advanced.backgroundTasks.handler is not configured');
      }

      expect(() => handler(Promise.resolve('sent'))).not.toThrow();
      await settle();

      expect(logs).toHaveLength(0);
    });
  });
});
