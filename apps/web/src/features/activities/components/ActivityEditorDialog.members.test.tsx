import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * The **Members** tab (`VITE_WBS_IMPROVEMENTS`) — a WBS summary's contents, in the editor.
 *
 * Its sibling suite (`…members.flag-off.test.tsx`) pins the other flag state, which is the rollback
 * contract; both are kept, per the ADR-0053 M6 precedent.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
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

const PLANNER_NO_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function mount(props: Partial<Parameters<typeof ActivityEditorDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        activity={SUMMARY}
        gating={PLANNER_WITH_PEN}
        planActivities={[SUMMARY, row(), row({ id: 'act-2', name: 'Excavate', code: 'A090' })]}
        intent={{ activityId: 'sum-1', tab: 'members' }}
        {...props}
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

/** The section rail's tab labels, in order. */
const railLabels = (): string[] =>
  within(screen.getByRole('tablist'))
    .getAllByRole('tab')
    .map((t) => t.textContent ?? '');

describe('ActivityEditorDialog — the Members tab', () => {
  it('adds Members to the rail for a summary, after Resources and before Progress', () => {
    mount();
    const labels = railLabels().join('|');
    expect(labels).toContain('Members');
    expect(labels.indexOf('Members')).toBeLessThan(labels.indexOf('Progress'));
  });

  /**
   * Conditional on the SUBJECT, not just the flag. Every other tab asks something of any activity;
   * "what is filed under this?" is meaningless for one that cannot hold anything, and a tab that
   * renders an empty checklist for a task would be a dead end with a plausible name.
   */
  it('does NOT add Members to a plain activity, flag on', () => {
    mount({ activity: row(), intent: { activityId: 'act-1', tab: 'general' } });
    expect(railLabels().join('|')).not.toContain('Members');
  });

  it('lands on the panel when opened with the members intent', () => {
    mount();
    expect(screen.getByLabelText('Find an activity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save membership' })).toBeInTheDocument();
  });

  // Membership is a definition write: same role, same pen, same sentence as every other one.
  it('shades the panel with the pen reason rather than hiding it', () => {
    mount({ gating: PLANNER_NO_PEN });
    expect(screen.getByLabelText('Find an activity')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Pour slab/ })).toBeDisabled();
    expect(screen.getByText('Start editing to change this activity.')).toBeInTheDocument();
  });

  it('offers the plan’s activities without needing a second fetch', () => {
    mount();
    // Both non-summary rows from `planActivities` are listed; nothing was fetched for them.
    expect(screen.getByRole('checkbox', { name: /Pour slab/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Excavate/ })).toBeInTheDocument();
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((c) => String(c[0]).includes('/activities'))).toBe(false);
  });
});
