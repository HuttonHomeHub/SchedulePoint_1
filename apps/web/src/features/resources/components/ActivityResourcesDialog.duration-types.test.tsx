import type { DurationType, ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The units/time (rate) surface (ADR-0040, M7 rung 4) with `VITE_DURATION_TYPES` forced ON — proves the
 * driving assignment's rate field renders, previews the derived duration for a units-driven type,
 * carries the `editedField` so the server recomputes the triad, and mirrors the N20 zero-rate block.
 * (Flag-off behaviour — no rate field, plain units store — is covered by `ActivityResourcesDialog.test.tsx`.)
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DURATION_TYPES_ENABLED: true,
  RESOURCES_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const CREW: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: null,
  description: null,
  kind: 'LABOUR',
  maxUnitsPerHour: null,
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
    budgetedUnits: 240,
    unitsPerHour: null,
    isDriving: true,
    actualUnits: 0,
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(assignments: ResourceAssignmentSummary[], durationType: DurationType) {
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
        activityName="Excavate"
        activityDurationType={durationType}
        open
        onClose={vi.fn()}
        canWrite
      />
    </QueryClientProvider>,
  );
}

describe('ActivityResourcesDialog — units/time rate (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('sets a rate on the driving assignment, previews the derived duration, and PATCHes with editedField', async () => {
    renderDialog([assignment()], 'FIXED_UNITS');
    const rate = screen.getByLabelText('Units / time (rate)');
    fireEvent.change(rate, { target: { value: '5' } });

    // 240 units ÷ 5 units/hour = 48 h = 2 days.
    expect(screen.getByText(/Duration becomes 2 days/)).toBeInTheDocument();

    // Each Save has a distinct accessible name (a row can show two).
    fireEvent.click(screen.getByRole('button', { name: 'Save rate for Crew A' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/assignments/asg-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      budgetedUnits: 240,
      unitsPerHour: 5,
      editedField: 'UNITS_PER_HOUR',
      isDriving: true,
      version: 3,
    });
  });

  it('blocks a zero rate on a units-driven type (the N20 mirror) — never PATCHes', () => {
    renderDialog([assignment()], 'FIXED_UNITS');
    fireEvent.change(screen.getByLabelText('Units / time (rate)'), { target: { value: '0' } });

    expect(screen.getByText(/rate must be greater than zero/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save rate for Crew A' })).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('names UNITS as the edited field when the units of a rated driving assignment change', async () => {
    renderDialog([assignment({ unitsPerHour: 2 })], 'FIXED_DURATION_AND_UNITS_TIME');
    const units = screen.getAllByLabelText('Budgeted units')[0]!;
    fireEvent.change(units, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budgeted units for Crew A' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      budgetedUnits: 10,
      editedField: 'UNITS',
      isDriving: true,
      version: 3,
    });
  });

  it('does not show the rate field on a non-driving assignment (rate is a driver property)', () => {
    renderDialog([assignment({ isDriving: false })], 'FIXED_UNITS');
    expect(screen.queryByLabelText('Units / time (rate)')).not.toBeInTheDocument();
  });

  it('assign form: the rate field appears once "Driving resource" is ticked, and posts an initial rate (no editedField)', async () => {
    renderDialog([], 'FIXED_UNITS');
    // Hidden until the resource is set to drive.
    expect(screen.queryByLabelText('Units / time (rate)')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-1' } });
    fireEvent.change(screen.getByLabelText('Budgeted units'), { target: { value: '100' } });
    fireEvent.click(screen.getByLabelText('Driving resource'));

    const rate = screen.getByLabelText('Units / time (rate)');
    fireEvent.change(rate, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1/assignments');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      resourceId: 'res-1',
      budgetedUnits: 100,
      unitsPerHour: 4,
      isDriving: true,
    });
    // A create never recomputes the triad — no editedField (a plain store; ADR-0040).
    expect(body.editedField).toBeUndefined();
  });

  it('assign form: a non-driving assignment omits the rate entirely', async () => {
    renderDialog([], 'FIXED_UNITS');
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-1' } });
    fireEvent.change(screen.getByLabelText('Budgeted units'), { target: { value: '100' } });
    // Leave "Driving resource" unchecked — the rate field never shows.
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ resourceId: 'res-1', budgetedUnits: 100, isDriving: false });
    expect(body.unitsPerHour).toBeUndefined();
  });
});
