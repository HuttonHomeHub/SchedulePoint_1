import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';
import type {
  CrossPlanDependencyRepository,
  PlanCrossEdge,
} from '../cross-plan-dependencies/cross-plan-dependency.repository';

import {
  PROGRESSED_VISUAL_MIGRATION,
  ProgressedVisualRederiveService,
  type PendingProgressedVisualPlan,
} from './progressed-visual-rederive.service';
import type { ScheduleService } from './schedule.service';

/**
 * The boot re-derivation's ORDER and its downstream propagation (#421 M2-T2.2, spec §4.4). The pending
 * query runs against a real database in `test/progressed-visual-rederive.e2e-spec.ts`; here it is
 * stubbed so the cases can say which plans are pending and which edges exist.
 */
const edge = (predecessorPlanId: string, successorPlanId: string): PlanCrossEdge => ({
  predecessorPlanId,
  successorPlanId,
});

function harness(
  pending: PendingProgressedVisualPlan[],
  edgesByOrg: Record<string, PlanCrossEdge[] | Error>,
  recalc: (organizationId: string, planId: string) => Promise<boolean> = () =>
    Promise.resolve(true),
) {
  const calls: string[] = [];
  const prisma = { $queryRaw: vi.fn().mockResolvedValue(pending) } as unknown as PrismaService;
  const schedule = {
    recalculateAsSystem: vi.fn((organizationId: string, planId: string) => {
      calls.push(`${organizationId}:${planId}`);
      return recalc(organizationId, planId);
    }),
  } as unknown as ScheduleService;
  const loadOrgAdjacency = vi.fn((organizationId: string) => {
    const edges = edgesByOrg[organizationId] ?? [];
    return edges instanceof Error ? Promise.reject(edges) : Promise.resolve(edges);
  });
  const crossPlan = { loadOrgAdjacency } as unknown as CrossPlanDependencyRepository;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new ProgressedVisualRederiveService(
    prisma,
    schedule,
    crossPlan,
    logger as unknown as PinoLogger,
  );
  return { service, calls, loadOrgAdjacency, logger };
}

describe('ProgressedVisualRederiveService', () => {
  it('names a migration that exists, so the marker is not a query that can never match', () => {
    const dir = join(
      __dirname,
      '..',
      '..',
      '..',
      'prisma',
      'migrations',
      PROGRESSED_VISUAL_MIGRATION,
    );
    expect(existsSync(join(dir, 'migration.sql'))).toBe(true);
  });

  it('does nothing, and loads no adjacency, when no plan is pending', async () => {
    const h = harness([], {});
    expect(await h.service.rederive()).toBe(0);
    expect(h.loadOrgAdjacency).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it('recalculates upstream first, not in id order', async () => {
    // x → m → b: the id order (b, m, x) is exactly backwards.
    const h = harness(
      [
        { id: 'b', organizationId: 'o1' },
        { id: 'm', organizationId: 'o1' },
        { id: 'x', organizationId: 'o1' },
      ],
      { o1: [edge('x', 'm'), edge('m', 'b')] },
    );
    expect(await h.service.rederive()).toBe(3);
    expect(h.calls).toEqual(['o1:x', 'o1:m', 'o1:b']);
  });

  it('orders organisations independently, loading each adjacency once, and logs one summary', async () => {
    const h = harness(
      [
        { id: 'b', organizationId: 'o1' },
        { id: 'z', organizationId: 'o1' },
        { id: 'c', organizationId: 'o2' },
      ],
      { o1: [edge('z', 'b')], o2: [] },
    );
    expect(await h.service.rederive()).toBe(3);
    expect(h.calls).toEqual(['o1:z', 'o1:b', 'o2:c']);
    expect(h.loadOrgAdjacency).toHaveBeenCalledTimes(2);
    expect(h.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'schedule.pv_rederived',
        pending: 3,
        recalculated: 3,
        organizations: 2,
        durationMs: expect.any(Number),
      }),
      expect.any(String),
    );
  });

  it('also recalculates a plan downstream of a recalculated one, all the way down the chain', async () => {
    // Only `a` is pending. b and c have no progress of their own, but read a's corrected dates.
    // `unrelated` shares the organisation, touches no recalculated plan and is left alone.
    const h = harness([{ id: 'a', organizationId: 'o1' }], {
      o1: [edge('a', 'b'), edge('b', 'c'), edge('u', 'unrelated')],
    });
    expect(await h.service.rederive()).toBe(3);
    expect(h.calls).toEqual(['o1:a', 'o1:b', 'o1:c']);
  });

  it('does not propagate past a plan whose recalculation failed or was declined', async () => {
    const h = harness(
      [{ id: 'a', organizationId: 'o1' }],
      { o1: [edge('a', 'b'), edge('b', 'c')] },
      (_org, planId) => (planId === 'b' ? Promise.resolve(false) : Promise.resolve(true)),
    );
    expect(await h.service.rederive()).toBe(1);
    expect(h.calls).toEqual(['o1:a', 'o1:b']);
  });

  it('recalculates a downstream plan once even when it has two recalculated upstream plans', async () => {
    const h = harness(
      [
        { id: 'a', organizationId: 'o1' },
        { id: 'b', organizationId: 'o1' },
      ],
      { o1: [edge('a', 'c'), edge('b', 'c')] },
    );
    expect(await h.service.rederive()).toBe(3);
    expect(h.calls.filter((c) => c === 'o1:c')).toHaveLength(1);
    expect(h.calls.at(-1)).toBe('o1:c');
  });

  it('logs a failing plan, skips it and its dependants, and carries on with the rest', async () => {
    const h = harness(
      [
        { id: 'a', organizationId: 'o1' },
        { id: 'd', organizationId: 'o1' },
      ],
      { o1: [edge('a', 'b')] },
      (_org, planId) =>
        planId === 'a' ? Promise.reject(new Error('horizon')) : Promise.resolve(true),
    );
    expect(await h.service.rederive()).toBe(1);
    expect(h.calls).toEqual(['o1:a', 'o1:d']);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'schedule.pv_rederive_plan_failed', planId: 'a' }),
      expect.any(String),
    );
  });

  it('skips an organisation whose graph cannot be ordered and carries on with the next', async () => {
    const h = harness(
      [
        { id: 'a', organizationId: 'o1' },
        { id: 'c', organizationId: 'o2' },
      ],
      { o1: [edge('a', 'b'), edge('b', 'a')], o2: [] },
    );
    expect(await h.service.rederive()).toBe(1);
    expect(h.calls).toEqual(['o2:c']);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'schedule.pv_rederive_org_failed',
        organizationId: 'o1',
        pending: 1,
      }),
      expect.any(String),
    );
  });

  it('skips an organisation whose adjacency load fails and carries on with the next', async () => {
    const h = harness(
      [
        { id: 'a', organizationId: 'o1' },
        { id: 'c', organizationId: 'o2' },
      ],
      { o1: new Error('connection reset'), o2: [] },
    );
    expect(await h.service.rederive()).toBe(1);
    expect(h.calls).toEqual(['o2:c']);
  });

  it('never fails the boot: a pending read that throws is logged, not thrown', async () => {
    const h = harness([], {});
    (h.service as unknown as { prisma: { $queryRaw: unknown } }).prisma.$queryRaw = vi
      .fn()
      .mockRejectedValue(new Error('db down'));
    expect(() => h.service.onApplicationBootstrap()).not.toThrow();
    await vi.waitFor(() =>
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'schedule.pv_rederive_failed' }),
        expect.any(String),
      ),
    );
  });
});
