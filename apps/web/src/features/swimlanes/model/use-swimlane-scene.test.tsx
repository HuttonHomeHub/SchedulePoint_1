import type { ActivitySummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { swimlanePictureInput, swimlanePictureOn, useSwimlaneScene } from './use-swimlane-scene';

import { anActivity } from '@/test/activity-fixture';

// A plain function rather than `vi.fn()`: the spy's own bookkeeping leaves a rejected promise
// unhandled, which fails the test that is asserting the rejection is survived.
const h = vi.hoisted(() => ({ calls: 0, impl: (): Promise<unknown> => Promise.resolve([]) }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchAllPages: () => {
    h.calls += 1;
    return h.impl();
  },
}));

const LIST: SwimlaneSummary[] = [
  {
    id: 's1',
    planId: 'p1',
    name: 'Mechanical',
    position: 0,
    version: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

function render(args: {
  source: SwimlaneSource;
  level?: number | null;
  shown: boolean;
  activities?: readonly ActivitySummary[] | undefined;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(
    (props: typeof args) =>
      useSwimlaneScene({
        orgSlug: 'acme',
        planId: 'p1',
        ...props,
        activities: props.activities,
      }),
    { wrapper, initialProps: { activities: [anActivity({ swimlaneId: 's1' })], ...args } },
  );
}

describe('useSwimlaneScene', () => {
  beforeEach(() => {
    h.calls = 0;
    h.impl = () => Promise.resolve(LIST);
  });

  it('fetches the list for a hand-made plan, shown or not, but builds no input while hidden', async () => {
    const { result } = render({ source: 'MANUAL', shown: false });
    await waitFor(() => expect(h.calls).toBe(1));
    expect(result.current).toMatchObject({ input: null, pending: false });
  });

  it('a toggle after the list is cached builds the input with no pending window', async () => {
    const { result, rerender } = render({ source: 'MANUAL', shown: false });
    await waitFor(() => expect(h.calls).toBe(1));
    await waitFor(() => expect(result.current.failed).toBe(false));
    // let the cache settle
    await new Promise((r) => setTimeout(r, 0));

    rerender({ source: 'MANUAL', shown: true, activities: [anActivity({ swimlaneId: 's1' })] });
    expect(result.current.pending).toBe(false);
    expect(result.current.input).not.toBeNull();
    expect(h.calls).toBe(1);
  });

  it.each([
    ['NONE', null],
    ['WBS', null],
  ] as const)('builds nothing for a %s plan with level %s, shown or not', (source, level) => {
    const { result } = render({ source, level, shown: true });
    expect(result.current).toMatchObject({ input: null, pending: false, failed: false });
    expect(h.calls).toBe(0);
  });

  describe('a WBS plan (M3)', () => {
    const tree = [
      anActivity({ id: 'works', type: 'WBS_SUMMARY', name: 'The Works' }),
      anActivity({ id: 'struct', type: 'WBS_SUMMARY', parentId: 'works', name: 'Structure' }),
      anActivity({ id: 'slab', parentId: 'struct' }),
    ];

    it('is drawn from the activities alone: no list is fetched and nothing is ever pending', () => {
      const { result } = render({ source: 'WBS', level: 2, shown: true, activities: tree });
      expect(result.current.pending).toBe(false);
      expect(result.current.input?.swimlanes).toEqual([{ id: 'struct', name: 'Structure' }]);
      expect(result.current.input?.membership.get('slab')).toBe('struct');
      expect(result.current.input?.source).toBe('WBS');
      expect(h.calls).toBe(0);
    });

    it('builds no input while hidden, and none before the activities have arrived', () => {
      expect(
        render({ source: 'WBS', level: 2, shown: false, activities: tree }).result.current.input,
      ).toBeNull();
      expect(
        render({ source: 'WBS', level: 2, shown: true, activities: undefined }).result.current
          .input,
      ).toBeNull();
    });

    it('follows a rename with no write: a changed name is a changed list, nothing else', () => {
      const { result, rerender } = render({
        source: 'WBS',
        level: 2,
        shown: true,
        activities: tree,
      });
      rerender({
        source: 'WBS',
        level: 2,
        shown: true,
        activities: tree.map((a) => (a.id === 'struct' ? { ...a, name: 'Substructure' } : a)),
      });
      expect(result.current.input?.swimlanes).toEqual([{ id: 'struct', name: 'Substructure' }]);
      expect(h.calls).toBe(0);
    });

    it('returns the same by-hand picture after a round trip through the WBS: no write in between', async () => {
      const activities = [anActivity({ swimlaneId: 's1' })];
      const { result, rerender } = render({ source: 'MANUAL', shown: true, activities });
      await waitFor(() => expect(result.current.input).not.toBeNull());
      const before = structuredClone({
        swimlanes: result.current.input?.swimlanes,
        membership: [...(result.current.input?.membership ?? [])],
        storedLanes: [...(result.current.input?.storedLanes ?? [])],
      });

      rerender({ source: 'WBS', level: 1, shown: true, activities });
      expect(result.current.input?.source).toBe('WBS');
      rerender({ source: 'MANUAL', shown: true, activities });
      await waitFor(() => expect(result.current.input?.source).toBe('MANUAL'));

      expect({
        swimlanes: result.current.input?.swimlanes,
        membership: [...(result.current.input?.membership ?? [])],
        storedLanes: [...(result.current.input?.storedLanes ?? [])],
      }).toEqual(before);
      // Membership and the stored lanes are read, never written: the activity is as it was.
      expect(activities[0]?.swimlaneId).toBe('s1');
    });
  });

  it('is pending, with no input, until the list arrives; then builds the input (ADR-0202)', async () => {
    const { result } = render({ source: 'MANUAL', shown: true });
    expect(result.current).toMatchObject({ input: null, pending: true });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.input?.swimlanes).toEqual([{ id: 's1', name: 'Mechanical' }]);
    expect(result.current.input?.membership.get('a1')).toBe('s1');
  });

  it('degrades to the swimlane-free diagram, not a spinner, when the list fails', async () => {
    h.impl = () => Promise.reject(new Error('boom'));
    const { result } = render({ source: 'MANUAL', shown: true });

    // One retry (1 s) before the failure is reported, not three.
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 4000 });
    expect(h.calls).toBe(2);
    expect(result.current.pending).toBe(false);
    expect(result.current.input).toBeNull();
  });

  it('offers a refetch that recovers from a failure', async () => {
    h.impl = () => Promise.reject(new Error('boom'));
    const { result } = render({ source: 'MANUAL', shown: true });
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 4000 });

    h.impl = () => Promise.resolve(LIST);
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.input).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });

  it('builds once per data change: an unrelated re-render returns the same object', async () => {
    const activities = [anActivity({ swimlaneId: 's1' })];
    const { result, rerender } = render({ source: 'MANUAL', shown: true, activities });
    await waitFor(() => expect(result.current.input).not.toBeNull());

    const first = result.current.input;
    rerender({ source: 'MANUAL', shown: true, activities });
    rerender({ source: 'MANUAL', shown: true, activities });
    expect(result.current.input).toBe(first);

    rerender({ source: 'MANUAL', shown: true, activities: [...activities] });
    expect(result.current.input).not.toBe(first);
  });
});

