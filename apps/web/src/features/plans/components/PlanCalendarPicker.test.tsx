import type { CalendarSummary, PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanCalendarPicker } from './PlanCalendarPicker';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const PLAN: PlanSummary = {
  id: 'plan-1',
  projectId: 'proj-1',
  name: 'Baseline',
  description: null,
  status: 'DRAFT',
  schedulingMode: 'EARLY',
  plannedStart: '2026-01-01',
  calendarId: 'cal-standard',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-standard',
    name: 'Standard',
    description: null,
    workingWeekdays: 31,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cal-7',
    name: 'Seven-day',
    description: null,
    workingWeekdays: 127,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderPicker(props: Partial<React.ComponentProps<typeof PlanCalendarPicker>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanCalendarPicker orgSlug="acme" plan={PLAN} calendars={CALENDARS} canEdit {...props} />
    </QueryClientProvider>,
  );
}

describe('PlanCalendarPicker', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, version: 5 });
  });

  it('shows the current calendar selected and lists the org calendars + None', () => {
    renderPicker();
    const select = screen.getByLabelText('Calendar');
    expect(select).toHaveValue('cal-standard');
    expect(screen.getByRole('option', { name: 'None (all days work)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Seven-day' })).toBeInTheDocument();
  });

  it('PATCHes the plan with the chosen calendar id and version', async () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('Calendar'), { target: { value: 'cal-7' } });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ calendarId: 'cal-7', version: 4 });
  });

  it('clears the calendar (null) when None is chosen', async () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('Calendar'), { target: { value: '' } });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ calendarId: null, version: 4 });
  });

  it('keeps the current calendar selected (not blank) while the calendars list loads', () => {
    // Plan has a calendar, but the list hasn't arrived yet — the Select must not
    // silently show "None" (which would misrepresent the plan's actual calendar).
    renderPicker({ calendars: [], calendarsLoading: true });
    const select = screen.getByLabelText('Calendar');
    expect(select).toBeDisabled();
    expect(select).toHaveValue('cal-standard');
    // A placeholder option represents the not-yet-loaded current calendar.
    expect(screen.getByRole('option', { name: 'Loading…' })).toBeInTheDocument();
  });

  it('renders read-only (no select) for a non-editor, showing the calendar name', () => {
    renderPicker({ canEdit: false });
    expect(screen.queryByLabelText('Calendar')).not.toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });

  it('shows "None (all days work)" read-only when the plan has no calendar', () => {
    renderPicker({ canEdit: false, plan: { ...PLAN, calendarId: null } });
    expect(screen.getByText('None (all days work)')).toBeInTheDocument();
  });
});
