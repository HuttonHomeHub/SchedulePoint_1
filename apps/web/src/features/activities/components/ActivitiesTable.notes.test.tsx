import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { anActivity } from '@/test/activity-fixture';

/**
 * The activities table's per-row **note count badge** (ADR-0046) with `VITE_NOTES` forced ON. The
 * count comes from a route-composed map (fed by ONE batch `activity-counts` query, never per-row); a
 * row with ≥1 note shows the badge, and a row at zero shows none. The companion `.notes-off` suite
 * proves the flag-off invisibility.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NOTES_ENABLED: true,
}));

const BASE: ActivitySummary = anActivity({
  planId: 'pl1',
  earlyStart: null,
  earlyFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  accrualType: 'UNIFORM',
});

function renderTable(data: ActivitySummary[], noteCountByActivityId?: ReadonlyMap<string, number>) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        {...(noteCountByActivityId ? { noteCountByActivityId } : {})}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — note count badge (flag on)', () => {
  it('badges a row with notes and leaves a zero-note row bare', () => {
    renderTable(
      [
        { ...BASE, id: 'a1', name: 'Annotated' },
        { ...BASE, id: 'a2', name: 'Bare' },
      ],
      new Map([['a1', 3]]),
    );
    const annotated = screen.getByText('Annotated').closest('tr')!;
    expect(within(annotated).getByText('3 notes')).toBeInTheDocument();

    const bare = screen.getByText('Bare').closest('tr')!;
    expect(within(bare).queryByText(/notes?$/)).not.toBeInTheDocument();
  });

  it('shows no badge when the map is absent (counts not loaded)', () => {
    renderTable([{ ...BASE, id: 'a1', name: 'Annotated' }]);
    const row = screen.getByText('Annotated').closest('tr')!;
    expect(within(row).queryByText(/notes?$/)).not.toBeInTheDocument();
  });
});
