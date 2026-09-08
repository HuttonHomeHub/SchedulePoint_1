import type { Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BaselineRepository } from '../baselines/baseline.repository';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { ScheduleRepository } from './schedule.repository';
import { ScheduleService } from './schedule.service';

/**
 * **`ScheduleService.crossPlanRevisionCompare` — the seam, not the arithmetic.**
 *
 * The delta, the classifier, the ghost builder and the correlation are pure and tested where they
 * live. What is only testable HERE is what the service decides: the order it refuses in, which plan
 * the ids resolve in, and what it returns when it cannot compare at all.
 *
 * Three of these cases name a risk the plan states in advance (M1-T3), and each was verified red
 * against the specific defect it guards before being kept.
 */

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const FROM_PLAN = 'plan-from';
const TO_PLAN = 'plan-to';

const READ: Permission[] = ['schedule:read', 'baseline:read'];

const principalWith = (permissions: Permission[]): Principal =>
  new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);

type PlanWithProject = Plan & { project: { id: string; name: string } };

const planRow = (id: string, over: Partial<Plan> = {}): PlanWithProject =>
  ({
    id,
    organizationId: ORG_ID,
    projectId: 'project-1',
    name: id === FROM_PLAN ? 'Rev A' : 'Rev B',
    description: null,
    status: 'DRAFT',
    plannedStart: new Date('2026-01-01T00:00:00.000Z'),
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
    scheduleComputedAt: new Date('2026-02-01T00:00:00.000Z'),
    scheduleCriticalPathDefinition: 'TOTAL_FLOAT',
    scheduleCriticalFloatThresholdMinutes: 0,
    scheduleTotalFloatMode: 'FINISH',
    scheduleMakeOpenEndsCritical: false,
    eacMethod: 'CPI',
    currencyCode: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    deletedAt: null,
    deleteBatchId: null,
    project: { id: 'project-1', name: 'Tower' },
    ...over,
  }) satisfies PlanWithProject;

/** A live activity row as `loadActiveActivitiesForDelta` returns it. */
const liveRow = (id: string, code: string | null, over: Record<string, unknown> = {}) => ({
  id,
  code,
  name: `Activity ${code ?? id}`,
  type: 'TASK' as const,
  durationMinutes: 480,
  isCritical: false,
  totalFloat: 0,
  earlyStart: new Date('2026-01-05T00:00:00.000Z'),
  earlyFinish: new Date('2026-01-06T00:00:00.000Z'),
  laneIndex: 0,
  parentId: null,
  calendarId: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  percentComplete: null,
  actualStart: null,
  actualFinish: null,
  ...over,
});

type LiveRow = ReturnType<typeof liveRow>;

