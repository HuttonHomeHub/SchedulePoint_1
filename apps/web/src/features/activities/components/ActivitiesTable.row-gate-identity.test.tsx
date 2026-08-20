import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * **The row menu shades from the SAME gate object the editor uses** (ADR-0082 §4).
 *
 * This is the ADR-0062 identity shape, and it exists because the failure it guards is invisible: two
 * derivations of "may this person write" both look right on their own, and only a planner who opened
 * the same activity two ways would ever see that one surface let them in and the other did not — or,
 * worse, that the two gave different reasons for the same refusal.
 *
 * Asserted through the rendered sentence rather than by reaching into a module, because that is what
 * a planner actually meets: the reason on the shaded row action must be the reason the gate carries,
 * character for character. It also closes `docs/TECH_DEBT.md` #112(5).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
}));

const ROW: Pick<ActivitySummary, 'id' | 'name' | 'type' | 'parentId'> = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  parentId: null,
};

/**
 * Built from the REAL derivation, not a hand-written literal: a fixture that invents the gate shape
 * proves the table reads *a* gate, not *the* gate. A Planner who does not hold the pen is the case
 * #111 is about.
 */
const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function renderTable() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ROW]);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule={false}
        canReportProgress
        calendars={[]}
        editorGating={GATING}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — the row menu gates on the editor’s own object', () => {
  it('shows the gate’s OWN sentence on a shaded row action, not a second one written here', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Excavate' }));
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    // Character for character. A paraphrase here would be two sentences for one refusal.
    expect(edit).toHaveAccessibleDescription(GATING.general.reason ?? '');
    // And it is a real sentence, not an empty string passing vacuously.
    expect(GATING.general.reason ?? '').not.toBe('');
  });

  it('leaves an action gated on a DIFFERENT scope actionable', () => {
    // Progress is deliberately not pen-gated (ADR-0060 Q-C), so a single fused boolean would have
    // shut it too. This is what proves the row menu reads per-scope gates rather than one flag.
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Excavate' }));
    expect(screen.getByRole('menuitem', { name: 'Report progress' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});
