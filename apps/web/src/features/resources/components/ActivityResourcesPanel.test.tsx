import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesPanel } from './ActivityResourcesPanel';

import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

// Pinned OFF for the same reason the sibling dialog suite pins it: this asserts the BASE surface
// (a flat native `<select>`), not the flag's searched `Combobox`.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: false,
  EARNED_VALUE_ENABLED: true,
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

const CONCRETE: ResourceSummary = { ...CREW, id: 'res-2', name: 'Concrete', kind: 'MATERIAL' };

const ASSIGNMENT: ResourceAssignmentSummary = {
  id: 'asg-1',
  activityId: 'a1',
  resourceId: 'res-1',
  budgetedUnits: 5,
  unitsPerHour: null,
  isDriving: false,
  curveType: 'UNIFORM',
  actualUnits: 0,
  budgetedCost: null,
  actualCost: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** Mounted bare — no `Dialog`, which is the point: the tab hosts the same panel directly. */
function renderPanel({
  seed = true,
  ...props
}: Partial<React.ComponentProps<typeof ActivityResourcesPanel>> & { seed?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seed) {
    queryClient.setQueryData(resourceKeys.list('acme'), [CREW, CONCRETE]);
    queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'a1'), [ASSIGNMENT]);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityResourcesPanel orgSlug="acme" activityId="a1" canWrite {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityResourcesPanel', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue([]);
  });

  it('renders the assigned rows and the assign form standalone, outside any dialog', () => {
    renderPanel();
    expect(screen.getByRole('group', { name: 'Assigned' })).toBeInTheDocument();
    expect(screen.getByText('Crew A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign resource' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unassign Crew A' })).toBeInTheDocument();
  });

  it('hides the assign form and the row controls for a reader', () => {
    renderPanel({ canWrite: false });
    expect(screen.queryByRole('group', { name: 'Assign a resource' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unassign Crew A' })).not.toBeInTheDocument();
    // The read-only summary line still states the assignment.
    expect(screen.getByText(/5 units/)).toBeInTheDocument();
  });

  it('shades the assign form with the reason when the host supplies one', () => {
    // The shade-with-a-reason rule (ADR-0060 §6): a host that can tell role from pen apart passes
    // the sentence, and the section stays visible with its Save inert. Hiding it instead left a
    // Planner without the pen looking at a Resources tab whose form had simply vanished.
    renderPanel({ canWrite: false, writeReason: 'Start editing to change this activity.' });
    const assign = screen.getByRole('group', { name: 'Assign a resource' });
    const save = within(assign).getByRole('button', { name: 'Assign resource' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    // Associated with the control, not merely adjacent to it.
    const reasonId = save.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent(
      'Start editing to change this activity.',
    );
  });

  it('shows the assignments empty state', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(resourceKeys.list('acme'), [CREW, CONCRETE]);
    queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'a1'), []);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivityResourcesPanel orgSlug="acme" activityId="a1" canWrite />
      </QueryClientProvider>,
    );
    expect(screen.getByText('No resources assigned yet.')).toBeInTheDocument();
  });

  it('surfaces a failed assignments load rather than an empty list', async () => {
    // The assignments read goes through `apiFetch`; the library read pages via `apiFetchAllPages`.
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));
    renderPanel({ seed: false });
    expect(await screen.findByText(/Couldn’t load assignments/)).toBeInTheDocument();
  });

  // Scoped to the assigned ROW: the assign form carries its own "Budgeted cost" field, so an
  // unscoped query would match either one and prove neither.
  const assignedRow = (): HTMLElement => screen.getByRole('listitem');

  it('shows the assignment’s money fields to a role that can read cost', () => {
    renderPanel();
    expect(within(assignedRow()).getByLabelText('Budgeted cost')).toBeInTheDocument();
  });

  it('withholds them from a role that cannot — the same gate the Cost tab answers to', () => {
    // Latent today (`canReadCost === canWrite`, TECH_DEBT #62); a tightening that becomes
    // load-bearing the day those role sets diverge, which is when nobody will be looking.
    renderPanel({ canReadCost: false });
    expect(within(assignedRow()).queryByLabelText('Budgeted cost')).not.toBeInTheDocument();
    // The row itself is still there — this gates the money, not the assignment.
    expect(screen.getByRole('button', { name: 'Unassign Crew A' })).toBeInTheDocument();
  });

  it('issues no request while disabled — a host may mount it before it is showing', async () => {
    renderPanel({ seed: false, enabled: false });
    await waitFor(() => expect(apiFetchAllPages).not.toHaveBeenCalled());
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Assigned' })).toBeInTheDocument();
  });
});
