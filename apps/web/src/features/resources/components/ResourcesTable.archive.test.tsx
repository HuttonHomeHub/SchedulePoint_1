import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ResourcesTable } from './ResourcesTable';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch, apiFetchAllPages } from '@/lib/api/client';

/**
 * The resource library's M4 management layer with `VITE_LIBRARY_SCOPING` ON (ADR-0053 §4): search,
 * kind + archived filters, the `Archived` badge, archive/unarchive, and the deliberate decision that
 * a FILTERED list is flat (a tree of partial matches would draw branches the server never sent).
 * The flag-OFF parity assertions live in `ResourcesTable.hierarchy.flag-off.test.tsx`.
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

function resource(overrides: Partial<ResourceSummary> & { id: string }): ResourceSummary {
  return {
    name: overrides.id,
    code: null,
    description: null,
    kind: 'LABOUR',
    parentId: null,
    maxUnitsPerHour: null,
    costPerUnit: null,
    calendarId: null,
    archivedAt: null,
    version: 7,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const GROUP = resource({ id: 'grp', name: 'Groundworks', kind: 'GROUP' });
const CREW = resource({ id: 'crew', name: 'Crew A', code: 'CA', parentId: 'grp' });
const RETIRED = resource({
  id: 'crane',
  name: 'CR600 Crawler Crane',
  kind: 'EQUIPMENT',
  archivedAt: '2026-07-01T00:00:00Z',
});

function listPaths(): string[] {
  return vi.mocked(apiFetchAllPages).mock.calls.map(([path]) => path);
}

function renderTable(rows: ResourceSummary[] = [GROUP, CREW, RETIRED]) {
  vi.mocked(apiFetchAllPages).mockResolvedValue(rows);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourcesTable orgSlug="acme" canWrite />
    </QueryClientProvider>,
  );
}

/** The rendered rows' indentation spacer width, `null` when the row is not indented. */
function indentWidths(): (string | null)[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('span[aria-hidden="true"]')?.getAttribute('style') ?? null);
}

describe('ResourcesTable — search, filters & archive (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined);
    vi.mocked(apiFetchAllPages).mockReset();
  });

  it('badges an archived row and explains that archiving is not deleting', async () => {
    renderTable();
    const row = (await screen.findByText('CR600 Crawler Crane')).closest('tr');
    expect(within(row!).getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText(/Everything already using it keeps working/)).toBeInTheDocument();
  });

  it('pushes the search term to the server without reintroducing a single page', async () => {
    renderTable();
    await screen.findByText('Crew A');
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'crane' } });

    await waitFor(() => expect(listPaths().some((path) => path.includes('q=crane'))).toBe(true));
    // Still the whole-library paging helper — a `?limit=` here would be the truncation defect back.
    expect(listPaths().every((path) => !path.includes('limit='))).toBe(true);
  });

  it('sends the kind and archived filters', async () => {
    renderTable();
    await screen.findByText('Crew A');

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'EQUIPMENT' } });
    await waitFor(() =>
      expect(listPaths().some((path) => path.includes('kind=EQUIPMENT'))).toBe(true),
    );

    fireEvent.change(screen.getByLabelText('Show archived'), { target: { value: 'only' } });
    await waitFor(() =>
      expect(listPaths().some((path) => path.includes('archived=only'))).toBe(true),
    );
  });

  it('leaves the URL bare while nothing is filtered', async () => {
    renderTable();
    await screen.findByText('Crew A');
    expect(listPaths()[0]).toBe('/organizations/acme/resources');
  });

  it('draws the tree unfiltered, and a FLAT list while a filter narrows the set', async () => {
    renderTable();
    await screen.findByText('Crew A');
    // Unfiltered: "Crew A" is nested under its group, so it carries an indent spacer.
    expect(indentWidths().some((style) => style !== null)).toBe(true);

    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'crew' } });
    await waitFor(() => expect(indentWidths().every((style) => style === null)).toBe(true));
    // The hierarchy is not lost — it moves into the Group column's text.
    expect(screen.getByText(/the Group column still names each match/)).toBeInTheDocument();
  });

  it('archives with the row version and unarchives an archived row', async () => {
    renderTable();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Crew A' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/resources/crew/archive', {
      method: 'POST',
      body: JSON.stringify({ version: 7 }),
    });

    vi.mocked(apiFetch).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive CR600 Crawler Crane' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith('/organizations/acme/resources/crane/unarchive', {
      method: 'POST',
      body: JSON.stringify({ version: 7 }),
    });
  });

  it('surfaces a stale-version 409 rather than failing silently', async () => {
    renderTable();
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'This was changed elsewhere.' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Crew A' }));

    expect(await screen.findByText('This was changed elsewhere.')).toBeInTheDocument();
  });

  it('offers a way back from a filtered-to-nothing list', async () => {
    renderTable([]);
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'zzz' } });

    expect(await screen.findByText('No resources match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Search resources')).toHaveValue('');
    expect(await screen.findByText(/No resources yet/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderTable();
    await screen.findByText('Crew A');
    expect((await axe(container)).violations).toEqual([]);
  });
});
