import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRememberPlan } from './use-remember-plan';

import { readRecentPlanIds } from '@/features/overview/model/recent-plans';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function Probe({ planId, resolved }: { planId: string; resolved: boolean }): null {
  useRememberPlan({ orgSlug: 'acme', planId, resolved });
  return null;
}

/**
 * Renders the probe and returns a `rerender` that keeps the SAME `QueryClient`.
 *
 * That matters for the write-once case: rerendering through a fresh client remounts the session
 * query, so the effect legitimately re-runs and the test would pass for the wrong reason — it would
 * be asserting a race rather than the dependency list.
 */
function renderProbe(props: { planId: string; resolved: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <Probe {...props} />
    </QueryClientProvider>,
  );
  return {
    ...utils,
    rerenderProbe: (next: { planId: string; resolved: boolean }) =>
      utils.rerender(
        <QueryClientProvider client={client}>
          <Probe {...next} />
        </QueryClientProvider>,
      ),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(apiFetch).mockImplementation((path: string) =>
    path === '/me'
      ? Promise.resolve({
          user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
          memberships: [],
        })
      : Promise.reject(new Error(`unexpected ${path}`)),
  );
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('useRememberPlan', () => {
  it('remembers a plan that resolved', async () => {
    renderProbe({ planId: 'p1', resolved: true });
    await waitFor(() => {
      expect(readRecentPlanIds(window.localStorage, { userId: 'u1', orgSlug: 'acme' })).toEqual([
        'p1',
      ]);
    });
  });

  it('remembers nothing for a plan that 404d', () => {
    // The entry would be pruned on the next visit anyway, but it would first cost a lookup and
    // occupy one of five slots that a plan the reader can actually open should have.
    const { rerenderProbe } = renderProbe({ planId: 'p1', resolved: false });
    rerenderProbe({ planId: 'p1', resolved: false });
    expect(readRecentPlanIds(window.localStorage, { userId: 'u1', orgSlug: 'acme' })).toEqual([]);
  });

  it('writes once per plan, not once per render', async () => {
    // The risk this hook's dependency list exists for: the plan workspace re-renders constantly,
    // on every canvas interaction. A write per render would be thousands of `localStorage` writes
    // in a drag.
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const { rerenderProbe } = renderProbe({ planId: 'p1', resolved: true });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const afterFirst = spy.mock.calls.length;

    rerenderProbe({ planId: 'p1', resolved: true });
    rerenderProbe({ planId: 'p1', resolved: true });
    expect(spy.mock.calls.length).toBe(afterFirst);

    // …and a DIFFERENT plan does write, so the assertion above is about the dependency list and
    // not about the spy having stopped working.
    rerenderProbe({ planId: 'p2', resolved: true });
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(afterFirst));
    spy.mockRestore();
  });
});
