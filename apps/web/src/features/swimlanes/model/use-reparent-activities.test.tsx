import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReparentActivities } from './use-reparent-activities';

import { apiFetch } from '@/lib/api/client';
import { activityKeys } from '@/lib/query/hierarchy-keys';
import { anActivity } from '@/test/activity-fixture';

const h = vi.hoisted(() => {
  const plan: { swimlaneSource: string; swimlaneWbsLevel: number | null; plannedStart: string } = {
    swimlaneSource: 'WBS',
    swimlaneWbsLevel: 1,
    plannedStart: '2026-01-01',
  };
  return { plan };
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

const PLAN = [
  summary('G1'),
  summary('G2'),
  { ...task('t1', 'G1', 0, 3), swimlaneLanes: [stored('G1', 0)] },
  { ...task('t2', 'G2', 0, 3), swimlaneLanes: [stored('G2', 0)] },
];
const PARENTS = '/organizations/acme/plans/p1/activities/parents';
const POSITIONS = '/organizations/acme/plans/p1/activities/positions';

function mount(qc: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useReparentActivities('acme', 'p1'), { wrapper });
}

const calls = (): { path: string; body: unknown }[] =>
  vi.mocked(apiFetch).mock.calls.map(([path, init]) => ({
    path: String(path),
    body: JSON.parse(init?.body as string) as unknown,
  }));

describe('useReparentActivities', () => {
  beforeEach(() => {
    h.plan = { swimlaneSource: 'WBS', swimlaneWbsLevel: 1, plannedStart: '2026-01-01' };
    vi.mocked(apiFetch)
      .mockReset()
      .mockImplementation((path) =>
        Promise.resolve(String(path) === PARENTS ? [{ ...PLAN[2]!, version: 5 }] : []),
      );
  });

  it('writes the parent, then the mover’s lane in its new group at the version the parent write returned', async () => {
    const qc = new QueryClient();
    qc.setQueryData(activityKeys.listByPlan('acme', 'p1'), PLAN);
    const { result } = mount(qc);

    await act(() =>
      result.current.mutateAsync({ parents: [{ id: 't1', parentId: 'G2', version: 4 }] }),
    );

    const [parents, lanes] = calls();
    expect(parents?.path).toBe(PARENTS);
    expect(lanes?.path).toBe(POSITIONS);
    const rows = (lanes?.body as { positions: { id: string }[] }).positions;
    // t1 shares days 0-3 with t2 in G2, so it takes the next lane; no row names a swimlane.
    expect(rows.find((r) => r.id === 't1')).toEqual({
      id: 't1',
      version: 5,
      swimlane: { laneIndex: 1 },
    });
  });

  it('is exactly the bare write when the plan’s swimlanes are not from the WBS', async () => {
    h.plan = { swimlaneSource: 'MANUAL', swimlaneWbsLevel: null, plannedStart: '2026-01-01' };
    const qc = new QueryClient();
    qc.setQueryData(activityKeys.listByPlan('acme', 'p1'), PLAN);
    const { result } = mount(qc);

    await act(() =>
      result.current.mutateAsync({ parents: [{ id: 't1', parentId: 'G2', version: 4 }] }),
    );

    expect(calls().map((c) => c.path)).toEqual([PARENTS]);
  });

  it('does not reject when the lanes fail: the parents have committed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(apiFetch).mockImplementation((path) =>
      String(path) === PARENTS
        ? Promise.resolve([{ ...PLAN[2]!, version: 5 }])
        : Promise.reject(new Error('boom')),
    );
    const qc = new QueryClient();
    qc.setQueryData(activityKeys.listByPlan('acme', 'p1'), PLAN);
    const { result } = mount(qc);

    const saved = await act(() =>
      result.current.mutateAsync({ parents: [{ id: 't1', parentId: 'G2', version: 4 }] }),
    );

    expect(saved).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
