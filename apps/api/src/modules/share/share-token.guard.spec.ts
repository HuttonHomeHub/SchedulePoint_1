import type { ExecutionContext } from '@nestjs/common';
import type { PlanShare } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuestRequest } from '../../common/auth/authenticated-request';
import { GuestPrincipal } from '../../common/auth/guest-principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import { hashToken } from '../../common/tokens/token';
import type { PlanRepository } from '../plans/plan.repository';

import type { PlanShareRepository } from './plan-share.repository';
import { SHARE_TOKEN_PREFIX, ShareTokenGuard } from './share-token.guard';

const SHARE_ID = 'share-1';
const PLAN_ID = '00000000-0000-7000-8000-000000000001';
const ORG_ID = 'org-1';
const RAW_TOKEN = `${SHARE_TOKEN_PREFIX}abc123`;

/** A minimal ExecutionContext carrying the given Authorization header (and exposing the request). */
function contextWith(authorization?: string): { ctx: ExecutionContext; request: GuestRequest } {
  const request = { headers: authorization ? { authorization } : {} } as GuestRequest;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function shareRow(): PlanShare {
  return {
    id: SHARE_ID,
    planId: PLAN_ID,
    organizationId: ORG_ID,
    tokenHash: hashToken(RAW_TOKEN),
  } as PlanShare;
}

describe('ShareTokenGuard', () => {
  let shares: { findLiveByTokenHash: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let guard: ShareTokenGuard;

  beforeEach(() => {
    shares = { findLiveByTokenHash: vi.fn().mockResolvedValue(shareRow()) };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PLAN_ID }) };
    guard = new ShareTokenGuard(
      shares as unknown as PlanShareRepository,
      plans as unknown as PlanRepository,
    );
  });

  it('resolves a live token to a GuestPrincipal scoped to its ONE plan + org', async () => {
    const { ctx, request } = contextWith(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(shares.findLiveByTokenHash).toHaveBeenCalledWith(hashToken(RAW_TOKEN));
    expect(plans.findActiveByIdInOrg).toHaveBeenCalledWith(PLAN_ID, ORG_ID);
    expect(request.guest).toBeInstanceOf(GuestPrincipal);
    expect(request.guest).toMatchObject({
      shareId: SHARE_ID,
      planId: PLAN_ID,
      organizationId: ORG_ID,
      scope: 'SCHEDULE_READ',
    });
  });

  it('accepts a lower-case `bearer` scheme', async () => {
    const { ctx } = contextWith(`bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it.each<[string, string | undefined]>([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', `Basic ${RAW_TOKEN}`],
    ['a Bearer with no token', 'Bearer '],
  ])('404s with %s and never touches the database', async (_label, header) => {
    const { ctx } = contextWith(header);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(shares.findLiveByTokenHash).not.toHaveBeenCalled();
    expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
  });

  it('404s a token without the sp_share_ prefix before any database hit', async () => {
    const { ctx } = contextWith('Bearer notashare_token');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(shares.findLiveByTokenHash).not.toHaveBeenCalled();
  });

  it('404s when the grant is unknown/revoked/expired/deleted (repo returns null)', async () => {
    shares.findLiveByTokenHash.mockResolvedValue(null);
    const { ctx, request } = contextWith(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    expect(request.guest).toBeUndefined();
  });

  it('404s when the grant is live but its PLAN is soft-deleted (plan re-check, ADR-0051 §5)', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    const { ctx, request } = contextWith(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(request.guest).toBeUndefined();
  });
});
