import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest, StaffRequest } from '../../common/auth/authenticated-request';
import { normalizeEmail } from '../../common/auth/normalize-email';
import { StaffPrincipal } from '../../common/auth/staff-principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves an authenticated session to a {@link StaffPrincipal}, for routes under
 * `/api/v1/staff/` (ADR-0086 D3).
 *
 * It runs **after** the session `AuthenticationGuard`, so a caller is already authenticated; this
 * guard answers only "is this account staff?". Three conditions, all required:
 *
 *   1. the session's address is on the `STAFF_EMAILS` allowlist, compared after
 *      {@link normalizeEmail} — `toLowerCase()` and **nothing else**, through the one shared
 *      function, because two implementations of one library's rule drift invisibly;
 *   2. the account's `emailVerified` is true;
 *   3. the account still exists — a hard check, because Better Auth users are hard-deleted and the
 *      `User` model carries no `deleted_at` at all. An earlier version of this comment claimed
 *      "not soft-deleted", describing a mechanism this schema does not have.
 *
 * **(2) is not defence in depth, it is the control that makes the allowlist safe.**
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to `false`, so without this check an allowlisted
 * address that has **not yet signed up** is squattable: whoever registers it first becomes staff.
 * It is asserted here unconditionally, independent of that switch, because the switch is an
 * operator's deployment choice and this is not.
 *
 * **Every failure is a uniform {@link NotFoundError}** — never 401 or 403 — so the staff surface is
 * not an oracle for whether an address is staff. The `ShareTokenGuard` precedent, for the same
 * reason: a 403 tells a prober their guess was interesting. It also means an ordinary member
 * browsing to `/api/v1/staff/me` sees exactly what they would see for a route that does not exist,
 * which is the truthful answer as far as they are concerned.
 *
 * It attaches `staff` and deliberately does **not** clear `principal`. Both may physically be on
 * the request; no staff controller reads `principal`, and the compile-error property (ADR-0086 D1)
 * is what makes that safe rather than a convention — a staff service takes `StaffPrincipal` and a
 * member service takes `Principal`, and neither is assignable to the other.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest & AuthenticatedRequest>();
    const principal = request.principal;

    // No session at all. **Unreachable in the wired app**, and the earlier comment here overstated
    // what it buys: the global `AuthenticationGuard` runs first and answers an anonymous caller
    // with 401, so this branch cannot make that response a 404. It is kept as a fail-closed default
    // for a future route wired differently, not as part of the uniform-404 guarantee — which holds
    // for AUTHENTICATED callers, which is the population that matters, since telling an anonymous
    // prober "sign in first" reveals nothing about whether any address is staff.
    if (!principal) throw this.notFound();

    const allowlist = this.config.staffEmails;
    if (allowlist.length === 0) throw this.notFound();

    // Read the address from the DATABASE, not from the session's cached profile: `principal.email`
    // is carried as best-effort display data and its own docblock says never to use it as an
    // authorisation input.
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user) throw this.notFound();

    const email = normalizeEmail(user.email);
    if (!allowlist.includes(email)) throw this.notFound();

    // The control that makes an address-keyed allowlist safe — see the class docblock.
    if (!user.emailVerified) throw this.notFound();

    request.staff = new StaffPrincipal(user.id, email);
    return true;
  }

  /**
   * One shape for every refusal. Written as a method rather than inlined so a future branch cannot
   * accidentally throw something more informative — which is how an oracle appears.
   */
  private notFound(): NotFoundError {
    return new NotFoundError('Not found');
  }
}
