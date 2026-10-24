import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReparentActivities } from './use-reparent-activities';

import type * as ReparentLanes from '@/features/tsld/model/reparent-lanes';
import { apiFetch } from '@/lib/api/client';
import { activityKeys } from '@/lib/query/hierarchy-keys';
import { anActivity } from '@/test/activity-fixture';

const h = vi.hoisted(() => {
  const plan: { swimlaneSource: string; swimlaneWbsLevel: number | null; plannedStart: string } = {
    swimlaneSource: 'WBS',
    swimlaneWbsLevel: 1,
    plannedStart: '2026-01-01',
  };
  return { plan, override: null as null | (() => unknown[]) };
});

vi.mock('@/features/tsld/model/reparent-lanes', async (importOriginal) => {
  const actual = await importOriginal<typeof ReparentLanes>();
  return {
    planReparentLanes: (...args: Parameters<typeof actual.planReparentLanes>) =>
      h.override ? h.override() : actual.planReparentLanes(...args),
  };
});

vi.mock('@/features/plans', () => ({ usePlan: () => ({ data: h.plan }) }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
}));

const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;
const summary = (id: string): ActivitySummary =>
  anActivity({ id, name: id, type: 'WBS_SUMMARY', parentId: null, version: 1 });
const task = (id: string, parentId: string, start: number, end: number): ActivitySummary =>
  anActivity({
    id,
    name: id,
    parentId,
    version: 4,
    visualEffectiveStart: iso(start),
    visualEffectiveFinish: iso(end),
  });

const stored = (summaryActivityId: string, laneIndex: number) => ({
  basis: 'WBS_SUMMARY' as const,
  swimlaneId: null,
  summaryActivityId,
  wbsLevel: null,
  laneIndex,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const G1 = summary('G1');
const G2 = summary('G2');
const T1 = { ...task('t1', 'G1', 0, 3), swimlaneLanes: [stored('G1', 0)] };
const T2 = { ...task('t2', 'G2', 0, 3), swimlaneLanes: [stored('G2', 0)] };
const PLAN = [G1, G2, T1, T2];
const PARENTS = '/organizations/acme/plans/p1/activities/parents';
const POSITIONS = '/organizations/acme/plans/p1/activities/positions';
const MOVE_T1 = { parents: [{ id: 't1', parentId: 'G2', version: 4 }] };

function mount(qc: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useReparentActivities('acme', 'p1'), { wrapper });
}

function seeded(rows: ActivitySummary[] = PLAN): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(activityKeys.listByPlan('acme', 'p1'), rows);
  return qc;
}

const calls = (): { path: string; body: unknown }[] =>
  vi.mocked(apiFetch).mock.calls.map(([path, init]) => ({
    path: String(path),
    body: JSON.parse(init?.body as string) as unknown,
  }));

const rowsOf = (call: { body: unknown } | undefined): { id: string; version: number }[] =>
  (call?.body as { positions: { id: string; version: number }[] }).positions;

describe('useReparentActivities', () => {
  beforeEach(() => {
    h.plan = { swimlaneSource: 'WBS', swimlaneWbsLevel: 1, plannedStart: '2026-01-01' };
    h.override = null;
    vi.mocked(apiFetch)
      .mockReset()
      .mockImplementation((path) =>
        Promise.resolve(String(path) === PARENTS ? [{ ...T1, version: 5 }] : []),
      );
  });

  it('writes the parent, then the mover’s lane in its new group at the version the parent write returned', async () => {
    const { result } = mount(seeded());

    await act(() => result.current.mutateAsync(MOVE_T1));

    const [parents, lanes] = calls();
    expect(parents?.path).toBe(PARENTS);
    expect(lanes?.path).toBe(POSITIONS);
    // t1 shares days 0-3 with t2 in G2, so it takes the next lane; no row names a swimlane.
    expect(rowsOf(lanes).find((r) => r.id === 't1')).toEqual({
      id: 't1',
      version: 5,
      swimlane: { laneIndex: 1 },
    });
  });

  it('is exactly the bare write when the plan’s swimlanes are not from the WBS', async () => {
    h.plan = { swimlaneSource: 'MANUAL', swimlaneWbsLevel: null, plannedStart: '2026-01-01' };
    const { result } = mount(seeded());

    await act(() => result.current.mutateAsync(MOVE_T1));

    expect(calls().map((c) => c.path)).toEqual([PARENTS]);
  });

  it('with a cold cache returns just the parents write', async () => {
    const { result } = mount(new QueryClient());

    const saved = await act(() => result.current.mutateAsync(MOVE_T1));

    expect(calls().map((c) => c.path)).toEqual([PARENTS]);
    expect(saved).toHaveLength(1);
  });

  it('sends no lane call when the move stays inside its group', async () => {
    const { result } = mount(seeded());

    await act(() =>
      result.current.mutateAsync({ parents: [{ id: 't1', parentId: 'G1', version: 4 }] }),
    );

    expect(calls().map((c) => c.path)).toEqual([PARENTS]);
  });

  it('stores a lane for a move to the top level, where the mover is in "No WBS group"', async () => {
    const { result } = mount(seeded());

    await act(() =>
      result.current.mutateAsync({ parents: [{ id: 't1', parentId: null, version: 4 }] }),
    );

    expect(calls()[1]?.path).toBe(POSITIONS);
    expect(rowsOf(calls()[1]).map((r) => r.id)).toContain('t1');
  });

  it('carries a summary’s descendants, at the versions the cache holds for them', async () => {
    const S = {
      ...summary('S'),
      parentId: 'G1',
      visualEffectiveStart: iso(0),
      visualEffectiveFinish: iso(3),
    };
    const child = { ...task('c1', 'S', 0, 3), version: 9 };
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(String(path) === PARENTS ? [{ ...S, version: 2 }] : []),
    );
    const { result } = mount(seeded([G1, G2, S, child, T2]));

    await act(() =>
      result.current.mutateAsync({ parents: [{ id: 'S', parentId: 'G2', version: 1 }] }),
    );

    const rows = rowsOf(calls()[1]);
    // The child was not in the parents response, so its version is the cached one.
    expect(rows.find((r) => r.id === 'c1')?.version).toBe(9);
    expect(rows.find((r) => r.id === 'S')?.version).toBe(2);
  });

  it('does not reject when the lanes fail: the parents have committed, and the planner is told', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(apiFetch).mockImplementation((path) =>
      String(path) === PARENTS
        ? Promise.resolve([{ ...T1, version: 5 }])
        : Promise.reject(new Error('boom')),
    );
    const { result } = mount(seeded());

    const saved = await act(() => result.current.mutateAsync(MOVE_T1));

    expect(calls()[0]?.path).toBe(PARENTS);
    expect(saved).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('logs with context and skips the lane write when a mover has no version', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A plan that names a bar neither the parents response nor the cache holds: no version exists.
    h.override = () => [{ id: 'ghost', lane: 0, materialised: true }];
    vi.mocked(apiFetch).mockResolvedValue([]);
    const { result } = mount(seeded());

    await act(() => result.current.mutateAsync(MOVE_T1));

    expect(calls().map((c) => c.path)).toEqual([PARENTS]);
    expect(error).toHaveBeenCalledWith(
      'Could not save where the moved activities sit in their swimlanes',
      expect.objectContaining({ message: expect.stringContaining('ghost') }),
    );
    error.mockRestore();
    h.override = null;
  });
});
