import type { PlanLock } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  LockedError,
  NotFoundError,
} from '../../common/errors/domain-errors';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';

import { LOCK_HANDOFF_GRACE_MS, LOCK_INACTIVE_AFTER_MS } from './plan-lock.policy';
import type { PlanLockRepository } from './plan-lock.repository';
import { PlanEditLockService } from './plan-lock.service';

const ORG_ID = 'org-1';
const ME = 'user-me';
const OTHER = 'user-other';
const PLAN_ID = 'plan-1';
const SLUG = 'acme';

const PLANNER: Permission[] = ['plan:read', 'plan:acquire_lock', 'plan:request_control'];
const ADMIN: Permission[] = [...PLANNER, 'plan:override_lock'];
const VIEWER: Permission[] = ['plan:read'];

function principal(userId: string, permissions: Permission[]): Principal {
  return new Principal(userId, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

/** A lock row (Prisma shape) with sensible live defaults, overridable per test. */
function lockRow(overrides: Partial<PlanLock> = {}): PlanLock {
  const now = Date.now();
  return {
    planId: PLAN_ID,
    organizationId: ORG_ID,
    holderUserId: OTHER,
    acquiredAt: new Date(now - 1_000),
    heartbeatAt: new Date(now - 1_000),
    expiresAt: new Date(now + 60_000),
    requestedByUserId: null,
    requestedAt: null,
    createdAt: new Date(now - 1_000),
    updatedAt: new Date(now - 1_000),
    ...overrides,
  };
}

describe('PlanEditLockService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let repository: {
    find: ReturnType<typeof vi.fn>;
    writeLeaseToHolder: ReturnType<typeof vi.fn>;
    renewOwnLease: ReturnType<typeof vi.fn>;
    heartbeat: ReturnType<typeof vi.fn>;
    stampRequest: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    findActors: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: PlanEditLockService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PLAN_ID }) };
    repository = {
      find: vi.fn().mockResolvedValue(null),
      writeLeaseToHolder: vi
        .fn()
        .mockImplementation((_tx, p) => lockRow({ holderUserId: p.holderUserId })),
      renewOwnLease: vi.fn().mockResolvedValue(1),
      heartbeat: vi.fn().mockResolvedValue(lockRow({ holderUserId: ME })),
      stampRequest: vi.fn().mockResolvedValue(1),
      remove: vi.fn().mockResolvedValue(1),
      findActors: vi.fn().mockResolvedValue(new Map()),
    };
    // The advisory-lock helper calls tx.$executeRaw; give the fake tx a no-op.
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: vi.fn() })),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
    // Enforcement ON so the assertHoldsPen tests exercise the gate (the staged
    // rollout flag is covered separately below).
    const config = { planEditLockEnforced: true } as unknown as AppConfigService;
    service = new PlanEditLockService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      repository as unknown as PlanLockRepository,
      config,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('status', () => {
    it('reports FREE with canAcquire for a Planner when no lock exists', async () => {
      const s = await service.status(principal(ME, PLANNER), SLUG, PLAN_ID);
      expect(s.state).toBe('FREE');
      expect(s.canAcquire).toBe(true);
      expect(s.holder).toBeNull();
    });

    it('404s an out-of-scope plan', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.status(principal(ME, PLANNER), SLUG, PLAN_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('acquire', () => {
    it('denies a caller without plan:acquire_lock (403)', async () => {
      await expect(
        service.acquire(principal(ME, VIEWER), SLUG, PLAN_ID, false),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.writeLeaseToHolder).not.toHaveBeenCalled();
    });

    it('grants a free lock to the caller (writes a fresh lease)', async () => {
      repository.find.mockResolvedValue(null);
      const s = await service.acquire(principal(ME, PLANNER), SLUG, PLAN_ID, false);
      expect(repository.writeLeaseToHolder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ holderUserId: ME }),
      );
      expect(s.state).toBe('HELD_BY_ME');
    });

    it('reclaims an expired lock', async () => {
      repository.find.mockResolvedValue(
        lockRow({ holderUserId: OTHER, expiresAt: new Date(Date.now() - 1) }),
      );
      await service.acquire(principal(ME, PLANNER), SLUG, PLAN_ID, false);
      expect(repository.writeLeaseToHolder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ holderUserId: ME }),
      );
    });

    it('renews (does not re-write) a lease the caller already holds', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: ME }));
      await service.acquire(principal(ME, PLANNER), SLUG, PLAN_ID, false);
      expect(repository.renewOwnLease).toHaveBeenCalled();
      expect(repository.writeLeaseToHolder).not.toHaveBeenCalled();
    });

    it('rejects an acquire on a live lock held by another (423 HELD)', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: OTHER }));
      await expect(
        service.acquire(principal(ME, PLANNER), SLUG, PLAN_ID, false),
      ).rejects.toMatchObject({ code: 'LOCKED', details: { reason: 'PLAN_EDIT_LOCK_HELD' } });
      expect(repository.writeLeaseToHolder).not.toHaveBeenCalled();
    });

    it('rejects a Planner take-over before grace on an active holder (must request first)', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: OTHER, heartbeatAt: new Date() }));
      await expect(
        service.acquire(principal(ME, PLANNER), SLUG, PLAN_ID, true),
      ).rejects.toBeInstanceOf(LockedError);
      expect(repository.writeLeaseToHolder).not.toHaveBeenCalled();
    });

    it('lets a Planner take over once their request has aged past grace', async () => {
      repository.find.mockResolvedValue(
        lockRow({
          holderUserId: OTHER,
          heartbeatAt: new Date(),
          requestedByUserId: ME,
          requestedAt: new Date(Date.now() - LOCK_HANDOFF_GRACE_MS - 1_000),
        }),
      );
      const s = await service.acquire(principal(ME, PLANNER), SLUG, PLAN_ID, true);
      expect(repository.writeLeaseToHolder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ holderUserId: ME }),
      );
      expect(s.state).toBe('HELD_BY_ME');
    });

    it('lets a Planner take over an inactive holder without waiting for grace', async () => {
      repository.find.mockResolvedValue(
        lockRow({
          holderUserId: OTHER,
          heartbeatAt: new Date(Date.now() - LOCK_INACTIVE_AFTER_MS - 1_000),
        }),
      );
      await service.acquire(principal(ME, PLANNER), SLUG, PLAN_ID, true);
      expect(repository.writeLeaseToHolder).toHaveBeenCalled();
    });

    it('lets an Org Admin take over a live, active lock immediately', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: OTHER, heartbeatAt: new Date() }));
      await service.acquire(principal(ME, ADMIN), SLUG, PLAN_ID, true);
      expect(repository.writeLeaseToHolder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ holderUserId: ME }),
      );
    });
  });

  describe('heartbeat', () => {
    it('renews a live lease and returns HELD_BY_ME', async () => {
      repository.heartbeat.mockResolvedValue(lockRow({ holderUserId: ME }));
      const s = await service.heartbeat(principal(ME, PLANNER), SLUG, PLAN_ID);
      expect(s.state).toBe('HELD_BY_ME');
    });

    it('raises 423 PLAN_EDIT_LOCK_LOST when the lease was stolen or expired', async () => {
      repository.heartbeat.mockResolvedValue(null);
      await expect(service.heartbeat(principal(ME, PLANNER), SLUG, PLAN_ID)).rejects.toMatchObject({
        code: 'LOCKED',
        details: { reason: 'PLAN_EDIT_LOCK_LOST' },
      });
    });
  });

  describe('release', () => {
    it('scopes a Planner release to their own lock', async () => {
      await service.release(principal(ME, PLANNER), SLUG, PLAN_ID);
      expect(repository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ planId: PLAN_ID, organizationId: ORG_ID, holderUserId: ME }),
      );
    });

    it('force-releases (no holder scope) for an Org Admin', async () => {
      await service.release(principal(ME, ADMIN), SLUG, PLAN_ID);
      const arg = repository.remove.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(arg.holderUserId).toBeUndefined();
    });
  });

  describe('request', () => {
    it('denies a caller without plan:request_control (403)', async () => {
      await expect(service.request(principal(ME, VIEWER), SLUG, PLAN_ID)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it('stamps a pending request on a lock held by another', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: OTHER }));
      await service.request(principal(ME, PLANNER), SLUG, PLAN_ID);
      expect(repository.stampRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ requesterId: ME }),
      );
    });

    it('is a no-op when the lock is free (nothing to request)', async () => {
      repository.find.mockResolvedValue(null);
      const s = await service.request(principal(ME, PLANNER), SLUG, PLAN_ID);
      expect(repository.stampRequest).not.toHaveBeenCalled();
      expect(s.state).toBe('FREE');
    });
  });

  describe('handoff', () => {
    it('transfers the pen to the pending requester', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: ME, requestedByUserId: OTHER }));
      await service.handoff(principal(ME, PLANNER), SLUG, PLAN_ID);
      expect(repository.writeLeaseToHolder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ holderUserId: OTHER }),
      );
    });

    it('409s when no one has requested control', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: ME, requestedByUserId: null }));
      await expect(service.handoff(principal(ME, PLANNER), SLUG, PLAN_ID)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('423 LOST when the caller is no longer the holder', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: OTHER, requestedByUserId: ME }));
      await expect(service.handoff(principal(ME, PLANNER), SLUG, PLAN_ID)).rejects.toMatchObject({
        code: 'LOCKED',
        details: { reason: 'PLAN_EDIT_LOCK_LOST' },
      });
    });
  });

  describe('assertHoldsPen', () => {
    it('resolves when the principal holds a live lease', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: ME }));
      await expect(
        service.assertHoldsPen(principal(ME, PLANNER), PLAN_ID, ORG_ID),
      ).resolves.toBeUndefined();
    });

    it('raises 423 PLAN_EDIT_LOCK_REQUIRED when no one holds the pen', async () => {
      repository.find.mockResolvedValue(null);
      await expect(
        service.assertHoldsPen(principal(ME, PLANNER), PLAN_ID, ORG_ID),
      ).rejects.toMatchObject({ code: 'LOCKED', details: { reason: 'PLAN_EDIT_LOCK_REQUIRED' } });
    });

    it('raises 423 PLAN_EDIT_LOCK_REQUIRED when someone else holds the pen', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: OTHER }));
      await expect(
        service.assertHoldsPen(principal(ME, PLANNER), PLAN_ID, ORG_ID),
      ).rejects.toMatchObject({ code: 'LOCKED', details: { reason: 'PLAN_EDIT_LOCK_REQUIRED' } });
    });

    it('does not renew the lease (the 423 gate never writes)', async () => {
      repository.find.mockResolvedValue(lockRow({ holderUserId: ME }));
      await service.assertHoldsPen(principal(ME, PLANNER), PLAN_ID, ORG_ID);
      expect(repository.writeLeaseToHolder).not.toHaveBeenCalled();
      expect(repository.renewOwnLease).not.toHaveBeenCalled();
    });

    it('is a no-op (never reads the lock) when enforcement is disabled — the staged rollout', async () => {
      const inertConfig = { planEditLockEnforced: false } as unknown as AppConfigService;
      const inert = new PlanEditLockService(
        organizations as unknown as OrganizationsService,
        plans as unknown as PlanRepository,
        repository as unknown as PlanLockRepository,
        inertConfig,
        prisma as unknown as PrismaService,
        { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger,
      );
      // Even with nobody holding the pen, an unenforced gate must not reject.
      repository.find.mockResolvedValue(lockRow({ holderUserId: OTHER }));
      await expect(
        inert.assertHoldsPen(principal(ME, PLANNER), PLAN_ID, ORG_ID),
      ).resolves.toBeUndefined();
      expect(repository.find).not.toHaveBeenCalled();
    });
  });
});
