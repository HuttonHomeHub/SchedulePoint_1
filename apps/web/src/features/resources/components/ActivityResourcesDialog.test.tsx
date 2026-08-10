import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesDialog } from './ActivityResourcesDialog';

import { apiFetch } from '@/lib/api/client';

// `LIBRARY_SCOPING_ENABLED` is pinned OFF so this suite keeps documenting the BASE assignment
// editor — a flat native `<select>` over the whole resource library (ADR-0039). The searched,
// paginated `Combobox` the flag turns it into is asserted by the sibling
// `ActivityResourcesDialog.picker.test.tsx` (ADR-0053 §4).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

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

const CONCRETE: ResourceSummary = {
  ...CREW,
  id: 'res-2',
  name: 'Concrete',
  kind: 'MATERIAL',
  parentId: null,
  maxUnitsPerHour: null,
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
    curveType: 'UNIFORM',
    lagMinutes: 0,
    actualUnits: 0,
    budgetedCost: null,
    actualCost: null,
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
  queryClient.setQueryData(resourceKeys.filtered('acme', { archived: 'include' }), resources);
  // The picker reads the cursor-paginated SEARCH query, a different read from the library
  // list above — seed it too, or the listbox opens empty.
  queryClient.setQueryData(resourceKeys.search('acme', { q: '' }), {
    pages: [{ resources: resources, nextCursor: null, hasMore: false }],
    pageParams: [null],
  });
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

describe('ActivityResourcesDialog', () => {
  beforeEach(() => {
    // A mutation invalidates the assignments list, which refetches through this same mock — so the
    // default resolves to an array (the list GET shape). Tests assert on the call args, not the value.
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
  });

  it('assigns a resource — POSTs the chosen resource and budgeted units', async () => {
    renderDialog([]);
    chooseCombo('Resource', /^Crew A\b/);
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

    chooseCombo('Resource', /^Concrete\b/);
    expect(screen.getByLabelText('Driving resource')).toBeDisabled();
    expect(screen.getByText(/material resource can’t drive/i)).toBeInTheDocument();
  });

  it('disables the driving toggle on an assigned MATERIAL row and unassigns it', async () => {
    renderDialog([assignment({ resourceId: 'res-2' })]);

    // The row for the MATERIAL resource (Concrete) can never drive. `aria-disabled` + a click
    // guard, not the native attribute (ADR-0083 D1): a checkbox's only operation is changing its
    // value, so there is nothing for `readOnly` to preserve — but it stays in the tab order, which
    // is how the reader reaches the sentence explaining why a material cannot drive.
    const drivingToggles = screen.getAllByLabelText('Driving resource');
    expect(drivingToggles[0]).toHaveAttribute('aria-disabled', 'true');
    expect(drivingToggles[0]).toBeEnabled();

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
    queryClient.setQueryData(resourceKeys.filtered('acme', { archived: 'include' }), [CREW]);
    // The picker reads the cursor-paginated SEARCH query, a different read from the library
    // list above — seed it too, or the listbox opens empty.
    queryClient.setQueryData(resourceKeys.search('acme', { q: '' }), {
      pages: [{ resources: [CREW], nextCursor: null, hasMore: false }],
      pageParams: [null],
    });
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
