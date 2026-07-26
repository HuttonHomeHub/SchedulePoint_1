import type { CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys } from '../api/use-calendars';

import { ProjectCalendarsSection } from './ProjectCalendarsSection';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

// The section only ever renders behind the flag (the project screen gates it), so it is on here.
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
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const ORG_CALENDAR = calendar({ id: 'cal-org', name: 'Standard' });
const OWN_CALENDAR = calendar({
  id: 'cal-own',
  name: 'Site shutdown',
  scope: 'PROJECT',
  projectId: 'proj-1',
});

function renderSection({
  canWrite = true,
  canManageOrg = true,
  rows = [ORG_CALENDAR, OWN_CALENDAR],
}: { canWrite?: boolean; canManageOrg?: boolean; rows?: CalendarSummary[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(calendarKeys.forProject('acme', 'proj-1'), rows);
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectCalendarsSection
        orgSlug="acme"
        projectId="proj-1"
        projectName="Harbour Tower"
        canWrite={canWrite}
        canManageOrg={canManageOrg}
      />
    </QueryClientProvider>,
  );
}

describe('ProjectCalendarsSection', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('lists the calendars usable in the project, badged by tier', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Calendars' })).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Site shutdown')).toBeInTheDocument();
    expect(screen.getByText('Organisation')).toBeInTheDocument();
    expect(screen.getByText('Project: Harbour Tower')).toBeInTheDocument();
  });

  it('offers the direction-appropriate move per row', () => {
    renderSection();

    expect(
      screen.getByRole('button', { name: 'Move to this project: Standard' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move to organisation: Site shutdown' }),
    ).toBeInTheDocument();
  });

  it('hides both moves from a writer without calendar:manage_org', () => {
    renderSection({ canManageOrg: false });

    expect(screen.queryByRole('button', { name: /^Move /i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Standard' })).toBeInTheDocument();
  });

  it('narrows an organisation calendar to THIS project (scope + projectId + version only)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...ORG_CALENDAR, scope: 'PROJECT' });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Move to this project: Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/calendars/cal-org');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      version: 1,
      scope: 'PROJECT',
      projectId: 'proj-1',
    });
  });

  it('surfaces the 409 narrowing block WITH its per-class counts', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'Narrowing blocked.',
        details: {
          reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED',
          count: 5,
          plans: 2,
          activities: 3,
          resources: 0,
        },
      }),
    );
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Move to this project: Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByText(/still used outside/i)).toBeInTheDocument();
    expect(screen.getByText(/2 plans and 3 activities/)).toBeInTheDocument();
  });

  it('gives a reader a read-only View and no create affordance', () => {
    renderSection({ canWrite: false });

    expect(screen.getByRole('button', { name: 'View Standard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New calendar' })).not.toBeInTheDocument();
  });

  it('shows an empty state when the project has no usable calendars', () => {
    renderSection({ rows: [] });
    expect(screen.getByText(/No calendars available/)).toBeInTheDocument();
  });

  /**
   * The M6 ux-review fold. Without these, archiving a project calendar removed it from the ONE
   * screen that lists the project's calendars, with no badge, no filter and no way back — which is
   * exactly how "archive" comes to read as "delete", this feature's named top usability risk.
   */
  describe('archive', () => {
    const ARCHIVED_OWN = calendar({
      id: 'cal-archived',
      name: 'Winter shutdown',
      scope: 'PROJECT',
      projectId: 'proj-1',
      archivedAt: '2026-02-01T00:00:00Z',
    });

    it('explains that archiving is not deleting, and offers the archived filter', () => {
      renderSection();
      expect(screen.getByLabelText('Show archived')).toHaveValue('exclude');
      expect(screen.getByText(/keeps working and still schedules exactly as before/)).toBeVisible();
    });

    it('archives one of the project’s OWN calendars, never a shared organisation one', () => {
      renderSection();
      expect(screen.getByRole('button', { name: 'Archive Site shutdown' })).toBeInTheDocument();
      // "Standard" is an ORG calendar: retiring shared tenant state belongs on the org library.
      expect(screen.queryByRole('button', { name: 'Archive Standard' })).not.toBeInTheDocument();
    });

    it('badges an archived row and offers Unarchive', async () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      });
      // The archived row only appears once the filter includes it — which is the point.
      queryClient.setQueryData(calendarKeys.forProject('acme', 'proj-1', { archived: 'include' }), [
        ARCHIVED_OWN,
      ]);
      queryClient.setQueryData(calendarKeys.forProject('acme', 'proj-1'), []);
      render(
        <QueryClientProvider client={queryClient}>
          <ProjectCalendarsSection
            orgSlug="acme"
            projectId="proj-1"
            projectName="Harbour Tower"
            canWrite
            canManageOrg
          />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByLabelText('Show archived'), { target: { value: 'include' } });

      expect(await screen.findByText('Winter shutdown')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unarchive Winter shutdown' })).toBeInTheDocument();
    });

    it('hides the archive action from a reader', () => {
      renderSection({ canWrite: false });
      expect(screen.queryByRole('button', { name: /^Archive /i })).not.toBeInTheDocument();
    });
  });
});
