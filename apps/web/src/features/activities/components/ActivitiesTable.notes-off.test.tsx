import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { anActivity } from '@/test/activity-fixture';

/**
 * Flag-OFF invisibility (ADR-0046): with `VITE_NOTES` off, the note count badge never renders — even
 * if a count map is passed — so the activities table is byte-identical to today. `NOTES_ENABLED` is
 * the config default (off), asserted explicitly here by NOT overriding it.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NOTES_ENABLED: false,
}));

const BASE: ActivitySummary = anActivity({
  planId: 'pl1',
  earlyStart: null,
  earlyFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  accrualType: 'UNIFORM',
});

describe('ActivitiesTable — note count badge (flag off)', () => {
  it('renders no badge even when a count map is supplied', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [
      { ...BASE, id: 'a1', name: 'Annotated' },
    ]);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule
          noteCountByActivityId={new Map([['a1', 3]])}
        />
      </QueryClientProvider>,
    );
    const row = screen.getByText('Annotated').closest('tr')!;
    expect(within(row).queryByText('3 notes')).not.toBeInTheDocument();
  });
});
