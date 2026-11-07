import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';
import type {
  CrossPlanDependencyRepository,
  PlanCrossEdge,
} from '../cross-plan-dependencies/cross-plan-dependency.repository';

import {
  CROSS_PLAN_INSTANTS_MIGRATION,
  CrossPlanInstantRederiveService,
  type PendingCrossPlanInstantPlan,
} from './cross-plan-instant-rederive.service';
import type { ScheduleService } from './schedule.service';

/**
 * The boot re-derivation's ORDER (#385 M3-T1, spec D8). The pending query itself runs against a real
 * database in `test/cross-plan-rederive.e2e-spec.ts`; here it is stubbed so the cases can say exactly
 * which plans are pending and which edges exist, and assert the sequence of recalculations.
 */
const edge = (predecessorPlanId: string, successorPlanId: string): PlanCrossEdge => ({
  predecessorPlanId,
  successorPlanId,
});

interface Harness {
  service: CrossPlanInstantRederiveService;
  /** `organizationId:planId` in the order `recalculateAsSystem` was called. */
  calls: string[];
  loadOrgAdjacency: ReturnType<typeof vi.fn>;
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
}

/** Plan ids whose per-plan re-check answers "no longer pending" (a peer recalculated them). */
const NO_LONGER_PENDING = new Set<string>();

function harness(
  pending: PendingCrossPlanInstantPlan[],
  edgesByOrg: Record<string, PlanCrossEdge[] | Error>,
  recalc: (organizationId: string, planId: string) => Promise<boolean> = () =>
    Promise.resolve(true),
): Harness {
  const calls: string[] = [];
  // The list read has an ORDER BY; the per-plan re-check is the one keyed on a single id.
  const prisma = {
    $queryRaw: vi.fn((strings: string[], ...values: unknown[]) =>
      strings.join('?').includes('ORDER BY')
        ? Promise.resolve(pending)
        : Promise.resolve(NO_LONGER_PENDING.has(String(values[0])) ? [] : [{ '?column?': 1 }]),
    ),
  } as unknown as PrismaService;
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
  const service = new CrossPlanInstantRederiveService(
    prisma,
    schedule,
    crossPlan,
    logger as unknown as PinoLogger,
  );
  return { service, calls, loadOrgAdjacency, logger };
}

