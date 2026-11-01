import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDissolveSummaryInSwimlanes } from './use-dissolve-summary';

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
const summary = (id: string, parentId: string | null = null): ActivitySummary =>
  anActivity({ id, name: id, type: 'WBS_SUMMARY', parentId, version: 1 });
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

// S is a level-1 group holding c1 (days 0-3). t2 sits at the top level (days 0-3). Dissolving S
// promotes c1 to the top level, "No WBS group", where it shares days 0-3 with t2.
const S = summary('S');
const T2 = { ...task('t2', 'x', 0, 3), parentId: null };
const C1 = { ...task('c1', 'S', 0, 3), swimlaneLanes: [stored('S', 0)] };
const PLAN = [S, T2, C1];

const DISSOLVE = '/organizations/acme/activities/S/dissolve';
const POSITIONS = '/organizations/acme/plans/p1/activities/positions';
const RESULT = { promoted: [{ id: 'c1', parentId: null, version: 5 }], deleteBatchId: 'b1' };

function mount(rows: ActivitySummary[] = PLAN) {
  const qc = new QueryClient();
  qc.setQueryData(activityKeys.listByPlan('acme', 'p1'), rows);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useDissolveSummaryInSwimlanes('acme', 'p1'), { wrapper });
}

const paths = (): string[] => vi.mocked(apiFetch).mock.calls.map(([path]) => String(path));

describe('useDissolveSummaryInSwimlanes', () => {
  beforeEach(() => {
    h.plan = { swimlaneSource: 'WBS', swimlaneWbsLevel: 1, plannedStart: '2026-01-01' };
    vi.mocked(apiFetch)
      .mockReset()
      .mockImplementation((path) => Promise.resolve(String(path) === DISSOLVE ? RESULT : []));
  });

  it('stores the promoted child’s lane in its new group, planned without the dissolved summary', async () => {
    const { result } = mount();

    await act(() => result.current.mutateAsync('S'));

    expect(paths()).toEqual([DISSOLVE, POSITIONS]);
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[1]?.[1]?.body as string) as {
      positions: unknown[];
    };
    // The lane is written at the version the dissolve returned, not the one the cache held (4), and
    // the dissolved summary itself is never a position.
    const rows = body.positions as {
      id: string;
      version: number;
      swimlane: { laneIndex: number };
    }[];
    expect(rows.find((r) => r.id === 'c1')).toEqual({
      id: 'c1',
      version: 5,
      swimlane: { laneIndex: 0 },
    });
    expect(rows.map((r) => r.id)).not.toContain('S');
  });

  it('writes the lane through mutate too, and reports the result to the caller', async () => {
    const { result } = mount();
    const onSuccess = vi.fn();

    await act(async () => {
      result.current.mutate({ activityId: 'S', version: 1 }, { onSuccess });
      await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith(RESULT));
    });

    expect(paths()).toEqual([DISSOLVE, POSITIONS]);
  });

  it('reports success before writing the lane, and still reports it when the lane write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(apiFetch).mockImplementation((path) =>
      String(path) === DISSOLVE ? Promise.resolve(RESULT) : Promise.reject(new Error('boom')),
    );
    const { result } = mount();
    const onSuccess = vi.fn(() => {
      expect(paths()).toEqual([DISSOLVE]);
    });

    await act(async () => {
      result.current.mutate('S', { onSuccess });
      await vi.waitFor(() => expect(error).toHaveBeenCalled());
    });

    expect(onSuccess).toHaveBeenCalledWith(RESULT);
    expect(paths()).toEqual([DISSOLVE, POSITIONS]);
    error.mockRestore();
  });

  it('logs, rather than rejecting, when a caller’s callback throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = mount();

    await act(async () => {
      result.current.mutate('S', {
        onSuccess: () => {
          throw new Error('caller');
        },
      });
      await vi.waitFor(() => expect(paths()).toEqual([DISSOLVE, POSITIONS]));
    });

    expect(error).toHaveBeenCalledWith('A dissolve success callback threw', expect.any(Error));
    error.mockRestore();
  });

  it('is exactly the bare write when the plan’s swimlanes are not from the WBS', async () => {
    h.plan = { swimlaneSource: 'MANUAL', swimlaneWbsLevel: null, plannedStart: '2026-01-01' };
    const { result } = mount();

    await act(() => result.current.mutateAsync('S'));

    expect(paths()).toEqual([DISSOLVE]);
  });

  it('hands the failure to the caller and writes no lane when the dissolve is refused', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('stale'));
    const { result } = mount();
    const onError = vi.fn();

    await act(async () => {
      result.current.mutate('S', { onError });
      await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    });

    expect(paths()).toEqual([DISSOLVE]);
  });
});
