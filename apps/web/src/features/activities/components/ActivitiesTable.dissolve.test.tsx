import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The table's **Dissolve** row action (WBS improvements M2) with `VITE_WBS_IMPROVEMENTS` forced on.
 * The copy itself is unit-tested in `lib/delete-activity-copy.test.ts`; what this pins is the
 * things a unit test of a pure function cannot see:
 *
 * - the action exists on a summary and **only** on a summary (the server 422s `NOT_A_SUMMARY`, so
 *   an action that reached it would be a dead end with a stack trace at the end of it);
 * - it sits immediately **before** Delete, because the two are neighbours in intent and opposites
 *   in effect — a planner choosing "get rid of this grouping" has to see the one that keeps the
 *   work at the moment they are choosing the one that does not;
 * - the confirm is **not** dressed as destructive, since it destroys nothing but the grouping.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

const BASE: Pick<ActivitySummary, 'id' | 'name' | 'type' | 'parentId'> = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  parentId: null,
};

function renderTable(rows: Partial<ActivitySummary>[], canEditSchedule = true) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    activityKeys.listByPlan('acme', 'pl1'),
    rows.map((r) => ({ ...BASE, ...r })),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canEditSchedule={canEditSchedule}
        calendars={[]}
      />
    </QueryClientProvider>,
  );
}

function openMenuFor(name: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return screen.getByRole('menu');
}

const SUMMARY_WITH_CHILDREN = [
  { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' as const },
  { id: 'c1', name: 'Excavate', parentId: 'sum' },
  { id: 'c2', name: 'Blind', parentId: 'sum' },
];

describe('ActivitiesTable — Dissolve row action (flag on)', () => {
  it('offers Dissolve on a summary, immediately before Delete', () => {
    renderTable(SUMMARY_WITH_CHILDREN);
    const items = within(openMenuFor('Substructure'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toContain('Dissolve');
    expect(items.indexOf('Dissolve')).toBe(items.indexOf('Delete') - 1);
  });

  it('does not offer Dissolve on a plain activity', () => {
    renderTable([{ id: 'c1', name: 'Excavate' }]);
    expect(
      within(openMenuFor('Excavate')).queryByRole('menuitem', { name: 'Dissolve' }),
    ).not.toBeInTheDocument();
  });

  // Dissolve is a pen-gated structural write (it reparents rows and soft-deletes one), so it rides
  // the same `canEditSchedule` gate as Edit and Delete rather than a rule of its own.
  it('does not offer Dissolve without edit rights', () => {
    renderTable(SUMMARY_WITH_CHILDREN, false);
    // The row menu still opens without edit rights (Logic is read-only), so this assertion really
    // runs rather than vacuously passing on an absent trigger.
    const menu = openMenuFor('Substructure');
    expect(within(menu).queryByRole('menuitem', { name: 'Dissolve' })).not.toBeInTheDocument();
  });

  it('confirms with copy that says the work is kept and where it goes', () => {
    renderTable(SUMMARY_WITH_CHILDREN);
    fireEvent.click(
      within(openMenuFor('Substructure')).getByRole('menuitem', { name: 'Dissolve' }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/keeps the work/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/its 2 activities move up to the top level/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/will NOT put them back/)).toBeInTheDocument();
  });

  /**
   * The regression that matters most here is a *visual* one, and it is the kind that passes a read:
   * dressing Dissolve in the delete red tells the eye the opposite of what the sentence says, and
   * the eye wins. `destructive` renders `bg-destructive`, so its absence is checkable.
   */
  it('does not dress the confirm as destructive', () => {
    renderTable(SUMMARY_WITH_CHILDREN);
    fireEvent.click(
      within(openMenuFor('Substructure')).getByRole('menuitem', { name: 'Dissolve' }),
    );
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Dissolve',
    });
    expect(confirm.className).not.toContain('destructive');
  });
});
