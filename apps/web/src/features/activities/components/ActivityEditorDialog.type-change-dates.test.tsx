import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';

/**
 * **After a General save that changed the type, a clean Scheduling tab shows the server's dates**
 * (ADR-0162 decision 3, `docs/specs/zero-duration-task/` M2-T2).
 *
 * The server re-expresses a zero-duration activity's stored dates when its type crosses the
 * finish-milestone convention, and returns the moved values. The editor seeds each scope once, at
 * open (`useScopeForm`'s trap 2), so without an explicit re-seed the Scheduling tab would go on
 * showing the pre-move date — and the next edit there would send it back. A DIRTY Scheduling tab is
 * left alone: it holds dates the reader typed (plan risk R2).
 */

function row(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'act-1',
    planId: 'plan-1',
    name: 'Handover',
    code: 'Z',
    type: 'TASK',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationDays: 0,
    durationMinutes: 0,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    constraintType: 'SNET',
    constraintDate: '2026-01-12',
    version: 1,
    ...overrides,
  } as ActivitySummary;
}

const PLANNER_WITH_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

/** What the PATCH answers with: the saved row as the server re-expressed it. */
let SAVED: ActivitySummary = row();

beforeEach(() => {
  SAVED = row({ type: 'FINISH_MILESTONE', constraintDate: '2026-01-11', version: 2 });
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: SAVED }),
      } as unknown as Response),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

function mount(activity = row()) {
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
      />
    </QueryClientProvider>,
  );
}

const saveGeneral = (type: string): void => {
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: type } });
  fireEvent.click(screen.getByRole('button', { name: /save general/i }));
};

describe('ActivityEditorDialog — re-seed after a type change (M2-T2)', () => {
  it('a clean Scheduling tab shows the re-expressed date after the General save', async () => {
    mount();
    saveGeneral('FINISH_MILESTONE');
    await screen.findByText('Saved.');

    fireEvent.click(screen.getByRole('tab', { name: /^Scheduling/ }));
    await waitFor(() => expect(screen.getByLabelText('Constraint date')).toHaveValue('2026-01-11'));
  });

  it('a dirty Scheduling tab keeps what the reader typed', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: /^Scheduling/ }));
    fireEvent.change(screen.getByLabelText('Constraint date'), { target: { value: '2026-02-02' } });
    fireEvent.click(screen.getByRole('tab', { name: /^General/ }));
    saveGeneral('FINISH_MILESTONE');
    await screen.findByText('Saved.');

    fireEvent.click(screen.getByRole('tab', { name: /^Scheduling/ }));
    expect(screen.getByLabelText('Constraint date')).toHaveValue('2026-02-02');
  });

  it('a General save that did not change the type does not re-seed', async () => {
    SAVED = row({ name: 'Handover B', constraintDate: '2026-03-03', version: 2 });
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Handover B' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await screen.findByText('Saved.');

    fireEvent.click(screen.getByRole('tab', { name: /^Scheduling/ }));
    expect(screen.getByLabelText('Constraint date')).toHaveValue('2026-01-12');
  });
});
