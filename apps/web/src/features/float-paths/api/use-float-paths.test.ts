import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  floatPathsQueryOptions,
  isPlanNotScheduled,
  isTargetMissing,
  useFloatPaths,
} from './use-float-paths';

import { ApiFetchError } from '@/lib/api/client';
import { scheduleKeys } from '@/lib/query/hierarchy-keys';

/**
 * The hook's job is almost entirely **not fetching**. Unlike the earned-value and
 * resource-histogram reads it sits beside, `GET …/schedule/float-paths` runs a full
 * `computeSchedule` per request — so a hook that fetched on mount would run a CPM computation for
 * every plan a planner opens, whether or not they ever asked the question. The first test here is
 * therefore the load-bearing one.
 */

const fetchMock = vi.fn();

const apiError = (status: number): ApiFetchError =>
  new ApiFetchError(status, { code: 'TEST', message: 'test' });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ data: { targetActivityId: 't', paths: [], hasMorePaths: false } }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('scheduleKeys.floatPaths', () => {
  it('lives under the schedule namespace, so a recalculate sweep already covers it', () => {
    const key = scheduleKeys.floatPaths('acme', 'plan-1', 'act-1', 10);
    expect(key.slice(0, 2)).toEqual(scheduleKeys.all('acme'));
  });

  it('separates targets and page sizes, so Show more cannot serve the short list back', () => {
    const ten = scheduleKeys.floatPaths('acme', 'plan-1', 'act-1', 10);
    const twentyFive = scheduleKeys.floatPaths('acme', 'plan-1', 'act-1', 25);
    const otherTarget = scheduleKeys.floatPaths('acme', 'plan-1', 'act-2', 10);
    expect(ten).not.toEqual(twentyFive);
    expect(ten).not.toEqual(otherTarget);
  });
});

describe('useFloatPaths', () => {
  it('issues no request while the panel is closed', async () => {
    const client = newClient();
    renderHook(() => useFloatPaths('acme', 'plan-1', 'act-1', 10, false), {
      wrapper: wrapper(client),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues no request without a target, even with the panel open', async () => {
    const client = newClient();
    renderHook(() => useFloatPaths('acme', 'plan-1', '', 10, true), { wrapper: wrapper(client) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues exactly one request when the panel opens on a target', async () => {
    const client = newClient();
    const { result } = renderHook(() => useFloatPaths('acme', 'plan-1', 'act-1', 10, true), {
      wrapper: wrapper(client),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/schedule/float-paths?target=act-1&maxPaths=10',
    );
  });

  it('holds staleTime at zero — a stale float path is a wrong one, not an old one', () => {
    expect(floatPathsQueryOptions('acme', 'plan-1', 'act-1', 10, true).staleTime).toBe(0);
  });
});

describe('error classification', () => {
  it('recognises the never-scheduled 422 and the missing-target 404', () => {
    expect(isPlanNotScheduled(apiError(422))).toBe(true);
    expect(isTargetMissing(apiError(404))).toBe(true);
    expect(isPlanNotScheduled(apiError(404))).toBe(false);
    expect(isTargetMissing(new Error('boom'))).toBe(false);
  });

  it('does not retry either — both describe the plan, not the transport', () => {
    const { retry } = floatPathsQueryOptions('acme', 'plan-1', 'act-1', 10, true);
    const decide = retry as (count: number, error: unknown) => boolean;
    expect(decide(0, apiError(422))).toBe(false);
    expect(decide(0, apiError(404))).toBe(false);
    expect(decide(0, apiError(500))).toBe(true);
  });
});
