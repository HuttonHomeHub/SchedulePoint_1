import { Prisma, type Activity, type ActivityType, type Plan } from '@prisma/client';
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
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import { ActivitiesService } from './activities.service';
import type { ActivityRepository } from './activity.repository';
import { ActivityResponseDto } from './dto/activity-response.dto';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PLAN_ID = 'plan-1';
const ACTIVITY_ID = 'act-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: 'Baseline',
    description: null,
    status: 'DRAFT',
    // Data date late enough that the progress tests' 2026 actuals are all on/before it (M2 N07).
    plannedStart: new Date('2026-12-31T00:00:00.000Z'),
    calendarId: null,
    schedulingMode: 'EARLY',
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

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: ACTIVITY_ID,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    // Stored in working-minutes now (ADR-0036): 5 working days = 5 × 1440.
    durationMinutes: 5 * 1440,
    calendarId: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    externalEarlyStart: null,
    externalLateFinish: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    accrualType: 'UNIFORM',
    budgetedExpense: null,
    actualExpense: null,
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayMinutes: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
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
  'activity:read',
  'activity:create',
  'activity:update',
  'activity:delete',
  'activity:restore',
];

describe('ActivitiesService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findCalendarIds: ReturnType<typeof vi.fn>;
  };
  let activities: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByPlan: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    findPlanWbsTree: ReturnType<typeof vi.fn>;
    updateParents: ReturnType<typeof vi.fn>;
    updatePlacements: ReturnType<typeof vi.fn>;
  };
  let lifecycle: {
    cascadeSoftDelete: ReturnType<typeof vi.fn>;
    cascadeSoftDeleteActivityLeaves: ReturnType<typeof vi.fn>;
    restoreBatch: ReturnType<typeof vi.fn>;
  };
  let calendars: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findHoursPerDayMinutes: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    activity: { findMany: ReturnType<typeof vi.fn> };
  };
  // Driving-assignment access on the tx client (ADR-0040 activity-path recompute). Default: no
  // driving assignment, so the triad is inert and every prior activity test stays byte-identical.
  let txDrivingFindFirst: ReturnType<typeof vi.fn>;
  let txDrivingUpdateMany: ReturnType<typeof vi.fn>;
  // The destination summary's name, read inside the reparent transaction for the audit row
  // (ADR-0073 C3.1). Named so a test can assert the batch looked one up at all.
  let txParentFindFirst: ReturnType<typeof vi.fn>;
  // The in-transaction membership read the batch placement / bulk-delete paths do before writing —
  // hoisted so a test can put a summary, a stale version or a ghost id in front of them.
  let txActivityFindMany: ReturnType<typeof vi.fn>;
  // Hoisted so a test can assert WHICH advisory locks a write path took. Both the plan write lock
  // (ADR-0038 parent-tree serialisation) and the calendar scope guard's lock go through
  // `tx.$executeRaw` as tagged templates, distinguishable by their namespace argument.
  let txExecuteRaw: ReturnType<typeof vi.fn>;
  // Hoisted so a test can make the pen refuse (423) and assert the write path stops there.
  let penGuard: { assertHoldsPen: ReturnType<typeof vi.fn> };
  let service: ActivitiesService;

  /** The namespaces passed to `pg_advisory_xact_lock`, in acquisition order. */
  const locksTaken = (): string[] =>
    txExecuteRaw.mock.calls.map((call) => String(call[1])).filter((ns) => ns !== 'undefined');

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = {
      findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()),
      // The plan-calendar half of an activity's effective calendar (ADR-0037/0068). Default: none,
      // so an activity that inherits falls back to the 24-hour constant and every existing
      // assertion here reads exactly the arithmetic it always did.
      findCalendarIds: vi.fn().mockResolvedValue([]),
    };
    activities = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findByIdInOrg: vi.fn(),
      findManyActiveByPlan: vi.fn(),
      updateIfVersionMatches: vi.fn(),
      findPlanWbsTree: vi.fn().mockResolvedValue([]),
      updateParents: vi.fn(),
      updatePlacements: vi.fn(),
    };
    lifecycle = {
      cascadeSoftDelete: vi.fn().mockResolvedValue({ batchId: 'b1', counts: {} }),
      cascadeSoftDeleteActivityLeaves: vi
        .fn()
        .mockResolvedValue({ activities: 0, dependencies: 0 }),
      restoreBatch: vi.fn().mockResolvedValue({}),
    };
    // The tx carries `$executeRaw` for the calendar advisory lock (ADR-0037 validation path) and the
    // `resourceAssignment` model for the ADR-0040 driving-assignment recompute. Default: no driver.
    txDrivingFindFirst = vi.fn().mockResolvedValue(null);
    txDrivingUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    txExecuteRaw = vi.fn();
    txParentFindFirst = vi.fn().mockResolvedValue({ name: 'Phase 1' });
    txActivityFindMany = vi.fn().mockResolvedValue([]);
    prisma = {
      // The post-transaction re-read of the rows a batch write moved.
      activity: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
        cb({
          $executeRaw: txExecuteRaw,
          activity: { findFirst: txParentFindFirst, findMany: txActivityFindMany },
          resourceAssignment: {
            findFirst: txDrivingFindFirst,
            updateMany: txDrivingUpdateMany,
          },
        }),
      ),
    };
    penGuard = { assertHoldsPen: vi.fn().mockResolvedValue(undefined) };
    const editLock = penGuard;
    // Activity calendars are validated in-org via this repo (ADR-0037); default: id resolves.
    // An ORG-tier calendar is usable by any activity in the org (ADR-0053 §2); the
    // wrong-project reject path is covered by the guard's own truth-table spec and e2e.
    calendars = {
      findActiveByIdInOrg: vi
        .fn()
        .mockResolvedValue({ id: 'cal-1', scope: 'ORG', projectId: null, archivedAt: null }),
      // The day↔minute factor (ADR-0068). Default: an empty map, so every lookup falls back to the
      // 24-hour constant and these specs assert exactly the arithmetic they always did.
      findHoursPerDayMinutes: vi.fn().mockResolvedValue(new Map()),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    // The audit producers (ADR-0073 C3.1) are proven end to end against a real table by
    // `audit-coverage.e2e-spec.ts` — a fake here could only assert that a fake was called. This
    // stub exists so the unit specs can keep asserting the scheduling behaviour they were written
    // for.
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new ActivitiesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      activities as unknown as ActivityRepository,
      calendars as unknown as CalendarRepository,
      lifecycle as unknown as HierarchyLifecycleService,
      editLock as unknown as PlanEditLockService,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      logger,
    );
  });

  describe('create', () => {
    it('creates an activity under an active parent plan, copying its org id', async () => {
      activities.create.mockResolvedValue(activity());
      const result = await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'Excavate',
      });
      expect(result.activity.id).toBe(ACTIVITY_ID);
      expect(activities.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, planId: PLAN_ID, name: 'Excavate' }),
        expect.anything(), // the transaction client (calendar validation is serialised inside it)
      );
    });

    it('validates a specific calendar in-org and threads it into the insert (M5, ADR-0037)', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'Cure',
        calendarId: 'cal-1',
      });
      expect(calendars.findActiveByIdInOrg).toHaveBeenCalledWith(
        'cal-1',
        ORG_ID,
        expect.anything(),
      );
      expect(activities.create).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'cal-1' }),
        expect.anything(),
      );
    });

    it('rejects a foreign/unknown activity calendar with 404 before the insert (M5)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Cure', calendarId: 'cal-x' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    it('threads a valid same-plan WBS_SUMMARY parent into the insert (ADR-0038)', async () => {
      activities.create.mockResolvedValue(activity());
      activities.findActiveByIdInOrg.mockResolvedValue(
        activity({ id: 'sum-1', type: 'WBS_SUMMARY', parentId: null }),
      );
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'Task',
        parentId: 'sum-1',
      });
      expect(activities.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'sum-1' }),
        expect.anything(),
      );
    });

    it('threads Earned-Value inputs into the insert (EV1, ADR-0042 — passthrough)', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'Fit-out',
        percentCompleteType: 'PHYSICAL',
        physicalPercentComplete: 40,
        budgetedExpense: 150000,
        actualExpense: 60000,
      });
      expect(activities.create).toHaveBeenCalledWith(
        expect.objectContaining({
          percentCompleteType: 'PHYSICAL',
          physicalPercentComplete: 40,
          budgetedExpense: 150000,
          actualExpense: 60000,
        }),
        expect.anything(),
      );
    });

    it('rejects a non-summary WBS parent with a 422 before the insert (PARENT_NOT_SUMMARY)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ id: 't-1', type: 'TASK' }));
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X', parentId: 't-1' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown / cross-plan WBS parent with a 404', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X', parentId: 'ghost' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    // ADR-0038 invariant (a): the parent-tree cycle walk is a read-then-write and MUST be
    // serialised per plan, or two concurrent mirror re-parents both pass a still-acyclic read.
    it('takes the plan write lock when creating UNDER a WBS parent', async () => {
      activities.create.mockResolvedValue(activity());
      activities.findActiveByIdInOrg.mockResolvedValue(
        activity({ id: 'sum-1', type: 'WBS_SUMMARY', parentId: null }),
      );
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'T', parentId: 'sum-1' });
      expect(locksTaken()).toContain('dependency-plan');
    });

    // The cost of the fix must fall ONLY on the re-parenting path: a plan-wide lock on every
    // ordinary create would serialise all authoring in the plan.
    it('takes NO plan lock on a top-level create (the common path is uncontended)', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'T' });
      expect(locksTaken()).not.toContain('dependency-plan');
    });

    // One acquisition order across this service (plan → calendar) is what makes two concurrent
    // writes unable to deadlock against each other.
    it('takes the plan lock BEFORE the calendar lock when a create sets both', async () => {
      activities.create.mockResolvedValue(activity());
      activities.findActiveByIdInOrg.mockResolvedValue(
        activity({ id: 'sum-1', type: 'WBS_SUMMARY', parentId: null }),
      );
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'T',
        parentId: 'sum-1',
        calendarId: 'cal-1',
      });
      expect(locksTaken()).toEqual(['dependency-plan', 'calendar-assign']);
    });

    it('defaults type to TASK and duration to 1 when omitted', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'A' });
      const arg = activities.create.mock.calls[0]?.[0] as { type: string; durationMinutes: number };
      expect(arg.type).toBe('TASK');
      // Public default of 1 working day is stored as 1440 working-minutes (ADR-0036).
      expect(arg.durationMinutes).toBe(1440);
    });

    /**
     * ADR-0068. Before the calendar carried an hours-per-day, "1 day" was 1440 working minutes on
     * every calendar — so on an 08:00-17:00 week (540 a day) it spanned 2.67 working days. The
     * factor comes from the activity's EFFECTIVE calendar, resolved inside the write transaction.
     */
    it('converts durationDays on the activity calendar’s working day, not a constant', async () => {
      calendars.findHoursPerDayMinutes.mockResolvedValue(new Map([['cal-1', 540]]));
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'A',
        durationDays: 2,
        calendarId: 'cal-1',
      });
      const arg = activities.create.mock.calls[0]?.[0] as { durationMinutes: number };
      expect(arg.durationMinutes).toBe(1080);
    });

    /**
     * The write and the read must use the SAME factor. With only the write converted, authoring
     * "2 days" on an 08:00-17:00 calendar would store the right minutes and read back as "1" — a
     * form that shows a different number from the one just saved.
     */
    it('reads a duration back in the unit it was written in', async () => {
      calendars.findHoursPerDayMinutes.mockResolvedValue(new Map([['cal-1', 540]]));
      activities.create.mockResolvedValue({
        ...activity(),
        durationMinutes: 1080,
        calendarId: 'cal-1',
      });
      const { activity: created } = await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'A',
        durationDays: 2,
        calendarId: 'cal-1',
      });
      expect(created.dayFactorMinutes).toBe(540);
      expect(ActivityResponseDto.from(created, true).durationDays).toBe(2);
    });

    it('takes durationMinutes literally — the factor is a days-only convenience', async () => {
      calendars.findHoursPerDayMinutes.mockResolvedValue(new Map([['cal-1', 540]]));
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'A',
        durationMinutes: 240,
        calendarId: 'cal-1',
      });
      const arg = activities.create.mock.calls[0]?.[0] as { durationMinutes: number };
      expect(arg.durationMinutes).toBe(240);
    });

    it('forces a milestone duration to 0 even if a non-zero value slips through', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'M',
        type: 'START_MILESTONE',
        durationDays: 3,
      });
      const arg = activities.create.mock.calls[0]?.[0] as { durationMinutes: number };
      expect(arg.durationMinutes).toBe(0);
    });

    it('converts a constraintDate (YYYY-MM-DD) to a UTC-midnight Date', async () => {
      activities.create.mockResolvedValue(activity());
      await service.create(principalWith(ALL), 'acme', PLAN_ID, {
        name: 'A',
        constraintType: 'SNET',
        constraintDate: '2026-05-01',
      });
      const arg = activities.create.mock.calls[0]?.[0] as {
        constraintType: string;
        constraintDate: Date;
      };
      expect(arg.constraintType).toBe('SNET');
      expect(arg.constraintDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });

    it('404s when the parent plan is missing/deleted (and does not create)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    it('forbids a caller without activity:create', async () => {
      await expect(
        service.create(principalWith(['activity:read']), 'acme', PLAN_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(activities.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name/code to a 409', async () => {
      activities.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', PLAN_ID, { name: 'Excavate' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('list', () => {
    it('404s when the parent plan is missing/deleted', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.findManyActiveByPlan).not.toHaveBeenCalled();
    });

    it('reports the next cursor when a full page + 1 comes back', async () => {
      activities.findManyActiveByPlan.mockResolvedValue([
        activity({ id: 'a' }),
        activity({ id: 'b' }),
        activity({ id: 'c' }),
      ]);
      const { items, meta } = await service.list(principalWith(ALL), 'acme', PLAN_ID, { limit: 2 });
      expect(items).toHaveLength(2);
      expect(meta).toEqual({ nextCursor: 'b', hasMore: true });
    });
  });

  // EV4a (ADR-0042): the money expense amounts are conditionally included only for a `cost:read`
  // caller (Planner/Org Admin), org-scoped and fail-closed. `ALL` above has no cost:read.
  describe('cost:read gating (EV4a)', () => {
    const withCost = activity({ budgetedExpense: 150000n, actualExpense: 60000n });

    it('a Planner/Org-Admin (cost:read) read exposes the real expense amounts (get + list)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(withCost);
      const got = await service.get(principalWith([...ALL, 'cost:read']), 'acme', ACTIVITY_ID);
      expect(got.canReadCost).toBe(true);
      const dto = ActivityResponseDto.from(got.activity, got.canReadCost);
      expect(dto.budgetedExpense).toBe(150000);
      expect(dto.actualExpense).toBe(60000);

      activities.findManyActiveByPlan.mockResolvedValue([withCost]);
      const listed = await service.list(principalWith([...ALL, 'cost:read']), 'acme', PLAN_ID, {
        limit: 20,
      });
      expect(listed.canReadCost).toBe(true);
      expect(ActivityResponseDto.from(listed.items[0]!, listed.canReadCost).budgetedExpense).toBe(
        150000,
      );
    });

    it('a Viewer/Contributor (no cost:read) read returns null for BOTH expense fields (fail-closed)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(withCost);
      const got = await service.get(principalWith(['activity:read']), 'acme', ACTIVITY_ID);
      expect(got.canReadCost).toBe(false);
      const dto = ActivityResponseDto.from(got.activity, got.canReadCost);
      expect(dto.budgetedExpense).toBeNull();
      expect(dto.actualExpense).toBeNull();
    });

    it('a Contributor reporting progress never sees cost (updateProgress fails closed)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(withCost);
      plans.findActiveByIdInOrg.mockResolvedValue(plan());
      activities.updateIfVersionMatches.mockResolvedValue(1);
      // A Contributor holds activity:update_progress but NOT cost:read.
      const res = await service.updateProgress(
        principalWith(['activity:update_progress']),
        'acme',
        ACTIVITY_ID,
        { percentComplete: 50, version: 1 },
      );
      expect(res.canReadCost).toBe(false);
      expect(ActivityResponseDto.from(res.activity, res.canReadCost).budgetedExpense).toBeNull();
    });
  });

  describe('update', () => {
    it('clears code/description on an empty string and constraint on null', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
        code: '',
        description: '',
        constraintType: null,
        constraintDate: null,
        version: 1,
      });
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        code: string | null;
        description: string | null;
        constraintType: unknown;
        constraintDate: Date | null;
      };
      expect(patch.code).toBeNull();
      expect(patch.description).toBeNull();
      expect(patch.constraintType).toBeNull();
      expect(patch.constraintDate).toBeNull();
    });

    it('patches Earned-Value inputs and clears the nullable ones on null (EV1, ADR-0042)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
        percentCompleteType: 'UNITS',
        physicalPercentComplete: null,
        budgetedExpense: 250000,
        actualExpense: null,
        version: 1,
      });
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        percentCompleteType: string;
        physicalPercentComplete: number | null;
        budgetedExpense: number | null;
        actualExpense: number | null;
      };
      expect(patch.percentCompleteType).toBe('UNITS');
      expect(patch.physicalPercentComplete).toBeNull();
      expect(patch.budgetedExpense).toBe(250000);
      expect(patch.actualExpense).toBeNull();
    });

    it('coerces duration to 0 when the type is changed to a milestone', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(1);
      await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
        type: 'FINISH_MILESTONE',
        version: 1,
      });
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        durationMinutes: number;
      };
      expect(patch.durationMinutes).toBe(0);
    });

    it('422s a partial constraint update (one side omitted) without touching the row', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await expect(
        service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          constraintType: null,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(activities.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('409s on a stale version', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', ACTIVITY_ID, { version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('404s when the activity is missing', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', ACTIVITY_ID, { name: 'New', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    // ADR-0038 invariant (a). The re-parent path reads the ancestor chain and then writes on the
    // strength of it; optimistic `version` cannot catch the mirror race (each row IS at the
    // version it was read at), so the plan advisory lock is the only thing serialising it.
    describe('WBS re-parent serialisation (ADR-0038 invariant (a))', () => {
      /**
       * First lookup resolves the activity being edited, the second its new parent; the trailing
       * default covers the post-transaction re-read of the updated row.
       */
      function existingThenParent() {
        activities.findActiveByIdInOrg
          .mockResolvedValueOnce(activity())
          .mockResolvedValueOnce(activity({ id: 'sum-1', type: 'WBS_SUMMARY', parentId: null }))
          .mockResolvedValue(activity({ parentId: 'sum-1' }));
        activities.updateIfVersionMatches.mockResolvedValue(1);
      }

      it('takes the plan write lock when re-parenting to a summary', async () => {
        existingThenParent();
        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          parentId: 'sum-1',
          version: 1,
        });
        expect(locksTaken()).toContain('dependency-plan');
      });

      it('takes NO plan lock on an ordinary edit that omits parentId', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(activity());
        activities.updateIfVersionMatches.mockResolvedValue(1);
        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, { name: 'New', version: 1 });
        expect(locksTaken()).not.toContain('dependency-plan');
      });

      // Clearing to top-level cannot create a cycle — there is no chain to walk — so it does not
      // pay for the lock either.
      it('takes NO plan lock when clearing the parent to top level', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(activity());
        activities.updateIfVersionMatches.mockResolvedValue(1);
        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          parentId: null,
          version: 1,
        });
        expect(locksTaken()).not.toContain('dependency-plan');
      });

      it('takes the plan lock BEFORE the calendar lock when an update sets both', async () => {
        existingThenParent();
        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          parentId: 'sum-1',
          calendarId: 'cal-1',
          version: 1,
        });
        expect(locksTaken()).toEqual(['dependency-plan', 'calendar-assign']);
      });
    });

    // Duration-type triad recompute on the ACTIVITY write path (M7 rung 4, ADR-0040 §3).
    // editedField = DURATION: the duration is held; the dependent (Units or Units/Time, per the
    // truth table) recomputes on the DRIVING assignment. `D` = durationMinutes / 60 working hours.
    describe('duration-type recompute (ADR-0040)', () => {
      /** A driving assignment row as the tx sees it (Decimal columns), with a rate by default. */
      function driving(overrides: Record<string, unknown> = {}) {
        return {
          id: 'asg-1',
          budgetedUnits: new Prisma.Decimal(40),
          unitsPerHour: new Prisma.Decimal(4),
          version: 1,
          ...overrides,
        };
      }

      it('recomputes the driving assignment’s UNITS on a duration edit (default FIXED_DURATION_AND_UNITS_TIME)', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(
          activity({ durationType: 'FIXED_DURATION_AND_UNITS_TIME' }),
        );
        activities.updateIfVersionMatches.mockResolvedValue(1);
        txDrivingFindFirst.mockResolvedValue(driving({ unitsPerHour: new Prisma.Decimal(4) }));

        // 10 working days → 14 400 min → D = 240 h; U := D × R = 240 × 4 = 960 (duration held).
        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          durationDays: 10,
          version: 1,
        });

        // The activity's own duration is the (held) edited value; the engine reads it unchanged.
        const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
          durationMinutes: number;
        };
        expect(patch.durationMinutes).toBe(10 * 1440);
        // The dependent (Units) is recomputed and persisted on the assignment row, optimistic-locked.
        expect(txDrivingUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'asg-1', version: 1, deletedAt: null },
            data: expect.objectContaining({ budgetedUnits: 960, unitsPerHour: 4 }),
          }),
        );
      });

      it('recomputes the driving assignment’s RATE on a duration edit for a FIXED_UNITS activity', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(activity({ durationType: 'FIXED_UNITS' }));
        activities.updateIfVersionMatches.mockResolvedValue(1);
        // U = 300 held; edit duration to 10 d → D = 240 h; R := U / D = 300 / 240 = 1.25.
        txDrivingFindFirst.mockResolvedValue(
          driving({ budgetedUnits: new Prisma.Decimal(300), unitsPerHour: new Prisma.Decimal(30) }),
        );

        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          durationDays: 10,
          version: 1,
        });

        expect(txDrivingUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ budgetedUnits: 300, unitsPerHour: 1.25 }),
          }),
        );
      });

      it('leaves the assignment untouched when there is no driving assignment (parity)', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(activity());
        activities.updateIfVersionMatches.mockResolvedValue(1);
        txDrivingFindFirst.mockResolvedValue(null); // no driver

        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          durationDays: 3,
          version: 1,
        });

        const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
          durationMinutes: number;
        };
        expect(patch.durationMinutes).toBe(3 * 1440);
        expect(txDrivingUpdateMany).not.toHaveBeenCalled();
      });

      it('leaves the assignment untouched when the driving assignment has no rate (parity)', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(activity());
        activities.updateIfVersionMatches.mockResolvedValue(1);
        txDrivingFindFirst.mockResolvedValue(driving({ unitsPerHour: null }));

        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          durationDays: 3,
          version: 1,
        });

        expect(txDrivingUpdateMany).not.toHaveBeenCalled();
      });

      it('does NOT recompute when only the durationType is set (US-1 — no duration edit)', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(activity());
        activities.updateIfVersionMatches.mockResolvedValue(1);

        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          durationType: 'FIXED_UNITS',
          version: 1,
        });

        // The type is persisted, but with no durationDays the driving assignment is never even read.
        const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
          durationType: string;
        };
        expect(patch.durationType).toBe('FIXED_UNITS');
        expect(txDrivingFindFirst).not.toHaveBeenCalled();
        expect(txDrivingUpdateMany).not.toHaveBeenCalled();
      });

      it('does NOT recompute when the edit makes the activity a (zero-duration) milestone', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(activity());
        activities.updateIfVersionMatches.mockResolvedValue(1);
        txDrivingFindFirst.mockResolvedValue(driving());

        await service.update(principalWith(ALL), 'acme', ACTIVITY_ID, {
          type: 'FINISH_MILESTONE',
          durationDays: 0,
          version: 1,
        });

        expect(txDrivingUpdateMany).not.toHaveBeenCalled();
      });

      it('409s (rolling the whole write back) on a stale driving-assignment version', async () => {
        activities.findActiveByIdInOrg.mockResolvedValue(
          activity({ durationType: 'FIXED_DURATION_AND_UNITS_TIME' }),
        );
        activities.updateIfVersionMatches.mockResolvedValue(1);
        txDrivingFindFirst.mockResolvedValue(driving());
        txDrivingUpdateMany.mockResolvedValue({ count: 0 }); // stale assignment version

        await expect(
          service.update(principalWith(ALL), 'acme', ACTIVITY_ID, { durationDays: 10, version: 1 }),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });
  });

  describe('updateParents (batch WBS membership)', () => {
    /** A node as `findPlanWbsTree` projects it. */
    const node = (id: string, parentId: string | null = null, type: ActivityType = 'TASK') => ({
      id,
      parentId,
      type,
    });
    /** A plan with two top-level summaries and two unfiled tasks. */
    const flatPlan = () => [
      node('s1', null, 'WBS_SUMMARY'),
      node('s2', null, 'WBS_SUMMARY'),
      node('t1'),
      node('t2'),
    ];
    const call = (parents: { id: string; parentId: string | null; version: number }[]) =>
      service.updateParents(principalWith(ALL), 'acme', PLAN_ID, { parents });

    beforeEach(() => {
      activities.findPlanWbsTree.mockResolvedValue(flatPlan());
    });

    it('files several activities under a summary in one write', async () => {
      activities.updateParents.mockResolvedValue(2);
      await call([
        { id: 't1', parentId: 's1', version: 1 },
        { id: 't2', parentId: 's1', version: 1 },
      ]);
      expect(activities.updateParents).toHaveBeenCalledWith(
        ORG_ID,
        PLAN_ID,
        [
          { id: 't1', parentId: 's1', version: 1 },
          { id: 't2', parentId: 's1', version: 1 },
        ],
        expect.any(String),
        expect.anything(),
      );
    });

    it('clears a member to the top level on a null parentId', async () => {
      activities.findPlanWbsTree.mockResolvedValue([
        node('s1', null, 'WBS_SUMMARY'),
        node('t1', 's1'),
      ]);
      activities.updateParents.mockResolvedValue(1);
      await call([{ id: 't1', parentId: null, version: 1 }]);
      expect(activities.updateParents).toHaveBeenCalledWith(
        ORG_ID,
        PLAN_ID,
        [{ id: 't1', parentId: null, version: 1 }],
        expect.any(String),
        expect.anything(),
      );
    });

    it('takes the plan write lock (ADR-0038 invariant (a))', async () => {
      activities.updateParents.mockResolvedValue(1);
      await call([{ id: 't1', parentId: 's1', version: 1 }]);
      expect(locksTaken()).toContain('dependency-plan');
    });

    it('422s a duplicate id without writing (DUPLICATE_PARENT_ID)', async () => {
      await expect(
        call([
          { id: 't1', parentId: 's1', version: 1 },
          { id: 't1', parentId: 's2', version: 1 },
        ]),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    it('404s an id that is not in this plan (anti-IDOR)', async () => {
      await expect(call([{ id: 'ghost', parentId: 's1', version: 1 }])).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    it('404s a parent that is not in this plan', async () => {
      await expect(call([{ id: 't1', parentId: 'ghost', version: 1 }])).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    it('422s a non-summary parent (PARENT_NOT_SUMMARY)', async () => {
      await expect(call([{ id: 't1', parentId: 't2', version: 1 }])).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    it('422s an activity filed under itself (PARENT_CYCLE)', async () => {
      await expect(call([{ id: 's1', parentId: 's1', version: 1 }])).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    // The reason validation runs against the RESULTING tree rather than the current one. Read row
    // by row against the pre-batch state, BOTH of these are legal — each files a childless
    // top-level summary under another childless top-level summary. Applied together they close a
    // loop, and a per-row check would have written it.
    it('409s a batch that is cycle-free row by row but cyclic as a whole', async () => {
      await expect(
        call([
          { id: 's1', parentId: 's2', version: 1 },
          { id: 's2', parentId: 's1', version: 1 },
        ]),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    it('409s a batch that closes a loop through an EXISTING edge', async () => {
      // s2 already sits under s1, so filing s1 under s2 closes s1 → s2 → s1.
      activities.findPlanWbsTree.mockResolvedValue([
        node('s1', null, 'WBS_SUMMARY'),
        node('s2', 's1', 'WBS_SUMMARY'),
      ]);
      await expect(call([{ id: 's1', parentId: 's2', version: 1 }])).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    it('accepts deep nesting that is legal (no false cycle from a long chain)', async () => {
      activities.findPlanWbsTree.mockResolvedValue([
        node('s1', null, 'WBS_SUMMARY'),
        node('s2', 's1', 'WBS_SUMMARY'),
        node('s3', 's2', 'WBS_SUMMARY'),
        node('t1'),
      ]);
      activities.updateParents.mockResolvedValue(1);
      await expect(call([{ id: 't1', parentId: 's3', version: 1 }])).resolves.toBeDefined();
    });

    it('409s and writes nothing when a row carries a stale version', async () => {
      activities.updateParents.mockResolvedValue(1); // one row short of the batch
      await expect(
        call([
          { id: 't1', parentId: 's1', version: 1 },
          { id: 't2', parentId: 's1', version: 9 },
        ]),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('refuses without the pen (423), before any read or write', async () => {
      const locked = new LockedError('nope', { reason: 'PLAN_EDIT_LOCK_REQUIRED', holder: null });
      penGuard.assertHoldsPen.mockRejectedValue(locked);
      await expect(call([{ id: 't1', parentId: 's1', version: 1 }])).rejects.toBe(locked);
      expect(activities.findPlanWbsTree).not.toHaveBeenCalled();
      expect(activities.updateParents).not.toHaveBeenCalled();
    });

    it('403s a principal without activity:update', async () => {
      await expect(
        service.updateParents(principalWith([]), 'acme', PLAN_ID, {
          parents: [{ id: 't1', parentId: 's1', version: 1 }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(activities.updateParents).not.toHaveBeenCalled();
    });
  });

  describe('dissolveSummary', () => {
    /** The tx client's `activity.updateMany`, used to promote the children. */
    let txUpdateMany: ReturnType<typeof vi.fn>;
    /** The tx client's `findFirst` — the summary RE-READ under the lock (the M6 perf finding). */
    let txFindFirst: ReturnType<typeof vi.fn>;
    /** The tx client's `findMany` — the children before, and the promoted rows after. */
    let txFindMany: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      txUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
      txFindFirst = vi.fn().mockResolvedValue({ parentId: null });
      txFindMany = vi.fn().mockResolvedValue([]);
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb({
          $executeRaw: txExecuteRaw,
          activity: {
            updateMany: txUpdateMany,
            findFirst: txFindFirst,
            findMany: txFindMany,
          },
        }),
      );
    });

    const summary = (over: Partial<Activity> = {}) =>
      activity({ id: ACTIVITY_ID, type: 'WBS_SUMMARY', parentId: null, ...over });

    it('promotes the direct children to the summary’s own parent, then deletes it', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary({ parentId: 'grandparent' }));
      txFindFirst.mockResolvedValue({ parentId: 'grandparent' });
      await service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID);

      expect(txUpdateMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, parentId: ACTIVITY_ID, deletedAt: null },
        data: expect.objectContaining({ parentId: 'grandparent' }),
      });
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalledWith(
        expect.anything(),
        'activity',
        ACTIVITY_ID,
        USER_ID,
      );
    });

    it('promotes children to the top level when the summary is top-level', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary({ parentId: null }));
      await service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(txUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ parentId: null }) }),
      );
    });

    /**
     * **The M6 backend-performance finding.** The summary is read once BEFORE the lock (to check
     * its type and find its plan), and the children's new parent must come from a read taken
     * AFTER it. Between the two, a concurrent `update` — which takes the same lock, so this is
     * precisely the race the lock exists to settle — can re-parent the summary; using the pre-lock
     * value would file the children under a grandparent it no longer has. A silently wrong tree,
     * produced by a transaction that looks correctly serialised.
     */
    it('takes the children’s new parent from the RE-READ under the lock, not the pre-lock read', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary({ parentId: 'stale-grandparent' }));
      // Someone re-parented the summary in the window before the lock was taken.
      txFindFirst.mockResolvedValue({ parentId: 'fresh-grandparent' });

      await service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID);

      expect(txUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'fresh-grandparent' }),
        }),
      );
    });

    it('404s when the summary vanished between the pre-lock read and the lock', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary());
      txFindFirst.mockResolvedValue(null);
      await expect(
        service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    /**
     * The caller could not have predicted which rows moved — it did not know the summary's
     * children — and each one's `version` was bumped, so a cached copy is now stale. Returning
     * them is what stops the next save 409-ing for a reason the user did not cause.
     */
    it('returns the promoted rows at their new versions', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary());
      txFindMany.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]).mockResolvedValueOnce([
        { id: 'c1', parentId: null, version: 3 },
        { id: 'c2', parentId: null, version: 8 },
      ]);

      const result = await service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID);

      expect(result.promoted).toEqual([
        { id: 'c1', parentId: null, version: 3 },
        { id: 'c2', parentId: null, version: 8 },
      ]);
    });

    // A promoted child's row changed, so a client holding the old copy must not be able to write
    // over the promotion — it gets a 409 on its next attempt instead.
    it('bumps the promoted children’s versions', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary());
      await service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID);
      const data = txUpdateMany.mock.calls[0]?.[0].data as { version: unknown };
      expect(data.version).toEqual({ increment: 1 });
    });

    it('takes the plan write lock, and does both writes in ONE transaction', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary());
      await service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(locksTaken()).toContain('dependency-plan');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('handles a childless summary (nothing to promote, still deleted)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary());
      txUpdateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID),
      ).resolves.toEqual({ promoted: [] });
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalled();
    });

    it('422s a non-summary activity without deleting it (NOT_A_SUMMARY)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ type: 'TASK' }));
      await expect(
        service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });

    /**
     * Gate first: a caller without the pen is told THAT, not the activity's type. The security
     * review's ordering nit, and the ordering every other structural write already uses.
     */
    it('asserts the pen BEFORE the type check', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ type: 'TASK' }));
      const locked = new LockedError('nope', { reason: 'PLAN_EDIT_LOCK_REQUIRED', holder: null });
      penGuard.assertHoldsPen.mockRejectedValue(locked);
      await expect(service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBe(
        locked,
      );
    });

    it('404s a missing activity', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses without the pen (423), before any write', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(summary());
      const locked = new LockedError('nope', { reason: 'PLAN_EDIT_LOCK_REQUIRED', holder: null });
      penGuard.assertHoldsPen.mockRejectedValue(locked);
      await expect(service.dissolveSummary(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBe(
        locked,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('403s a principal without activity:delete', async () => {
      await expect(
        service.dissolveSummary(principalWith([]), 'acme', ACTIVITY_ID),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('updateProgress', () => {
    const PROGRESS: Permission[] = ['activity:update_progress'];

    it('derives IN_PROGRESS from a partial percentage', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ percentComplete: 0 }));
      activities.updateIfVersionMatches.mockResolvedValue(1);
      await service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
        percentComplete: 40,
        version: 1,
      });
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        status: string;
        percentComplete: number;
      };
      expect(patch.status).toBe('IN_PROGRESS');
      expect(patch.percentComplete).toBe(40);
    });

    it('derives COMPLETE from 100% and IN_PROGRESS from a start date at 0%', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);

      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
        percentComplete: 100,
        actualStart: '2026-05-01',
        actualFinish: '2026-06-01',
        version: 1,
      });
      expect(
        (activities.updateIfVersionMatches.mock.calls[0]?.[2] as { status: string }).status,
      ).toBe('COMPLETE');

      // Started but 0% → IN_PROGRESS (the actual-start signal, not just the %).
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ percentComplete: 0 }));
      await service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
        actualStart: '2026-05-01',
        version: 1,
      });
      expect(
        (activities.updateIfVersionMatches.mock.calls[1]?.[2] as { status: string }).status,
      ).toBe('IN_PROGRESS');
    });

    it('rejects a finish without a start, and a finish before the start', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          actualFinish: '2026-06-01',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          actualStart: '2026-06-01',
          actualFinish: '2026-05-01',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(activities.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('rejects an actual date after the data date (M2 N07)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      // Data date is 2026-12-31; an actual start in 2027 is in the future.
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          actualStart: '2027-03-01',
          version: 1,
        }),
      ).rejects.toMatchObject({ details: { reason: 'ACTUAL_AFTER_DATA_DATE' } });
      expect(activities.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('repairs a complete activity with no actual finish to the data date (M2 N08)', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      const { warnings } = await service.updateProgress(
        principalWith(PROGRESS),
        'acme',
        ACTIVITY_ID,
        {
          percentComplete: 100,
          actualStart: '2026-05-01',
          version: 1, // no actualFinish, but 100% ⇒ complete
        },
      );
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        actualFinish: Date;
        status: string;
      };
      expect(patch.status).toBe('COMPLETE');
      expect(patch.actualFinish.toISOString()).toBe('2026-12-31T00:00:00.000Z'); // repaired to data date
      // The repair is surfaced to the caller as a machine-readable warning (ADR-0035 §6).
      expect(warnings).toEqual([
        { code: 'COMPLETE_WITHOUT_FINISH', message: expect.any(String) as string },
      ]);
    });

    it('repairs remaining > 0 on a complete activity to 0 (M2 N18)', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      const { warnings } = await service.updateProgress(
        principalWith(PROGRESS),
        'acme',
        ACTIVITY_ID,
        {
          percentComplete: 100,
          actualStart: '2026-05-01',
          actualFinish: '2026-06-01',
          remainingDurationDays: 3, // contradicts completeness → repaired to 0
          version: 1,
        },
      );
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        remainingDurationMinutes: number;
      };
      expect(patch.remainingDurationMinutes).toBe(0);
      expect(warnings).toEqual([
        { code: 'REMAINING_ON_COMPLETE', message: expect.any(String) as string },
      ]);
    });

    it('converts remaining days to stored minutes for an in-progress activity (M2), no warnings', async () => {
      activities.updateIfVersionMatches.mockResolvedValue(1);
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ percentComplete: 0 }));
      const { warnings } = await service.updateProgress(
        principalWith(PROGRESS),
        'acme',
        ACTIVITY_ID,
        {
          actualStart: '2026-05-01',
          remainingDurationDays: 2,
          version: 1,
        },
      );
      const patch = activities.updateIfVersionMatches.mock.calls[0]?.[2] as {
        remainingDurationMinutes: number;
      };
      expect(patch.remainingDurationMinutes).toBe(2 * 1440);
      // An ordinary in-progress report repairs nothing.
      expect(warnings).toEqual([]);
    });

    it('forbids a caller without activity:update_progress', async () => {
      await expect(
        service.updateProgress(principalWith(['activity:read']), 'acme', ACTIVITY_ID, {
          percentComplete: 10,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(activities.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('409s on a stale version', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      activities.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.updateProgress(principalWith(PROGRESS), 'acme', ACTIVITY_ID, {
          percentComplete: 50,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('remove', () => {
    it('soft-deletes an existing activity', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      await service.remove(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(lifecycle.cascadeSoftDelete).toHaveBeenCalledWith(
        expect.anything(),
        'activity',
        ACTIVITY_ID,
        USER_ID,
      );
    });

    /**
     * The #113 contract at the unit layer. It was proven only by the DB-gated e2e, so on a machine
     * without Postgres — and in the fast suite everyone actually runs — nothing said the id reaches
     * the caller at all. It is the cascade's OWN batch id, not a fresh one: that is what makes
     * `restore-batch` bring back exactly the rows this delete swept, including a summary's subtree.
     */
    it('returns the cascade’s delete batch id, so the caller can restore what it deleted', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      const result = await service.remove(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(result).toEqual({ deleteBatchId: 'b1' });
    });

    it('404s (and does not delete) when the activity is missing', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });
  });

  /**
   * The batch operations a canvas multi-select needs (`docs/specs/canvas-multi-select/` M1).
   *
   * These assert the **guard ordering** and the **no-write-on-refusal** property, which is what a
   * unit spec can prove and an e2e cannot cheaply: that a refused batch never reached the writer at
   * all, rather than reaching it and being rolled back. The behaviour against a real Postgres —
   * all-or-nothing, the shared batch id, the single audit row — is `activity-batch-ops.e2e-spec.ts`.
   */
  describe('updatePlacements (batch placement write)', () => {
    const row = (id: string, version = 1) => ({
      id,
      version,
      constraintType: null,
      constraintDate: null,
      visualStart: null,
      laneIndex: null,
    });
    const call = (placements: ReturnType<typeof row>[]) =>
      service.updatePlacements(principalWith(ALL), 'acme', PLAN_ID, { placements });

    it('writes the batch through the repository when every id is in the plan', async () => {
      txActivityFindMany.mockResolvedValue([{ id: 'a', type: 'TASK', version: 1 }]);
      activities.updatePlacements.mockResolvedValue(1);
      await call([row('a')]);
      expect(activities.updatePlacements).toHaveBeenCalledWith(
        ORG_ID,
        PLAN_ID,
        [row('a')],
        USER_ID,
        expect.anything(),
      );
    });

    it('422s a duplicate id without writing (DUPLICATE_PLACEMENT_ID)', async () => {
      await expect(call([row('a'), row('a')])).rejects.toBeInstanceOf(ValidationError);
      expect(activities.updatePlacements).not.toHaveBeenCalled();
    });

    it('404s an id that is not in this plan, and does not write (anti-IDOR)', async () => {
      txActivityFindMany.mockResolvedValue([]);
      await expect(call([row('ghost')])).rejects.toBeInstanceOf(NotFoundError);
      expect(activities.updatePlacements).not.toHaveBeenCalled();
    });

    it('404s a foreign id BEFORE it can learn the type of anything', async () => {
      // The ordering matters: telling a caller "that is a summary" about an id they cannot see
      // would answer "does this activity exist" — the existence oracle the module avoids.
      txActivityFindMany.mockResolvedValue([{ id: 'a', type: 'WBS_SUMMARY', version: 1 }]);
      await expect(call([row('a'), row('ghost')])).rejects.toBeInstanceOf(NotFoundError);
    });

    it('422s a WBS summary without writing (SUMMARY_NOT_BULK_ELIGIBLE)', async () => {
      txActivityFindMany.mockResolvedValue([{ id: 's', type: 'WBS_SUMMARY', version: 1 }]);
      await expect(call([row('s')])).rejects.toBeInstanceOf(ValidationError);
      expect(activities.updatePlacements).not.toHaveBeenCalled();
    });

    it('409s when the set-based write moves fewer rows than the batch names', async () => {
      txActivityFindMany.mockResolvedValue([
        { id: 'a', type: 'TASK', version: 1 },
        { id: 'b', type: 'TASK', version: 1 },
      ]);
      activities.updatePlacements.mockResolvedValue(1); // one stale
      await expect(call([row('a'), row('b')])).rejects.toBeInstanceOf(ConflictError);
    });

    it('423s without the pen, before any read or write', async () => {
      penGuard.assertHoldsPen.mockRejectedValue(new LockedError('no pen'));
      await expect(call([row('a')])).rejects.toBeInstanceOf(LockedError);
      expect(txActivityFindMany).not.toHaveBeenCalled();
      expect(activities.updatePlacements).not.toHaveBeenCalled();
    });

    it('403s a principal without activity:update', async () => {
      await expect(
        service.updatePlacements(principalWith([]), 'acme', PLAN_ID, { placements: [row('a')] }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('bulkDelete', () => {
    const ref = (id: string, version = 1) => ({ id, version });
    const call = (activitiesToDelete: ReturnType<typeof ref>[]) =>
      service.bulkDelete(principalWith(ALL), 'acme', PLAN_ID, { activities: activitiesToDelete });

    it('sweeps every row under ONE injected batch id, in ONE set-wise call', async () => {
      // The invariant is unchanged and is now **structural**: one call takes one batch id, so N
      // minted ids — which would make the undo restore a single activity, silently — is no longer
      // a thing the code could do. What the assertion had to change to is the count, and that is
      // the point of `docs/TECH_DEBT.md` #109: the loop issued five statements per id under the
      // plan-wide advisory lock, ~10,000 at the 2,000 cap.
      txActivityFindMany.mockResolvedValue([
        { id: 'a', type: 'TASK', version: 1 },
        { id: 'b', type: 'TASK', version: 1 },
      ]);
      lifecycle.cascadeSoftDeleteActivityLeaves.mockResolvedValue({
        activities: 2,
        dependencies: 0,
      });
      const result = await call([ref('a'), ref('b')]);

      expect(lifecycle.cascadeSoftDeleteActivityLeaves).toHaveBeenCalledTimes(1);
      // The per-id path must not be reached at all — a fallback that quietly kept looping would
      // pass a count assertion and lose the whole benefit.
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
      const [, ids, , injected] = lifecycle.cascadeSoftDeleteActivityLeaves.mock.calls[0] as [
        unknown,
        readonly string[],
        string,
        string,
      ];
      expect([...ids]).toEqual(['a', 'b']);
      expect(injected).toBe(result.deleteBatchId);
      expect(result).toMatchObject({ activityCount: 2, dependencyCount: 0 });
    });

    it('takes the plan write lock', async () => {
      txActivityFindMany.mockResolvedValue([{ id: 'a', type: 'TASK', version: 1 }]);
      lifecycle.cascadeSoftDeleteActivityLeaves.mockResolvedValue({
        activities: 1,
        dependencies: 0,
      });
      await call([ref('a')]);
      expect(locksTaken()).toContain('dependency-plan');
    });

    it('409s a stale version without deleting anything', async () => {
      txActivityFindMany.mockResolvedValue([{ id: 'a', type: 'TASK', version: 7 }]);
      await expect(call([ref('a', 1)])).rejects.toBeInstanceOf(ConflictError);
      expect(lifecycle.cascadeSoftDeleteActivityLeaves).not.toHaveBeenCalled();
    });

    it('422s a WBS summary without deleting anything', async () => {
      txActivityFindMany.mockResolvedValue([
        { id: 'a', type: 'TASK', version: 1 },
        { id: 's', type: 'WBS_SUMMARY', version: 1 },
      ]);
      await expect(call([ref('a'), ref('s')])).rejects.toBeInstanceOf(ValidationError);
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });

    it('422s a duplicate id without deleting anything', async () => {
      await expect(call([ref('a'), ref('a')])).rejects.toBeInstanceOf(ValidationError);
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });

    it('404s an id not in this plan without deleting anything', async () => {
      txActivityFindMany.mockResolvedValue([]);
      await expect(call([ref('ghost')])).rejects.toBeInstanceOf(NotFoundError);
      expect(lifecycle.cascadeSoftDelete).not.toHaveBeenCalled();
    });

    it('423s without the pen, before the transaction opens', async () => {
      penGuard.assertHoldsPen.mockRejectedValue(new LockedError('no pen'));
      await expect(call([ref('a')])).rejects.toBeInstanceOf(LockedError);
      expect(txActivityFindMany).not.toHaveBeenCalled();
    });

    it('403s a principal without activity:delete', async () => {
      await expect(
        service.bulkDelete(principalWith([]), 'acme', PLAN_ID, { activities: [ref('a')] }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('restoreDeleteBatch', () => {
    const BATCH = 'batch-1';
    const call = () => service.restoreDeleteBatch(principalWith(ALL), 'acme', PLAN_ID, BATCH);

    it('restores the whole batch with ONE lifecycle call, anchored on any member', async () => {
      // Not one call per member: `restoreBatch` sweeps every table by the anchor's batch id, so N
      // calls would be N redundant sweeps of rows the first one already brought back.
      prisma.activity.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
      await call();
      expect(lifecycle.restoreBatch).toHaveBeenCalledTimes(1);
      expect(lifecycle.restoreBatch).toHaveBeenCalledWith(
        expect.anything(),
        'activity',
        'a',
        USER_ID,
      );
    });

    it('404s a batch id no deleted row in this plan carries', async () => {
      prisma.activity.findMany.mockResolvedValue([]);
      await expect(call()).rejects.toBeInstanceOf(NotFoundError);
      expect(lifecycle.restoreBatch).not.toHaveBeenCalled();
    });

    it('423s without the pen, before it looks the batch up', async () => {
      penGuard.assertHoldsPen.mockRejectedValue(new LockedError('no pen'));
      await expect(call()).rejects.toBeInstanceOf(LockedError);
      expect(prisma.activity.findMany).not.toHaveBeenCalled();
    });

    it('403s a principal without activity:restore', async () => {
      await expect(
        service.restoreDeleteBatch(principalWith([]), 'acme', PLAN_ID, BATCH),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted activity', async () => {
      activities.findByIdInOrg.mockResolvedValue(activity({ deletedAt: new Date() }));
      activities.findActiveByIdInOrg.mockResolvedValue(activity());
      const result = await service.restore(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(lifecycle.restoreBatch).toHaveBeenCalledWith(
        expect.anything(),
        'activity',
        ACTIVITY_ID,
        USER_ID,
      );
      expect(result.activity.id).toBe(ACTIVITY_ID);
    });

    it('is a no-op when the activity is already active', async () => {
      activities.findByIdInOrg.mockResolvedValue(activity({ deletedAt: null }));
      await service.restore(principalWith(ALL), 'acme', ACTIVITY_ID);
      expect(lifecycle.restoreBatch).not.toHaveBeenCalled();
    });

    it('404s when the activity is unknown in this org', async () => {
      activities.findByIdInOrg.mockResolvedValue(null);
      await expect(service.restore(principalWith(ALL), 'acme', ACTIVITY_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
