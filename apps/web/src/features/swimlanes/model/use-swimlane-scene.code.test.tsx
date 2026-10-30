import type { ActivitySummary, CodeTypeSummary, CodeValueSummary, PlanCodeLane } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { swimlanePictureInput, swimlanePictureOn, useSwimlaneScene } from './use-swimlane-scene';

import { anActivity } from '@/test/activity-fixture';

// Plain functions rather than `vi.fn()`, as the sibling suite does: a spy's bookkeeping leaves a
// rejected promise unhandled, which fails the test that asserts the rejection is survived.
const h = vi.hoisted(() => ({
  paths: [] as string[],
  types: (): Promise<unknown> => Promise.resolve([]),
  values: (): Promise<unknown> => Promise.resolve([]),
  lanes: (): Promise<unknown> => Promise.resolve({ codeTypeId: '', lanes: [] }),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchAllPages: (path: string) => {
    h.paths.push(path);
    return h.types();
  },
  apiFetchEnvelope: async (path: string) => {
    h.paths.push(path);
    return { data: await h.values(), meta: { hasMore: false, nextCursor: null } };
  },
  apiFetch: (path: string) => {
    h.paths.push(path);
    return h.lanes();
  },
}));

const TYPE = { id: 'area', name: 'Area' } as CodeTypeSummary;
const value = (id: string, shortCode: string, position: number): CodeValueSummary => ({
  id,
  codeTypeId: 'area',
  shortCode,
  description: null,
  position,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  deletedAt: null,
});
const VALUES = [value('gf', 'GF', 0), value('l1', 'L1', 1), value('rf', 'RF', 2)];
const lane = (over: Partial<PlanCodeLane>): PlanCodeLane => ({
  activityId: 'a',
  codeValueId: 'gf',
  laneIndex: 3,
  updatedAt: '2026-10-02T00:00:00.000Z',
  ...over,
});