describe('CrossPlanInstantRederiveService', () => {
  it('names a migration that exists, so the marker is not a query that can never match', () => {
    const dir = join(
      __dirname,
      '..',
      '..',
      '..',
      'prisma',
      'migrations',
      CROSS_PLAN_INSTANTS_MIGRATION,
    );
    expect(existsSync(join(dir, 'migration.sql'))).toBe(true);
  });

  it('names a marker migration that holds no statement: its row is its only product', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'prisma',
        'migrations',
        CROSS_PLAN_INSTANTS_MIGRATION,
        'migration.sql',
      ),
      'utf8',
    );
    const statements = sql
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('--'));
    expect(statements).toEqual([]);
  });

  it('keys the pending read on a scalar-subquery marker and states every soft-delete filter', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new CrossPlanInstantRederiveService(
      prisma as unknown as PrismaService,
      {} as ScheduleService,
      {} as CrossPlanDependencyRepository,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger,
    );
    await service.pendingPlans();
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join('?');
    expect(values).toEqual([CROSS_PLAN_INSTANTS_MIGRATION]);
    expect(sql).toContain('p."schedule_computed_at" < (');
    expect(sql).toContain('m."rolled_back_at" IS NULL');
    expect(sql).toContain('p."planned_start" IS NOT NULL');
    // The plan and BOTH link directions each state their own filter (ADR-0172).
    expect(sql.match(/"deleted_at" IS NULL/g)).toHaveLength(3);
    expect(sql).toContain('d."predecessor_plan_id" = p."id"');
    expect(sql).toContain('d."successor_plan_id" = p."id"');
  });

  it('does nothing, and loads no adjacency, when no plan is pending', async () => {
    const h = harness([], {});
    expect(await h.service.rederive()).toBe(0);
    expect(h.loadOrgAdjacency).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it('recalculates within an organisation upstream first, not in id order', async () => {
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

  it('orders two organisations independently, loading each adjacency once', async () => {
    const h = harness(
      [
        { id: 'b', organizationId: 'o1' },
        { id: 'z', organizationId: 'o1' },
        { id: 'c', organizationId: 'o2' },
        { id: 'y', organizationId: 'o2' },
      ],
      { o1: [edge('z', 'b')], o2: [edge('y', 'c')] },
    );
    expect(await h.service.rederive()).toBe(4);
    expect(h.calls).toEqual(['o1:z', 'o1:b', 'o2:y', 'o2:c']);
    expect(h.loadOrgAdjacency).toHaveBeenCalledTimes(2);
    expect(h.loadOrgAdjacency).toHaveBeenCalledWith('o1');
    expect(h.loadOrgAdjacency).toHaveBeenCalledWith('o2');
    expect(h.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'schedule.xplan_instants_rederived',
        pending: 4,
        recalculated: 4,
        organizations: 2,
      }),
      expect.any(String),
    );
  });

  it('orders the WHOLE graph: A → B → C with B not pending and C sorting first recalculates A before C, and not B', async () => {
    // The id `a-c…` sorts before `z-a…`, so C would come first if only the pending set were ordered:
    // with B absent from the node set, A and C are both roots and fall to the id tie-break.
    const A = 'z-a';
    const B = 'm-b';
    const C = 'a-c';
    const h = harness(
      [
        { id: C, organizationId: 'o1' },
        { id: A, organizationId: 'o1' },
      ],
      { o1: [edge(A, B), edge(B, C)] },
    );
    expect(await h.service.rederive()).toBe(2);
    expect(h.calls).toEqual([`o1:${A}`, `o1:${C}`]);
  });

  it('skips a plan a peer recalculated since the list was read, and does not count it', async () => {
    NO_LONGER_PENDING.add('m');
    try {
      const h = harness(
        [
          { id: 'x', organizationId: 'o1' },
          { id: 'm', organizationId: 'o1' },
        ],
        { o1: [edge('x', 'm')] },
      );
      expect(await h.service.rederive()).toBe(1);
      expect(h.calls).toEqual(['o1:x']);
    } finally {
      NO_LONGER_PENDING.delete('m');
    }
  });

  it('keeps going after one plan fails, logs it, and does not count it', async () => {
    const h = harness(
      [
        { id: 'a', organizationId: 'o1' },
        { id: 'b', organizationId: 'o1' },
        { id: 'c', organizationId: 'o1' },
      ],
      { o1: [edge('a', 'b'), edge('b', 'c')] },
      (_org, planId) =>
        planId === 'b' ? Promise.reject(new Error('horizon')) : Promise.resolve(true),
    );
    expect(await h.service.rederive()).toBe(2);
    expect(h.calls).toEqual(['o1:a', 'o1:b', 'o1:c']);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'schedule.xplan_instants_rederive_plan_failed',
        planId: 'b',
      }),
      expect.any(String),
    );
  });

  it('does not count a plan the recalculation declined (deleted or lost its data date since)', async () => {
    const h = harness(
      [
        { id: 'a', organizationId: 'o1' },
        { id: 'b', organizationId: 'o1' },
      ],
      { o1: [edge('a', 'b')] },
      (_org, planId) => Promise.resolve(planId !== 'a'),
    );
    expect(await h.service.rederive()).toBe(1);
    expect(h.calls).toEqual(['o1:a', 'o1:b']);
  });

  it('skips a whole organisation whose graph cannot be ordered and carries on with the next', async () => {
    const h = harness(
      [
        { id: 'a', organizationId: 'o1' },
        { id: 'b', organizationId: 'o1' },
        { id: 'c', organizationId: 'o2' },
      ],
      // A residual cycle (unreachable under ADR-0045 §3) makes the order unknowable.
      { o1: [edge('a', 'b'), edge('b', 'a')], o2: [edge('d', 'c')] },
    );
    expect(await h.service.rederive()).toBe(1);
    expect(h.calls).toEqual(['o2:c']);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'schedule.xplan_instants_rederive_org_failed',
        organizationId: 'o1',
        pending: 2,
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
      { o1: new Error('connection reset'), o2: [edge('c', 'd')] },
    );
    expect(await h.service.rederive()).toBe(1);
    expect(h.calls).toEqual(['o2:c']);
  });
});
