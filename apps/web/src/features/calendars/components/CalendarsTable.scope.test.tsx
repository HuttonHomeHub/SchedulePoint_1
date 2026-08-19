import { WorkingWeekdays } from '@repo/types';
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
    shifts: WorkingWeekdays.toFullDayShifts(31),
    hoursPerDay: 24,
    hoursPerDayMinutes: 1440,
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
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

/**
 * Open a row's `⋯` and click one of its secondary actions (ADR-0097 Landing F1).
 *
 * These were five text buttons per row until that landing; now the row's primary action (`Edit`)
 * stays visible and the rest sit behind a trigger. The **menu** carries the subject
 * (`Actions for <name>`), so the items are plain verbs — which is why this helper takes the row
 * name and the verb separately rather than the old `"Archive Standard"` composite.
 */
async function rowAction(calendarName: string, action: string | RegExp): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${calendarName}` }));
  fireEvent.click(
    await within(
      await screen.findByRole('menu', { name: `Actions for ${calendarName}` }),
    ).findByRole('menuitem', { name: action }),
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

  /** Open one row's `⋯` without selecting anything, to inspect what it offers. */
  async function openRowMenu(calendarName: string): Promise<HTMLElement> {
    fireEvent.click(await screen.findByRole('button', { name: `Actions for ${calendarName}` }));
    return screen.findByRole('menu', { name: `Actions for ${calendarName}` });
  }

  it('offers Move to organisation only for project-scoped rows', async () => {
    renderTable();
    expect(
      within(await openRowMenu('Site shutdown')).getByRole('menuitem', {
        name: 'Move to organisation',
      }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    // **Omitted, not shaded** — and that is the other half of ADR-0082. An ORG calendar is already
    // in the shared library, so the action does not apply to the object at all; shading it would
    // offer a reader something that could never become available.
    expect(
      within(await openRowMenu('Standard')).queryByRole('menuitem', {
        name: 'Move to organisation',
      }),
    ).not.toBeInTheDocument();
  });

  it('shades the tier move — with its reason — for a writer without calendar:manage_org', async () => {
    renderTable({ canManageOrg: false });

    // **This asserted the item was HIDDEN until ADR-0097 Landing F1**, and the change is the point
    // rather than a locator update: hiding it means a planner never learns the row can do the thing
    // and never learns what would let them (ADR-0082). It is shaded, still an arrow-key stop, and
    // carries the reason.
    const item = within(await openRowMenu('Site shutdown')).getByRole('menuitem', {
      name: 'Move to organisation',
    });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(/Org Admin or Planner/);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    // The ordinary write actions are untouched — only the shared-library act is gated.
    expect(screen.getByRole('button', { name: 'Edit Site shutdown' })).toBeInTheDocument();
  });

  it('PATCHes only the tier + version when promoting (never the untouched name/pattern)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...PROJECT_CALENDAR, scope: 'ORG' });
    renderTable();

    await rowAction('Site shutdown', 'Move to organisation');
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

    await rowAction('Site shutdown', 'Move to organisation');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByText('This calendar changed. Reload.')).toBeInTheDocument();
  });
});
