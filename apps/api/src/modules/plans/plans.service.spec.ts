import { Prisma, type Plan, type Project } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { ProjectRepository } from '../projects/project.repository';

import type { PlanPatch, PlanRepository } from './plan.repository';
import { PlansService } from './plans.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PROJECT_ID = 'project-1';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    organizationId: ORG_ID,
    clientId: 'client-1',
    name: 'Riverside',
    description: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'pl1',
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    name: 'Baseline',
    description: null,
    status: 'DRAFT',
    plannedStart: new Date('2026-01-01T00:00:00.000Z'),
    calendarId: null,
    schedulingMode: 'EARLY',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6' });
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const ALL: Permission[] = [
  'plan:read',
  'plan:create',
  'plan:update',
  'plan:delete',
  'plan:restore',
];

describe('PlansService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let projects: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let plans: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByProject: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
  };
  let calendars: {
    findActiveByNameInOrg: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
  };
  let lifecycle: {
    cascadeSoftDelete: ReturnType<typeof vi.fn>;
    restoreBatch: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: PlansService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    projects = { findActiveByIdInOrg: vi.fn().mockResolvedValue(project()) };
    plans = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findByIdInOrg: vi.fn(),
      findManyActiveByProject: vi.fn(),
      updateIfVersionMatches: vi.fn(),
    };
    calendars = {
      // By default the org has a seeded Standard calendar new plans default to.
      findActiveByNameInOrg: vi.fn().mockResolvedValue({ id: 'cal-standard' }),
      findActiveByIdInOrg: vi.fn(),
    };
    lifecycle = {
      cascadeSoftDelete: vi.fn().mockResolvedValue({ batchId: 'b1', counts: {} }),
      restoreBatch: vi.fn().mockResolvedValue({}),
    };
    // The tx handle exposes $executeRaw (the calendar advisory lock) for the
    // calendar-assignment path; repo methods are mocked, so they ignore the tx arg.
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: vi.fn() })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new PlansService(
      organizations as unknown as OrganizationsService,
      projects as unknown as ProjectRepository,
      plans as unknown as PlanRepository,
      calendars as unknown as CalendarRepository,
      lifecycle as unknown as HierarchyLifecycleService,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('create', () => {
    it('creates a plan under an active parent project, copying its org id', async () => {
      plans.create.mockResolvedValue(plan());
      const result = await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'Baseline',
        plannedStart: '2026-01-01',
      });
      expect(result.id).toBe('pl1');
      expect(plans.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          name: 'Baseline',
          // Defaults to the org's seeded Standard calendar.
          calendarId: 'cal-standard',
        }),
      );
    });

    it('defaults calendarId to null when the org has no active Standard calendar', async () => {
      calendars.findActiveByNameInOrg.mockResolvedValue(null);
      plans.create.mockResolvedValue(plan());
      await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'NoCal',
        plannedStart: '2026-01-01',
      });
      const arg = plans.create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('calendarId' in arg).toBe(false);
    });

    it('converts plannedStart (YYYY-MM-DD) to a UTC-midnight Date and passes status', async () => {
      plans.create.mockResolvedValue(plan());
      await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'B',
        status: 'ACTIVE',
        plannedStart: '2026-05-01',
      });
      const arg = plans.create.mock.calls[0]?.[0] as { status: string; plannedStart: Date };
      expect(arg.status).toBe('ACTIVE');
      expect(arg.plannedStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });

    it('404s when the parent project is missing/deleted (and does not create)', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PROJECT_ID, {
          name: 'X',
          plannedStart: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(plans.create).not.toHaveBeenCalled();
    });

    it('forbids a caller without plan:create', async () => {
      await expect(
        service.create(principalWith(['plan:read']), 'acme', PROJECT_ID, {
          name: 'X',
          plannedStart: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(plans.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to a 409', async () => {
      plans.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', PROJECT_ID, {
          name: 'Baseline',
          plannedStart: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('list', () => {
    it('404s when the parent project is missing/deleted', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.list(principalWith(ALL), 'acme', PROJECT_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(plans.findManyActiveByProject).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('moves plannedStart to a new calendar day (mandatory: never cleared, ADR-0033 M1)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'pl1', {
        plannedStart: '2026-09-01',
        version: 1,
      });
      const patch = plans.updateIfVersionMatches.mock.calls[0]?.[2] as { plannedStart: Date };
      expect(patch.plannedStart.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('assigns a same-org active calendar and clears it on explicit null', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(1);
      calendars.findActiveByIdInOrg.mockResolvedValue({ id: 'cal-1' });

      await service.update(principalWith(ALL), 'acme', 'pl1', { calendarId: 'cal-1', version: 1 });
      expect((plans.updateIfVersionMatches.mock.calls[0]?.[2] as PlanPatch).calendarId).toBe(
        'cal-1',
      );

      await service.update(principalWith(ALL), 'acme', 'pl1', { calendarId: null, version: 1 });
      expect((plans.updateIfVersionMatches.mock.calls[1]?.[2] as PlanPatch).calendarId).toBeNull();
    });

    it('404s when assigning a foreign/unknown calendar (anti-IDOR, no leak)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', 'pl1', { calendarId: 'foreign', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(plans.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('409s on a stale version', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', 'pl1', { version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('404s when the plan is missing', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', 'pl1', { name: 'New', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('soft-deletes an existing plan', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      await service.remove(principalWith(ALL), 'acme', 'pl1');
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalledWith(
        expect.anything(),
        'plan',
        'pl1',
        USER_ID,
      );
    });

    it('404s (and does not delete) when the plan is missing', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', 'pl1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted plan', async () => {
      plans.findByIdInOrg.mockResolvedValue(plan({ deletedAt: new Date() }));
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      const result = await service.restore(principalWith(ALL), 'acme', 'pl1');
      expect(lifecycle.restoreBatch).toHaveBeenCalledWith(
        expect.anything(),
        'plan',
        'pl1',
        USER_ID,
      );
      expect(result.id).toBe('pl1');
    });

    it('is a no-op when the plan is already active', async () => {
      plans.findByIdInOrg.mockResolvedValue(plan({ deletedAt: null }));
      await service.restore(principalWith(ALL), 'acme', 'pl1');
      expect(lifecycle.restoreBatch).not.toHaveBeenCalled();
    });

    it('404s when the plan is unknown in this org', async () => {
      plans.findByIdInOrg.mockResolvedValue(null);
      await expect(service.restore(principalWith(ALL), 'acme', 'pl1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
