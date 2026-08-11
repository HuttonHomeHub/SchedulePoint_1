import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { WorkingWeekdays } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';

/**
 * **Seed → field → per-scope Save → PATCH body, ported from the deleted edit path of
 * `ActivityCreateDialog` (activity-dialog-unification epic).**
 *
 * These cases used to live in `ActivityCreateDialog.<flag>.test.tsx` files, one per flagged field
 * group, driving a single wide `renderDialog({ activity })` → change → one "Save changes" click →
 * one PATCH body. `ActivityCreateDialog` is now create-only (no `activity` prop, no edit path at
 * all), so the behaviour they proved — a stored value the reader never touched survives a save of a
 * DIFFERENT field, because the seed reads every field from the row and the body sends every field
 * the scope owns — now lives here, against the ONE remaining edit surface. Porting is a rewrite, not
 * a move: the editor saves per scope, so each case opens the tab that owns the field, asserts the
 * seeded value, saves THAT scope's button, and reads the PATCH body from that save alone.
 *
 * Pure value-mapping (blank → null, major ↔ minor money, the `CLEARABLE_KEYS` set) is proven once,
 * flag-independently, at the builder — `apps/web/src/features/activities/api/scope-bodies.test.ts`
 * and `activity-body-builders.structural.test.ts`. What is proven here instead is the WIRING no pure
 * function test can see: that the real field shows what the row seeded, and that the button a
 * planner actually clicks sends it.
 */

const PATCHES: { url: string; body: Record<string, unknown> }[] = [];

function row(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'act-1',
    planId: 'plan-1',
    name: 'Pour slab',
    code: 'A100',
    type: 'TASK',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationDays: 5,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    version: 1,
    ...overrides,
  } as ActivitySummary;
}

