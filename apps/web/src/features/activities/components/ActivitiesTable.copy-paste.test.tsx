import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The **Duplicate row action** (`docs/specs/activity-copy-paste/` M1-T3).
 *
 * The assertion worth reading is **absent on a summary**. Duplicating one leaf of a band would
 * create a grouping with nothing in it, and copying the band with its subtree is M2 — so the action
 * is gated on `type`, the same fact `dissolve` gates on, rather than being offered and then
 * refusing. An action that appears and then explains why it cannot work is the dead-end shape
 * ADR-0064 §7 exists to prevent.
 */
const BASE: Pick<ActivitySummary, 'id' | 'name' | 'type' | 'parentId'> = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  parentId: null,
};

const ROWS = [
  { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' as const },
  { id: 'c1', name: 'Excavate', parentId: 'sum' },
];

function renderTable(props: { onDuplicate?: (a: ActivitySummary) => void } = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    activityKeys.listByPlan('acme', 'pl1'),
    ROWS.map((r) => ({ ...BASE, ...r })),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        calendars={[]}
        {...(props.onDuplicate ? { onDuplicate: props.onDuplicate } : {})}
      />
    </QueryClientProvider>,
  );
}

function openMenuFor(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return screen.getByRole('menu');
}

describe('ActivitiesTable — Duplicate, flag on', () => {
  it('offers Duplicate on an ordinary row and hands the host that row', () => {
    const onDuplicate = vi.fn();
    renderTable({ onDuplicate });
    const item = within(openMenuFor('Excavate')).getByRole('menuitem', { name: 'Duplicate' });
    fireEvent.click(item);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDuplicate.mock.calls[0]?.[0]).toMatchObject({ id: 'c1', name: 'Excavate' });
  });

  it('does NOT offer Duplicate on a summary — an empty band is not a useful copy', () => {
    renderTable({ onDuplicate: vi.fn() });
    expect(
      within(openMenuFor('Substructure')).queryByRole('menuitem', { name: 'Duplicate' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT offer Duplicate when the host has not wired it', () => {
    // A host that cannot duplicate must not show a lit item that does nothing — the ADR-0064 §7
    // shape. The prop's absence is the gate, exactly as it is for `onOpenLogic`.
    renderTable();
    expect(
      within(openMenuFor('Excavate')).queryByRole('menuitem', { name: 'Duplicate' }),
    ).not.toBeInTheDocument();
  });
});
