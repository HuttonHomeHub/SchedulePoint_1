import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';
import { openActivityEditor } from '../lib/activity-editor-intent';

import { ActivitiesTable } from './ActivitiesTable';
import { ActivityEditorDialog } from './ActivityEditorDialog';

import { expectInert } from '@/components/ui/scope-save-bar-assertions';

/**
 * M5 — entry-point convergence. The flag it forced ON retired in ADR-0089; the editor is now the only surface, so there is nothing to force.
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

/**
 * **A host, because the table no longer mounts an editor** (Graphite M6-T4).
 *
 * It used to hold its own `editorIntent` and its own `ActivityEditorDialog`, beside the
 * workspace's — two mounts, two sets of scope forms and two dirty states for one activity, and
 * after M6-T2 two different chromes for the same Edit. The row actions call `onOpenEditor` now and
 * the workspace decides.
 *
 * This test grew a five-line host rather than losing its assertions, and that is the honest trade:
 * the property under test is *the whole chain* — a row action reaches one editor on the right tab —
 * so testing the table's callback alone would prove the door opens and nothing about the room.
 */
function Host({
  gating,
  canEditSchedule,
}: {
  gating: ReturnType<typeof deriveActivityEditorGating>;
  canEditSchedule: boolean;
}): React.ReactElement {
  const [intent, setIntent] = useState<ReturnType<typeof openActivityEditor> | null>(null);
  const activity = intent ? BASE : undefined;
  return (
    <>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canEditSchedule={canEditSchedule}
        canReportProgress
        editorGating={gating}
        onOpenEditor={(a, purpose) => setIntent(openActivityEditor(a, purpose))}
      />
      <ActivityEditorDialog
        orgSlug="acme"
        planId="pl1"
        open={intent !== null}
        onClose={() => setIntent(null)}
        gating={gating}
        activity={activity}
        planActivities={[BASE]}
        {...(intent ? { intent } : {})}
      />
    </>
  );
}

function renderTable(gating = PLANNER_WITH_PEN, canEditSchedule = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [BASE]);
  return render(
    <QueryClientProvider client={queryClient}>
      <Host gating={gating} canEditSchedule={canEditSchedule} />
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
    rowAction('Progress');
    expect(screen.getByRole('tablist', { name: 'Activity sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Progress', selected: true })).toBeInTheDocument();
  });

  /**
   * **The capability did not leave with the button** (`docs/specs/object-bar-defects/` M1).
   *
   * This case used to drive `rowAction('Steps')` and assert the Weighted-steps heading took focus.
   * `Steps` is gone — it opened this very tab, differing from `Progress` only in where focus landed
   * — so the assertion moves to what a planner must still be able to do: open Progress and find the
   * weighted steps on it.
   *
   * Focus is deliberately NOT asserted here any more. It was `Steps`'s contribution, and claiming
   * it of `Progress` would pin behaviour nothing produces. The `focusSteps` mapping itself is still
   * covered by `activity-editor-intent.test.ts`, which is where a pure mapping belongs.
   */
  it('reaches the Weighted steps panel through Progress, now that Steps is gone', () => {
    renderTable();
    expect(screen.queryByRole('menuitem', { name: 'Steps' })).not.toBeInTheDocument();
    rowAction('Progress');
    expect(screen.getByRole('tab', { name: 'Progress', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weighted steps' })).toBeInTheDocument();
  });

  it('leaves the three superseded dialogs unmounted', () => {
    renderTable();
    rowAction('Progress');
    // The old progress dialog's own title. If it were still mounted we would have two surfaces for
    // one action, which is the drift M5 exists to remove.
    expect(screen.queryByRole('heading', { name: 'Progress' })).not.toBeInTheDocument();
  });

  it('gives a Contributor the editor with progress open and the definition shut', () => {
    // Flag-off, a Contributor could only ever reach the progress dialog; Edit was writer-only. Now
    // they reach the editor and the gate — not the entry point — decides what they may change.
    renderTable(CONTRIBUTOR, false);
    rowAction('Progress');
    expect(screen.getByLabelText('Percent complete')).toBeEnabled();
    expectInert(screen.getByRole('button', { name: /save measure/i }));
    // …and Cost is not merely disabled but absent, because there is nothing there to read.
    expect(screen.queryByRole('tab', { name: 'Cost' })).not.toBeInTheDocument();
  });
});
