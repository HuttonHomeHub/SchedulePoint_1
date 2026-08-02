import { WorkingWeekdays } from '@repo/types';
import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ActivityFormDialog } from './ActivityFormDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * The per-activity calendar picker with BOTH `VITE_ACTIVITY_CALENDAR` and `VITE_LIBRARY_SCOPING` on
 * (ADR-0053 §1): the plan's project supplies its own calendars alongside the organisation's, so the
 * options group by tier. The flag-off flat list is covered by `ActivityFormDialog.calendar.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_CALENDAR_ENABLED: true,
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

function calendar(overrides: Partial<CalendarSummary> & { id: string }): CalendarSummary {
  return {
    name: overrides.id,
    description: null,
    workingWeekdays: 31,
    shifts: WorkingWeekdays.toFullDayShifts(31),
    hoursPerDay: 24,
    hoursPerDayMinutes: 1440,
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const ORG = calendar({ id: 'cal-org', name: '5-day week' });
const OWN = calendar({
  id: 'cal-own',
  name: 'Site shutdown',
  scope: 'PROJECT',
  projectId: 'proj-1',
});

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

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityFormDialog
        orgSlug="acme"
        planId="pl1"
        open
        onClose={vi.fn()}
        calendars={[ORG, OWN]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const field = (): HTMLElement => screen.getByRole('combobox', { name: 'Calendar' });
/** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
const open = (): void => {
  fireEvent.keyDown(field(), { key: 'ArrowDown' });
};
/**
 * The picker's visible tier group headings, in DOM order. Scoped to the listbox — the surrounding
 * form has `role="group"` fieldsets of its own, which are not tiers.
 */
function groupLabels(): string[] {
  return within(screen.getByRole('listbox'))
    .queryAllByRole('group')
    .map((group) => {
      const labelId = group.getAttribute('aria-labelledby') ?? '';
      return document.getElementById(labelId)?.textContent ?? '';
    });
}

describe('ActivityFormDialog — combobox calendar picker (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue({ id: 'a1' });
  });

  it('groups the calendar options by tier, keeping inherit ungrouped at the top', () => {
    renderDialog();
    open();

    // `role="group"` + an associated visible label is the APG successor of `<optgroup label>`.
    expect(groupLabels()).toEqual(['Organisation calendars', 'This project’s calendars']);
    // The inherit option is deliberately outside both groups — it is not a calendar. Scoped to the
    // listbox for the reason `groupLabels` already is: the form's own `FormSection`s are
    // `role="group"` too (ADR-0061), and a bare `closest` would find the enclosing section instead.
    const listbox = screen.getByRole('listbox');
    const inherit = within(listbox).getByRole('option', { name: 'Plan default (inherit)' });
    const enclosing = inherit.closest('[role="group"]');
    expect(enclosing === null || !listbox.contains(enclosing)).toBe(true);
    const project = screen.getByRole('group', { name: 'This project’s calendars' });
    expect(within(project).getByRole('option', { name: 'Site shutdown' })).toBeInTheDocument();
  });

  it('stays flat when the project contributes no calendars of its own', () => {
    renderDialog({ calendars: [ORG] });
    open();
    expect(groupLabels()).toEqual([]);
  });

  it('filters server-free over the complete library as the planner types', () => {
    renderDialog();
    fireEvent.change(field(), { target: { value: 'shut' } });

    expect(screen.getByRole('option', { name: 'Site shutdown' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '5-day week' })).not.toBeInTheDocument();
    // "Inherit" is not a search result, so it is never filtered away.
    expect(screen.getByRole('option', { name: 'Plan default (inherit)' })).toBeInTheDocument();
  });

  it('keeps an archived seeded calendar selected, badged Archived', () => {
    const archived = calendar({
      id: 'cal-old',
      name: 'Winter shutdown',
      archivedAt: '2026-07-01T00:00:00Z',
    });
    renderDialog({
      calendars: [ORG, archived],
      activity: { ...ACTIVITY, calendarId: 'cal-old' },
    });

    expect(field()).toHaveValue('Winter shutdown');
    open();
    expect(screen.getByRole('option', { name: 'Winter shutdown, Archived' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // …while a DIFFERENT archived calendar is never offered for a new selection.
    expect(screen.queryByRole('option', { name: /Summer/ })).not.toBeInTheDocument();
  });

  it('selects a calendar with the keyboard and submits it', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavate' } });
    open();
    fireEvent.keyDown(field(), { key: 'End' });
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /Create activity|Save changes/ }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string) as {
      calendarId?: string;
    };
    expect(body.calendarId).toBe('cal-own');
  });

  it('has no axe violations with the picker open', async () => {
    const { container } = renderDialog();
    open();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('maps a 422 CALENDAR_WRONG_SCOPE on save to an actionable message', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Validation failed.',
        details: { reason: 'CALENDAR_WRONG_SCOPE' },
      }),
    );
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavate' } });
    fireEvent.click(screen.getByRole('button', { name: /Create activity|Save changes/ }));

    expect(
      await screen.findByText(/belongs to another project and can’t be used here/),
    ).toBeInTheDocument();
  });
});
