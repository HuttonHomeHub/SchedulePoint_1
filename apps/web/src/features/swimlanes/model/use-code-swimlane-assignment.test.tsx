import type { ActivitySummary, CodeValueSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { useCodeSwimlaneAssignment } from './use-code-swimlane-assignment';

import type { Command } from '@/features/undo-redo';
import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: h.apiFetch,
}));

const TYPE = { id: 'area', name: 'Area' };
const value = (id: string, shortCode: string, description: string | null): CodeValueSummary => ({
  id,
  codeTypeId: 'area',
  shortCode,
  description,
  position: 0,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  deletedAt: null,
});
// `l2` is live and unused, so Move to swimlane… does not offer it.
const VALUES = [
  value('gf', 'GF', 'Ground floor'),
  value('l1', 'L1', 'Level 1'),
  value('rf', 'RF', 'Roof'),
  value('l2', 'L2', 'Level 2'),
];

const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;
const bar = (id: string, valueId: string | null, start: number, end: number): ActivitySummary =>
  anActivity({
    id,
    name: `Task ${id}`,
    version: 4,
    codes: valueId === null ? [] : [{ codeTypeId: 'area', codeValueId: valueId }],
    visualEffectiveStart: iso(start),
    visualEffectiveFinish: iso(end),
  });

const ACTIVITIES = [
  bar('a', 'gf', 0, 3),
  bar('b', 'l1', 0, 3),
  bar('c', 'l1', 5, 8),
  bar('d', 'rf', 0, 3),
  bar('e', null, 0, 3),
];

function render(
  over: Partial<{
    dataDate: string | null;
    type: typeof TYPE | undefined;
    record: Mock<(command: Command) => void>;
    shown: boolean;
  }> = {},
) {
  const record = over.record ?? vi.fn<(command: Command) => void>();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const hook = renderHook(
    () =>
      useCodeSwimlaneAssignment({
        orgSlug: 'acme',
        planId: 'p1',
        code: {
          type: 'type' in over ? over.type : TYPE,
          values: VALUES,
          planLanes: undefined,
        },
        activities: ACTIVITIES,
        barDateSource: 'visual',
        dataDate: over.dataDate === undefined ? '2026-01-01' : over.dataDate,
        shown: over.shown ?? true,
        wbsBandOn: false,
        record,
      }),
    { wrapper },
  );
  return { ...hook, record };
}

beforeEach(() => {
  h.apiFetch.mockReset();
  h.apiFetch.mockResolvedValue([]);
});

describe('useCodeSwimlaneAssignment', () => {
  it('offers nothing before the type arrives or without a data date', () => {
    expect(render({ type: undefined }).result.current).toBeNull();
    expect(render({ dataDate: null }).result.current).toBeNull();
  });

  it('lists the bands on screen, then "No Area" — not every value of the type', () => {
    const { result } = render();
    expect(result.current?.choices).toEqual([
      { id: 'gf', name: 'Ground floor' },
      { id: 'l1', name: 'Level 1' },
      { id: 'rf', name: 'Roof' },
      { id: null, name: 'No Area' },
    ]);
  });

  it('says under the select that a value nobody uses yet is set with Set code…', () => {
    const { result } = render();
    expect(result.current?.note).toBe('Need a swimlane that isn’t listed? Use Set code…');
  });

  it('knows where each activity is', () => {
    const { result } = render();
    expect(result.current?.currentOf('a')).toBe('gf');
    expect(result.current?.currentOf('e')).toBeNull();
  });

  it('writes one codes request carrying the movers’ value and the lanes of every bar it places', async () => {
    const { result } = render();
    const outcome = await result.current!.assign(['a'], 'l1');

    expect(h.apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = h.apiFetch.mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/p1/activities/codes');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string) as {
      activities: { id: string; version: number; codes: unknown[] }[];
      lanes: { id: string; version: number; laneIndex: number }[];
      lanesCodeTypeId: string;
    };
    // Codes only for the mover; the lanes name the mover and the unplaced members of Level 1.
    expect(body.activities).toEqual([
      { id: 'a', version: 4, codes: [{ codeTypeId: 'area', codeValueId: 'l1' }] },
    ]);
    expect(body.lanesCodeTypeId).toBe('area');
    expect(body.lanes.map((l) => l.id).sort()).toEqual(['a', 'b', 'c']);
    expect(body.lanes.find((l) => l.id === 'a')?.laneIndex).toBe(1);
    expect(outcome).toMatchObject({ applied: true, moved: 1 });
    expect(outcome.landed?.swimlane).toBe('Level 1');
  });

  it('is one undo step, named for the move', async () => {
    const { result, record } = render();
    await result.current!.assign(['a'], 'l1');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0].label).toBe('Move “Task a” to Level 1');
    await result.current!.assign(['d', 'e'], 'l1');
    expect(record.mock.calls[1]![0].label).toBe('Move 2 activities to Level 1');
  });

  it('clears the code to move work to "No Area"', async () => {
    const { result } = render();
    await result.current!.assign(['d'], null);
    const body = JSON.parse(h.apiFetch.mock.calls[0]![1].body as string) as {
      activities: { codes: unknown[] }[];
    };
    expect(body.activities[0]?.codes).toEqual([{ codeTypeId: 'area', codeValueId: null }]);
  });

  it('omits the landed place while swimlanes are not drawn', async () => {
    const { result } = render({ shown: false });
    const outcome = await result.current!.assign(['a'], 'l1');
    expect(outcome.landed).toBeUndefined();
  });

  it('writes nothing when everything is in the band already', async () => {
    const { result } = render();
    const outcome = await result.current!.assign(['b', 'c'], 'l1');
    expect(outcome).toEqual({ applied: false, conflict: null, moved: 0 });
    expect(h.apiFetch).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a band, and says nothing was written', async () => {
    const { result } = render();
    const outcome = await result.current!.assign(['a'], 'l2');
    expect(outcome.applied).toBe(false);
    expect(outcome.conflict).toMatch(/no longer in the plan/);
    expect(h.apiFetch).not.toHaveBeenCalled();
  });

  it('turns a refused write into a sentence that names the move, and records no step', async () => {
    h.apiFetch.mockRejectedValue(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'Conflict.',
        details: { reason: 'SWIMLANE_SOURCE_CHANGED' },
      }),
    );
    const { result, record } = render();
    const outcome = await result.current!.assign(['a'], 'l1');
    expect(outcome.applied).toBe(false);
    expect(outcome.conflict).toMatch(
      /^Could not move “Task a” to Level 1: the plan’s swimlanes were changed/,
    );
    expect(record).not.toHaveBeenCalled();
  });
});