describe('ScheduleService.crossPlanRevisionCompare', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActivePairInOrgWithProject: ReturnType<typeof vi.fn> };
  let baselines: {
    findActiveByIdInPlan: ReturnType<typeof vi.fn>;
    loadSnapshotRowsForDelta: ReturnType<typeof vi.fn>;
    // Typed rather than `ReturnType<typeof vi.fn>`: an untyped mock is a VOID procedure, so
    // every `mockImplementation` returning a promise is a lint error against a correct test.
    loadActiveActivitiesForDelta: Mock<(org: string, planId: string) => Promise<LiveRow[]>>;
    loadSnapshotDependenciesForDelta: ReturnType<typeof vi.fn>;
    loadActiveDependenciesForDelta: ReturnType<typeof vi.fn>;
    loadCalendarNames: ReturnType<typeof vi.fn>;
  };
  let service: ScheduleService;

  const compare = (
    permissions: Permission[] = READ,
    from = 'live',
    to = 'live',
    fromPlanId = FROM_PLAN,
    toPlanId = TO_PLAN,
  ) =>
    service.crossPlanRevisionCompare(
      principalWith(permissions),
      'acme',
      fromPlanId,
      toPlanId,
      from,
      to,
    );

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = {
      findActivePairInOrgWithProject: vi
        .fn()
        .mockResolvedValue([planRow(FROM_PLAN), planRow(TO_PLAN)]),
    };
    baselines = {
      findActiveByIdInPlan: vi.fn().mockResolvedValue(null),
      loadSnapshotRowsForDelta: vi.fn().mockResolvedValue([]),
      // Both plans hold A100; the FROM plan additionally holds A200, which the TO plan does not.
      loadActiveActivitiesForDelta: vi.fn((_org: string, planId: string) =>
        Promise.resolve(
          planId === FROM_PLAN
            ? [liveRow('from-uuid-1', 'A100'), liveRow('from-uuid-2', 'A200')]
            : [liveRow('to-uuid-1', 'A100')],
        ),
      ),
      loadSnapshotDependenciesForDelta: vi.fn().mockResolvedValue([]),
      loadActiveDependenciesForDelta: vi.fn().mockResolvedValue([]),
      loadCalendarNames: vi.fn().mockResolvedValue([]),
    };
    service = new ScheduleService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      {} as unknown as ScheduleRepository,
      { findHoursPerDayMinutes: () => Promise.resolve(new Map()) } as unknown as CalendarRepository,
      { assertHoldsPen: vi.fn() } as unknown as PlanEditLockService,
      { $transaction: vi.fn() } as unknown as PrismaService,
      {} as unknown as CrossPlanDependencyRepository,
      baselines as unknown as BaselineRepository,
      { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
    );
  });

  it('denies a caller holding schedule:read but NOT baseline:read, before any load', async () => {
    // Both codes are asserted, and the reason is forward-looking: they are granted to the same set
    // today, so narrowing either later must not leave this route open on the strength of the other.
    await expect(compare(['schedule:read'])).rejects.toBeInstanceOf(ForbiddenError);
    expect(plans.findActivePairInOrgWithProject).not.toHaveBeenCalled();
  });

  it('404s — never 403 — when either plan is outside the caller’s organisation', async () => {
    // `findMany` answers a miss with a SHORTER ARRAY rather than an error, which is the shape a
    // reader of the repository has to be told about; this is the case that pins the caller checking.
    plans.findActivePairInOrgWithProject.mockResolvedValue([planRow(FROM_PLAN)]);
    await expect(compare()).rejects.toBeInstanceOf(NotFoundError);
    expect(baselines.loadActiveActivitiesForDelta).not.toHaveBeenCalled();
  });

  it('refuses a SAME-PLAN pair with 422 CROSS_PLAN_SAME_PLAN, BEFORE resolving either revision', async () => {
    // The ordering is the decision. A same-plan pair is the wrong question whatever revisions it
    // names, so resolving them first would answer a 404 about a revision when the real answer is
    // "use the other route" — sending a reader to look for a typo in an id that is correct.
    plans.findActivePairInOrgWithProject.mockResolvedValue([planRow(FROM_PLAN)]);
    await expect(
      compare(READ, 'baseline-a', 'baseline-b', FROM_PLAN, FROM_PLAN),
    ).rejects.toMatchObject({ details: { reason: 'CROSS_PLAN_SAME_PLAN' } });
    expect(baselines.findActiveByIdInPlan).not.toHaveBeenCalled();
  });

  it('resolves each side’s revision against ITS OWN plan (anti-IDOR), and 404s a miss', async () => {
    await expect(compare(READ, 'baseline-of-other-plan', 'live')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(baselines.findActiveByIdInPlan).toHaveBeenCalledWith(
      'baseline-of-other-plan',
      ORG_ID,
      FROM_PLAN,
    );
  });

  it('carries every row under the ANCHOR plan’s UUID, and null where the row lives only in the other plan', async () => {
    const result = await compare();

    // A100 is in both, so it resolves in the plan the reader has open.
    expect(result.criticalPath.notAssessableReason).toBeNull();
    const removed = result.criticalPath.removed;
    expect(removed).toHaveLength(1);
    // A200 exists only in the OTHER plan. Inventing an id here would give the panel a reveal
    // control that navigates nowhere, which is worse than one that is absent (ADR-0082).
    expect(removed[0]).toMatchObject({ code: 'A200', activityId: null, existsLive: false });
    expect(result.correlation).toMatchObject({
      key: 'CODE',
      matched: 1,
      fromUnmatched: 1,
      toUnmatched: 0,
    });
    expect(result.correlation.fromUnmatchedRows).toEqual([
      expect.objectContaining({ code: 'A200', activityId: null, planId: FROM_PLAN }),
    ]);
  });

  it('answers NO_COMMON_CODES with a 200, a reason and NO delta — never a fabricated one', async () => {
    // Running the delta anyway reports every old activity as removed and every new one as added:
    // each row technically true, the picture a lie. It is not a 422 — the question was well formed
    // and the answer is a fact about the data.
    baselines.loadActiveActivitiesForDelta.mockImplementation((_org: string, planId: string) =>
      Promise.resolve([liveRow(`${planId}-1`, planId === FROM_PLAN ? 'AAA' : 'ZZZ')]),
    );
    const result = await compare();

    expect(result.notAssessableReason).toBe('NO_COMMON_CODES');
    expect(result.correlation.matched).toBe(0);
    expect(result.criticalPath.removed).toEqual([]);
    expect(result.criticalPath.added).toEqual([]);
    // Carried on the delta block TOO. A consumer reading only that block would otherwise see four
    // empty sets and a null reason, which reads as "assessed, and nothing changed".
    expect(result.criticalPath.notAssessableReason).toBe('NO_COMMON_CODES');
    expect(result.completion).toMatchObject({
      assessable: false,
      reason: 'NO_COMMON_ACTIVITIES',
    });
  });

  it('counts an uncoded row and puts it in NEITHER presence set', async () => {
    baselines.loadActiveActivitiesForDelta.mockImplementation((_org: string, planId: string) =>
      Promise.resolve(
        planId === FROM_PLAN
          ? [liveRow('from-1', 'A100'), liveRow('from-2', null)]
          : [liveRow('to-1', 'A100')],
      ),
    );
    const result = await compare();

    expect(result.correlation.fromUncoded).toBe(1);
    expect(result.correlation.uncodedRows).toEqual([
      expect.objectContaining({ code: null, planId: FROM_PLAN }),
    ]);
    // It is neither an addition nor a removal, because the product does not know which it is.
    expect(result.criticalPath.removed).toEqual([]);
    expect(result.criticalPath.added).toEqual([]);
  });

  it('names the measurement frame as the FROM plan’s, because two plans need not share one', async () => {
    const result = await compare();
    expect(result.frame).toMatchObject({ planId: FROM_PLAN, planName: 'Rev A' });
    expect(result.frame.hoursPerDayMinutes).toBe(result.dayFactorMinutes);
    // And both plans are named: with two of them the reader can infer neither.
    expect(result.fromPlan).toMatchObject({ id: FROM_PLAN, projectName: 'Tower' });
    expect(result.toPlan).toMatchObject({ id: TO_PLAN, projectName: 'Tower' });
  });

  it('withholds the criticality delta when either side was never calculated', async () => {
    // `is_critical` DEFAULTS to false, so an uncalculated side has no critical activity — and
    // comparing a real one against it reports every activity that was critical as having LEFT the
    // critical path. Alarming, confident and false.
    plans.findActivePairInOrgWithProject.mockResolvedValue([
      planRow(FROM_PLAN),
      planRow(TO_PLAN, { scheduleComputedAt: null }),
    ]);
    const result = await compare();
    expect(result.criticalPath.notAssessableReason).toBe('SIDE_NOT_SCHEDULED');
    expect(result.criticalPath.removed).toEqual([]);
  });

  it('omits every opt-in projection when none was asked for, and loads no edges', async () => {
    const result = await compare();
    expect(result.changes).toBeUndefined();
    expect(result.ghosts).toBeUndefined();
    expect(result.links).toBeUndefined();
    expect(baselines.loadActiveDependenciesForDelta).not.toHaveBeenCalled();
    expect(baselines.loadCalendarNames).not.toHaveBeenCalled();
  });

  it('loads the edges for ?include=ghosts ALONE — the defect ADR-0126 records shipping once', async () => {
    // Gating the edge loads on `changes` gave `?include=ghosts` two EMPTY edge sets and lit an
    // overlay that drew no logic at all. Nothing else can see it: the journey asks for both.
    const result = await service.crossPlanRevisionCompare(
      principalWith(READ),
      'acme',
      FROM_PLAN,
      TO_PLAN,
      'live',
      'live',
      ['ghosts'],
    );
    expect(baselines.loadActiveDependenciesForDelta).toHaveBeenCalledWith(ORG_ID, FROM_PLAN);
    expect(baselines.loadActiveDependenciesForDelta).toHaveBeenCalledWith(ORG_ID, TO_PLAN);
    expect(result.ghosts).toBeDefined();
    expect(result.links).toBeDefined();
    expect(result.changes).toBeUndefined();
  });
});
