import type { CalendarSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
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
    scope: 'ORG',
    projectId: null,
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

describe('ResourceFormDialog — organisation-only calendars (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(RESOURCE);
  });

  it('offers organisation calendars only — never a tier group, never a project calendar', () => {
    renderDialog();
    const select = screen.getByLabelText('Calendar (optional)');

    // No `<optgroup>`: there is exactly one tier here, by construction.
    expect(select.querySelectorAll('optgroup')).toHaveLength(0);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Plan default (inherit)', 'Standard']);
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
