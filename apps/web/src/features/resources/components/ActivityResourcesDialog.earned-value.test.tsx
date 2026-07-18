import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The assignment cost & actuals surface (`budgetedCost` / `actualCost` / `actualUnits`, EV4b /
 * ADR-0042) with `VITE_EARNED_VALUE` forced ON — proves the inline row's grouped cost editor seeds
 * (minor → major) and PATCHes all three (money ×100 → minor; a blank budgeted-cost clears the override
 * to null), and the assign form carries the cost inputs on POST. Flag-off behaviour is covered by
 * `ActivityResourcesDialog.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EARNED_VALUE_ENABLED: true,
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
    budgetedUnits: 240,
    unitsPerHour: null,
    isDriving: true,
    curveType: 'UNIFORM',
    actualUnits: 3,
    // 50000 minor = 500.00 major; 25000 minor = 250.00 major.
    budgetedCost: 50000,
    actualCost: 25000,
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(assignments: ResourceAssignmentSummary[]) {
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
        open
        onClose={vi.fn()}
        canWrite
      />
    </QueryClientProvider>,
  );
}

describe('ActivityResourcesDialog — cost & actuals (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('seeds the row cost fields (minor → major) and PATCHes all three on Save', async () => {
    renderDialog([assignment()]);
    expect(screen.getByLabelText('Budgeted cost')).toHaveValue(500);
    expect(screen.getByLabelText('Actual cost')).toHaveValue(250);
    expect(screen.getByLabelText('Actual units')).toHaveValue(3);

    fireEvent.change(screen.getByLabelText('Actual cost'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost for Crew A' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/assignments/asg-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      budgetedUnits: 240,
      isDriving: true,
      budgetedCost: 50000,
      actualCost: 30000,
      actualUnits: 3,
      version: 3,
    });
  });

  it('clears the budgeted-cost override to null when blanked', async () => {
    renderDialog([assignment()]);
    fireEvent.change(screen.getByLabelText('Budgeted cost'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cost for Crew A' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ budgetedCost: null, version: 3 });
  });

  it('rejects a negative actual cost and makes no request', () => {
    renderDialog([assignment()]);
    fireEvent.change(screen.getByLabelText('Actual cost'), { target: { value: '-5' } });
    expect(screen.getByText('Cost cannot be negative.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save cost for Crew A' })).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('assign form: carries the cost inputs on POST (major → minor)', async () => {
    renderDialog([]);
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-1' } });
    fireEvent.change(screen.getByLabelText('Budgeted units'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Budgeted cost (optional)'), {
      target: { value: '750' },
    });
    fireEvent.change(screen.getByLabelText('Actual units (optional)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/activities/a1/assignments');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      resourceId: 'res-1',
      budgetedUnits: 100,
      budgetedCost: 75000,
      actualUnits: 5,
    });
  });
});
