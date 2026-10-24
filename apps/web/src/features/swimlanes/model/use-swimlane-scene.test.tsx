import type { ActivitySummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SWIMLANES_LENS_OFFERED,
  swimlanePictureInput,
  swimlanePictureOn,
  useSwimlaneScene,
} from './use-swimlane-scene';

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
  shown: boolean;
  offered?: boolean;
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
        offered: props.offered ?? true,
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

  it('is lit: the lens is offered', () => {
    expect(SWIMLANES_LENS_OFFERED).toBe(true);
  });

  it('builds nothing and fetches nothing while swimlanes are not shown', () => {
    const { result } = render({ source: 'MANUAL', shown: false, offered: false });
    expect(result.current).toMatchObject({ input: null, pending: false, failed: false });
    expect(h.calls).toBe(0);
  });

  it('fetches the list as soon as the lens is offered, shown or not, but builds no input', async () => {
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

  it.each(['NONE', 'WBS'] as const)('builds nothing for a %s plan, shown or not', (source) => {
    const { result } = render({ source, shown: true });
    expect(result.current).toMatchObject({ input: null, pending: false, failed: false });
    expect(h.calls).toBe(0);
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

describe('swimlanePictureOn / swimlanePictureInput (M2-T5: nothing behind the lens runs while it is withheld)', () => {
  it('is off while the lens is not offered, whatever the plan says', () => {
    expect(swimlanePictureOn({ offered: false, source: 'MANUAL', canEdit: true })).toBe(false);
  });

  it('is on for a hand-made source once offered, and only for a writer when asked', () => {
    expect(swimlanePictureOn({ offered: true, source: 'MANUAL' })).toBe(true);
    expect(swimlanePictureOn({ offered: true, source: 'MANUAL', canEdit: false })).toBe(false);
    expect(swimlanePictureOn({ offered: true, source: 'NONE' })).toBe(false);
    expect(swimlanePictureOn({ offered: true, source: 'WBS' })).toBe(false);
  });

  it('yields no input unless the picture is on and both lists are loaded', () => {
    const rows: never[] = [];
    expect(swimlanePictureInput({ on: false, activities: rows, list: [] })).toBeNull();
    expect(swimlanePictureInput({ on: true, activities: undefined, list: [] })).toBeNull();
    expect(swimlanePictureInput({ on: true, activities: rows, list: undefined })).toBeNull();
    expect(swimlanePictureInput({ on: true, activities: rows, list: [] })).not.toBeNull();
  });
});
