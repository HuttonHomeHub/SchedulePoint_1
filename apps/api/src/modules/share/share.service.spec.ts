import type { PlanShare } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import type { AppConfigService } from '../../config/app-config.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { PlanShareRepository } from './plan-share.repository';
import { SHARE_TOKEN_PREFIX } from './share-token.guard';
import { SHARE_ERROR, ShareService } from './share.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const ORG_SLUG = 'acme';
const PLAN_ID = '00000000-0000-7000-8000-000000000001';
const SHARE_ID = '00000000-0000-7000-8000-0000000000aa';

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

function shareRow(overrides: Partial<PlanShare> = {}): PlanShare {
  return {
    id: SHARE_ID,
    planId: PLAN_ID,
    organizationId: ORG_ID,
    label: null,
    expiresAt: null,
    revokedAt: null,
    lastAccessedAt: null,
    createdAt: new Date(Date.UTC(2026, 6, 1)),
    ...overrides,
  } as PlanShare;
}

describe('ShareService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let shares: {
    create: ReturnType<typeof vi.fn>;
    listActiveByPlan: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    setRevoked: ReturnType<typeof vi.fn>;
  };
  let config: { appUrl: string };
  let logger: Pick<PinoLogger, 'info' | 'warn'>;
  let service: ShareService;
  const member = principalWith(['plan:share']);

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    // The resolved plan carries the org id the service MUST copy (never caller input).
    plans = {
      findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PLAN_ID, organizationId: ORG_ID }),
    };
    shares = {
      create: vi.fn().mockImplementation((data) => Promise.resolve(shareRow(data))),
      listActiveByPlan: vi.fn().mockResolvedValue([shareRow()]),
      findActiveByIdInOrg: vi.fn().mockResolvedValue(shareRow()),
      setRevoked: vi.fn().mockResolvedValue(1),
    };
    config = { appUrl: 'https://app.example' };
    logger = { info: vi.fn(), warn: vi.fn() };
    service = new ShareService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      shares as unknown as PlanShareRepository,
      config as unknown as AppConfigService,
      logger as unknown as PinoLogger,
    );
  });

  describe('create', () => {
    it('mints a fragment-delivered guest URL and stores the hashed token', async () => {
      const { url } = await service.create(member, ORG_SLUG, PLAN_ID, {});
      // The raw token rides in the fragment, prefixed sp_share_ (ADR-0051 §2).
      expect(url).toMatch(new RegExp(`^https://app\\.example/share#${SHARE_TOKEN_PREFIX}`));
      const created = shares.create.mock.calls[0]?.[0];
      // Only the hash is persisted — never the raw token.
      expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(created)).not.toContain(url.split('#')[1]);
    });

    it('copies organization_id from the RESOLVED plan, never caller input (F-M1 review follow-up)', async () => {
      // Even though the caller could try to smuggle an org id, the service ONLY uses the plan's.
      await service.create(member, ORG_SLUG, PLAN_ID, {});
      const created = shares.create.mock.calls[0]?.[0];
      expect(created.organizationId).toBe(ORG_ID);
      expect(created.planId).toBe(PLAN_ID);
    });

    it('stores an optional label and future expiry', async () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      await service.create(member, ORG_SLUG, PLAN_ID, {
        label: 'Client review',
        expiresAt: future,
      });
      const created = shares.create.mock.calls[0]?.[0];
      expect(created.label).toBe('Client review');
      expect(created.expiresAt).toBeInstanceOf(Date);
    });

    it('422s a non-future expiry (SHARE_EXPIRY_IN_PAST) before creating', async () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const err = await service
        .create(member, ORG_SLUG, PLAN_ID, { expiresAt: past })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toMatchObject({
        reason: SHARE_ERROR.EXPIRY_IN_PAST,
      });
      expect(shares.create).not.toHaveBeenCalled();
    });

    it('403s a principal lacking plan:share', async () => {
      const noCap = principalWith([]);
      await expect(service.create(noCap, ORG_SLUG, PLAN_ID, {})).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('404s a foreign/deleted plan (anti-IDOR)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.create(member, ORG_SLUG, PLAN_ID, {})).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('propagates the 404 when the caller is not a member of the org', async () => {
      organizations.resolveScope.mockRejectedValue(new NotFoundError('Organisation not found.'));
      await expect(service.create(member, ORG_SLUG, PLAN_ID, {})).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it("returns the plan's links (scoped by the resolved plan's org)", async () => {
      const result = await service.list(member, ORG_SLUG, PLAN_ID);
      expect(shares.listActiveByPlan).toHaveBeenCalledWith(ORG_ID, PLAN_ID);
      expect(result).toHaveLength(1);
    });

    it('404s a foreign/deleted plan', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.list(member, ORG_SLUG, PLAN_ID)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('revoke', () => {
    it('revokes a link and is idempotent (setRevoked drives immediacy)', async () => {
      await service.revoke(member, ORG_SLUG, PLAN_ID, SHARE_ID);
      expect(shares.setRevoked).toHaveBeenCalledWith(SHARE_ID, ORG_ID, USER_ID);
    });

    it('404s an unknown share', async () => {
      shares.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.revoke(member, ORG_SLUG, PLAN_ID, SHARE_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(shares.setRevoked).not.toHaveBeenCalled();
    });

    it('404s a share that belongs to a different plan (anti-IDOR)', async () => {
      shares.findActiveByIdInOrg.mockResolvedValue(shareRow({ planId: 'other-plan' }));
      await expect(service.revoke(member, ORG_SLUG, PLAN_ID, SHARE_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(shares.setRevoked).not.toHaveBeenCalled();
    });
  });
});
