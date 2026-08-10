import { WorkingWeekdays } from '@repo/types';
import type { CalendarSummary, PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanCalendarPicker } from './PlanCalendarPicker';

import { apiFetch } from '@/lib/api/client';

// This suite documents the plan-calendar picker's BASE behaviour over the org library (ADR-0024):
// the current value, the PATCH body, clearing to null, the loading placeholder and the read-only
// render. It pinned `LIBRARY_SCOPING_ENABLED` OFF until ADR-0088 D3 retired that flag and deleted
// the native `<select>` arm, so the assertions were CONVERTED to drive the `Combobox` — the claims
// are unchanged, only the control they reach through. Tier grouping stays with the sibling
// `PlanCalendarPicker.scope.test.tsx` (ADR-0053 §1/§4).

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const PLAN: PlanSummary = {
  id: 'plan-1',
  projectId: 'proj-1',
  name: 'Baseline',
  description: null,
  status: 'DRAFT',
  schedulingMode: 'EARLY',
  progressRecalcMode: 'RETAINED_LOGIC',
  useExpectedFinishDates: false,
  criticalPathDefinition: 'TOTAL_FLOAT',
  criticalFloatThresholdMinutes: 0,
  totalFloatMode: 'FINISH',
  makeOpenEndsCritical: false,
  ignoreExternalRelationships: false,
  levelResources: false,
  levelWithinFloatOnly: false,
  eacMethod: 'CPI',
  currencyCode: null,
  plannedStart: '2026-01-01',
  calendarId: 'cal-standard',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-standard',
    name: 'Standard',
    description: null,
    workingWeekdays: 31,
    shifts: WorkingWeekdays.toFullDayShifts(31),
    hoursPerDay: 24,
    hoursPerDayMinutes: 1440,
    // Every fixture is a shared organisation calendar — the only tier before ADR-0053.
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cal-7',
    name: 'Seven-day',
    description: null,
    workingWeekdays: 127,
    shifts: WorkingWeekdays.toFullDayShifts(127),
    hoursPerDay: 24,
    hoursPerDayMinutes: 1440,
    // Every fixture is a shared organisation calendar — the only tier before ADR-0053.
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderPicker(props: Partial<React.ComponentProps<typeof PlanCalendarPicker>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanCalendarPicker orgSlug="acme" plan={PLAN} calendars={CALENDARS} canEdit {...props} />
    </QueryClientProvider>,
  );
}

const field = (): HTMLElement => screen.getByRole('combobox', { name: 'Calendar' });
/** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
const open = (): void => {
  fireEvent.keyDown(field(), { key: 'ArrowDown' });
};
/**
 * Pick by visible name. Options exist in the DOM only while the listbox is open, and the Combobox
 * commits on `pointerDown` rather than `click` — deliberately, so the pick beats the input's own
 * `blur`, which would otherwise close the listbox first on touch.
 */
const choose = (name: string): void => {
  open();
  fireEvent.pointerDown(within(screen.getByRole('listbox')).getByRole('option', { name }));
};

describe('PlanCalendarPicker', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, version: 5 });
  });

  it('shows the current calendar selected and lists the org calendars + None', () => {
    renderPicker();
    expect(field()).toHaveValue('Standard');
    open();
    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.getByRole('option', { name: 'None (all days work)' })).toBeInTheDocument();
    expect(listbox.getByRole('option', { name: 'Seven-day' })).toBeInTheDocument();
  });

  it('PATCHes the plan with the chosen calendar id and version', async () => {
    renderPicker();
    choose('Seven-day');

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ calendarId: 'cal-7', version: 4 });
  });

  it('clears the calendar (null) when None is chosen', async () => {
    renderPicker();
    choose('None (all days work)');

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ calendarId: null, version: 4 });
  });

  it('keeps the current calendar selected (not blank) while the calendars list loads', () => {
    // Plan has a calendar, but the list hasn't arrived yet — the control must not silently show
    // "None", which would misrepresent the plan's actual calendar. The Combobox carries this as its
    // own value (there is no option list to hold a placeholder), and reports the wait via
    // `aria-busy` rather than by going inert.
    renderPicker({ calendars: [], calendarsLoading: true });
    expect(field()).toHaveValue('Loading…');
    expect(field()).toHaveAttribute('aria-busy', 'true');
  });

  it('renders read-only (no control) for a non-editor, showing the calendar name', () => {
    renderPicker({ canEdit: false });
    expect(screen.queryByRole('combobox', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });

  it('shows "None (all days work)" read-only when the plan has no calendar', () => {
    renderPicker({ canEdit: false, plan: { ...PLAN, calendarId: null } });
    expect(screen.getByText('None (all days work)')).toBeInTheDocument();
  });
});
