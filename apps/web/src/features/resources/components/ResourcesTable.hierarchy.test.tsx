import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resourceKeys } from '../api/use-resources';

import { ResourcesTable } from './ResourcesTable';

import type * as ApiClient from '@/lib/api/client';
import { apiFetch } from '@/lib/api/client';

/**
 * The resource library's TREE surface under `VITE_LIBRARY_SCOPING` (ADR-0053 §3): rows are ordered
 * depth-first so a group is followed by its own contents, a group is visibly labelled and shown as
 * non-scheduled, and the parent relationship is also carried IN TEXT (the Group column) so nesting
 * is never conveyed by indentation alone.
 *
 * The flag-OFF half of the contract — the same data rendering byte-for-byte today's flat table —
 * lives in `ResourcesTable.hierarchy.flag-off.test.tsx`, which must mock the flag the other way.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
}));

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

/**
 * Deliberately supplied in an order that is NOT the display order: the child arrives before its
 * group, and a second top-level row sits between them. Only a real tree walk produces the expected
 * output, so this cannot pass by accident.
 */
const TREE: ResourceSummary[] = [
  resource({ id: 'grp', name: 'Groundworks', kind: 'GROUP' }),
  resource({ id: 'loose', name: 'Loose Crew' }),
  resource({ id: 'child', name: 'Crew A', parentId: 'grp' }),
  resource({ id: 'nested-grp', name: 'Diggers', kind: 'GROUP', parentId: 'grp' }),
  resource({ id: 'deep', name: 'CR600', kind: 'EQUIPMENT', parentId: 'nested-grp' }),
];

function renderTable(data: ResourceSummary[] = TREE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.list('acme'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourcesTable orgSlug="acme" canWrite calendars={[]} />
    </QueryClientProvider>,
  );
}

function rowNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1) // drop the header row
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent?.trim() ?? '');
}

describe('ResourcesTable — resource tree (VITE_LIBRARY_SCOPING on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('orders rows depth-first: a group is immediately followed by its own contents', () => {
    renderTable();
    expect(rowNames()).toEqual([
      'GroundworksNot assignable',
      'Crew A',
      'DiggersNot assignable',
      'CR600',
      'Loose Crew',
    ]);
  });

  it('labels a group in text, not by indentation or colour alone', () => {
    renderTable();
    const groupRow = screen.getAllByRole('row')[1]!;
    expect(within(groupRow).getByText('Not assignable')).toBeInTheDocument();
  });

  it('shows a group as “Not scheduled” rather than the “—” that means “inherits the plan calendar”', () => {
    renderTable();
    const groupRow = screen.getAllByRole('row')[1]!;
    expect(within(groupRow).getByText('Not scheduled')).toBeInTheDocument();
  });

  it('carries the parent relationship in TEXT via the Group column (not layout alone)', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Group' })).toBeInTheDocument();
    // The nested equipment names its own group.
    const deepRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('CR600'))!;
    expect(within(deepRow).getByText('Diggers')).toBeInTheDocument();
  });

  it('renders a resource whose parent is absent from the list as top-level rather than dropping it', () => {
    // A group soft-deleted mid-session: losing the row entirely would be far worse than un-nesting it.
    renderTable([resource({ id: 'orphan', name: 'Orphan', parentId: 'gone' })]);
    expect(rowNames()).toEqual(['Orphan']);
  });

  it('does not hang on cyclic data it did not create (the visited guard)', () => {
    renderTable([
      resource({ id: 'a', name: 'A', kind: 'GROUP', parentId: 'b' }),
      resource({ id: 'b', name: 'B', kind: 'GROUP', parentId: 'a' }),
    ]);
    // Both rows are unreachable as roots, so the table renders its empty state rather than looping.
    expect(screen.getByText(/No resources yet/)).toBeInTheDocument();
  });
});
