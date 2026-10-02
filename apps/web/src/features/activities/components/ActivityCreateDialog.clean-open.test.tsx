import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

/**
 * **A New activity dialog opened and not touched has no unsaved work** (docs/specs/activity-editor-
 * seeding, M3b) — the create-side twin of `ActivityEditor.clean-open.test.tsx`.
 *
 * Under StrictMode, as the app is mounted, react-hook-form re-attaches each registered field once
 * at mount; a seed that omits an optional key then reads as an edit. The flags are on so every
 * scope's optional fields (levelling priority, expenses, physical %) are actually registered.
 */

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_STEPS_ENABLED: true,
  EARNED_VALUE_ENABLED: true,
  COST_ACCRUAL_ENABLED: true,
  ACTIVITY_CALENDAR_ENABLED: true,
  SUB_DAY_DURATIONS_ENABLED: true,
  ADVANCED_ACTIVITY_TYPES_ENABLED: true,
  INTER_PROJECT_DATES_ENABLED: true,
  RESOURCE_LEVELLING_ENABLED: true,
}));

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

afterEach(() => vi.unstubAllGlobals());

describe('New activity opened and left alone closes without a confirmation', () => {
  it('closes on Cancel with no confirmation, under StrictMode', async () => {
    const onClose = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <ActivityCreateDialog
            open
            onClose={onClose}
            orgSlug="acme"
            planId="plan-1"
            planActivities={[] as ActivitySummary[]}
          />
        </QueryClientProvider>
      </StrictMode>,
    );
    // Let any seed settle, as a real browser does before a key is pressed.
    await new Promise((resolve) => setTimeout(resolve, 50));

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
