import { WorkingWeekdays } from '@repo/types';
import type { CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ActivityCreateDialog } from './ActivityCreateDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * The per-activity calendar picker with BOTH `VITE_ACTIVITY_CALENDAR` and `VITE_LIBRARY_SCOPING` on
 * (ADR-0053 §1): the plan's project supplies its own calendars alongside the organisation's, so the
 * options group by tier. The flag-off flat list is covered by `ActivityCreateDialog.calendar.test.tsx`.
 *
 * **The archived-seeded-calendar case moved.** `ActivityCreateDialog` lost its edit path in the
 * activity-dialog-unification epic (create-only now, no `activity` prop), so "keeps an archived
 * seeded calendar selected, badged Archived" ported to `fields/ActivityCalendarField.test.tsx` —
 * "keeps it selected, badged Archived, rather than reading as an ordinary choice". It moved to the
 * field-group suite rather than the editor: the tier grouping and the Archived badge are both
 * `ActivityCalendarField`'s own behaviour (via `lib/calendar-tiers.ts`), driven identically by
 * either host, and that suite had no coverage of the archived state at all before this.
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

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityCreateDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityCreateDialog
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

describe('ActivityCreateDialog — combobox calendar picker (flag on)', () => {
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
