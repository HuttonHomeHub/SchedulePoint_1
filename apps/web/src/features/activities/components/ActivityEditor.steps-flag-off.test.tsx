import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';

/**
 * **A host with the steps flag off does not fetch steps nobody renders** (ADR-0169 D-8). The list is
 * requested on the first visit to Progress, but the panel that shows it needs both
 * `VITE_ACTIVITY_STEPS` and `VITE_EARNED_VALUE`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_STEPS_ENABLED: false,
}));

const ROW = {
  id: 'act-1',
  planId: 'plan-1',
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  percentCompleteType: 'PHYSICAL',
  accrualType: 'UNIFORM',
  percentComplete: 10,
  version: 1,
} as ActivitySummary;

let stepGets = 0;

beforeEach(() => {
  stepGets = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/steps')) stepGets += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Progress with the steps flag off', () => {
  it('renders no steps panel and requests no steps', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ActivityEditorDialog
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={vi.fn()}
          activity={ROW}
          gating={deriveActivityEditorGating({
            penManaged: true,
            holdsPen: true,
            canWrite: true,
            canProgress: true,
            canReadCost: true,
          })}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    await screen.findByRole('button', { name: 'Save progress' });

    expect(screen.queryByRole('heading', { name: 'Weighted steps' })).not.toBeInTheDocument();
    expect(stepGets).toBe(0);
  });
});
