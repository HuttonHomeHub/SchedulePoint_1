import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * **Row-level isolation — one checkbox tick must not re-render the other rows**
 * (`docs/TECH_DEBT.md` #334, M2-F2; `docs/specs/activities-panel-scale/`).
 *
 * Every row's Name cell mounts a `NoteCountBadge`, so the number of times that stub renders is the
 * number of row cells whose renderer ran. Before M2 the selection lived in `ActivitiesTable`'s own
 * state and was read by closure inside each cell, so `columns` was a fresh array per toggle and
 * every row re-rendered for it — measured at 2,000 rows as the I2/I3 limbs of the M0 harness. A
 * count rather than a timing, because jsdom has no layout to time and a count is what does not
 * flake (ADR-0133 D6's shape).
 *
 * One summary is in the plan so the select column exists (`WBS_IMPROVEMENTS_ENABLED` forced on).
 */
const badgeRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));
vi.mock('@/features/notes', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NoteCountBadge: () => {
    badgeRenders.count += 1;
    return null;
  },
}));

const ROW_COUNT = 30;

function seed(): ActivitySummary[] {
  const rows: Partial<ActivitySummary>[] = [
    { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY', parentId: null },
    ...Array.from({ length: ROW_COUNT }, (_, i) => ({
      id: `a${i}`,
      name: `Activity ${i}`,
      type: 'TASK' as const,
      parentId: null,
    })),
  ];
  return rows as ActivitySummary[];
}

function renderTable() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), seed());
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        calendars={[]}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — row isolation (M2)', () => {
  beforeEach(() => {
    badgeRenders.count = 0;
  });

  it('re-renders at most the one row whose checkbox was toggled', () => {
    renderTable();
    expect(badgeRenders.count).toBeGreaterThanOrEqual(ROW_COUNT + 1);
    badgeRenders.count = 0;

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Activity 7' }));

    expect(screen.getByRole('checkbox', { name: 'Select Activity 7' })).toBeChecked();
    expect(badgeRenders.count).toBeLessThanOrEqual(1);
  });

  it('re-renders at most one row when a row menu opens', () => {
    renderTable();
    badgeRenders.count = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Activity 7' }));

    expect(screen.getByRole('menu', { name: 'Actions for Activity 7' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Activity 7' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(badgeRenders.count).toBeLessThanOrEqual(1);
  });
});
