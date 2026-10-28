import { Prisma, type Plan, type Project } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import { BATCH_TRANSACTION_TIMEOUT_MS, type PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
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
    swimlaneSource: 'NONE',
    swimlaneWbsLevel: null,
    swimlaneCodeTypeId: null,
    projectId: PROJECT_ID,
    name: 'Baseline',
    description: null,
    status: 'DRAFT',
    plannedStart: new Date('2026-01-01T00:00:00.000Z'),
    calendarId: null,
    progressRecalcMode: 'RETAINED_LOGIC',
    useExpectedFinishDates: false,
    criticalPathDefinition: 'TOTAL_FLOAT',
    criticalFloatThresholdMinutes: 0,
    totalFloatMode: 'FINISH',
    makeOpenEndsCritical: false,
    levelResources: false,
    levelWithinFloatOnly: false,
    ignoreExternalRelationships: false,
    scheduleComputedAt: null,
    // ADR-0125 mirrors: null = the rule that produced this plan's persisted criticality is
    // unknown, which is what a never-recalculated fixture plan should say.
    scheduleCriticalPathDefinition: null,
    scheduleCriticalFloatThresholdMinutes: null,
    scheduleTotalFloatMode: null,
    scheduleMakeOpenEndsCritical: null,
    scheduleInputsChangedAt: new Date('2026-01-01T00:00:00Z'),
    eacMethod: 'CPI',
    currencyCode: null,
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
    findActiveHoldingNameInTier: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
  };
  let lifecycle: {
    cascadeSoftDelete: ReturnType<typeof vi.fn>;
    restoreBatch: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let txExecuteRaw: ReturnType<typeof vi.fn>;
  // The parent-lock statement a create takes (`FOR SHARE`); a row back means the parent is active.
  let txQueryRaw: ReturnType<typeof vi.fn>;
  // The plan ids the scheduling-input stamp named (its parameters: the organisation, then the ids).
  const stampedPlanIds = (): string[][] =>
    txExecuteRaw.mock.calls
      .filter((call) => String(call[0]).includes('schedule_inputs_changed_at'))
      .map((call) => call[2] as string[]);
  let audit: { record: ReturnType<typeof vi.fn> };
  // Hoisted so a test can make the pen refuse (423) and assert the swimlane write stops there.
  let penGuard: { assertHoldsPen: ReturnType<typeof vi.fn> };
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
      findActiveHoldingNameInTier: vi
        .fn()
        .mockResolvedValue({ id: 'cal-standard', name: 'Standard', archivedAt: null }),
      // The guard's locked re-read; by default the Standard is still active and ORG-scoped.
      findActiveByIdInOrg: vi.fn().mockResolvedValue({
        id: 'cal-standard',
        scope: 'ORG',
        projectId: null,
        archivedAt: null,
      }),
    };
    lifecycle = {
      cascadeSoftDelete: vi.fn().mockResolvedValue({ batchId: 'b1', counts: {} }),
      restoreBatch: vi.fn().mockResolvedValue({}),
    };
    // The tx handle exposes $executeRaw (the calendar advisory lock) for the
    // calendar-assignment path; repo methods are mocked, so they ignore the tx arg.
    txExecuteRaw = vi.fn();
    txQueryRaw = vi.fn().mockResolvedValue([{ id: 'locked' }]);
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
        cb({ $executeRaw: txExecuteRaw, $queryRaw: txQueryRaw }),
      ),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    penGuard = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    service = new PlansService(
      organizations as unknown as OrganizationsService,
      projects as unknown as ProjectRepository,
      plans as unknown as PlanRepository,
      calendars as unknown as CalendarRepository,
      lifecycle as unknown as HierarchyLifecycleService,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      penGuard as unknown as PlanEditLockService,
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
        expect.anything(),
      );
    });

    it('404s and does not insert when the parent is deleted between the read and the lock', async () => {
      // The race of docs/TECH_DEBT.md #531: the read saw an active project, a delete then won it.
      txQueryRaw.mockResolvedValue([]);
      await expect(
        service.create(principalWith(ALL), 'acme', PROJECT_ID, {
          name: 'X',
          plannedStart: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(plans.create).not.toHaveBeenCalled();
    });

    it('defaults calendarId to null when the org has no active Standard calendar', async () => {
      calendars.findActiveHoldingNameInTier.mockResolvedValue(null);
      plans.create.mockResolvedValue(plan());
      await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'NoCal',
        plannedStart: '2026-01-01',
      });
      const arg = plans.create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('calendarId' in arg).toBe(false);
    });

    it('looks the Standard up in the ORG tier only, so another project\'s "Standard" is never a candidate', async () => {
      plans.create.mockResolvedValue(plan());
      await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'Tier',
        plannedStart: '2026-01-01',
      });
      expect(calendars.findActiveHoldingNameInTier).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        name: 'Standard',
        scope: 'ORG',
        projectId: null,
      });
    });

    it('locks the project chain, then the calendar, then inserts (docs/TECH_DEBT.md #559)', async () => {
      plans.create.mockResolvedValue(plan());
      await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'Order',
        plannedStart: '2026-01-01',
      });
      const calendarLock = txExecuteRaw.mock.invocationCallOrder[0];
      const chainLock = txQueryRaw.mock.invocationCallOrder[0];
      const insert = plans.create.mock.invocationCallOrder[0];
      expect(chainLock).toBeDefined();
      expect(calendarLock).toBeDefined();
      expect(insert).toBeDefined();
      expect(chainLock!).toBeLessThan(calendarLock!);
      expect(calendarLock!).toBeLessThan(insert!);
    });

    it('binds nothing when the Standard is archived, and never takes its lock', async () => {
      calendars.findActiveHoldingNameInTier.mockResolvedValue({
        id: 'cal-standard',
        name: 'Standard',
        archivedAt: new Date(),
      });
      plans.create.mockResolvedValue(plan());
      await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'Archived',
        plannedStart: '2026-01-01',
      });
      const arg = plans.create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('calendarId' in arg).toBe(false);
    });

    it('omits the calendar when the Standard is deleted between the hint and the lock', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      plans.create.mockResolvedValue(plan());
      await service.create(principalWith(ALL), 'acme', PROJECT_ID, {
        name: 'Gone',
        plannedStart: '2026-01-01',
      });
      const arg = plans.create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect('calendarId' in arg).toBe(false);
    });

    it('does not swallow a scope rejection from the guard', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue({
        id: 'cal-standard',
        scope: 'PROJECT',
        projectId: 'other-project',
        archivedAt: null,
      });
      await expect(
        service.create(principalWith(ALL), 'acme', PROJECT_ID, {
          name: 'Wrong',
          plannedStart: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(plans.create).not.toHaveBeenCalled();
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
    it('flags the plan as edited when a scheduling option changes', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'pl1', {
        progressRecalcMode: 'PROGRESS_OVERRIDE',
        version: 1,
      });
      expect(stampedPlanIds()).toEqual([['pl1']]);
    });

    it('does not flag the plan for a rename, a currency change, or resending the values it holds', async () => {
      const held = plan();
      plans.findActiveByIdInOrg.mockResolvedValue(held);
      plans.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'pl1', {
        name: 'Renamed',
        currencyCode: 'EUR',
        plannedStart: held.plannedStart.toISOString().slice(0, 10),
        progressRecalcMode: held.progressRecalcMode,
        version: 1,
      });
      expect(stampedPlanIds()).toEqual([]);
    });

    describe('swimlane source and level', () => {
      const patchOf = (): Record<string, unknown> =>
        plans.updateIfVersionMatches.mock.calls[0]?.[2] as Record<string, unknown>;

      beforeEach(() => {
        plans.updateIfVersionMatches.mockResolvedValue(1);
      });

      it('writes the pair together, and is not a scheduling input', async () => {
        plans.findActiveByIdInOrg.mockResolvedValue(plan());
        await service.update(principalWith(ALL), 'acme', 'pl1', {
          swimlaneSource: 'WBS',
          swimlaneWbsLevel: 2,
          version: 1,
        });
        expect(patchOf()).toMatchObject({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2 });
        expect(stampedPlanIds()).toEqual([]);
      });

      it('clears the level when the source leaves WBS', async () => {
        plans.findActiveByIdInOrg.mockResolvedValue(
          plan({ swimlaneSource: 'WBS', swimlaneWbsLevel: 3 }),
        );
        await service.update(principalWith(ALL), 'acme', 'pl1', {
          swimlaneSource: 'MANUAL',
          version: 1,
        });
        expect(patchOf()).toMatchObject({ swimlaneSource: 'MANUAL', swimlaneWbsLevel: null });
      });

      it('keeps the stored level when only the source is resent as WBS', async () => {
        plans.findActiveByIdInOrg.mockResolvedValue(
          plan({ swimlaneSource: 'WBS', swimlaneWbsLevel: 3 }),
        );
        await service.update(principalWith(ALL), 'acme', 'pl1', {
          swimlaneSource: 'WBS',
          version: 1,
        });
        expect(patchOf()).toMatchObject({ swimlaneSource: 'WBS', swimlaneWbsLevel: 3 });
      });

      it('moves only the level of a WBS plan', async () => {
        plans.findActiveByIdInOrg.mockResolvedValue(
          plan({ swimlaneSource: 'WBS', swimlaneWbsLevel: 1 }),
        );
        await service.update(principalWith(ALL), 'acme', 'pl1', {
          swimlaneWbsLevel: 2,
          version: 1,
        });
        expect(patchOf()).toMatchObject({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2 });
      });

      it.each([
        ['WBS without a level', { swimlaneSource: 'WBS' as const }, 'NONE'],
        [
          'a level on a source that is not WBS',
          { swimlaneSource: 'MANUAL' as const, swimlaneWbsLevel: 2 },
          'NONE',
        ],
        ['a level on a plan that is not WBS', { swimlaneWbsLevel: 1 }, 'NONE'],
        ['a cleared level on a WBS plan', { swimlaneWbsLevel: null }, 'WBS'],
      ])('refuses %s (422), where the CHECK would be a 500', async (_name, body, held) => {
        plans.findActiveByIdInOrg.mockResolvedValue(
          plan(held === 'WBS' ? { swimlaneSource: 'WBS', swimlaneWbsLevel: 1 } : {}),
        );
        const error = await service
          .update(principalWith(ALL), 'acme', 'pl1', { ...body, version: 1 })
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).details).toEqual({ reason: 'SWIMLANE_LEVEL_MISMATCH' });
        expect(plans.updateIfVersionMatches).not.toHaveBeenCalled();
      });

      it('needs the pen for a source change, but not for a rename', async () => {
        plans.findActiveByIdInOrg.mockResolvedValue(plan());
        await service.update(principalWith(ALL), 'acme', 'pl1', { name: 'Renamed', version: 1 });
        expect(penGuard.assertHoldsPen).not.toHaveBeenCalled();
        penGuard.assertHoldsPen.mockRejectedValue(new LockedError('no pen'));
        await expect(
          service.update(principalWith(ALL), 'acme', 'pl1', {
            swimlaneSource: 'MANUAL',
            version: 1,
          }),
        ).rejects.toBeInstanceOf(LockedError);
        expect(plans.updateIfVersionMatches).toHaveBeenCalledTimes(1);
      });

      it('leaves both columns alone when the request names neither', async () => {
        plans.findActiveByIdInOrg.mockResolvedValue(plan());
        await service.update(principalWith(ALL), 'acme', 'pl1', { name: 'Renamed', version: 1 });
        expect(patchOf()).not.toHaveProperty('swimlaneSource');
        expect(patchOf()).not.toHaveProperty('swimlaneWbsLevel');
      });
    });

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

    it('persists the progress recalc mode (M2, ADR-0035)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'pl1', {
        progressRecalcMode: 'PROGRESS_OVERRIDE',
        version: 1,
      });
      expect(
        (plans.updateIfVersionMatches.mock.calls[0]?.[2] as PlanPatch).progressRecalcMode,
      ).toBe('PROGRESS_OVERRIDE');
    });

    it('persists the critical-path definition and float threshold (M6, ADR-0035 §17)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'pl1', {
        criticalPathDefinition: 'LONGEST_PATH',
        criticalFloatThresholdMinutes: 3,
        totalFloatMode: 'SMALLEST',
        makeOpenEndsCritical: true,
        version: 1,
      });
      const patch = plans.updateIfVersionMatches.mock.calls[0]?.[2] as PlanPatch;
      expect(patch.criticalPathDefinition).toBe('LONGEST_PATH');
      expect(patch.criticalFloatThresholdMinutes).toBe(3);
      expect(patch.totalFloatMode).toBe('SMALLEST');
      expect(patch.makeOpenEndsCritical).toBe(true);
    });

    it('persists the Earned-Value plan options; currencyCode clears on null (EV1, ADR-0042)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', 'pl1', {
        eacMethod: 'CPI_TIMES_SPI',
        currencyCode: null,
        version: 1,
      });
      const patch = plans.updateIfVersionMatches.mock.calls[0]?.[2] as PlanPatch;
      expect(patch.eacMethod).toBe('CPI_TIMES_SPI');
      expect(patch.currencyCode).toBeNull();
    });

    it('assigns a same-org active calendar and clears it on explicit null', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      plans.updateIfVersionMatches.mockResolvedValue(1);
      // An ORG-tier calendar is usable by any plan in the org (ADR-0053 §2).
      calendars.findActiveByIdInOrg.mockResolvedValue({
        id: 'cal-1',
        scope: 'ORG',
        projectId: null,
        archivedAt: null,
      });

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

    it('runs the cascade under the batch transaction timeout, not the 15 s default', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      await service.remove(principalWith(ALL), 'acme', 'pl1');
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: BATCH_TRANSACTION_TIMEOUT_MS,
      });
    });

    it('404s (and does not delete) when the plan is missing', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', 'pl1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('audits the delete with the cascade’s OWN batch id, inside its transaction', async () => {
      // The batch id is what makes forty vanished rows legible as one action. Taking it from the
      // cascade's result rather than re-deriving it is the whole point: there is exactly one
      // place that number is decided.
      plans.findActiveByIdInOrg.mockResolvedValue(plan({ name: 'Baseline', status: 'ACTIVE' }));

      await service.remove(principalWith(ALL), 'acme', 'pl1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'plan.deleted',
          subjectType: 'PLAN',
          subjectId: 'pl1',
          subjectLabel: 'Baseline',
          before: { name: 'Baseline', status: 'ACTIVE', deleteBatchId: 'b1' },
        }),
        expect.anything(),
      );
      // The second argument is the transaction client, not undefined: a failed audit write must
      // roll the cascade back with it.
      expect(audit.record.mock.calls[0]?.[1]).toBeDefined();
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

    it('runs the restore under the batch transaction timeout, not the 15 s default', async () => {
      plans.findByIdInOrg.mockResolvedValue(plan({ deletedAt: new Date() }));
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      await service.restore(principalWith(ALL), 'acme', 'pl1');
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: BATCH_TRANSACTION_TIMEOUT_MS,
      });
    });

    it('is a no-op when the plan is already active', async () => {
      plans.findByIdInOrg.mockResolvedValue(plan({ deletedAt: null }));
      await service.restore(principalWith(ALL), 'acme', 'pl1');
      expect(lifecycle.restoreBatch).not.toHaveBeenCalled();
      // A no-op is not an event. Recording one would fill the log with rows for nothing having
      // happened, which is how a reader stops trusting it.
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('audits the restore in the `after` direction, carrying the batch it came from', async () => {
      plans.findByIdInOrg.mockResolvedValue(
        plan({ deletedAt: new Date(), deleteBatchId: 'b9', name: 'Baseline' }),
      );
      plans.findActiveByIdInOrg.mockResolvedValue(plan());

      await service.restore(principalWith(ALL), 'acme', 'pl1');

      const [input] = audit.record.mock.calls[0] as [Record<string, unknown>];
      expect(input.action).toBe('plan.restored');
      // `after`, not `before`: a restored row's name is what it now IS again. Putting the same
      // facts on both sides would assert a change that did not happen.
      expect(input.after).toEqual({ name: 'Baseline', status: 'DRAFT', deleteBatchId: 'b9' });
      expect(input.before).toBeUndefined();
    });

    it('404s when the plan is unknown in this org', async () => {
      plans.findByIdInOrg.mockResolvedValue(null);
      await expect(service.restore(principalWith(ALL), 'acme', 'pl1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
