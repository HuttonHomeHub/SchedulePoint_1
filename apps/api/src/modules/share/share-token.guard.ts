import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import type { GuestRequest } from '../../common/auth/authenticated-request';
import { GuestPrincipal } from '../../common/auth/guest-principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import { hashToken } from '../../common/tokens/token';
import { PlanRepository } from '../plans/plan.repository';

import { PlanShareRepository } from './plan-share.repository';

/**
 * The `sp_share_` prefix minted onto every raw share token (ADR-0051 §2) — human-
 * readable in logs/secret-scanners. It is part of the token (and so part of what is
 * hashed), so the guard hashes the presented value whole. F-M2's ShareService mints
 * with `generateOpaqueToken(SHARE_TOKEN_PREFIX)`.
 */
export const SHARE_TOKEN_PREFIX = 'sp_share_';

/**
 * Resolves an External-Guest bearer token to a {@link GuestPrincipal} (ADR-0051 §3/§5),
 * for `@Public()` guest routes (which bypass the session `AuthenticationGuard`).
 *
 * The token is read ONLY from the `Authorization: Bearer …` header — never a path or
 * query param — so it never lands in a server/referrer log (the fragment-delivery
 * design). The guard:
 *   1. hashes the presented token and looks up the LIVE grant row (not revoked, not
 *      expired, not soft-deleted);
 *   2. re-checks the referenced PLAN is itself active (a soft-deleted plan's links must
 *      stop resolving — the cascade stamps them, and this is defence in depth);
 *   3. attaches a `GuestPrincipal` scoped to that ONE plan + its org.
 *
 * EVERY failure — missing/garbage token, unknown/revoked/expired/deleted grant, deleted
 * plan — resolves to a UNIFORM 404 ({@link NotFoundError}), never 401/403, so the guest
 * path is no oracle for whether a token ever existed (ADR-0051 §5). Plan + org are derived
 * ENTIRELY from the token row; a guest supplies no id, so there is nothing to tamper with
 * (anti-IDOR by construction).
 *
 * Dark in F-M1 (no route uses it yet); F-M3 attaches it to the guest read controller.
 */
@Injectable()
export class ShareTokenGuard implements CanActivate {
  constructor(
    private readonly shares: PlanShareRepository,
    private readonly plans: PlanRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuestRequest>();
    const token = this.extractBearer(request.headers.authorization);
    // Cheap fast-fail on an obviously-non-share token (still a uniform 404 — no oracle),
    // sparing a DB hit under token spraying.
    if (!token || !token.startsWith(SHARE_TOKEN_PREFIX)) {
      throw this.notFound();
    }

    const share = await this.shares.findLiveByTokenHash(hashToken(token));
    if (!share) throw this.notFound();

    // Re-check the plan is active (ADR-0051 §5): a soft-deleted plan's links must not
    // resolve. plan_id + organization_id come from the trusted grant row, never input.
    const plan = await this.plans.findActiveByIdInOrg(share.planId, share.organizationId);
    if (!plan) throw this.notFound();

    request.guest = new GuestPrincipal(share.id, share.planId, share.organizationId);
    return true;
  }

  /** Extract the token from an `Authorization: Bearer <token>` header (scheme case-insensitive). */
  private extractBearer(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;
    return value.trim() || null;
  }

  /** The single, uniform failure — indistinguishable across every dead-token case. */
  private notFound(): NotFoundError {
    return new NotFoundError('This share link is no longer available.');
  }
}