function render(args: {
  shown?: boolean;
  activities?: readonly ActivitySummary[] | undefined;
  codeTypeId?: string | null;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(
    (props: typeof args) =>
      useSwimlaneScene({
        orgSlug: 'acme',
        planId: 'p1',
        source: 'ACTIVITY_CODE',
        codeTypeId: 'area',
        shown: true,
        ...props,
        activities: props.activities,
      }),
    {
      wrapper,
      initialProps: {
        activities: [anActivity({ id: 'a', codes: [{ codeTypeId: 'area', codeValueId: 'gf' }] })],
        ...args,
      },
    },
  );
}

describe('useSwimlaneScene under a code source (M4-T3)', () => {
  beforeEach(() => {
    h.paths = [];
    h.types = () => Promise.resolve([TYPE]);
    h.values = () => Promise.resolve(VALUES);
    h.lanes = () => Promise.resolve({ codeTypeId: 'area', lanes: [] });
  });

  it('is pending once, with no input, until the type and its values arrive (ADR-0202)', async () => {
    const { result } = render({});
    expect(result.current).toMatchObject({ input: null, pending: true, failed: false });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.input).toMatchObject({
      source: 'ACTIVITY_CODE',
      codeTypeId: 'area',
      codeTypeName: 'Area',
      noneName: 'No Area',
    });
    // Only the value an activity carries is a swimlane.
    expect(result.current.input?.swimlanes).toEqual([{ id: 'gf', name: 'GF' }]);
    expect(result.current.input?.membership.get('a')).toBe('gf');
  });

  it('reads the type and values whether or not swimlanes are shown, but builds no input while hidden', async () => {
    const { result } = render({ shown: false });
    await waitFor(() => expect(h.paths.some((p) => p.endsWith('/values?limit=1000'))).toBe(true));
    expect(h.paths.some((p) => p.includes('/code-types?values=none'))).toBe(true);
    expect(result.current).toMatchObject({ input: null, pending: false });
  });

  it('draws nothing, and fetches nothing, for a code source whose type is not set', () => {
    const { result } = render({ codeTypeId: null });
    expect(result.current).toMatchObject({ input: null, pending: false, failed: false });
    expect(h.paths).toEqual([]);
  });

  it('degrades to the swimlane-free diagram when the values fail, and recovers on a refetch', async () => {
    h.values = () => Promise.reject(new Error('boom'));
    const { result } = render({});
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: 4000 });
    expect(result.current).toMatchObject({ input: null, pending: false });

    h.values = () => Promise.resolve(VALUES);
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.input).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });

  it('is failed, not pending for ever, when the type is not in the plan’s list', async () => {
    h.types = () => Promise.resolve([{ id: 'other', name: 'Trade' }]);
    const { result } = render({});
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.pending).toBe(false);
  });

  describe('the lanes the list does not carry', () => {
    it('reads the plan-wide lanes when no activity carries one for the type, and applies a matching one', async () => {
      h.lanes = () => Promise.resolve({ codeTypeId: 'area', lanes: [lane({ laneIndex: 4 })] });
      const { result } = render({});
      expect(result.current.pending).toBe(true);
      await waitFor(() => expect(result.current.pending).toBe(false));

      expect(h.paths.some((p) => p.endsWith('/code-types/area/swimlane-lanes'))).toBe(true);
      expect(result.current.input?.storedLanes.get('a')).toMatchObject({ lane: 4 });
    });

    it('treats a plan-wide lane for a value the activity no longer holds as unplaced', async () => {
      h.lanes = () =>
        Promise.resolve({ codeTypeId: 'area', lanes: [lane({ codeValueId: 'l1', laneIndex: 4 })] });
      const { result } = render({});
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(result.current.input?.storedLanes.has('a')).toBe(false);
    });

    it('does not read them at all once the list carries a lane for the type', async () => {
      const activities = [
        anActivity({
          id: 'a',
          codes: [{ codeTypeId: 'area', codeValueId: 'gf' }],
          codeSwimlaneLanes: [
            {
              codeTypeId: 'area',
              codeValueId: 'gf',
              laneIndex: 2,
              updatedAt: '2026-10-02T00:00:00.000Z',
            },
          ],
        }),
      ];
      const { result } = render({ activities });
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(h.paths.some((p) => p.endsWith('/swimlane-lanes'))).toBe(false);
      expect(result.current.input?.storedLanes.get('a')).toMatchObject({ lane: 2 });
    });

    it('draws with derived lanes, not a failure, when only the plan-wide read fails', async () => {
      h.lanes = () => Promise.reject(new Error('boom'));
      const { result } = render({});
      // The query's own single retry (1 s) runs before the failure settles.
      await waitFor(() => expect(result.current.pending).toBe(false), { timeout: 4000 });
      expect(result.current).toMatchObject({ failed: false, lanesFailed: true });
      expect(result.current.input).not.toBeNull();
      expect(result.current.input?.storedLanes.size).toBe(0);
    });
  });

  describe('over 100 values in use (owner answer 1)', () => {
    const many = Array.from({ length: 101 }, (_, i) => value(`v${String(i)}`, `V${String(i)}`, i));
    const carriers = many.map((v, i) =>
      anActivity({ id: `a${String(i)}`, codes: [{ codeTypeId: 'area', codeValueId: v.id }] }),
    );

    it('keeps drawing every band and says how many are in use', async () => {
      h.values = () => Promise.resolve(many);
      const { result } = render({ activities: carriers });
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(result.current.input?.swimlanes).toHaveLength(101);
      expect(result.current.overLimit).toEqual({ typeName: 'Area', count: 101 });
    });

    it('says nothing at exactly 100', async () => {
      h.values = () => Promise.resolve(many.slice(0, 100));
      const { result } = render({ activities: carriers.slice(0, 100) });
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(result.current.overLimit).toBeUndefined();
    });
  });
});

describe('the picture gate for a code source', () => {
  it('is on only with a type, and only for a writer when asked', () => {
    expect(swimlanePictureOn({ source: 'ACTIVITY_CODE', codeTypeId: 'area' })).toBe(true);
    expect(swimlanePictureOn({ source: 'ACTIVITY_CODE', codeTypeId: 'area', canEdit: false })).toBe(
      false,
    );
    expect(swimlanePictureOn({ source: 'ACTIVITY_CODE', codeTypeId: null })).toBe(false);
    expect(swimlanePictureOn({ source: 'ACTIVITY_CODE' })).toBe(false);
  });

  it('yields no input until the type and its values have loaded', () => {
    const base = { source: 'ACTIVITY_CODE', on: true, activities: [], list: undefined } as const;
    const type = { id: 'area', name: 'Area' };
    expect(swimlanePictureInput({ ...base })).toBeNull();
    expect(
      swimlanePictureInput({ ...base, code: { type, values: undefined, planLanes: undefined } }),
    ).toBeNull();
    expect(
      swimlanePictureInput({
        ...base,
        code: { type: undefined, values: VALUES, planLanes: undefined },
      }),
    ).toBeNull();
    expect(
      swimlanePictureInput({ ...base, code: { type, values: VALUES, planLanes: undefined } }),
    ).toMatchObject({ source: 'ACTIVITY_CODE' });
    expect(
      swimlanePictureInput({
        ...base,
        on: false,
        code: { type, values: VALUES, planLanes: undefined },
      }),
    ).toBeNull();
  });
});
