import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

/**
 * The **flag matrix** for the Resources tab: it needs the convergence flag *and* `VITE_RESOURCES`.
 *
 * This is the class of defect the ADR-0060 security review caught on the steps panel — a surface
 * reachable when its entry point is hidden, or the reverse — and a single-flag test would not have
 * found it, because a single-flag test only ever exercises one row of this table.
 *
 * Both flags are read at module scope, so each combination needs its own module registry: hence
 * `vi.resetModules()` + a dynamic import per case rather than one mount helper.
 */
const ROW = {
  id: 'a1',
  planId: 'pl1',
  name: 'Excavate',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  version: 1,
} as ActivitySummary;

const PLANNER_WITH_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

async function renderWith(convergence: boolean, resources: boolean): Promise<void> {
  vi.resetModules();
  vi.doMock('@/config/env', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    ACTIVITY_EDITOR_CONVERGENCE_ENABLED: convergence,
    RESOURCES_ENABLED: resources,
  }));
  const { ActivityEditorDialog } = await import('./ActivityEditorDialog');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="pl1"
        open
        onClose={() => {}}
        activity={ROW}
        gating={PLANNER_WITH_PEN}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@/config/env');
});

describe('the Resources tab needs both flags', () => {
  const CASES: [boolean, boolean, boolean][] = [
    // convergence, resources, tab present
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ];

  it.each(CASES)(
    'convergence=%s resources=%s ⇒ tab present: %s',
    async (convergence, resources, expected) => {
      await renderWith(convergence, resources);
      const tab = screen.queryByRole('tab', { name: /Resources/ });
      expect(tab === null).toBe(!expected);
    },
  );
});