const PLANNER_WITH_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function mount(props: Partial<Parameters<typeof ActivityEditorDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        activity={row()}
        gating={PLANNER_WITH_PEN}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const openTab = (name: string): void => {
  fireEvent.click(screen.getByRole('tab', { name }));
};

/** What the steps GET returns — mutable so a Progress-tab mount doesn't need it, but must answer. */
let STEPS: { name: string; weight: number; percentComplete: number }[] = [];

beforeEach(() => {
  PATCHES.length = 0;
  STEPS = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET') {
        const body: string = typeof init?.body === 'string' ? init.body : '{}';
        PATCHES.push({ url, body: JSON.parse(body) as Record<string, unknown> });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(url.includes('/steps') ? { data: STEPS } : { data: row({ version: 2 }) }),
      } as unknown as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('ActivityEditorDialog — WBS self-parenting (ported from ActivityCreateDialog.activity-types.test.tsx)', () => {
  it('does not offer the activity being edited as its own WBS parent', () => {
    // A real invariant, not a display nicety: `parentOptions` is filtered by
    // `a.id !== activity?.id` (`ActivityEditorDialog.tsx`), and editing a summary is the one case
    // that can put the activity itself in `planActivities`.
    const summary = row({ id: 'sum-1', code: 'TT.4', name: 'Superstructure', type: 'WBS_SUMMARY' });
    const other = row({ id: 'sum-2', code: 'TT.5', name: 'Substructure', type: 'WBS_SUMMARY' });
    mount({ activity: summary, planActivities: [summary, other] });

    const parent = screen.getByLabelText('Parent WBS summary');
    expect(within(parent).queryByRole('option', { name: 'TT.4 · Superstructure' })).toBeNull();
    expect(within(parent).getByRole('option', { name: 'TT.5 · Substructure' })).toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — Cost accrual round-trip (ported from ActivityCreateDialog.cost-accrual.test.tsx)', () => {
  it('seeds accrualType from the row and round-trips it on a Cost save', async () => {
    mount({ activity: row({ accrualType: 'START', version: 3 }) });
    openTab('Cost');
    expect(screen.getByLabelText('Cost accrual')).toHaveValue('START');

    // Dirty the scope with an unrelated field, so Save is enabled without touching accrualType.
    fireEvent.change(screen.getByLabelText('Budgeted expense'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({ accrualType: 'START', version: 3 });
  });
});

describe('ActivityEditorDialog — duration type round-trip (ported from ActivityCreateDialog.duration-types.test.tsx)', () => {
  it('seeds the duration type from the row and round-trips it on a General save', async () => {
    mount({ activity: row({ durationType: 'FIXED_UNITS', version: 3 }) });
    expect(screen.getByLabelText('Duration type')).toHaveValue('FIXED_UNITS');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab B' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({ durationType: 'FIXED_UNITS', version: 3 });
  });
});

describe('ActivityEditorDialog — levelling priority round-trip (ported from ActivityCreateDialog.levelling.test.tsx)', () => {
  it('seeds the priority from the row and round-trips it on a Scheduling save', async () => {
    mount({ activity: row({ levelingPriority: 10, version: 3 }) });
    openTab('Scheduling');
    expect(screen.getByLabelText('Levelling priority')).toHaveValue(10);

    fireEvent.click(screen.getByLabelText(/schedule as late as possible/i));
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({ levelingPriority: 10, version: 3 });
  });
});

describe('ActivityEditorDialog — external dates round-trip (ported from ActivityCreateDialog.inter-project-dates.test.tsx)', () => {
  it('seeds both dates from the row and round-trips them on a Scheduling save', async () => {
    mount({
      activity: row({
        externalEarlyStart: '2026-02-01',
        externalLateFinish: '2026-03-01',
        version: 3,
      }),
    });
    openTab('Scheduling');
    expect(screen.getByLabelText('External early start')).toHaveValue('2026-02-01');
    expect(screen.getByLabelText('External late finish')).toHaveValue('2026-03-01');

    fireEvent.click(screen.getByLabelText(/schedule as late as possible/i));
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({
      externalEarlyStart: '2026-02-01',
      externalLateFinish: '2026-03-01',
      version: 3,
    });
  });
});

describe('ActivityEditorDialog — calendar round-trip (ported from ActivityCreateDialog.calendar.test.tsx)', () => {
  const CALENDARS: CalendarSummary[] = [
    {
      id: 'cal-247',
      name: '24/7',
      description: null,
      workingWeekdays: 0b1111111,
      shifts: WorkingWeekdays.toFullDayShifts(0b1111111),
      hoursPerDay: 24,
      hoursPerDayMinutes: 1440,
      scope: 'ORG',
      projectId: null,
      archivedAt: null,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const comboField = (): HTMLElement => screen.getByRole('combobox', { name: 'Calendar' });
  /** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
  const openCombo = (): void => {
    fireEvent.keyDown(comboField(), { key: 'ArrowDown' });
  };
  const chooseCombo = (option: string | RegExp): void => {
    openCombo();
    fireEvent.pointerDown(
      within(screen.getByRole('listbox')).getByRole('option', { name: option }),
    );
  };

  it('seeds the activity’s calendar and clears it to inherit (null) on a Scheduling save', async () => {
    mount({
      activity: row({ calendarId: 'cal-247', version: 3 }),
      calendars: CALENDARS,
      planCalendarId: 'cal-247',
    });
    openTab('Scheduling');
    expect(comboField()).toHaveValue('24/7');

    chooseCombo('Plan default (inherit)');
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({ calendarId: null, version: 3 });
  });
});

describe('ActivityEditorDialog — advanced constraint fields, flag on (ported from ActivityCreateDialog.advanced-constraints.test.tsx)', () => {
  it('seeds the secondary constraint, ALAP and expected finish from the row', () => {
    mount({
      activity: row({
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-06-01',
        scheduleAsLateAsPossible: true,
        expectedFinish: '2026-05-20',
      }),
    });
    openTab('Scheduling');
    expect(screen.getByLabelText('Secondary constraint')).toHaveValue('FNLT');
    expect(screen.getByLabelText('Secondary constraint date')).toHaveValue('2026-06-01');
    expect(screen.getByLabelText('Schedule as late as possible')).toBeChecked();
    expect(screen.getByLabelText('Expected finish')).toHaveValue('2026-05-20');
  });
});

describe('ActivityEditorDialog — a parked MANDATORY_* constraint round-trips (ported from ActivityCreateDialog.test.tsx)', () => {
  it('re-sends a seeded parked constraint and its date unchanged on a Scheduling save', async () => {
    // `ActivityConstraintFields.test.tsx` already pins the SELECT's own honest display (keeps its
    // place under a label saying what it does, drops out once the reader picks something else).
    // What that field-level harness cannot see is the PATCH: does the editor's Scheduling save
    // actually re-send the parked value, or does an untouched control silently omit it?
    mount({
      activity: row({
        constraintType: 'MANDATORY_START',
        constraintDate: '2026-03-02',
        version: 3,
      }),
    });
    openTab('Scheduling');
    expect(screen.getByLabelText('Constraint')).toHaveValue('MANDATORY_START');

    // Dirty an unrelated field in the same scope — the realistic way a planner saves this tab.
    fireEvent.click(screen.getByLabelText(/schedule as late as possible/i));
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({
      constraintType: 'MANDATORY_START',
      constraintDate: '2026-03-02',
      scheduleAsLateAsPossible: true,
      version: 3,
    });
  });
});

describe('ActivityEditorDialog — Cost & Earned Value round-trips (ported from ActivityCreateDialog.earned-value.test.tsx)', () => {
  // 250000 minor = 2,500.00 major; 100000 minor = 1,000.00 major.
  const ACTIVITY = row({
    percentCompleteType: 'PHYSICAL',
    physicalPercentComplete: 40,
    budgetedExpense: 250000,
    actualExpense: 100000,
    version: 3,
  });

  it('seeds the expenses (minor → major) from the row and round-trips them on a Cost save', async () => {
    mount({ activity: ACTIVITY });
    openTab('Cost');
    expect(screen.getByLabelText('Budgeted expense')).toHaveValue(2500);
    expect(screen.getByLabelText('Actual expense')).toHaveValue(1000);

    // Dirty the scope with a field OTHER than the two under test, so the assertion below proves
    // the expenses round-trip UNTOUCHED rather than merely that whatever is typed is sent.
    fireEvent.change(screen.getByLabelText('Cost accrual'), { target: { value: 'START' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({
      budgetedExpense: 250000,
      actualExpense: 100000,
      version: 3,
    });
  });

  it('seeds the value measure from the row and round-trips it on a Progress (Measure) save', async () => {
    mount({ activity: ACTIVITY });
    openTab('Progress');
    expect(await screen.findByLabelText('Earn value from')).toHaveValue('PHYSICAL');
    expect(screen.getByLabelText('Physical % complete')).toHaveValue(40);

    // The measure scope has only these two fields, so dirtying it means editing one of them —
    // this proves the OTHER (the %-complete-type selection) round-trips unchanged.
    fireEvent.change(screen.getByLabelText('Physical % complete'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: /save measure/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({
      percentCompleteType: 'PHYSICAL',
      physicalPercentComplete: 45,
      version: 3,
    });
  });
});

describe('ActivityEditorDialog — onSaved (ADR-0048), ported from ActivityCreateDialog.test.tsx', () => {
  it('calls onSaved with the pre-save row and the server’s post-save row on a successful scope save', async () => {
    // The undo seam: the create dialog's now-deleted edit path called `onSaved(activity, saved)`
    // once, on its single wide submit. The editor calls it from `saveScope`, on EVERY scope's save —
    // ported as a General-scope save, the case a planner hits most often.
    const before = row({ version: 1 });
    const onSaved = vi.fn();
    mount({ activity: before, onSaved });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Excavate deeper' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // Pre-save row first (the undo target), then the server's post-save row (the redo target) — the
    // mocked fetch above always answers a write with `row({ version: 2 })`.
    expect(onSaved).toHaveBeenCalledWith(before, row({ version: 2 }));
  });
});
