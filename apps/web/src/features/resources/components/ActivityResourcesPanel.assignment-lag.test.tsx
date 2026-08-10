import type { ResourceAssignmentSummary, ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignmentKeys, resourceKeys } from '../api/use-resources';

import { ActivityResourcesPanel } from './ActivityResourcesPanel';

import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

/**
 * The join-lag control, flag ON (ADR-0071 M4). The sibling `.flag-off.` suite is the rollback
 * contract and is deliberately NOT weakened to share this file's mock.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ASSIGNMENT_LAG_ENABLED: true,
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

const ASSIGNMENT: ResourceAssignmentSummary = {
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
};

/** An eight-hour working day, so `1d` is 480 minutes and a wrong factor is visible in the assertion. */
const EIGHT_HOUR = 8;

/**
 * The assign form and each assigned row carry the SAME field labels — "Budgeted units", "Joins
 * after" — because they are the same fields on two objects. Queries are scoped to the section, the
 * idiom the sibling suite already uses; a bare `getByLabelText` here would match both and pass or
 * fail for the wrong reason.
 */
const assignForm = () => within(screen.getByRole('group', { name: 'Assign a resource' }));
/**
 * Pick the assign form's resource. Scoped to the form, because the panel also lists the ALREADY
 * assigned rows. Options exist only while the listbox is open, and the Combobox commits on
 * `pointerDown` rather than `click` — deliberately, so the pick beats the input's own `blur`.
 * (This drove a native `<select>` by id until ADR-0088 D3 deleted that arm.)
 */
const chooseResource = (option: RegExp): void => {
  const field = assignForm().getByRole('combobox', { name: 'Resource' });
  fireEvent.keyDown(field, { key: 'ArrowDown' });
  fireEvent.pointerDown(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
};
const assignedRow = () => within(screen.getByRole('listitem'));

/**
 * `noFactor` renders the panel with the prop ABSENT rather than explicitly `undefined` — which
 * `exactOptionalPropertyTypes` rightly refuses, and which is also the honest shape: the host omits it
 * when it cannot resolve the calendar, it does not pass an undefined.
 */
function renderPanel(
  {
    noFactor,
    ...props
  }: Partial<React.ComponentProps<typeof ActivityResourcesPanel>> & {
    noFactor?: boolean;
  } = {},
  assignments: ResourceAssignmentSummary[] = [ASSIGNMENT],
) {
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
  queryClient.setQueryData(assignmentKeys.listByActivity('acme', 'a1'), assignments);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityResourcesPanel
        orgSlug="acme"
        activityId="a1"
        canWrite
        {...(noFactor ? {} : { activityHoursPerDay: EIGHT_HOUR })}
        {...props}
      />
    </QueryClientProvider>,
  );
}

/** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
describe('ActivityResourcesPanel — the join lag, flag on', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
    vi.mocked(apiFetchAllPages).mockReset().mockResolvedValue([]);
  });

  it('sends the typed lag as working MINUTES on the activity’s own calendar', async () => {
    // The whole reason the factor is threaded (ADR-0068): `1d` on an eight-hour calendar is 480
    // minutes. A 1,440 here would be the epic's own defect — a wrong day, silently, changing dates.
    renderPanel();
    chooseResource(/^Crane\b/);
    fireEvent.change(assignForm().getByLabelText('Joins after'), { target: { value: '1d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    const body = JSON.parse(
      (vi.mocked(apiFetch).mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body.lagMinutes).toBe(480);
  });

  it('sends no lag at all when the field is left alone', () => {
    // "Joins with the activity" is the default, and an unlagged assign must build the body it always
    // did — the flag's rollback contract, asserted on the request rather than on the screen.
    renderPanel();
    expect(assignForm().getByLabelText('Joins after')).toHaveValue('');
  });

  it('refuses to submit a lag it cannot convert, and says which units it can take', async () => {
    // No factor: the calendar list is loading, absent, or missing the row. Days are the ONLY unit
    // that needs one, so the field keeps hours and minutes and refuses days — rather than hiding, or
    // guessing 24 (three days' work on an eight-hour calendar) or 8 (the inverse on a 24-hour one).
    renderPanel({ noFactor: true });
    expect(assignForm().getByLabelText('Joins after (hours or minutes)')).toBeInTheDocument();
    chooseResource(/^Crane\b/);
    fireEvent.change(assignForm().getByLabelText('Joins after (hours or minutes)'), {
      target: { value: '2d' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    expect(await screen.findByText(/That’s in days/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('registers the refusal with the form rather than failing silently', async () => {
    // The guard used to just `return`: nothing landed in RHF's `errors`, so the form's own
    // `FormErrorSummary` (role="alert") had nothing to announce, focus never moved, and the Assign
    // button stayed lit while doing nothing when pressed. `AddLinkSection` — the sibling this code's
    // comment claims parity with — has always called `setError(..., { shouldFocus: true })`.
    renderPanel({ noFactor: true });
    const field = assignForm().getByLabelText('Joins after (hours or minutes)');
    chooseResource(/^Crane\b/);
    fireEvent.change(field, { target: { value: '2d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => {
      expect(field).toHaveAttribute('aria-invalid', 'true');
    });
    expect(field).toHaveFocus();
  });

  it('accepts hours with no factor, because an hour needs none', async () => {
    renderPanel({ noFactor: true });
    chooseResource(/^Crane\b/);
    fireEvent.change(assignForm().getByLabelText('Joins after (hours or minutes)'), {
      target: { value: '4h' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign resource' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    const body = JSON.parse(
      (vi.mocked(apiFetch).mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body.lagMinutes).toBe(240);
  });

  it('hides the control for a zero-span milestone, which has nothing for a lag to sit inside', () => {
    renderPanel({ isMilestone: true });
    expect(screen.queryByLabelText('Joins after')).not.toBeInTheDocument();
  });

  it('seeds an existing lag into the row editor and saves a change in minutes', async () => {
    // 2 days at eight hours = 960 minutes; the row must READ that back as `2d`, not as `16h`.
    renderPanel({}, [{ ...ASSIGNMENT, lagMinutes: 960 }]);
    const field = assignedRow().getByLabelText('Joins after');
    expect(field).toHaveValue('2d');

    fireEvent.change(field, { target: { value: '4h' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save join delay for Crew A' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    const body = JSON.parse(
      (vi.mocked(apiFetch).mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body.lagMinutes).toBe(240);
    // A lag save must not carry an `editedField`: a lag is not a triad term (ADR-0040) and must
    // never trigger a duration recompute.
    expect(body.editedField).toBeUndefined();
  });

  it('shades the row’s Save rather than natively disabling it', async () => {
    // ADR-0060 M6 / ADR-0063 M6: this control flips its unavailability twice per save, and a
    // natively-disabled element holding focus is blurred to `<body>` each time (WCAG 2.4.3). It must
    // be `aria-disabled` with a real click guard — clicking it while shaded must write nothing.
    renderPanel({}, [{ ...ASSIGNMENT, lagMinutes: 960 }]);
    const save = screen.getByRole('button', { name: 'Save join delay for Crew A' });
    // Nothing has changed yet, so there is nothing to save.
    expect(save).not.toBeDisabled();
    expect(save).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(save);
    await waitFor(() => {
      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  it('states an existing lag on a read-only row, and states nothing when there is none', () => {
    renderPanel({ canWrite: false }, [{ ...ASSIGNMENT, lagMinutes: 480 }]);
    expect(screen.getByText(/joins after 1d/)).toBeInTheDocument();
  });

  it('does not write “0d” onto an unlagged read-only row', () => {
    // A zero lag is what every unlagged assignment has; printing it reads as a choice somebody made.
    renderPanel({ canWrite: false });
    expect(screen.queryByText(/joins after/)).not.toBeInTheDocument();
  });
});
