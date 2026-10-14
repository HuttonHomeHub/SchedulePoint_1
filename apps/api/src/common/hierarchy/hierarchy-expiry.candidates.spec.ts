import { describe, expect, it, vi } from 'vitest';

import {
  resolveExpiryScope,
  selectExpiryCandidates,
  type ExpiryReader,
} from './hierarchy-expiry.candidates';

/**
 * The selector's ordering and skip rules. Whether it agrees with what the sweep then deletes is
 * proven on a real database in `test/hierarchy-expiry.e2e-spec.ts`; the sweep's own use of it is
 * covered by `hierarchy-expiry.service.spec.ts`.
 */
const CUTOFF = new Date('2026-05-20T12:00:00.000Z');
const OLD = new Date('2026-05-01T00:00:00.000Z');

type Row = Record<string, unknown>;

function row(id: string, extra: Row = {}): Row {
  return {
    id,
    name: `name ${id}`,
    organizationId: 'org-1',
    deletedAt: OLD,
    deleteBatchId: `batch-${id}`,
    ...extra,
  };
}

function reader(data: { clients?: Row[]; projects?: Row[]; plans?: Row[] }) {
  const page = (rows: Row[]) =>
    vi.fn((args: { take?: number; cursor?: { id: string }; skip?: number }) => {
      const start = args.cursor ? rows.findIndex((r) => r['id'] === args.cursor!.id) + 1 : 0;
      return Promise.resolve(rows.slice(start, start + (args.take ?? rows.length)));
    });
  const client = { findMany: page(data.clients ?? []) };
  const project = { findMany: page(data.projects ?? []) };
  const plan = { findMany: page(data.plans ?? []) };
  return { client, project, plan } as unknown as ExpiryReader & {
    client: { findMany: ReturnType<typeof vi.fn> };
    project: { findMany: ReturnType<typeof vi.fn> };
    plan: { findMany: ReturnType<typeof vi.fn> };
  };
}

describe('selectExpiryCandidates', () => {
  it('returns clients, then projects, then plans', async () => {
    const roots = await selectExpiryCandidates(
      reader({
        clients: [row('c1')],
        projects: [row('pr1', { clientId: 'c-live' })],
        plans: [row('pl1', { projectId: 'pr-live' })],
      }),
      { cutoff: CUTOFF },
    );
    expect(roots.map((r) => `${r.kind}:${r.id}`)).toEqual(['client:c1', 'project:pr1', 'plan:pl1']);
  });

  it('leaves out a project whose client is expiring and a plan whose project is', async () => {
    const roots = await selectExpiryCandidates(
      reader({
        clients: [row('c1')],
        projects: [row('pr1', { clientId: 'c1' }), row('pr2', { clientId: 'c-live' })],
        plans: [
          row('pl1', { projectId: 'pr1' }),
          row('pl2', { projectId: 'pr2' }),
          row('pl3', { projectId: 'pr-live' }),
        ],
      }),
      { cutoff: CUTOFF },
    );
    // pl1 sits under pr1, which is itself expiring (and itself left out, under c1): c1's pass takes
    // the whole chain, so neither appears again.
    expect(roots.map((r) => r.id)).toEqual(['c1', 'pr2', 'pl3']);
  });

  it('asks for rows strictly older than the cutoff, oldest first, with the limit it was given', async () => {
    const r = reader({});
    await selectExpiryCandidates(r, { cutoff: CUTOFF, limit: 5 });
    expect(r.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: { lt: CUTOFF } },
        orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
    );
  });

  it('pages through everything when no limit is given', async () => {
    const plans = Array.from({ length: 2_300 }, (_, i) => row(`pl${i}`, { projectId: `x${i}` }));
    const roots = await selectExpiryCandidates(reader({ plans }), { cutoff: CUTOFF });
    expect(roots).toHaveLength(2_300);
    expect(new Set(roots.map((r) => r.id)).size).toBe(2_300);
  });

  it('stops at the limit when one is given', async () => {
    const plans = Array.from({ length: 30 }, (_, i) => row(`pl${i}`, { projectId: `x${i}` }));
    const roots = await selectExpiryCandidates(reader({ plans }), { cutoff: CUTOFF, limit: 10 });
    expect(roots).toHaveLength(10);
  });
});

describe('resolveExpiryScope', () => {
  it('owns just itself for a plan, with no lookup', async () => {
    const r = reader({});
    expect(await resolveExpiryScope(r, { kind: 'plan', id: 'pl1' })).toEqual({
      clientIds: [],
      projectIds: [],
      planIds: ['pl1'],
    });
    expect(r.plan.findMany).not.toHaveBeenCalled();
  });

  it('takes the active plans under a project too', async () => {
    const r = reader({
      plans: [row('pl1', { projectId: 'pr1' }), row('pl2', { projectId: 'pr2' })],
    });
    r.plan.findMany.mockResolvedValueOnce([{ id: 'pl1' }]);
    expect(await resolveExpiryScope(r, { kind: 'project', id: 'pr1' })).toEqual({
      clientIds: [],
      projectIds: ['pr1'],
      planIds: ['pl1'],
    });
  });

  it('skips the plan lookup for a client with no projects', async () => {
    const r = reader({});
    expect(await resolveExpiryScope(r, { kind: 'client', id: 'c1' })).toEqual({
      clientIds: ['c1'],
      projectIds: [],
      planIds: [],
    });
    expect(r.plan.findMany).not.toHaveBeenCalled();
  });
});
