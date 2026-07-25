import type { CalendarSummary, PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarKeys, calendarsQueryOptions } from '../api/use-calendars';

import { CalendarFormDialog } from './CalendarFormDialog';
import { CalendarsTable } from './CalendarsTable';

import { ActivityFormDialog } from '@/features/activities';
import { PlanCalendarPicker } from '@/features/plans';
import { ResourceFormDialog } from '@/features/resources';
import type * as ApiClient from '@/lib/api/client';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

/**
 * **Flag-off parity for the whole ADR-0053 §1 web surface** (library-scoping M2).
 *
 * `VITE_LIBRARY_SCOPING` defaults off, so this suite deliberately does NOT mock `@/config/env` — it
 * runs against the real, shipped configuration. Every touched screen must render exactly what it
 * rendered before the milestone: no Scope column, no scope filter, no scope control, no tier
 * grouping, no project section — and the org list must still request the same URL with no `?scope=`
 * param, so even the network traffic is unchanged. One suite covering every surface, so a future
 * change that leaks the surface past the flag fails here regardless of which component it touched.
 */

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

const ORG = calendar({ id: 'cal-org', name: 'Standard' });
// A project-scoped row: even given one, nothing flag-off may reveal the tier.
const OWN = calendar({
  id: 'cal-own',
  name: 'Site shutdown',
  scope: 'PROJECT',
  projectId: 'proj-1',
});

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

  it('the plan calendar picker stays a flat, ungrouped option list', () => {
    withClient(<PlanCalendarPicker orgSlug="acme" plan={PLAN} calendars={[ORG, OWN]} canEdit />);

    expect(document.querySelectorAll('optgroup')).toHaveLength(0);
    expect(screen.getByRole('option', { name: 'Standard' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Site shutdown' })).toBeInTheDocument();
  });

  it('the activity calendar picker stays a flat, ungrouped option list', () => {
    withClient(
      <ActivityFormDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={vi.fn()}
        calendars={[ORG, OWN]}
      />,
    );

    expect(document.querySelectorAll('optgroup')).toHaveLength(0);
  });

  it('the resource calendar picker gains no organisation-only note', () => {
    withClient(<ResourceFormDialog orgSlug="acme" open onClose={vi.fn()} calendars={[ORG]} />);

    expect(screen.queryByText(/Organisation calendars only/)).not.toBeInTheDocument();
  });
});
