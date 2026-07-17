import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
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
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(
  assignments: ResourceAssignmentSummary[],
  durationType: React.ComponentProps<typeof ActivityResourcesDialog>['activityDurationType'],
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

    // The rate block's Save is the second "Save" (the units block's is first).
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]!);
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
    expect(screen.getAllByRole('button', { name: 'Save' })[1]!).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('names UNITS as the edited field when the units of a rated driving assignment change', async () => {
    renderDialog([assignment({ unitsPerHour: 2 })], 'FIXED_DURATION_AND_UNITS_TIME');
    const units = screen.getAllByLabelText('Budgeted units')[0]!;
    fireEvent.change(units, { target: { value: '10' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

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
});
