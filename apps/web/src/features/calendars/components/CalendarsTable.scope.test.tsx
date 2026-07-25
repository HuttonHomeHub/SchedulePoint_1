import type { CalendarSummary, ProjectSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys } from '../api/use-calendars';

import { CalendarsTable } from './CalendarsTable';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch, apiFetchAllPages } from '@/lib/api/client';
import { projectKeys } from '@/lib/query/hierarchy-keys';

// Flag ON: the whole ADR-0053 §1 web surface. The flag-OFF parity assertions live in the sibling
// `CalendarsTable.test.tsx`, which imports the real (default-off) config.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn().mockResolvedValue([]),
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

const ORG_CALENDAR = calendar({ id: 'cal-org', name: 'Standard' });
const PROJECT_CALENDAR = calendar({
  id: 'cal-proj',
  name: 'Site shutdown',
  scope: 'PROJECT',
  projectId: 'proj-1',
});

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  clientId: 'client-1',
  name: 'Harbour Tower',
  description: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderTable({
  canWrite = true,
  canManageOrg = true,
  rows = [ORG_CALENDAR, PROJECT_CALENDAR],
  seedProject = true,
}: {
  canWrite?: boolean;
  canManageOrg?: boolean;
  rows?: CalendarSummary[];
  seedProject?: boolean;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // Seed both the default (org) list and the "all" list so switching the filter is instant.
  queryClient.setQueryData(calendarKeys.list('acme'), rows);
  queryClient.setQueryData(calendarKeys.scoped('acme', 'all'), rows);
  queryClient.setQueryData(calendarKeys.scoped('acme', 'project'), [PROJECT_CALENDAR]);
  if (seedProject) queryClient.setQueryData(projectKeys.detail('acme', 'proj-1'), PROJECT);
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarsTable orgSlug="acme" canWrite={canWrite} canManageOrg={canManageOrg} />
    </QueryClientProvider>,
  );
}

describe('CalendarsTable — calendar scope tier (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockClear().mockResolvedValue([]);
  });

  it('badges each row with its tier, naming the owning project', () => {
    renderTable();
    // Scoped to the table: the filter Select also offers an "Organisation" option.
    const table = within(screen.getByRole('table'));

    expect(screen.getByRole('columnheader', { name: 'Scope' })).toBeInTheDocument();
    expect(table.getByText('Organisation')).toBeInTheDocument();
    // The project name is in the visible label, not a hover-only title.
    expect(table.getByText('Project: Harbour Tower')).toBeInTheDocument();
  });

  it('falls back to a plain "Project" pill when the owning project can’t be resolved', () => {
    renderTable({ seedProject: false });
    const table = within(screen.getByRole('table'));

    expect(table.getByText('Project')).toBeInTheDocument();
    expect(table.queryByText(/Project: /)).not.toBeInTheDocument();
  });

  it('offers a labelled scope filter and refetches the chosen tier', async () => {
    renderTable();
    const filter = screen.getByLabelText('Scope');
    expect(filter).toHaveValue('org');

    fireEvent.change(filter, { target: { value: 'project' } });

    await waitFor(() => expect(filter).toHaveValue('project'));
    // Only the project-scoped row remains listed.
    expect(screen.queryByText('Standard')).not.toBeInTheDocument();
    expect(screen.getByText('Site shutdown')).toBeInTheDocument();
  });

  it('offers Move to organisation only for project-scoped rows, and only with calendar:manage_org', () => {
    renderTable();
    expect(
      screen.getByRole('button', { name: 'Move to organisation: Site shutdown' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Move to organisation: Standard' }),
    ).not.toBeInTheDocument();
  });

  it('hides the tier move from a writer without calendar:manage_org', () => {
    renderTable({ canManageOrg: false });

    expect(
      screen.queryByRole('button', { name: 'Move to organisation: Site shutdown' }),
    ).not.toBeInTheDocument();
    // The ordinary write actions are untouched — only the shared-library act is gated.
    expect(screen.getByRole('button', { name: 'Edit Site shutdown' })).toBeInTheDocument();
  });

  it('PATCHes only the tier + version when promoting (never the untouched name/pattern)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...PROJECT_CALENDAR, scope: 'ORG' });
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Move to organisation: Site shutdown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/calendars/cal-proj');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ version: 1, scope: 'ORG' });
  });

  it('does not render the scope surface for a reader (no move action)', () => {
    renderTable({ canWrite: false });

    expect(screen.getByRole('columnheader', { name: 'Scope' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Move to organisation: Site shutdown' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Site shutdown' })).toBeInTheDocument();
  });

  it('surfaces an unrelated failure with the server’s own message', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'This calendar changed. Reload.' }),
    );
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Move to organisation: Site shutdown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByText('This calendar changed. Reload.')).toBeInTheDocument();
  });
});
