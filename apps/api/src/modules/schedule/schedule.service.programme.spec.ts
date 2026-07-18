import type { PlanScheduleSummary } from '@repo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, LockedError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CrossPlanDependencyRepository } from '../cross-plan-dependencies/cross-plan-dependency.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanEditLockService } from '../plan-lock/plan-lock.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { ScheduleRepository } from './schedule.repository';
import { ScheduleService } from './schedule.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const CAN: Permission[] = ['schedule:calculate'];

/** A zeroed single-plan summary (the recalcs are stubbed; content is irrelevant to the orchestration). */
function summary(): PlanScheduleSummary {
  return {
    dataDate: '2026-01-01',
    projectFinish: null,
    activityCount: 0,
    criticalCount: 0,
    nearCriticalCount: 0,
    constraintViolationCount: 0,
    constraintWarningCount: 0,
    loeNoSpanCount: 0,
    resourceDriverMissingCount: 0,
    externalDrivenCount: 0,
    leveledActivityCount: 0,
    levelingWindowExceededCount: 0,
    selfOverAllocatedCount: 0,
    leveledProjectFinish: null,
  };
}

const edge = (predecessorPlanId: string, successorPlanId: string) => ({
  predecessorPlanId,
  successorPlanId,
});

describe('ScheduleService.recalculateProgramme', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let crossPlan: { loadOrgAdjacency: ReturnType<typeof vi.fn> };
  let editLock: { assertHoldsPen: ReturnType<typeof vi.fn<PlanEditLockService['assertHoldsPen']>> };
  let logger: Record<'info' | 'warn' | 'debug' | 'error', ReturnType<typeof vi.fn>>;
  let service: ScheduleService;
  /** The per-plan recalc, stubbed so we observe the closure order without touching the engine/transaction. */
  type PerPlanResult = { summary: PlanScheduleSummary; crossPlanUpstreamMissingCount: number };
  type WithRecalcPlan = {
    recalculatePlan: (p: Principal, o: string, planId: string) => Promise<PerPlanResult>;
  };
  let recalcSpy: ReturnType<typeof vi.fn<WithRecalcPlan['recalculatePlan']>>;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: 'C', organizationId: ORG_ID }) };
    crossPlan = { loadOrgAdjacency: vi.fn().mockResolvedValue([]) };
    editLock = {
      assertHoldsPen: vi.fn<PlanEditLockService['assertHoldsPen']>().mockResolvedValue(undefined),
    };
    logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
    service = new ScheduleService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      {} as unknown as ScheduleRepository,
      editLock as unknown as PlanEditLockService,
      {} as unknown as PrismaService,
      crossPlan as unknown as CrossPlanDependencyRepository,
      logger as never,
    );
    // Stub the shared single-plan recalc unit: it is exercised by its own spec; here we only assert the
    // orchestration (order, pre-flight, roll-up). Each call returns a zeroed summary + a 0 missing count.
    recalcSpy = vi.fn<WithRecalcPlan['recalculatePlan']>(() =>
      Promise.resolve({ summary: summary(), crossPlanUpstreamMissingCount: 0 }),
    );
    (service as unknown as WithRecalcPlan).recalculatePlan = recalcSpy;
  });

  it('denies a caller without schedule:calculate (403) and recalculates nothing', async () => {
    await expect(
      service.recalculateProgramme(principalWith([]), 'acme', 'C'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(recalcSpy).not.toHaveBeenCalled();
  });

  it('404s when the target plan is not in the caller’s org', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(
      service.recalculateProgramme(principalWith(CAN), 'acme', 'C'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(recalcSpy).not.toHaveBeenCalled();
  });

  it('recalculates only the target when it has no cross-plan edges (single-plan recalc)', async () => {
    crossPlan.loadOrgAdjacency.mockResolvedValue([]);
    const result = await service.recalculateProgramme(principalWith(CAN), 'acme', 'C');
    expect(recalcSpy).toHaveBeenCalledTimes(1);
    expect(recalcSpy).toHaveBeenCalledWith(expect.any(Principal), 'acme', 'C');
    expect(result.plans.map((p) => p.planId)).toEqual(['C']);
    expect(result.programme.planCount).toBe(1);
  });

  it('recalculates the upstream closure in topological order (chain A→B→C, target C)', async () => {
    crossPlan.loadOrgAdjacency.mockResolvedValue([edge('A', 'B'), edge('B', 'C')]);
    const result = await service.recalculateProgramme(principalWith(CAN), 'acme', 'C');
    // Upstream-first, target last — and the per-plan recalc was invoked in exactly that order.
    const calledOrder = recalcSpy.mock.calls.map((c) => c[2]);
    expect(calledOrder).toEqual(['A', 'B', 'C']);
    expect(result.plans.map((p) => p.planId)).toEqual(['A', 'B', 'C']);
    expect(result.programme.planCount).toBe(3);
  });

  it('rejects (422 PROGRAMME_TOO_LARGE) an over-large closure BEFORE any pen check or write', async () => {
    // A 51-edge chain P000→…→P051 → the target's upstream closure is 52 plans, above the 50-plan cap.
    const ids = Array.from({ length: 52 }, (_, i) => `P${String(i).padStart(3, '0')}`);
    const chain = ids.slice(0, -1).map((from, i) => edge(from, ids[i + 1]!));
    crossPlan.loadOrgAdjacency.mockResolvedValue(chain);
    const targetId = ids[ids.length - 1]!;
    plans.findActiveByIdInOrg.mockResolvedValue({ id: targetId, organizationId: ORG_ID });
    await expect(
      service.recalculateProgramme(principalWith(CAN), 'acme', targetId),
    ).rejects.toMatchObject({ details: { reason: 'PROGRAMME_TOO_LARGE', planCount: 52 } });
    // Rejected up-front: neither the pen pre-flight nor any per-plan recalc ran.
    expect(editLock.assertHoldsPen).not.toHaveBeenCalled();
    expect(recalcSpy).not.toHaveBeenCalled();
  });

  it('sums crossPlanUpstreamMissingCount (N32) across the closure into the roll-up', async () => {
    crossPlan.loadOrgAdjacency.mockResolvedValue([edge('A', 'C'), edge('B', 'C')]);
    // A contributes 2 missing-upstream warnings, B contributes 1, C none.
    recalcSpy.mockImplementation((_p, _o, planId) =>
      Promise.resolve({
        summary: summary(),
        crossPlanUpstreamMissingCount: planId === 'A' ? 2 : planId === 'B' ? 1 : 0,
      }),
    );
    const result = await service.recalculateProgramme(principalWith(CAN), 'acme', 'C');
    expect(result.programme.crossPlanUpstreamMissingCount).toBe(3);
  });

  it('fails fast with 423 + the blocked-plan list and writes NOTHING when a plan’s pen is held', async () => {
    crossPlan.loadOrgAdjacency.mockResolvedValue([edge('A', 'B'), edge('B', 'C')]);
    // Enforcement on: B is held by another editor — its pre-flight assert throws.
    editLock.assertHoldsPen.mockImplementation((_p, planId) => {
      if (planId === 'B') {
        return Promise.reject(
          new LockedError('Not the editor.', { reason: 'PLAN_EDIT_LOCK_REQUIRED' }),
        );
      }
      return Promise.resolve(undefined);
    });

    await expect(
      service.recalculateProgramme(principalWith(CAN), 'acme', 'C'),
    ).rejects.toMatchObject({
      code: 'LOCKED',
      details: { reason: 'PROGRAMME_PLANS_LOCKED', blockedPlanIds: ['B'] },
    });
    // Pre-flight ran across the WHOLE closure before any write; NOT a single recalc executed.
    expect(recalcSpy).not.toHaveBeenCalled();
  });

  it('collects ALL blocked plans (not just the first) before throwing', async () => {
    crossPlan.loadOrgAdjacency.mockResolvedValue([edge('A', 'C'), edge('B', 'C')]);
    // Both upstreams A and B are held; the target C is free.
    editLock.assertHoldsPen.mockImplementation((_p, planId) =>
      planId === 'C'
        ? Promise.resolve(undefined)
        : Promise.reject(new LockedError('Held.', { reason: 'PLAN_EDIT_LOCK_REQUIRED' })),
    );
    await expect(
      service.recalculateProgramme(principalWith(CAN), 'acme', 'C'),
    ).rejects.toMatchObject({
      details: { reason: 'PROGRAMME_PLANS_LOCKED', blockedPlanIds: ['A', 'B'] },
    });
    expect(recalcSpy).not.toHaveBeenCalled();
  });
});
