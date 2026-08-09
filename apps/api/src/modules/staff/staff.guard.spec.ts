import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest, StaffRequest } from '../../common/auth/authenticated-request';
import { Principal } from '../../common/auth/principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';

import { StaffGuard } from './staff.guard';

/**
 * **Every refusal must be identical, and most of these tests exist to prove a negative.**
 *
 * A staff surface that answered 403 for "you are not staff" and 404 for "no such route" would tell
 * a prober which addresses are worth attacking — so the assertion that matters is not "it refuses"
 * but "it refuses the same way for every reason". That is the `ShareTokenGuard` precedent, and it is
 * the kind of property a later branch erases without any other test noticing.
 */

const STAFF_ID = 'user-staff';

function contextFor(request: Partial<StaffRequest & AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function principal(userId = STAFF_ID): Principal {
  return new Principal(userId, []);
}

function build(options: {
  allowlist?: readonly string[];
  user?: { id: string; email: string; emailVerified: boolean } | null;
}): { guard: StaffGuard; findFirst: ReturnType<typeof vi.fn> } {
  const findFirst = vi.fn().mockResolvedValue(options.user ?? null);
  const config = {
    staffEmails: options.allowlist ?? ['staff@schedulepoint.test'],
  } as AppConfigService;
  const prisma = { user: { findFirst } } as unknown as PrismaService;

  return { guard: new StaffGuard(config, prisma), findFirst };
}

const VERIFIED_STAFF = { id: STAFF_ID, email: 'staff@schedulepoint.test', emailVerified: true };

describe('StaffGuard', () => {
  it('admits a verified allowlisted account and attaches the principal', async () => {
    const { guard } = build({ user: VERIFIED_STAFF });
    const request: Partial<StaffRequest & AuthenticatedRequest> = { principal: principal() };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.staff?.userId).toBe(STAFF_ID);
    expect(request.staff?.email).toBe('staff@schedulepoint.test');
  });

  it('matches case-insensitively, and ONLY case-insensitively', async () => {
    // `normalizeEmail` is `toLowerCase()` and nothing else. Trimming the stored value would be a
    // defect, not a courtesy — that function's docblock records why for the audit path, and the
    // same reasoning holds here: an address with leading whitespace is one no sign-in could have
    // used, so matching it would grant staff to an input that never reached an account.
    const { guard } = build({
      allowlist: ['staff@schedulepoint.test'],
      user: { ...VERIFIED_STAFF, email: 'Staff@SchedulePoint.TEST' },
    });
    const request: Partial<StaffRequest & AuthenticatedRequest> = { principal: principal() };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    // The attached label is the normalised form, so the audit actor label cannot vary by how the
    // caller happened to type it.
    expect(request.staff?.email).toBe('staff@schedulepoint.test');
  });

  it('REFUSES an allowlisted account whose address is unverified', async () => {
    // The control that makes an address-keyed allowlist safe, and it is asserted unconditionally
    // because `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to FALSE. Without this, an allowlisted
    // address that has never signed up is squattable: whoever registers it first becomes staff.
    const { guard } = build({ user: { ...VERIFIED_STAFF, emailVerified: false } });

    await expect(guard.canActivate(contextFor({ principal: principal() }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('refuses an authenticated member who is not on the allowlist', async () => {
    const { guard } = build({
      user: { id: 'user-member', email: 'planner@acme.test', emailVerified: true },
    });

    await expect(
      guard.canActivate(contextFor({ principal: principal('user-member') })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses everyone when the allowlist is empty — the safe default', async () => {
    // An unset `STAFF_EMAILS` must grant nothing. The failure direction matters: a guard that
    // treated "no allowlist" as "no restriction" would hand the console to every member.
    const { guard, findFirst } = build({ allowlist: [], user: VERIFIED_STAFF });

    await expect(guard.canActivate(contextFor({ principal: principal() }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // And it short-circuits before touching the database, so an empty allowlist cannot be probed
    // for timing either.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('refuses when the account no longer exists', async () => {
    const { guard } = build({ user: null });

    await expect(guard.canActivate(contextFor({ principal: principal() }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('refuses with no session at all', async () => {
    const { guard } = build({ user: VERIFIED_STAFF });

    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('gives EVERY refusal the identical shape — no oracle', async () => {
    // The assertion the surface's safety actually rests on. Five distinguishable internal reasons,
    // one indistinguishable answer: an ordinary member browsing to /api/v1/staff/me sees exactly
    // what they would see for a route that does not exist, which is the truthful answer as far as
    // they are concerned.
    const cases = [
      build({ user: { ...VERIFIED_STAFF, emailVerified: false } }),
      build({ user: { id: 'x', email: 'nobody@acme.test', emailVerified: true } }),
      build({ allowlist: [], user: VERIFIED_STAFF }),
      build({ user: null }),
    ];

    const errors = await Promise.all(
      cases.map(({ guard }) =>
        guard.canActivate(contextFor({ principal: principal() })).catch((error: unknown) => error),
      ),
    );

    const shapes = new Set(
      errors.map((error) => `${(error as Error).constructor.name}:${(error as Error).message}`),
    );
    expect(shapes.size, 'every refusal must be indistinguishable').toBe(1);
  });

  it('reads the address from the database, never from the session principal', async () => {
    // `principal.email` is carried as best-effort display data and its own docblock says never to
    // use it as an authorisation input. A guard that trusted it would authorise on a value that was
    // correct when the session was minted and may not be now.
    const { guard, findFirst } = build({ user: VERIFIED_STAFF });

    await guard.canActivate(contextFor({ principal: principal() }));

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: STAFF_ID } }));
  });
});
