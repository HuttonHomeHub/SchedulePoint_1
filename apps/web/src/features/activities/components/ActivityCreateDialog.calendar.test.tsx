import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

import { apiFetch } from '@/lib/api/client';

/**
 * The per-activity calendar picker (ADR-0037, M5) with `VITE_ACTIVITY_CALENDAR` forced ON — the
 * feature ships dark by default, so this suite pins the flag to prove the Select renders, defaults to
 * inherit, persists a chosen calendar, and surfaces a load error without masking a seeded calendar as
 * "inherit". The org calendars are route-composed (passed as a prop), so no calendars fetch is
 * mocked here — only the create/update mutation hits `apiFetch`. (The flag-off behaviour — no
 * picker, value still round-trips — is covered by `ActivityCreateDialog.test.tsx`.)
 *
 * **Two edit-mode cases moved** when `ActivityCreateDialog` lost its edit path
 * (activity-dialog-unification epic): "seeds the activity's calendar and clears it to inherit (null)
 * on save" ported to `ActivityEditorDialog.round-trips.test.tsx` — "seeds the activity's calendar and
 * clears it to inherit (null) on a Scheduling save"; "surfaces a load error and keeps a seeded
 * calendar visibly distinct from inherit" is covered by
 * `fields/ActivityCalendarField.test.tsx` ("says the list failed rather than offering a short one" +
 * "still shows a bound calendar the list does not contain").
 */
// `LIBRARY_SCOPING_ENABLED` is pinned OFF so this suite keeps documenting the BASE per-activity
// calendar picker — a flat, ungrouped native `<select>` over the org library (ADR-0037). The
// tier-grouped `Combobox` the flag turns it into has its own suite,
// `ActivityCreateDialog.scope.test.tsx` (ADR-0053 §1/§4). Pinning both directions means neither
// behaviour can regress unnoticed when the flag default moves.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_CALENDAR_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const CALENDARS: CalendarSummary[] = [
  {
    id: 'cal-5day',
    name: '5-day week',
    description: null,
    workingWeekdays: 0b0011111, // Mon–Fri
    shifts: WorkingWeekdays.toFullDayShifts(0b0011111),
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
    id: 'cal-247',
    name: '24/7',
    description: null,
    workingWeekdays: 0b1111111, // every day
    shifts: WorkingWeekdays.toFullDayShifts(0b1111111),
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

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
  durationMinutes: 2400,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: 'cal-247',
  laneIndex: 0,
  scheduleAsLateAsPossible: false,
  expectedFinish: null,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  remainingDurationDays: null,
  remainingDurationMinutes: null,
  suspendDate: null,
  resumeDate: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  freeFloat: null,
  isCritical: false,
  isNearCritical: false,
  constraintViolated: false,
  externalDriven: false,
  loeNoSpan: false,
  resourceDriverMissing: false,
  externalEarlyStart: null,
  externalLateFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
  levelingPriority: null,
  leveledStart: null,
  leveledFinish: null,
  levelingDelayDays: null,
  levelingWindowExceeded: false,
  selfOverAllocated: false,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityCreateDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityCreateDialog
        orgSlug="acme"
        planId="pl1"
        open
        onClose={vi.fn()}
        calendars={CALENDARS}
        // The plan's calendar, which every real host supplies (ADR-0070). Without it, selecting
        // "inherit" leaves the duration field with no working-hours factor and its submit guard
        // correctly refuses the save — a true behaviour, but not the one this suite is about.
        planCalendarId="cal-247"
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

describe('ActivityCreateDialog — calendar picker (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('offers "Plan default (inherit)" plus each org calendar, defaulting to inherit on a new activity', () => {
    renderDialog();
    // Inherit is the value, shown by its label rather than as a blank field — the Combobox renders
    // `emptyOption`'s label as the selection (ADR-0053 M6), because "None"/"Inherit" is the most
    // common state of all and a blank box reads as unset-and-broken.
    expect(comboField('Calendar')).toHaveValue('Plan default (inherit)');
    openCombo('Calendar');
    const labels = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual(['Plan default (inherit)', '5-day week', '24/7']);
  });

  it('creates an activity on a chosen calendar', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    chooseCombo('Calendar', '5-day week');
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      calendarId: 'cal-5day',
    });
  });
});
