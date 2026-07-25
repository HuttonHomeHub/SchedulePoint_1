import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { resourceKeys } from '../api/use-resources';

import { ResourceFormDialog } from './ResourceFormDialog';
import { ResourcesTable } from './ResourcesTable';

import type * as ApiClient from '@/lib/api/client';

/**
 * The FLAG-OFF half of the ADR-0053 §3 rollback contract: with `VITE_LIBRARY_SCOPING` off — the
 * default — the resource tree is invisible. The same data renders as today's flat table in the
 * SERVER's order, no Group column or badge appears, and the form offers neither a `GROUP` kind nor
 * a parent picker. This is what makes turning the flag off a real rollback rather than a hope.
 *
 * The flag is left at its real default here (no `@/config/env` mock) precisely so a change to that
 * default breaks this file.
 */
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
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
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// The same nested fixture the flag-on suite uses, so the two files differ only in the flag.
const TREE: ResourceSummary[] = [
  resource({ id: 'grp', name: 'Groundworks', kind: 'GROUP' }),
  resource({ id: 'loose', name: 'Loose Crew' }),
  resource({ id: 'child', name: 'Crew A', parentId: 'grp' }),
];

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.list('acme'), TREE);
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourcesTable orgSlug="acme" canWrite calendars={[]} />
    </QueryClientProvider>,
  );
}

describe('resource tree — flag off (VITE_LIBRARY_SCOPING default)', () => {
  it('renders the library FLAT, in the server’s order — nesting is not applied', () => {
    renderTable();
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]?.textContent?.trim() ?? '');
    // The server order (Groundworks, Loose Crew, Crew A), NOT the depth-first order the flag-on
    // suite asserts (Groundworks, Crew A, Loose Crew).
    expect(names).toEqual(['Groundworks', 'Loose Crew', 'Crew A']);
  });

  it('renders no Group column and no “Not assignable” badge', () => {
    renderTable();
    expect(screen.queryByRole('columnheader', { name: 'Group' })).not.toBeInTheDocument();
    expect(screen.queryByText('Not assignable')).not.toBeInTheDocument();
    expect(screen.queryByText('Not scheduled')).not.toBeInTheDocument();
  });

  it('offers neither a GROUP kind nor a parent picker in the form', () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ResourceFormDialog orgSlug="acme" open onClose={() => {}} resources={TREE} />
      </QueryClientProvider>,
    );
    const kind = screen.getByLabelText('Kind');
    expect(within(kind).queryByRole('option', { name: 'Group' })).not.toBeInTheDocument();
    expect(within(kind).getAllByRole('option')).toHaveLength(3);
    expect(screen.queryByLabelText('Group (optional)')).not.toBeInTheDocument();
  });
});
