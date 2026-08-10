import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesPanel } from './ActivityResourcesPanel';

import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

/**
 * **The rollback contract** for `VITE_ASSIGNMENT_LAG` (ADR-0071 M4).
 *
 * Flag off, the join lag is not authorable and — the part that actually matters — the assign request
 * is the body that shipped before it existed. A stored lag keeps scheduling, loading and earning
 * exactly as it does now; the surface simply stops offering it. Kept and pinned rather than weakened
 * to match the flag-on suite, which is the whole point of a rollback contract.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ASSIGNMENT_LAG_ENABLED: false,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchAllPages: vi.fn() }));

const CREW: ResourceSummary = {
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
const CRANE: ResourceSummary = { ...CREW, id: 'res-2', name: 'Crane' };

/** Deliberately carrying a stored lag: flag off must ignore it, not clear it. */
const LAGGED: ResourceAssignmentSummary = {
  id: 'asg-1',
  activityId: 'a1',
  resourceId: 'res-1',
  budgetedUnits: 5,
  unitsPerHour: null,
  isDriving: false,
  curveType: 'UNIFORM',
  lagMinutes: 960,
  actualUnits: 0,
  budgetedCost: null,
  actualCost: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderPanel(props: Partial<React.ComponentProps<typeof ActivityResourcesPanel>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.filtered('acme', { archived: 'include' }), [CREW, CRANE]);
  // The picker reads the cursor-paginated SEARCH query, a different read from the library
  // list above — seed it too, or the listbox opens empty.
  queryClient.setQueryData(resourceKeys.search('acme', { q: '' }), {
    pages: [{ resources: [CREW, CRANE], nextCursor: null, hasMore: false }],
    pageParams: [null],
  });
  queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'a1'), [LAGGED]);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityResourcesPanel
        orgSlug="acme"
        activityId="a1"
        canWrite
        activityHoursPerDay={8}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const comboField = (name: string): HTMLElement => screen.getByRole('combobox', { name });
/** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
const openCombo = (name: string): void => {
  fireEvent.keyDown(comboField(name), { key: 'ArrowDown' });
};
/**
 * Pick by visible option name. Options exist in the DOM only while the listbox is open, and the
 * Combobox commits on `pointerDown` rather than `click` — deliberately, so the pick beats the
 * input's own `blur`, which would otherwise close the listbox first on touch.
 */
const chooseCombo = (name: string, option: string | RegExp): void => {
  openCombo(name);
  fireEvent.pointerDown(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
};

describe('ActivityResourcesPanel — the join lag, flag OFF (the rollback contract)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue([]);
  });

  it('offers no lag control on the assign form or on a row', () => {
    renderPanel();
    expect(screen.queryByLabelText(/^Joins after/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save join delay for Crew A' }),
    ).not.toBeInTheDocument();
  });

  it('mentions no lag on a read-only row, even for an assignment that has one', () => {
    // The stored value is untouched — it is simply not a thing this build talks about.
    renderPanel({ canWrite: false });
    expect(screen.queryByText(/joins after/)).not.toBeInTheDocument();
    expect(screen.getByText(/5 units/)).toBeInTheDocument();
  });

  it('sends an assign body with no lagMinutes key at all', async () => {
    // Not `lagMinutes: 0` — absent. An explicit zero would be this build asserting a value it has no
    // control for, and would overwrite a lag set by an import or by a flag-on colleague.
    renderPanel();
    chooseCombo('Resource', /^Crane\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    const body = JSON.parse(
      (vi.mocked(apiFetch).mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('lagMinutes');
  });
});
