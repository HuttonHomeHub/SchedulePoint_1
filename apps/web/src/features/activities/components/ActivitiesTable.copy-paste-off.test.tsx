import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The **rollback contract** for activity copy/paste on this surface: with
 * `VITE_ACTIVITY_COPY_PASTE` off, the row menu is exactly what it was — no Duplicate — even when a
 * host has wired `onDuplicate`.
 *
 * That last clause is the point. The flag and the prop are two independent gates, and a rollback
 * that only removed the host wiring would leave the item reachable from any other host that still
 * passed the prop. Pinned by mocking the flag off rather than relying on its default.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_COPY_PASTE_ENABLED: false,
}));

const BASE: Pick<ActivitySummary, 'id' | 'name' | 'type' | 'parentId'> = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  parentId: null,
};

describe('ActivitiesTable — VITE_ACTIVITY_COPY_PASTE off (parity)', () => {
  it('offers no Duplicate, even with the host prop wired', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [
      { ...BASE, id: 'c1', name: 'Excavate' },
    ]);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          orgSlug="acme"
          planId="pl1"
          canEditSchedule
          calendars={[]}
          onDuplicate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Excavate' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument();
    // The neighbours it sits between are untouched, so a rollback is the prior menu exactly.
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });
});
