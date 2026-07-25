import type { CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * The per-activity calendar picker with BOTH `VITE_ACTIVITY_CALENDAR` and `VITE_LIBRARY_SCOPING` on
 * (ADR-0053 §1): the plan's project supplies its own calendars alongside the organisation's, so the
 * options group by tier. The flag-off flat list is covered by `ActivityFormDialog.calendar.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_CALENDAR_ENABLED: true,
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

function calendar(overrides: Partial<CalendarSummary> & { id: string }): CalendarSummary {
  return {
    name: overrides.id,
    description: null,
    workingWeekdays: 31,
    scope: 'ORG',
    projectId: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const ORG = calendar({ id: 'cal-org', name: '5-day week' });
const OWN = calendar({
  id: 'cal-own',
  name: 'Site shutdown',
  scope: 'PROJECT',
  projectId: 'proj-1',
});

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityFormDialog
        orgSlug="acme"
        planId="pl1"
        open
        onClose={vi.fn()}
        calendars={[ORG, OWN]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ActivityFormDialog — tier-grouped calendar picker (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue({ id: 'a1' });
  });

  it('groups the calendar options by tier, keeping inherit ungrouped at the top', () => {
    renderDialog();
    const select = screen.getByLabelText('Calendar (optional)');

    expect(
      Array.from(select.querySelectorAll('optgroup')).map((g) => g.getAttribute('label')),
    ).toEqual(['Organisation calendars', 'This project’s calendars']);
    // The inherit option is deliberately outside both groups — it is not a calendar.
    expect(
      within(select).getByRole('option', { name: 'Plan default (inherit)' }).parentElement,
    ).toBe(select);
    expect(within(select).getByRole('option', { name: 'Site shutdown' })).toBeInTheDocument();
  });

  it('stays flat when the project contributes no calendars of its own', () => {
    renderDialog({ calendars: [ORG] });
    const select = screen.getByLabelText('Calendar (optional)');
    expect(select.querySelectorAll('optgroup')).toHaveLength(0);
  });

  it('maps a 422 CALENDAR_WRONG_SCOPE on save to an actionable message', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Validation failed.',
        details: { reason: 'CALENDAR_WRONG_SCOPE' },
      }),
    );
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavate' } });
    fireEvent.click(screen.getByRole('button', { name: /Create activity|Save changes/ }));

    expect(
      await screen.findByText(/belongs to another project and can’t be used here/),
    ).toBeInTheDocument();
  });
});
