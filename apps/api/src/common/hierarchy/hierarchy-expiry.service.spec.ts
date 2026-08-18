import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';
import type { AuditService } from '../../modules/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';

import * as runner from './hierarchy-expiry.runner';
import { HierarchyExpiryService } from './hierarchy-expiry.service';

/**
 * **Which subtrees the sweep picks, and when it arms.** What it actually deletes is proven against
 * a real Postgres in `test/hierarchy-expiry.e2e-spec.ts` — a mocked Prisma accepts any statement,
 * so a unit test here could not tell a correct foreign-key order from a wrong one, and the wrong
 * one is the failure mode this feature has.
 */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const NOW = new Date('2026-08-18T12:00:00.000Z');
/** 91 days before NOW — past a 90-day period. */
const EXPIRED = new Date('2026-05-19T12:00:00.000Z');

type Row = Record<string, unknown>;

function build(
  options: {
    enabled?: boolean;
    clients?: Row[];
    projects?: Row[];
    plans?: Row[];
    activitiesPerPlan?: number;
  } = {},
) {
  const clients = options.clients ?? [];
  const projects = options.projects ?? [];
  const plans = options.plans ?? [];

  const config = {
    retentionHierarchyEnabled: options.enabled ?? true,
    retentionHierarchyDays: 90,
    retentionSweepIntervalMinutes: 60,
  } as AppConfigService;

  // The candidate scans are the top-level `findMany`s; the descendant lookups filter the same
  // arrays, which is what a real query would do.
  const prisma = {
    client: { findMany: vi.fn(() => Promise.resolve(clients)) },
    project: {
      findMany: vi.fn((args: { where?: { clientId?: string } }) =>
        Promise.resolve(
          args.where?.clientId === undefined
            ? projects
            : projects.filter((p) => p['clientId'] === args.where!.clientId),
        ),
      ),
    },
    plan: {
      findMany: vi.fn((args: { where?: { projectId?: unknown } }) => {
        const filter = args.where?.projectId as { in?: string[] } | string | undefined;
        if (filter === undefined) return Promise.resolve(plans);
        const ids = typeof filter === 'string' ? [filter] : (filter.in ?? []);
        return Promise.resolve(plans.filter((p) => ids.includes(p['projectId'] as string)));
      }),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as PrismaService;

  const record = vi.fn((_event: unknown, _tx?: unknown) => Promise.resolve());
  const service = new HierarchyExpiryService(
    prisma,
    config,
    { record } as unknown as AuditService,
    logger as never,
  );
  return { service, prisma, record };
}

function client(id: string, over: Row = {}): Row {
  return {
    id,
    name: `client ${id}`,
    organizationId: 'org-1',
    deletedAt: EXPIRED,
    deleteBatchId: `batch-${id}`,
    ...over,
  };
}
function project(id: string, clientId: string, over: Row = {}): Row {
  return { ...client(id, over), clientId };
}
function plan(id: string, projectId: string, over: Row = {}): Row {
  return { ...client(id, over), projectId };
}

let deleteScope: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  logger.info.mockReset();
  logger.warn.mockReset();
  logger.error.mockReset();
  deleteScope = vi
    .spyOn(runner, 'deleteExpiredScope')
    .mockResolvedValue({ clients: 1, projects: 1, plans: 1, activities: 10 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('arming', () => {
  it('starts no timer at all when the expiry is disabled', () => {
    const { service, prisma } = build({ enabled: false, clients: [client('c1')] });
    service.onApplicationBootstrap();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    // The M3 state, and the one an operator must be able to confirm from a log alone.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hierarchy_expiry.disabled' }),
      expect.any(String),
    );
  });

  it('warns rather than informs on the tick that arms permanent deletion', () => {
    const { service } = build();
    service.onApplicationBootstrap();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hierarchy_expiry.armed', retentionDays: 90 }),
      expect.stringContaining('ARMED'),
    );
    service.onApplicationShutdown();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('which subtrees expire', () => {
  it('takes a plan deleted on its own, with no deleted client above it', async () => {
    // A client-only scan leaves this in the bin forever while the countdown says otherwise — a
    // screen that lies rather than a sweep that misses.
    const { service } = build({ plans: [plan('p1', 'proj-1')] });
    await service.sweepNow(NOW);
    expect(deleteScope).toHaveBeenCalledTimes(1);
    expect(deleteScope.mock.calls[0]![1]).toEqual({
      clientIds: [],
      projectIds: [],
      planIds: ['p1'],
    });
  });

  it('does not expire a descendant twice when its ancestor is expiring too', async () => {
    const { service } = build({
      clients: [client('c1')],
      projects: [project('proj-1', 'c1')],
      plans: [plan('p1', 'proj-1')],
    });
    await service.sweepNow(NOW);
    expect(deleteScope).toHaveBeenCalledTimes(1);
    expect(deleteScope.mock.calls[0]![1]).toEqual({
      clientIds: ['c1'],
      projectIds: ['proj-1'],
      planIds: ['p1'],
    });
  });

  it('expires a project whose client is still live, and its plans with it', async () => {
    const { service } = build({
      projects: [project('proj-1', 'c-live')],
      plans: [plan('p1', 'proj-1'), plan('p2', 'proj-1')],
    });
    await service.sweepNow(NOW);
    expect(deleteScope).toHaveBeenCalledTimes(1);
    expect(deleteScope.mock.calls[0]![1]).toEqual({
      clientIds: [],
      projectIds: ['proj-1'],
      planIds: ['p1', 'p2'],
    });
  });

  it('records the deletion inside the transaction, with flattened counts', async () => {
    const { service, record } = build({ plans: [plan('p1', 'proj-1')] });
    await service.sweepNow(NOW);
    expect(record).toHaveBeenCalledTimes(1);
    const [event, tx] = record.mock.calls[0]!;
    expect(tx, 'the tx must be passed, or the row can outlive its subject').toBeDefined();
    expect(event).toMatchObject({
      action: 'hierarchy.expired',
      actorType: 'SYSTEM',
      subjectType: 'plan',
      subjectId: 'p1',
      after: expect.objectContaining({ activityCount: 10, retentionDays: 90 }),
    });
  });
});

describe('the budget and the failure path', () => {
  it('stops once the activity budget is spent, leaving the rest for the next tick', async () => {
    deleteScope.mockResolvedValue({ clients: 1, projects: 0, plans: 1, activities: 20_000 });
    const { service } = build({ clients: [client('c1'), client('c2'), client('c3')] });
    await service.sweepNow(NOW);
    expect(deleteScope).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['P2003', 'a wrong delete order'],
    ['P2035', 'a statement over the bind-parameter ceiling'],
  ])('escalates %s rather than absorbing it as sweep noise', async (code) => {
    // Both are DETERMINISTIC: the batch rolls back and is retried hourly forever, and the generic
    // message says the next tick will retry it — true, and useless, because it never will. P2035
    // is unreachable now that the runner chunks, and is caught anyway: a silent permanent stall is
    // the failure this class is dangerous for.
    deleteScope.mockRejectedValue(Object.assign(new Error('boom'), { code }));
    const { service } = build({ clients: [client('c1'), client('c2')] });
    await service.sweepNow(NOW);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hierarchy_expiry.permanent_failure', code }),
      expect.stringContaining('NEVER expire'),
    );
    // …and the next batch is still attempted: one bad subtree must not stall the queue.
    expect(deleteScope).toHaveBeenCalledTimes(2);
  });

  it('never lets two sweeps overlap', async () => {
    // `RetentionSweepService` carries this guard deliberately and this service did not. Two
    // concurrent runs contend on the same rows, and the loser writes a second `hierarchy.expired`
    // row with all-zero counts — a permanent, misleading record in the one table that refuses
    // DELETE.
    let release!: () => void;
    deleteScope.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ clients: 1, projects: 0, plans: 0, activities: 1 });
        }),
    );
    const { service } = build({ clients: [client('c1')] });
    const first = service.sweepNow(NOW);
    // Let the first run reach its candidate scans before the overlapping tick arrives — otherwise
    // this asserts the guard against a run that has not started, which passes for the wrong reason.
    await Promise.resolve();
    await Promise.resolve();
    await service.sweepNow(NOW); // the overlapping tick
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hierarchy_expiry.overlapped' }),
      expect.any(String),
    );
    release();
    await first;
    // ONCE across both calls: the second tick did no work at all, rather than doing it later.
    expect(deleteScope).toHaveBeenCalledTimes(1);
  });

  it('stops once the scope budget is spent, however small each deletion is', async () => {
    // The mirror of the activity budget, and the shape a real backlog has: hundreds of ordinary
    // deletions carrying no activities at all, which the activity budget never bounds.
    deleteScope.mockResolvedValue({ clients: 0, projects: 0, plans: 1, activities: 0 });
    const plans = Array.from({ length: 2_100 }, (_, i) => plan(`p${i}`, `proj-${i}`));
    const { service } = build({ plans });
    await service.sweepNow(NOW);
    expect(deleteScope).toHaveBeenCalledTimes(2_000);
  });
});
