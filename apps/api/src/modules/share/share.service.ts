import { Injectable } from '@nestjs/common';
import type { PlanShare } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { generateOpaqueToken } from '../../common/tokens/token';
import { AppConfigService } from '../../config/app-config.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import { PlanShareRepository } from './plan-share.repository';
import { SHARE_TOKEN_PREFIX } from './share-token.guard';

/** Machine-readable reasons carried in a share {@link ValidationError}'s `details.reason`. */
export const SHARE_ERROR = {
  /** `expiresAt` was supplied but is not in the future — a link cannot be born already expired. */
  EXPIRY_IN_PAST: 'SHARE_EXPIRY_IN_PAST',
} as const;

/** The create result: the stored row plus the one-time guest URL (raw token in the fragment). */
export interface CreatedShareResult {
  share: PlanShare;
  url: string;
}

/**
 * The External-Guest share-link **management** surface (ADR-0051 F-M2) — the authenticated
 * create / list / revoke API for a plan's owner. Every method resolves the org from the
 * caller's memberships (anti-IDOR — non-members get 404), asserts `plan:share` (Planner +
 * Org Admin only — a governance act), and scopes the target plan to that org (anti-IDOR).
 *
 * On create, a 256-bit `sp_share_` token is minted, its SHA-256 hash stored, and the raw
 * token returned ONCE in the guest URL (`…/share#<token>`, fragment-delivered per ADR §2).
 * `organization_id` is copied from the RESOLVED plan (never client input — the denormalised-
 * scope invariant). This is a write to a NON-scheduling table: the CPM engine and the pen
 * model (ADR-0028) are untouched, and share writes are deliberately NOT pen-gated.
 */
@Injectable()
export class ShareService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly shares: PlanShareRepository,
    private readonly config: AppConfigService,
    @InjectPinoLogger(ShareService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Create a share link for a plan. Throws {@link NotFoundError} (404) when the org/plan is
   * not the caller's (anti-IDOR), {@link ForbiddenError} (403) without `plan:share`, and
   * {@link ValidationError} (422 `SHARE_EXPIRY_IN_PAST`) for a non-future expiry.
   */
  async create(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: { label?: string; expiresAt?: string },
  ): Promise<CreatedShareResult> {
    const plan = await this.resolvePlan(principal, orgSlug, planId);

    let expiresAt: Date | null = null;
    if (dto.expiresAt !== undefined) {
      const parsed = new Date(dto.expiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        throw new ValidationError('The expiry must be a future date and time.', {
          reason: SHARE_ERROR.EXPIRY_IN_PAST,
        });
      }
      expiresAt = parsed;
    }

    const { token, tokenHash } = generateOpaqueToken(SHARE_TOKEN_PREFIX);
    const share = await this.shares.create({
      planId: plan.id,
      // Copied from the RESOLVED plan — never client input (the denormalised-scope invariant).
      organizationId: plan.organizationId,
      tokenHash,
      label: dto.label ?? null,
      expiresAt,
      createdBy: principal.userId,
      updatedBy: principal.userId,
    });

    // The raw token rides ONLY in the URL fragment (never the path/query), so it is never
    // sent to any server / logged (ADR-0051 §2). Returned once; only the hash is stored.
    const url = `${this.config.appUrl}/share#${token}`;
    this.logger.info(
      {
        organizationId: plan.organizationId,
        planId: plan.id,
        shareId: share.id,
        userId: principal.userId,
      },
      'plan share link created',
    );
    return { share, url };
  }

  /** A plan's active (incl. revoked-but-not-deleted) share links, newest-first. */
  async list(principal: Principal, orgSlug: string, planId: string): Promise<PlanShare[]> {
    const plan = await this.resolvePlan(principal, orgSlug, planId);
    return this.shares.listActiveByPlan(plan.organizationId, plan.id);
  }

  /**
   * Revoke a link — the immediate, one-way live → dead transition (ADR-0051 §5). Idempotent:
   * revoking an already-revoked / unknown link resolves to the same 204 (CQ-6). Throws
   * {@link NotFoundError} (404) when the org/plan is not the caller's, or the link is not this
   * plan's (anti-IDOR — the link is scoped to the resolved org AND must match the route plan).
   */
  async revoke(
    principal: Principal,
    orgSlug: string,
    planId: string,
    shareId: string,
  ): Promise<void> {
    const plan = await this.resolvePlan(principal, orgSlug, planId);
    const share = await this.shares.findActiveByIdInOrg(shareId, plan.organizationId);
    // 404 (not 403/409) when the link is unknown, or belongs to a different plan — no oracle,
    // and nothing to tamper with (the link is dereferenced by id within the resolved org+plan).
    if (!share || share.planId !== plan.id) {
      throw new NotFoundError('Share link not found.');
    }
    await this.shares.setRevoked(shareId, plan.organizationId, principal.userId);
    this.logger.info(
      { organizationId: plan.organizationId, planId: plan.id, shareId, userId: principal.userId },
      'plan share link revoked',
    );
  }

  /**
   * Resolve the org from the caller's memberships (404 non-member), assert `plan:share`
   * (403 without it), and scope the target plan to that org (404 foreign/deleted plan) — the
   * shared anti-IDOR + authorisation prologue for every management method.
   */
  private async resolvePlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<{ id: string; organizationId: string }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:share', organization.id);
    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    return { id: plan.id, organizationId: plan.organizationId };
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
