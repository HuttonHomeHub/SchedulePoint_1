import type { ActivitySummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSwimlaneAssignment } from './use-swimlane-assignment';

import { anActivity } from '@/test/activity-fixture';

const h = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchAllPages: () => Promise.resolve(h.list),
}));

const swimlane = (id: string, name: string, position: number): SwimlaneSummary => ({
  id,
  planId: 'p1',
  name,
  position,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;
const bar = (id: string, start: number, end: number, swimlaneId: string | null) =>
  anActivity({
    id,
    name: `Task ${id}`,
    laneIndex: 0,
    swimlaneId,
    visualEffectiveStart: iso(start),
    visualEffectiveFinish: iso(end),
  });

const ACTIVITIES: ActivitySummary[] = [
  bar('a', 0, 3, 'S1'),
  bar('b', 0, 3, null),
  bar('c', 5, 8, null),
];

function render(
  over: Partial<{
    source: SwimlaneSource;
    offered: boolean;
    dataDate: string | null;
    moveMany: ReturnType<typeof vi.fn> | undefined;
  }> = {},
) {
  const moveMany =
    'moveMany' in over
      ? over.moveMany
      : vi.fn().mockResolvedValue({ applied: true, conflict: null });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const hook = renderHook(
    () =>
      useSwimlaneAssignment({
        orgSlug: 'acme',
        planId: 'p1',
        source: over.source ?? 'MANUAL',
        offered: over.offered ?? true,
        activities: ACTIVITIES,
        barDateSource: 'visual',
        dataDate: over.dataDate === undefined ? '2026-01-01' : over.dataDate,
        wbsBandOn: false,
        moveMany: moveMany as never,
      }),
    { wrapper },
  );
  return { ...hook, moveMany };
}

describe('useSwimlaneAssignment', () => {
  it('offers nothing while the source is NONE, or the lens is not offered, or there is no data date', async () => {
    h.list = [swimlane('S1', 'Civil', 0)];
    expect(render({ source: 'NONE' }).result.current).toBeNull();
    expect(render({ offered: false }).result.current).toBeNull();
    const noDate = render({ dataDate: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(noDate.result.current).toBeNull();
  });

  it('offers nothing when the plan has no swimlane to move to', async () => {
    h.list = [];
    const { result } = render();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });

  it('lists the swimlanes in order, then "No swimlane", and knows where each activity is', async () => {
    h.list = [swimlane('S1', 'Civil', 0), swimlane('S2', 'Mechanical', 1)];
    const { result } = render();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.choices).toEqual([
      { id: 'S1', name: 'Civil' },
      { id: 'S2', name: 'Mechanical' },
      { id: null, name: 'No swimlane' },
    ]);
    expect(result.current?.currentOf('a')).toBe('S1');
    expect(result.current?.currentOf('b')).toBeNull();
  });

  it('writes one plural move with no lane delta, the in-swimlane lanes, and a step named for the destination', async () => {
    h.list = [swimlane('S1', 'Civil', 0), swimlane('S2', 'Mechanical', 1)];
    const { result, moveMany } = render();
    await waitFor(() => expect(result.current).not.toBeNull());

    const outcome = await result.current!.assign(['b', 'c'], 'S2');

    expect(moveMany).toHaveBeenCalledTimes(1);
    const [rows, delta, options] = moveMany!.mock.calls[0]!;
    expect((rows as ActivitySummary[]).map((r) => r.id)).toEqual(['b', 'c']);
    expect(delta).toEqual({ dayDelta: 0, laneDelta: 0 });
    expect(options.label).toBe('Move 2 activities to Mechanical');
    expect(
      (options.swimlaneLanes as { id: string; swimlaneId?: string | null; lane: number }[]).filter(
        (p) => p.swimlaneId === 'S2',
      ),
    ).toHaveLength(2);
    expect(outcome).toMatchObject({ applied: true, moved: 2 });
  });

  it('names the one activity in a single move, and files in none with a null swimlane', async () => {
    h.list = [swimlane('S1', 'Civil', 0)];
    const { result, moveMany } = render();
    await waitFor(() => expect(result.current).not.toBeNull());

    await result.current!.assign(['a'], null);

    const options = moveMany!.mock.calls[0]![2];
    expect(options.label).toBe('Move “Task a” to No swimlane');
    expect(options.swimlaneLanes.find((p: { id: string }) => p.id === 'a').swimlaneId).toBeNull();
  });

  it('writes nothing when every activity is in the swimlane already', async () => {
    h.list = [swimlane('S1', 'Civil', 0)];
    const { result, moveMany } = render();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(await result.current!.assign(['a'], 'S1')).toEqual({
      applied: false,
      conflict: null,
      moved: 0,
    });
    expect(moveMany).not.toHaveBeenCalled();
  });

  it('refuses an activity that is not in the plan, whole, with nothing written', async () => {
    h.list = [swimlane('S1', 'Civil', 0)];
    const { result, moveMany } = render();
    await waitFor(() => expect(result.current).not.toBeNull());
    const outcome = await result.current!.assign(['b', 'ghost'], 'S1');
    expect(outcome.applied).toBe(false);
    expect(outcome.conflict).toMatch(/isn.t drawn/);
    expect(moveMany).not.toHaveBeenCalled();
  });

  it('is absent when the host supplies no plural move', async () => {
    h.list = [swimlane('S1', 'Civil', 0)];
    const { result } = render({ moveMany: undefined });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });
});
