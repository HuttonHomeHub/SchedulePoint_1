import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **Flag-OFF parity** for the Members tab — the rollback contract for `VITE_WBS_IMPROVEMENTS`.
 *
 * Pinned explicitly rather than relying on the default, so this suite keeps meaning the day the
 * flag flips default-on. A parity suite rewritten to describe the new behaviour stops being a
 * parity suite, and the day a rollback is needed there is nothing left saying what "back" meant
 * (the ADR-0053 M6 rule).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: false,
}));

function row(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'act-1',
    planId: 'plan-1',
    name: 'Pour slab',
    code: 'A100',
    type: 'TASK',
    parentId: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationDays: 5,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    version: 1,
    ...overrides,
  } as ActivitySummary;
}

const SUMMARY = row({ id: 'sum-1', name: 'Substructure', code: 'W1', type: 'WBS_SUMMARY' });

const PLANNER_WITH_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function mount(activity: ActivitySummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        activity={activity}
        gating={PLANNER_WITH_PEN}
        planActivities={[SUMMARY, row()]}
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
afterEach(() => vi.unstubAllGlobals());

const railLabels = (): string[] =>
  within(screen.getByRole('tablist'))
    .getAllByRole('tab')
    .map((t) => t.textContent ?? '');

describe('ActivityEditorDialog — Members, flag off', () => {
  it('shows no Members tab, even on a WBS summary', () => {
    mount(SUMMARY);
    expect(railLabels().join('|')).not.toContain('Members');
  });

  it('renders no membership checklist anywhere in the editor', () => {
    mount(SUMMARY);
    expect(screen.queryByLabelText('Find an activity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save membership' })).not.toBeInTheDocument();
  });

  it('leaves a plain activity’s editor exactly as it was', () => {
    mount(row());
    expect(railLabels().join('|')).not.toContain('Members');
  });
});
