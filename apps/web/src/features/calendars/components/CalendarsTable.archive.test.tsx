import type { CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { CalendarsTable } from './CalendarsTable';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch, apiFetchAllPages } from '@/lib/api/client';

/**
 * The calendar library's M4 management layer with `VITE_LIBRARY_SCOPING` ON (ADR-0053 §4 / US-7 +
 * US-8): server-side search, the archived filter, the `Archived` badge and the archive/unarchive
 * actions. The flag-OFF parity assertions live in `library-scoping-flag-off.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
}));

function calendar(overrides: Partial<CalendarSummary> & { id: string }): CalendarSummary {
  return {
    name: overrides.id,
    description: null,
    workingWeekdays: 31,
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const STANDARD = calendar({ id: 'cal-1', name: 'Standard' });
const RETIRED = calendar({
  id: 'cal-2',
  name: 'Winter shutdown',
  archivedAt: '2026-07-01T00:00:00Z',
});

/** Every list URL the component asked for, in order. */
function listPaths(): string[] {
  return vi.mocked(apiFetchAllPages).mock.calls.map(([path]) => path);
}

function renderTable(rows: CalendarSummary[] = [STANDARD, RETIRED]) {
  vi.mocked(apiFetchAllPages).mockResolvedValue(rows);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarsTable orgSlug="acme" canWrite />
    </QueryClientProvider>,
  );
}

describe('CalendarsTable — search & archive (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined);
    vi.mocked(apiFetchAllPages).mockReset();
  });

  it('badges an archived row, and says archiving is not deleting', async () => {
    renderTable();
    const row = (await screen.findByText('Winter shutdown')).closest('tr');
    expect(within(row!).getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText(/Everything already using it keeps working/)).toBeInTheDocument();
  });

  it('pushes the search term to the server, debounced', async () => {
    renderTable();
    await screen.findByText('Standard');
    fireEvent.change(screen.getByLabelText('Search calendars'), { target: { value: 'winter' } });

    await waitFor(() => expect(listPaths().some((path) => path.includes('q=winter'))).toBe(true));
    // The whole-library read is preserved: it is still the paging helper, never a single page.
    expect(listPaths().every((path) => !path.includes('limit='))).toBe(true);
  });

  it('leaves the URL bare while nothing is filtered', async () => {
    renderTable();
    await screen.findByText('Standard');
    expect(listPaths()[0]).toBe('/organizations/acme/calendars');
  });

  it('"Show archived" moves the request between exclude / include / only', async () => {
    renderTable();
    await screen.findByText('Standard');
    const filter = screen.getByLabelText('Show archived');

    fireEvent.change(filter, { target: { value: 'include' } });
    await waitFor(() =>
      expect(listPaths().some((path) => path.includes('archived=include'))).toBe(true),
    );

    fireEvent.change(filter, { target: { value: 'only' } });
    await waitFor(() =>
      expect(listPaths().some((path) => path.includes('archived=only'))).toBe(true),
    );
  });

  it('archives a row with its version, and unarchives an archived one', async () => {
    renderTable();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Standard' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/calendars/cal-1/archive', {
      method: 'POST',
      body: JSON.stringify({ version: 3 }),
    });

    vi.mocked(apiFetch).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive Winter shutdown' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/calendars/cal-2/unarchive', {
      method: 'POST',
      body: JSON.stringify({ version: 3 }),
    });
  });

  it('surfaces a stale-version 409 rather than failing silently', async () => {
    renderTable();
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'This was changed elsewhere.' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Standard' }));

    expect(await screen.findByText('This was changed elsewhere.')).toBeInTheDocument();
  });

  it('offers a way back from a filtered-to-nothing list, never a bare blank', async () => {
    renderTable([]);
    fireEvent.change(screen.getByLabelText('Search calendars'), { target: { value: 'zzz' } });

    expect(await screen.findByText('No calendars match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Search calendars')).toHaveValue('');
    // …and with nothing filtered it reads as an empty LIBRARY, which is a different situation.
    expect(await screen.findByText(/No calendars yet/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderTable();
    await screen.findByText('Standard');
    expect((await axe(container)).violations).toEqual([]);
  });
});
