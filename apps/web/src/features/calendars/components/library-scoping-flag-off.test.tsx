import type { CalendarSummary, PlanSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys, calendarsQueryOptions } from '../api/use-calendars';

import { CalendarFormDialog } from './CalendarFormDialog';
import { CalendarsTable } from './CalendarsTable';

import { ActivityFormDialog } from '@/features/activities';
import { PlanCalendarPicker } from '@/features/plans';
import {
  ActivityResourcesDialog,
  ResourceFormDialog,
  ResourcesTable,
  assignmentKeys,
  resourceKeys,
} from '@/features/resources';
import type * as ApiClient from '@/lib/api/client';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

/**
 * **Flag-off parity for the whole ADR-0053 web surface** (library-scoping M2/M4).
 *
 * This is the **rollback contract**: with `VITE_LIBRARY_SCOPING=false`, every touched screen must
 * render exactly what it rendered before the epic — no Scope column, no scope filter, no scope
 * control, no tier grouping, no project section, no search box, no archived filter, and every
 * picker a flat native `<select>` — and the org list must still request the same URL with no
 * `?scope=` param, so even the network traffic is unchanged. One suite covering every surface, so a
 * change that leaks the surface past the flag fails here regardless of which component it touched.
 *
 * The flag is **explicitly pinned off** below. It shipped default-off (M2–M5) and flipped
 * default-ON at M6 enablement (2026-07-26); pinning keeps this suite asserting the rollback path
 * rather than silently becoming a duplicate of the flag-on suites when the default moved. The
 * flag-ON behaviour is asserted by the sibling suites (`CalendarsTable.scope`/`.archive`,
 * `PlanCalendarPicker.scope`, `ActivityFormDialog.scope`, `ResourceFormDialog.scope`/`.hierarchy`,
 * `ResourcesTable.hierarchy`/`.archive`, `ActivityResourcesDialog.picker`).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: false,
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

const ORG = calendar({ id: 'cal-org', name: 'Standard' });
// A project-scoped row: even given one, nothing flag-off may reveal the tier.
const OWN = calendar({
  id: 'cal-own',
  name: 'Site shutdown',
  scope: 'PROJECT',
  projectId: 'proj-1',
});

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
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const PLAN: PlanSummary = {
  id: 'plan-1',
  projectId: 'proj-1',
  name: 'Baseline',
  description: null,
  status: 'DRAFT',
  schedulingMode: 'EARLY',
  progressRecalcMode: 'RETAINED_LOGIC',
  useExpectedFinishDates: false,
  criticalPathDefinition: 'TOTAL_FLOAT',
  criticalFloatThreshold: 0,
  totalFloatMode: 'FINISH',
  makeOpenEndsCritical: false,
  ignoreExternalRelationships: false,
  levelResources: false,
  levelWithinFloatOnly: false,
  eacMethod: 'CPI',
  currencyCode: null,
  plannedStart: '2026-01-01',
  calendarId: 'cal-org',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function withClient(ui: React.ReactElement, seed?: (client: QueryClient) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  seed?.(queryClient);
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('library scoping — flag off parity', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetchAllPages).mockClear().mockResolvedValue([]);
  });

  it('the calendar library has no Scope column and no scope filter', () => {
    withClient(<CalendarsTable orgSlug="acme" canWrite />, (client) =>
      client.setQueryData(calendarKeys.list('acme'), [ORG, OWN]),
    );

    expect(screen.queryByRole('columnheader', { name: 'Scope' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Scope')).not.toBeInTheDocument();
    expect(screen.queryByText('Organisation')).not.toBeInTheDocument();
    // …and no tier move is reachable, even on a project-scoped row.
    expect(screen.queryByRole('button', { name: /^Move /i })).not.toBeInTheDocument();
    // The pre-existing actions are exactly as before.
    expect(screen.getByRole('button', { name: 'Edit Standard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Standard' })).toBeInTheDocument();
  });

  it('the org calendar list still requests the same URL, with no ?scope= param', async () => {
    const options = calendarsQueryOptions('acme');
    await options.queryFn!({} as never);

    expect(apiFetchAllPages).toHaveBeenCalledWith('/organizations/acme/calendars');
  });

  it('the create dialog has no scope control, even given a project context', () => {
    withClient(
      <CalendarFormDialog
        orgSlug="acme"
        open
        onClose={() => {}}
        projectId="proj-1"
        projectName="Harbour Tower"
      />,
    );

    expect(screen.queryByLabelText('Scope')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create calendar' })).toBeEnabled();
  });

  it('the edit dialog shows no tier badge', () => {
    withClient(<CalendarFormDialog orgSlug="acme" open onClose={() => {}} calendar={OWN} />);

    expect(screen.queryByText(/^Project/)).not.toBeInTheDocument();
    expect(screen.queryByText('Organisation')).not.toBeInTheDocument();
  });

  it('the plan calendar picker stays a native, flat, ungrouped select', () => {
    withClient(<PlanCalendarPicker orgSlug="acme" plan={PLAN} calendars={[ORG, OWN]} canEdit />);

    expect(screen.getByLabelText('Calendar').tagName).toBe('SELECT');
    expect(document.querySelectorAll('optgroup')).toHaveLength(0);
    expect(screen.getByRole('option', { name: 'Standard' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Site shutdown' })).toBeInTheDocument();
  });

  it('the activity calendar picker stays a native, flat, ungrouped select', () => {
    withClient(
      <ActivityFormDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={vi.fn()}
        calendars={[ORG, OWN]}
      />,
    );

    expect(screen.getByLabelText('Calendar').tagName).toBe('SELECT');
    expect(document.querySelectorAll('optgroup')).toHaveLength(0);
  });

  it('the resource calendar picker stays a native select and gains no organisation-only note', () => {
    withClient(<ResourceFormDialog orgSlug="acme" open onClose={vi.fn()} calendars={[ORG]} />);

    expect(screen.getByLabelText('Calendar').tagName).toBe('SELECT');
    // …and no group picker at all: the resource tree is itself behind the flag (ADR-0053 §3).
    expect(screen.queryByLabelText('Group (optional)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Organisation calendars only/)).not.toBeInTheDocument();
  });

  it('the assignment resource picker stays a native select over the whole library', () => {
    withClient(
      <ActivityResourcesDialog orgSlug="acme" activityId="act-1" open onClose={vi.fn()} canWrite />,
      (client) => {
        client.setQueryData(resourceKeys.list('acme'), [RESOURCE]);
        client.setQueryData(assignmentKeys.listByActivity('acme', 'act-1'), []);
      },
    );

    expect(screen.getByLabelText('Resource').tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Crew A (Labour)' })).toBeInTheDocument();
  });

  it('neither library screen grows a search box or an archived filter', () => {
    withClient(<CalendarsTable orgSlug="acme" canWrite />, (client) =>
      client.setQueryData(calendarKeys.list('acme'), [ORG]),
    );
    expect(screen.queryByLabelText('Search calendars')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show archived')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archive /i })).not.toBeInTheDocument();
  });

  it('the resource library grows no search, kind or archived control either', () => {
    withClient(<ResourcesTable orgSlug="acme" canWrite />, (client) =>
      client.setQueryData(resourceKeys.list('acme'), [RESOURCE]),
    );
    expect(screen.queryByLabelText('Search resources')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Kind')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show archived')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archive /i })).not.toBeInTheDocument();
  });

  it('the resource library still requests the same bare URL', async () => {
    const { resourcesQueryOptions } = await import('@/features/resources');
    await resourcesQueryOptions('acme').queryFn!({} as never);

    expect(apiFetchAllPages).toHaveBeenCalledWith('/organizations/acme/resources');
  });
});
