import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The loading-curve picker on the resource-assignment dialog (M7 rung 5, ADR-0044 §3 / ADR-0035 §31),
 * behind `VITE_RESOURCE_CURVES`. Proves the picker seeds from the row, round-trips on create, and saves
 * immediately on an assigned row — all via the assignment create/update mutation.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RESOURCE_CURVES_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchEnvelope: vi.fn() }));

const CREW: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: null,
  description: null,
  kind: 'LABOUR',
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function assignment(overrides: Partial<ResourceAssignmentSummary> = {}): ResourceAssignmentSummary {
  return {
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
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(
  assignments: ResourceAssignmentSummary[],
  props: Partial<React.ComponentProps<typeof ActivityResourcesDialog>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.list('acme'), [CREW]);
  queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'a1'), assignments);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityResourcesDialog
        orgSlug="acme"
        activityId="a1"
        open
        onClose={vi.fn()}
        canWrite
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ActivityResourcesDialog — loading curve picker (ADR-0044 §3)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('creates an assignment with the chosen curve', async () => {
    renderDialog([]);
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-1' } });
    fireEvent.change(screen.getByLabelText('Budgeted units'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Loading curve'), { target: { value: 'FRONT_LOADED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1/assignments');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      resourceId: 'res-1',
      budgetedUnits: 12,
      curveType: 'FRONT_LOADED',
    });
  });

  it('seeds the assigned row picker from the stored curve and PATCHes on change', async () => {
    renderDialog([assignment({ curveType: 'BELL' })]);
    // The row's picker (there are two "Loading curve" selects: the create form + this row).
    const selects = screen.getAllByLabelText('Loading curve');
    const rowSelect = selects.find((el) => (el as HTMLSelectElement).value === 'BELL')!;
    expect(rowSelect).toBeTruthy();

    fireEvent.change(rowSelect, { target: { value: 'DOUBLE_PEAK' } });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/assignments/asg-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      curveType: 'DOUBLE_PEAK',
      version: 3,
    });
  });

  it('hides the loading-curve picker for a milestone activity, in both the assigned row and the assign form (TECH_DEBT #44b)', () => {
    renderDialog([assignment({ curveType: 'BELL' })], { isMilestone: true });
    // Neither the assigned row's picker nor the assign form's picker renders — a milestone
    // is zero-span, so a loading curve has nothing to distribute units over.
    expect(screen.queryByLabelText('Loading curve')).not.toBeInTheDocument();
  });
});
