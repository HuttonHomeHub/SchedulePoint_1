import { WorkingWeekdays } from '@repo/types';
import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resourceKeys } from '../api/use-resources';

import { ResourcesTable } from './ResourcesTable';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

// `LIBRARY_SCOPING_ENABLED` is pinned OFF so this suite keeps documenting the BASE library table —
// a flat list with no search field, no kind/archived filters, no Group column and no archive row
// action (ADR-0039). The flag-on surface is asserted by the sibling `ResourcesTable.hierarchy` and
// `ResourcesTable.archive` suites (ADR-0053 §3/§4).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

const RESOURCES: ResourceSummary[] = [
  {
    id: 'res-1',
    name: 'Crew A',
    code: 'CRW-A',
    description: null,
    kind: 'LABOUR',
    parentId: null,
    maxUnitsPerHour: null,
    costPerUnit: null,
    calendarId: 'cal-1',
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'res-2',
    name: 'Concrete',
    code: null,
    description: null,
    kind: 'MATERIAL',
    parentId: null,
    maxUnitsPerHour: null,
    costPerUnit: null,
    calendarId: null,
    archivedAt: null,
    version: 2,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

function renderTable(
  canWrite: boolean,
  data: ResourceSummary[] | undefined = RESOURCES,
  seedList = true,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seedList) queryClient.setQueryData(resourceKeys.list('acme'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourcesTable
        orgSlug="acme"
        canWrite={canWrite}
        calendars={[
          {
            id: 'cal-1',
            name: 'Standard',
            description: null,
            workingWeekdays: 31,
            shifts: WorkingWeekdays.toFullDayShifts(31),
            hoursPerDay: 24,
            hoursPerDayMinutes: 1440,
            // Every fixture is a shared organisation calendar — the only tier before ADR-0053.
            scope: 'ORG',
            projectId: null,
            archivedAt: null,
            version: 1,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ]}
      />
    </QueryClientProvider>,
  );
}

/** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
describe('ResourcesTable', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('shows a loading state before the list resolves', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderTable(true, undefined, false);
    expect(screen.getByText('Loading resources…')).toBeInTheDocument();
  });

  it('renders each resource with its kind, code and calendar name plus write actions', () => {
    renderTable(true);

    // Kind assertions are scoped to their ROW: the Kind filter above the table offers "Labour" and
    // "Material" as options too, which it did not while `VITE_LIBRARY_SCOPING` gated the filter bar
    // (ADR-0088 D3). The claim is unchanged — this row shows this kind — only the scope is.
    const crewRow = within(screen.getByRole('row', { name: /Crew A/ }));
    expect(crewRow.getByText('Crew A')).toBeInTheDocument();
    expect(crewRow.getByText('Labour')).toBeInTheDocument();
    expect(crewRow.getByText('CRW-A')).toBeInTheDocument();
    expect(crewRow.getByText('Standard')).toBeInTheDocument();
    const concreteRow = within(screen.getByRole('row', { name: /Concrete/ }));
    expect(concreteRow.getByText('Concrete')).toBeInTheDocument();
    expect(concreteRow.getByText('Material')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Crew A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Concrete' })).toBeInTheDocument();
  });

  it('hides write actions for non-writers but offers a read-only View', () => {
    renderTable(false);
    expect(screen.queryByRole('button', { name: 'Edit Crew A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Crew A' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no resources', () => {
    renderTable(true, []);
    expect(screen.getByText(/No resources yet/)).toBeInTheDocument();
  });

  it('surfaces a friendly in-use message when a delete is blocked (409)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'Resource in use.',
        details: { reason: 'RESOURCE_IN_USE' },
      }),
    );
    renderTable(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Crew A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/Assigned to one or more activities/)).toBeInTheDocument();
  });
});
