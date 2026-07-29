import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivitiesTable } from './ActivitiesTable';
import { ActivityEditorDialog } from './ActivityEditorDialog';

/**
 * **Flag-OFF parity** for the convergence epic — the rollback contract.
 *
 * `VITE_ACTIVITY_EDITOR_CONVERGENCE` off must leave the editor's rail exactly as ADR-0060 shipped
 * it and leave **Logic** delegating to the host's dialog. Kept, not weakened, on the day it becomes
 * inconvenient: a parity suite rewritten to describe the new behaviour stops being one, and there
 * is then nothing left saying what "back" meant (ADR-0053 M6).
 *
 * It asserts by **role and label**, never by structure, so it pins the surface rather than the
 * implementation that happens to produce it.
 *
 * One thing this suite deliberately does *not* claim: that flag-off is the pre-epic surface. It is
 * not — the inline add-link form (M1) landed unflagged inside the Logic dialog. That is stated in
 * the spec (§4.10) and is why M1 shipped early enough to soak.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED: false,
  ACTIVITY_EDITOR_TABS_ENABLED: true,
  RESOURCES_ENABLED: true,
}));

const ROW = {
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

describe('convergence flag-off — the editor rail', () => {
  it('has exactly the four ADR-0060 tabs, with no Logic and no Resources', () => {
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
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'General',
      'Scheduling',
      'Progress',
      'Cost',
    ]);
  });
});

describe('convergence flag-off — the row menu', () => {
  it('leaves Logic delegating to the host, which opens the Logic dialog', () => {
    const onOpenLogic = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ROW]);
    render(
      <QueryClientProvider client={client}>
        <ActivitiesTable
          orgSlug="acme"
          planId="pl1"
          canEditSchedule
          editorGating={PLANNER_WITH_PEN}
          onOpenLogic={onOpenLogic}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Excavate' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Logic' }));
    expect(onOpenLogic).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('leaves Resources opening the table’s own dialog, not the host', () => {
    const onOpenResources = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ROW]);
    render(
      <QueryClientProvider client={client}>
        <ActivitiesTable
          orgSlug="acme"
          planId="pl1"
          canEditSchedule
          editorGating={PLANNER_WITH_PEN}
          onOpenResources={onOpenResources}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Excavate' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Resources' }));
    // The host callback exists but must be ignored with the flag off — that is the contract a
    // rollback depends on, and the reason the table still mounts its own dialog.
    expect(onOpenResources).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Resources' })).toBeInTheDocument();
  });
});