describe('swimlanePictureOn / swimlanePictureInput (M2-T5: the one gate)', () => {
  it('is on for a hand-made source, and only for a writer when asked; NONE has none', () => {
    expect(swimlanePictureOn({ source: 'MANUAL' })).toBe(true);
    expect(swimlanePictureOn({ source: 'MANUAL', canEdit: false })).toBe(false);
    expect(swimlanePictureOn({ source: 'NONE' })).toBe(false);
  });

  it('is on for a WBS source with a level, and off for one without (the server stores none)', () => {
    expect(swimlanePictureOn({ source: 'WBS', level: 2 })).toBe(true);
    expect(swimlanePictureOn({ source: 'WBS', level: 2, canEdit: false })).toBe(false);
    expect(swimlanePictureOn({ source: 'WBS', level: null })).toBe(false);
    expect(swimlanePictureOn({ source: 'WBS' })).toBe(false);
    expect(swimlanePictureOn({ source: 'WBS', level: 4 })).toBe(false);
  });

  it('yields no input unless the picture is on and what the source reads has loaded', () => {
    const rows: never[] = [];
    const manual = { source: 'MANUAL' } as const;
    expect(swimlanePictureInput({ ...manual, on: false, activities: rows, list: [] })).toBeNull();
    expect(
      swimlanePictureInput({ ...manual, on: true, activities: undefined, list: [] }),
    ).toBeNull();
    expect(
      swimlanePictureInput({ ...manual, on: true, activities: rows, list: undefined }),
    ).toBeNull();
    expect(
      swimlanePictureInput({ ...manual, on: true, activities: rows, list: [] }),
    ).not.toBeNull();
  });

  it('reads a WBS plan from the activities alone, and never from a list', () => {
    const rows: never[] = [];
    const wbs = { source: 'WBS', level: 1 } as const;
    expect(
      swimlanePictureInput({ ...wbs, on: true, activities: rows, list: undefined }),
    ).toMatchObject({ source: 'WBS' });
    expect(swimlanePictureInput({ ...wbs, on: true, activities: undefined, list: [] })).toBeNull();
    expect(
      swimlanePictureInput({ source: 'WBS', level: null, on: true, activities: rows, list: [] }),
    ).toBeNull();
  });
});
