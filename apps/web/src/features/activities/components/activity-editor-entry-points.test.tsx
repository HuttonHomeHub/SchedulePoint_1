import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivitiesTable } from './ActivitiesTable';

import { expectInert } from '@/components/ui/scope-save-bar-assertions';

/**
 * M5 — entry-point convergence, with `VITE_ACTIVITY_EDITOR_TABS` forced ON.
 *
 * The property under test is that **Edit**, **Report progress** and **Steps** are three doors into
 * one room. Before this milestone they were three dialogs, and the drift that produced was real: a
 * Contributor could reach the progress dialog but not the row's other surfaces, and the pen rule for
 * steps differed between the client and the server (ADR-0060 M0).
 *
 * The companion `.flag-off` expectations live in the existing `ActivitiesTable` suites, which mount
 * without `editorGating` and still see the legacy dialogs — that is the rollback contract, and it is
 * why this file forces the flag rather than the shipped default flipping under those tests.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_EDITOR_TABS_ENABLED: true,
  EARNED_VALUE_ENABLED: true,
  ACTIVITY_STEPS_ENABLED: true,
}));

const BASE = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  type: 'TASK',
  durationDays: 5,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  status: 'NOT_STARTED',
  percentComplete: 0,
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

const CONTRIBUTOR = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: false,
  canProgress: true,
  canReadCost: false,
});

function renderTable(gating = PLANNER_WITH_PEN, canEditSchedule = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [BASE]);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canEditSchedule={canEditSchedule}
        canReportProgress
        editorGating={gating}
      />
    </QueryClientProvider>,
  );
}

/** Open the row's ⋯ menu and pick an action by its visible label. */
function rowAction(label: string): void {
  const row = screen.getByText('Excavate').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: /actions/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
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

describe('activity editor entry points (flag on)', () => {
  it('opens the same tabbed editor from Edit, on General', () => {
    renderTable();
    rowAction('Edit');
    expect(screen.getByRole('tablist', { name: 'Activity sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'General', selected: true })).toBeInTheDocument();
  });

  it('opens that same editor from Report progress, on Progress', () => {
    renderTable();
    rowAction('Report progress');
    expect(screen.getByRole('tablist', { name: 'Activity sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Progress', selected: true })).toBeInTheDocument();
  });

  it('opens it from Steps too, focused on the Weighted steps panel', async () => {
    renderTable();
    rowAction('Steps');
    expect(screen.getByRole('tab', { name: 'Progress', selected: true })).toBeInTheDocument();
    // Not merely the right tab: the right place within it. Landing at the top of a three-panel tab
    // would make Steps feel like it opened the wrong thing.
    const heading = await screen.findByRole('heading', { name: 'Weighted steps' });
    expect(document.activeElement).toBe(heading);
  });

  it('leaves the three superseded dialogs unmounted', () => {
    renderTable();
    rowAction('Report progress');
    // The old progress dialog's own title. If it were still mounted we would have two surfaces for
    // one action, which is the drift M5 exists to remove.
    expect(screen.queryByRole('heading', { name: 'Report progress' })).not.toBeInTheDocument();
  });

  it('gives a Contributor the editor with progress open and the definition shut', () => {
    // Flag-off, a Contributor could only ever reach the progress dialog; Edit was writer-only. Now
    // they reach the editor and the gate — not the entry point — decides what they may change.
    renderTable(CONTRIBUTOR, false);
    rowAction('Report progress');
    expect(screen.getByLabelText('Percent complete')).toBeEnabled();
    expectInert(screen.getByRole('button', { name: /save measure/i }));
    // …and Cost is not merely disabled but absent, because there is nothing there to read.
    expect(screen.queryByRole('tab', { name: 'Cost' })).not.toBeInTheDocument();
  });
});
