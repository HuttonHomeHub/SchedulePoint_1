import type { CalendarSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_CALENDAR_LIBRARY_FILTERS,
  type CalendarLibraryFilters,
} from '../schemas/calendar-schemas';

import { CalendarsTable } from './CalendarsTable';

import { AnnouncerProvider } from '@/components/ui/announcer';
import {
  DEFAULT_RESOURCE_LIBRARY_FILTERS,
  ResourcesTable,
  type ResourceLibraryFilters,
} from '@/features/resources';
import type * as ApiClient from '@/lib/api/client';
import { apiFetchAllPages } from '@/lib/api/client';

/**
 * **The library filters are URL state** (M6 ux-review fold; `docs/UX_STANDARDS.md` "filters live in
 * the URL", `docs/FRONTEND_ARCHITECTURE.md` typed search params).
 *
 * Both library tables are therefore *controlled*: the ROUTE owns the three filter values (it reads
 * and writes them through `useUrlFilterState`) and hands them down. This suite pins that contract —
 * a controlled table must never keep a private copy, or a reload would silently reset the view
 * while the URL still claimed otherwise. It also covers the WCAG 4.1.3 result-count announcement,
 * which a debounced search otherwise makes invisible to a screen-reader user.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
  RESOURCES_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
}));

function calendar(id: string, name: string): CalendarSummary {
  return {
    id,
    name,
    description: null,
    workingWeekdays: 31,
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function resource(id: string, name: string): ResourceSummary {
  return {
    id,
    name,
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
}

describe('library filters are owned by the route (URL state)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue([]);
  });

  it('CalendarsTable reports every filter change up and renders only what it is given', () => {
    const onFiltersChange = vi.fn();
    const filters: CalendarLibraryFilters = { ...DEFAULT_CALENDAR_LIBRARY_FILTERS };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AnnouncerProvider>
        <QueryClientProvider client={queryClient}>
          <CalendarsTable
            orgSlug="acme"
            canWrite
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </QueryClientProvider>
      </AnnouncerProvider>,
    );

    fireEvent.change(screen.getByLabelText('Search calendars'), { target: { value: 'winter' } });
    expect(onFiltersChange).toHaveBeenCalledWith({ q: 'winter' });
    // Controlled: the table did NOT adopt the term itself — the route decides.
    expect(screen.getByLabelText('Search calendars')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'all' } });
    expect(onFiltersChange).toHaveBeenCalledWith({ scope: 'all' });

    fireEvent.change(screen.getByLabelText('Show archived'), { target: { value: 'only' } });
    expect(onFiltersChange).toHaveBeenCalledWith({ archived: 'only' });
  });

  it('ResourcesTable does the same for its three filters', () => {
    const onFiltersChange = vi.fn();
    const filters: ResourceLibraryFilters = { ...DEFAULT_RESOURCE_LIBRARY_FILTERS };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AnnouncerProvider>
        <QueryClientProvider client={queryClient}>
          <ResourcesTable
            orgSlug="acme"
            canWrite
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </QueryClientProvider>
      </AnnouncerProvider>,
    );

    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'crew' } });
    expect(onFiltersChange).toHaveBeenCalledWith({ q: 'crew' });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'EQUIPMENT' } });
    expect(onFiltersChange).toHaveBeenCalledWith({ kind: 'EQUIPMENT' });
    fireEvent.change(screen.getByLabelText('Show archived'), { target: { value: 'include' } });
    expect(onFiltersChange).toHaveBeenCalledWith({ archived: 'include' });
  });

  it('still self-manages when the route passes nothing (uncontrolled fallback)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AnnouncerProvider>
        <QueryClientProvider client={queryClient}>
          <CalendarsTable orgSlug="acme" canWrite />
        </QueryClientProvider>
      </AnnouncerProvider>,
    );
    fireEvent.change(screen.getByLabelText('Search calendars'), { target: { value: 'winter' } });
    expect(screen.getByLabelText('Search calendars')).toHaveValue('winter');
  });

  it('announces the settled result count when a filter changes (WCAG 4.1.3)', async () => {
    vi.mocked(apiFetchAllPages).mockResolvedValue([calendar('c1', 'Standard')]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <AnnouncerProvider>
        <QueryClientProvider client={queryClient}>
          <CalendarsTable orgSlug="acme" canWrite />
        </QueryClientProvider>
      </AnnouncerProvider>,
    );
    await screen.findByText('Standard');
    // The first load is deliberately silent — it is not a "results changed" event.
    expect(screen.getByTestId('announcer')).toHaveTextContent('');

    vi.mocked(apiFetchAllPages).mockResolvedValue([
      calendar('c1', 'Standard'),
      calendar('c2', 'Nights'),
    ]);
    fireEvent.change(screen.getByLabelText('Show archived'), { target: { value: 'include' } });
    rerender(
      <AnnouncerProvider>
        <QueryClientProvider client={queryClient}>
          <CalendarsTable orgSlug="acme" canWrite />
        </QueryClientProvider>
      </AnnouncerProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('2 calendars found.'),
    );
  });

  it('announces an empty result set as a filter miss, not an empty library', async () => {
    vi.mocked(apiFetchAllPages).mockResolvedValue([resource('r1', 'Crew A')]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AnnouncerProvider>
        <QueryClientProvider client={queryClient}>
          <ResourcesTable orgSlug="acme" canWrite />
        </QueryClientProvider>
      </AnnouncerProvider>,
    );
    await screen.findByText('Crew A');

    vi.mocked(apiFetchAllPages).mockResolvedValue([]);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'MATERIAL' } });

    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'No resources match these filters.',
      ),
    );
  });
});
