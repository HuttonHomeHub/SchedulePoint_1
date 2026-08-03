import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFloatPathsPanel } from './model/use-float-paths-panel';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { makeTsldToolbarContext } from '@/features/tsld/toolbar/test-helpers';
import { buildTsldToolbarItems } from '@/features/tsld/toolbar/tsld-toolbar-items';

/**
 * **The rollback contract** (audit F4, M2.4).
 *
 * With `VITE_FLOAT_PATHS` off, the product is byte-for-byte what shipped before this epic: no
 * toolbar item, no panel, and — the one that actually costs something — **no request**. This suite
 * is kept rather than weakened when the flag flips (the ADR-0053 M6 rule); it is the only thing
 * that makes `VITE_FLOAT_PATHS=false` a real answer on the day it is needed.
 *
 * Note what is asserted about the toolbar: the item is **absent**, not a "Coming soon" placeholder.
 * Every other flag-gated id here ships a stub, and this one deliberately does not — a stub would
 * add a control to a shipped row, which is not what "byte-for-byte" means.
 */

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  FLOAT_PATHS_ENABLED: false,
}));

const fetchMock = vi.fn();

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

const SELECTED = { id: 'a1', version: 1, name: 'Excavate' } as unknown as ActivitySummary;

describe('VITE_FLOAT_PATHS off — parity with the prior product', () => {
  it('registers no Float paths toolbar item at all — not even a placeholder', () => {
    const rows = splitByRow(buildTsldToolbarItems());
    render(
      <Toolbar
        items={rows.look}
        context={makeTsldToolbarContext({ activityCount: 12, selectedActivity: SELECTED })}
        label="View and navigate"
        authoringEnabled
        alignEndGroup="object"
      />,
    );
    expect(screen.queryByRole('button', { name: /float paths/i })).not.toBeInTheDocument();
    // And no "Coming soon" stub under that name either.
    expect(screen.queryByText(/float paths/i)).not.toBeInTheDocument();
  });

  it('never issues the analysis request, even if the panel state is somehow opened', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useFloatPathsPanel({
          orgSlug: 'acme',
          planId: 'plan-1',
          activities: [],
          planCalendarId: null,
          calendars: [],
          selectedActivityId: 'a1',
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      },
    );
    // The flag is the FIRST clause of the hook's `enabled`, so even an opened panel is inert.
    result.current.openWith('a1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.model).toBeNull();
    expect(result.current.emphasisIds.size).toBe(0);
  });
});
