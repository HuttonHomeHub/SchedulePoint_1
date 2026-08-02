import { WorkingWeekdays } from '@repo/types';
import type { CalendarSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ResourceFormDialog } from './ResourceFormDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * The resource calendar picker under `VITE_LIBRARY_SCOPING` (ADR-0053 §2). The resource pool is
 * org-global (ADR-0039), so the API **hard-rejects** a project-scoped calendar on a resource — this
 * suite pins the two halves of that: the picker is fed the ORGANISATION list only (the route reads
 * the default `?scope=org` list, so a project calendar is never even offered), and if one somehow
 * reaches the wire the 422 comes back as a plain explanation rather than a raw code.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

const RESOURCE: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: null,
  description: null,
  kind: 'LABOUR',
  parentId: null,
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
  archivedAt: null,
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const ORG_CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-org',
    name: 'Standard',
    description: null,
    workingWeekdays: 31,
    shifts: WorkingWeekdays.toFullDayShifts(31),
    hoursPerDay: 24,
    hoursPerDayMinutes: 1440,
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderDialog(props: Partial<React.ComponentProps<typeof ResourceFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourceFormDialog
        orgSlug="acme"
        open
        onClose={vi.fn()}
        calendars={ORG_CALENDARS}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const field = (): HTMLElement => screen.getByRole('combobox', { name: 'Calendar' });

describe('ResourceFormDialog — organisation-only calendars (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(RESOURCE);
  });

  it('offers organisation calendars only — never a tier group, never a project calendar', () => {
    renderDialog();
    fireEvent.keyDown(field(), { key: 'ArrowDown' });

    // No tier groups: there is exactly one tier here, by construction.
    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.queryAllByRole('group')).toHaveLength(0);
    expect(
      listbox.getAllByRole('option').map((option) => option.getAttribute('aria-label')),
    ).toEqual(['Plan default (inherit)', 'Standard']);
  });

  it('searches the organisation library from the keyboard', () => {
    renderDialog({
      calendars: [...ORG_CALENDARS, { ...ORG_CALENDARS[0]!, id: 'cal-24', name: '24-hour' }],
    });
    fireEvent.change(field(), { target: { value: '24' } });

    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.getByRole('option', { name: '24-hour' })).toBeInTheDocument();
    expect(listbox.queryByRole('option', { name: 'Standard' })).not.toBeInTheDocument();
  });

  it('keeps an archived seeded calendar selected and badged, but offers no other archived one', () => {
    const archived = {
      ...ORG_CALENDARS[0]!,
      id: 'cal-old',
      name: 'Old shifts',
      archivedAt: '2026-07-01T00:00:00Z',
    };
    const otherArchived = { ...archived, id: 'cal-gone', name: 'Retired shifts' };
    renderDialog({
      calendars: [...ORG_CALENDARS, archived, otherArchived],
      resource: { ...RESOURCE, calendarId: 'cal-old' },
    });

    expect(field()).toHaveValue('Old shifts');
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Old shifts, Archived' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('option', { name: /Retired shifts/ })).not.toBeInTheDocument();
  });

  it('submits the calendar chosen with the keyboard', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Crane' } });
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    fireEvent.keyDown(field(), { key: 'End' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string) as {
      calendarId?: string;
    };
    expect(body.calendarId).toBe('cal-org');
  });

  it('has no axe violations with the picker open', async () => {
    const { container } = renderDialog();
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect((await axe(container)).violations).toEqual([]);
  });

  it('says why, so a planner who expected their project calendar isn’t left guessing', () => {
    renderDialog();
    expect(screen.getByText(/Organisation calendars only/)).toBeInTheDocument();
  });

  it('maps a 422 RESOURCE_REQUIRES_ORG_CALENDAR to a plain explanation + remedy', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Validation failed.',
        details: { reason: 'RESOURCE_REQUIRES_ORG_CALENDAR' },
      }),
    );
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Crane' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create resource' }));

    expect(
      await screen.findByText(/resource can only use an organisation-wide calendar/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Promote the calendar to the organisation library/),
    ).toBeInTheDocument();
  });
});
