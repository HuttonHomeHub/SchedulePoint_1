import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const CREW: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: null,
  description: null,
  kind: 'LABOUR',
  calendarId: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const CONCRETE: ResourceSummary = {
  ...CREW,
  id: 'res-2',
  name: 'Concrete',
  kind: 'MATERIAL',
  version: 1,
};

function assignment(overrides: Partial<ResourceAssignmentSummary> = {}): ResourceAssignmentSummary {
  return {
    id: 'asg-1',
    activityId: 'a1',
    resourceId: 'res-1',
    budgetedUnits: 5,
    unitsPerHour: null,
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(
  assignments: ResourceAssignmentSummary[],
  resources: ResourceSummary[] = [CREW, CONCRETE],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.list('acme'), resources);
  queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'a1'), assignments);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityResourcesDialog
        orgSlug="acme"
        activityId="a1"
        activityName="Excavate"
        open
        onClose={vi.fn()}
        canWrite
      />
    </QueryClientProvider>,
  );
}

describe('ActivityResourcesDialog', () => {
  beforeEach(() => {
    // A mutation invalidates the assignments list, which refetches through this same mock — so the
    // default resolves to an array (the list GET shape). Tests assert on the call args, not the value.
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('assigns a resource — POSTs the chosen resource and budgeted units', async () => {
    renderDialog([]);
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-1' } });
    fireEvent.change(screen.getByLabelText('Budgeted units'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1/assignments');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      resourceId: 'res-1',
      budgetedUnits: 10,
      isDriving: false,
    });
  });

  it('shows an error and blocks Save for an invalid budgeted-units edit (no silent no-op)', () => {
    renderDialog([assignment()]);
    // Two "Budgeted units" fields exist (the assigned row's inline edit + the assign form);
    // the row's is first. "Crew A" is assigned with 5 units; edit it to an invalid value.
    const unitsInput = screen.getAllByLabelText('Budgeted units')[0]!;
    fireEvent.change(unitsInput, { target: { value: '-3' } });

    expect(screen.getByText(/cannot be negative/i)).toBeInTheDocument();
    expect(unitsInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Save budgeted units for Crew A' })).toBeDisabled();

    // Too many decimal places is likewise rejected, and never PATCHes.
    fireEvent.change(unitsInput, { target: { value: '1.234567' } });
    expect(screen.getByText(/at most 4 decimal places/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save budgeted units for Crew A' })).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();

    // A valid value clears the error and enables Save.
    fireEvent.change(unitsInput, { target: { value: '7.5' } });
    expect(screen.queryByText(/decimal places|cannot be negative/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save budgeted units for Crew A' })).toBeEnabled();
  });

  it('disables the driving toggle when a MATERIAL resource is selected in the assign form', () => {
    renderDialog([]);
    const driving = screen.getByLabelText('Driving resource');
    expect(driving).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-2' } });
    expect(screen.getByLabelText('Driving resource')).toBeDisabled();
    expect(screen.getByText(/material resource can’t drive/i)).toBeInTheDocument();
  });

  it('disables the driving toggle on an assigned MATERIAL row and unassigns it', async () => {
    renderDialog([assignment({ resourceId: 'res-2' })]);

    // The row for the MATERIAL resource (Concrete) can never drive.
    const drivingToggles = screen.getAllByLabelText('Driving resource');
    expect(drivingToggles[0]).toBeDisabled();

    vi.mocked(apiFetch).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Unassign Concrete' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/assignments/asg-1');
    expect(init?.method).toBe('DELETE');
  });

  it('shows a read-only view without the assign form for non-writers', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(resourceKeys.list('acme'), [CREW]);
    queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'a1'), [assignment()]);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivityResourcesDialog
          orgSlug="acme"
          activityId="a1"
          activityName="Excavate"
          open
          onClose={vi.fn()}
          canWrite={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Crew A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign resource' })).not.toBeInTheDocument();
  });
});
