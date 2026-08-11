import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { WorkingWeekdays } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';
import { ActivityFormDialog } from './ActivityFormDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import type * as ApiClient from '@/lib/api/client';
import { apiFetch } from '@/lib/api/client';

/**
 * **What each host does today with the same activity — including where they disagree.**
 *
 * `ActivityFormDialog` (create) and `ActivityEditorDialog` (tabbed edit) render the same ~20
 * definition fields with **no shared code**, and nine features' worth of additions have drifted
 * them apart. The activity-dialog-unification epic (`docs/specs/activity-dialog-unification/`)
 * extracts shared field groups; before anything moves, this file pins what each surface does
 * **now**, so an extraction that silently resolves a divergence in the extractor's favour fails
 * here instead of being absorbed.
 *
 * **This suite is written to be deleted or rewritten, one `it()` at a time.** Each divergence
 * closes in a converge commit (plan M2–M4), and the assertion pinning it is expected to flip in
 * that commit — a failure here after a converge commit is the **intended signal**, not a
 * regression. Do not "fix" a failing case by loosening it: change it to state the converged
 * behaviour, or delete it once the divergence no longer exists.
 *
 * **Two deliberate choices about how the comparison is set up.**
 *
 * 1. Both hosts are mounted **on the same stored activity**, which means `ActivityFormDialog` is
 *    driven through its *edit* path. That path is unreachable by users (both mount sites are
 *    flag-off branches) but is exercised by two live Playwright harnesses, and — more to the
 *    point — its field markup is byte-identical in both modes: `isEdit` changes only the dialog
 *    title, its description, the submit label and which mutation fires. Comparing like with like
 *    is what makes a divergence attributable to the host rather than to the mode.
 * 2. **No `@/config/env` mock for the default cases.** Every flag these hosts read is
 *    `flagDefaultOn`, so the unmocked configuration *is* the shipped one (ADR-0088 D1). The one
 *    exception is `ADVANCED_CONSTRAINTS_ENABLED`, which D6 is *about*, and which is toggled
 *    through a getter so the off-branch can be characterised in the same file.
 *
 * Case names state the fact being pinned and carry the divergence number from the spec's §1.3
 * table where there is one; rows found here and **absent from that table** are marked `NEW`.
 */

const flags = vi.hoisted(() => ({ advancedConstraints: true }));

// A getter, not a value: these constants are read at render time, so one mocked module can serve
// both branches without `vi.resetModules()` (the `password-reset.parity.test.tsx` precedent).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get ADVANCED_CONSTRAINTS_ENABLED() {
    return flags.advancedConstraints;
  },
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

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

const SUMMARY = row({ id: 'sum-1', name: 'Phase 1', code: 'W1', type: 'WBS_SUMMARY' });

/** An eight-hour calendar, so the duration field resolves its ADR-0068 factor on both hosts. */
const CALENDAR: CalendarSummary = {
  id: 'cal-1',
  name: '5-day week',
  description: null,
  workingWeekdays: 31,
  shifts: WorkingWeekdays.toFullDayShifts(31),
  hoursPerDay: 8,
  hoursPerDayMinutes: 480,
  scope: 'ORG',
  projectId: null,
  archivedAt: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const PLANNER_WITH_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function mountCreate(
  props: Partial<React.ComponentProps<typeof ActivityFormDialog>> = {},
): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={client()}>
      <ActivityFormDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        calendars={[CALENDAR]}
        planCalendarId="cal-1"
        planActivities={[SUMMARY]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

function mountEditor(
  props: Partial<Parameters<typeof ActivityEditorDialog>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={client()}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        calendars={[CALENDAR]}
        planCalendarId="cal-1"
        planActivities={[SUMMARY]}
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

/** The text a control points at with `aria-describedby` — its hint, error and reason, in order. */
function hintOf(control: HTMLElement): string {
  return (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

/** Every `FormSection` / panel heading currently on screen, in DOM order. */
function sectionHeadings(): string[] {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent ?? '')
    .map((text) => text.replace(/\s+/g, ' ').trim());
}

const optionValues = (select: HTMLElement): string[] =>
  [...(select as HTMLSelectElement).options].map((option) => option.value);
const optionLabels = (select: HTMLElement): string[] =>
  [...(select as HTMLSelectElement).options].map((option) => option.textContent ?? '');

function bodyOfLastRequest(): Record<string, unknown> {
  const calls = vi.mocked(apiFetch).mock.calls;
  const last = calls.at(-1);
  if (!last) throw new Error('no request was made');
  return JSON.parse((last[1] as RequestInit).body as string) as Record<string, unknown>;
}

beforeEach(() => {
  flags.advancedConstraints = true;
  vi.mocked(apiFetch)
    .mockReset()
    // The Progress tab's steps GET must answer with a list; every write answers with the row.
    .mockImplementation((path: string) =>
      Promise.resolve(path.includes('/steps') ? [] : row({ version: 2 })),
    );
});

describe('divergence D1 (CLOSED, M3-T1 commit B) — the calendar picker', () => {
  it('both hosts shade a resource-dependent calendar with `readOnly`, never `disabled` (ADR-0083)', () => {
    // Create inlined its own `Combobox` and reached for native `disabled`; the editor called the
    // shared component, which had already taken ADR-0083's rule. `disabled` on this control hides
    // which calendar the activity carries from the one reader who most needs to know it is being
    // overridden — the value stops being focusable, selectable and copyable to buy nothing.
    const resourceDependent = row({ type: 'RESOURCE_DEPENDENT' });

    const created = mountCreate({ activity: resourceDependent });
    const createField = screen.getByRole('combobox', { name: 'Calendar' });
    expect(createField).toHaveAttribute('readonly');
    expect(createField).not.toBeDisabled();
    created.unmount();

    mountEditor({ activity: resourceDependent });
    openTab('Scheduling');
    const editorField = screen.getByRole('combobox', { name: 'Calendar' });
    expect(editorField).toHaveAttribute('readonly');
    expect(editorField).not.toBeDisabled();
  });

  it('NEW (CLOSED) — the two hosts word the ordinary calendar hint identically', () => {
    const hint =
      'The working-time calendar this activity is scheduled on. Inherits the plan’s calendar unless you pick one. Recalculate to apply it to the activity’s dates.';

    const created = mountCreate({ activity: row() });
    expect(hintOf(screen.getByRole('combobox', { name: 'Calendar' }))).toBe(hint);
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    expect(hintOf(screen.getByRole('combobox', { name: 'Calendar' }))).toBe(hint);
  });

  it('the resource-dependent reason itself is already identical — the one thing D1 must not change', () => {
    const reason =
      'Not used by a resource-dependent activity — it is scheduled on its driving resource’s calendar instead. Change the type back to set a calendar here.';
    const resourceDependent = row({ type: 'RESOURCE_DEPENDENT' });

    const created = mountCreate({ activity: resourceDependent });
    expect(hintOf(screen.getByRole('combobox', { name: 'Calendar' }))).toBe(reason);
    created.unmount();

    mountEditor({ activity: resourceDependent });
    openTab('Scheduling');
    expect(hintOf(screen.getByRole('combobox', { name: 'Calendar' }))).toBe(reason);
  });

  it('NEW (CLOSED) — neither host pins a fixed DOM id on its calendar control', () => {
    // Create's `activity-calendar` was referenced by nothing outside its own markup, and a fixed id
    // is a hazard the moment two of anything mount together. The shared component generates one.
    const created = mountCreate({ activity: row() });
    expect(screen.getByRole('combobox', { name: 'Calendar' })).not.toHaveAttribute(
      'id',
      'activity-calendar',
    );
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    expect(screen.getByRole('combobox', { name: 'Calendar' })).not.toHaveAttribute(
      'id',
      'activity-calendar',
    );
  });
});

describe('divergence D2 (CLOSED, M2-T3 commit A) — the WBS parent picker', () => {
  const nested = row({ parentId: 'gone-1' });

  it('both hosts name a stored parent absent from the list “Unavailable”', () => {
    // **The sharpest case in the table.** Before this converge the editor rendered nothing
    // selected, and read back `''` — the same value "None" carries — so nothing on screen or in
    // the DOM distinguished "nested under a summary I cannot resolve" from "top level". The save
    // still re-sent the real parent (the case below), which is worse rather than better: the
    // screen said one thing and the record held another.
    const created = mountCreate({ activity: nested });
    const createSelect = screen.getByLabelText('Parent WBS summary');
    expect(createSelect).toHaveValue('gone-1');
    expect(optionLabels(createSelect)).toContain('Unavailable');
    created.unmount();

    mountEditor({ activity: nested });
    const editorSelect = screen.getByLabelText('Parent WBS summary');
    expect(editorSelect).toHaveValue('gone-1');
    expect(optionLabels(editorSelect)).toContain('Unavailable');
  });

  it('but a General save still re-sends the unresolvable parent unchanged — the editor displays it wrongly, it does not drop it', async () => {
    mountEditor({ activity: nested });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(bodyOfLastRequest().parentId).toBe('gone-1');
  });

  it('NEW (CLOSED) — neither host claims “No summaries in this plan” while the activity is nested under one', () => {
    // The editor's `FormSection` aside said that whenever the offerable list was empty, which is
    // exactly when a stored-but-unresolvable parent is most likely — so the one activity that
    // disproves the sentence was the one it was shown to. Create carries no aside at all, and the
    // honest option above is the better answer to the same question.
    mountEditor({ activity: nested, planActivities: [] });
    expect(screen.queryByText('No summaries in this plan')).toBeNull();
  });

  it('both hosts surface the plan-activities loading and error states', () => {
    const loading = mountCreate({ planActivitiesLoading: true });
    expect(screen.getByLabelText('Parent WBS summary')).toBeDisabled();
    expect(screen.getByLabelText('Parent WBS summary')).toHaveAttribute('aria-busy', 'true');
    loading.unmount();

    const errored = mountCreate({ planActivitiesError: true, planActivities: [] });
    expect(
      screen.getByText(
        'Couldn’t load the plan’s activities, so no WBS summaries are available to choose.',
      ),
    ).toBeInTheDocument();
    errored.unmount();

    // The editor now takes both props. Its two mount sites already held the signals and were
    // passing them to create; the editor simply had nowhere to put them.
    const editorLoading = mountEditor({ planActivitiesLoading: true });
    expect(screen.getByLabelText('Parent WBS summary')).toBeDisabled();
    expect(screen.getByLabelText('Parent WBS summary')).toHaveAttribute('aria-busy', 'true');
    editorLoading.unmount();

    mountEditor({ planActivitiesError: true, planActivities: [] });
    expect(
      screen.getByText(
        'Couldn’t load the plan’s activities, so no WBS summaries are available to choose.',
      ),
    ).toBeInTheDocument();
  });

  it('NEW (CLOSED) — the hosts agree on the field’s label, its empty option and how an option reads', () => {
    // The LABEL converges onto the EDITOR, which is the one row in D2 where create loses: the Type
    // selector on the same form offers an OPTION labelled exactly “WBS summary”, so the shorter
    // label reads as if it sets the type. `ActivityEditorDialog.test.tsx:130` had recorded that
    // reason since the editor shipped. Everything else here converges onto create.
    const created = mountCreate();
    const createSelect = screen.getByLabelText('Parent WBS summary');
    expect(optionLabels(createSelect)).toEqual(['None (top-level)', 'W1 · Phase 1']);
    expect(hintOf(createSelect)).toContain(
      'Groups this activity under a WBS summary, whose dates roll up from its members.',
    );
    created.unmount();

    // The option carries its CODE, which is how a planner refers to a phase on a programme; the
    // editor showed the name alone, so two phases sharing a name were indistinguishable.
    mountEditor();
    const editorSelect = screen.getByLabelText('Parent WBS summary');
    expect(optionLabels(editorSelect)).toEqual(['None (top-level)', 'W1 · Phase 1']);
    expect(hintOf(editorSelect)).toContain(
      'Groups this activity under a WBS summary, whose dates roll up from its members.',
    );
  });

  it('NEW (CLOSED) — both hosts append the “no summaries yet” guidance once the list has resolved empty', () => {
    const created = mountCreate({ planActivities: [] });
    expect(hintOf(screen.getByLabelText('Parent WBS summary'))).toContain(
      'There are no WBS summaries in this plan yet',
    );
    created.unmount();

    mountEditor({ planActivities: [] });
    expect(hintOf(screen.getByLabelText('Parent WBS summary'))).toContain(
      'There are no WBS summaries in this plan yet',
    );
  });
});

describe('divergence D3 (CLOSED, M3-T2 commit A) — a parked MANDATORY_* constraint', () => {
  const parked = row({ constraintType: 'MANDATORY_START', constraintDate: '2026-03-02' });

  it('both hosts label a parked constraint honestly rather than showing no constraint at all', () => {
    // **The highest-consequence row in the table.** The engine parks `MANDATORY_*` — it accepts the
    // value and applies it as the nearest honoured kind — so the six offered are the six that behave
    // exactly as they read. An activity that already carries a parked value keeps it as its own
    // labelled option, or the selector shows nothing selected and reads back `''`, which is the
    // "None" option's own value: a constraint that IS set, displayed as unset, with its date filled
    // in below it.
    const created = mountCreate({ activity: parked });
    const createSelect = screen.getByLabelText('Constraint');
    expect(createSelect).toHaveValue('MANDATORY_START');
    expect(optionLabels(createSelect)).toContain('Mandatory start — applied as Must start on');
    created.unmount();

    mountEditor({ activity: parked });
    openTab('Scheduling');
    const editorSelect = screen.getByLabelText('Constraint');
    expect(editorSelect).toHaveValue('MANDATORY_START');
    expect(optionLabels(editorSelect)).toContain('Mandatory start — applied as Must start on');
    expect(screen.getByLabelText('Constraint date')).toHaveValue('2026-03-02');
  });

  it('a Scheduling save re-sends the parked constraint and its date unchanged — the display was wrong, the data never was', async () => {
    mountEditor({ activity: parked });
    openTab('Scheduling');
    // Dirty an unrelated field in the same scope: the realistic way a planner saves this tab.
    fireEvent.click(screen.getByLabelText(/schedule as late as possible/i));
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = bodyOfLastRequest();
    expect(body.constraintType).toBe('MANDATORY_START');
    expect(body.constraintDate).toBe('2026-03-02');
    expect(body.scheduleAsLateAsPossible).toBe(true);
  });

  it('the same holds for a parked SECONDARY constraint', () => {
    const secondary = row({
      secondaryConstraintType: 'MANDATORY_FINISH',
      secondaryConstraintDate: '2026-04-01',
    });

    const created = mountCreate({ activity: secondary });
    expect(optionLabels(screen.getByLabelText('Secondary constraint'))).toContain(
      'Mandatory finish — applied as Must finish on',
    );
    created.unmount();

    mountEditor({ activity: secondary });
    openTab('Scheduling');
    const editorSelect = screen.getByLabelText('Secondary constraint');
    expect(optionLabels(editorSelect)).toContain('Mandatory finish — applied as Must finish on');
    expect(editorSelect).toHaveValue('MANDATORY_FINISH');
  });

  it('NEW (CLOSED) — both constraint hints tell the reader an existing value keeps its own label', () => {
    const hint =
      'Pins the activity’s start or finish to a date. Only constraints the scheduler applies exactly as named are listed (an existing value keeps its own label).';

    const created = mountCreate();
    expect(hintOf(screen.getByLabelText('Constraint'))).toBe(hint);
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    expect(hintOf(screen.getByLabelText('Constraint'))).toBe(hint);
  });

  it('NEW (CLOSED) — the secondary-constraint hint keeps its worked example on both', () => {
    const created = mountCreate();
    expect(hintOf(screen.getByLabelText('Secondary constraint'))).toContain(
      'e.g. a primary “start no earlier than” with a secondary “finish no later than”',
    );
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    expect(hintOf(screen.getByLabelText('Secondary constraint'))).toContain(
      'e.g. a primary “start no earlier than” with a secondary “finish no later than”',
    );
  });
});

describe('divergence D4 (CLOSED, M2-T2 commit A1) — where the Type picker’s option list comes from', () => {
  it('both hosts keep the activity’s own out-of-set type after you change away from it', () => {
    // `HAMMOCK` is deliberately never offered (no engine behaviour), so it is only in the list
    // because this activity carries it — the honest-selector case both hosts claim to support.
    //
    // **Converged onto the EDITOR, which reverses the spec's §1.3 verdict.** That table says
    // "create wins", and this case — written before anything moved, which is what it is for —
    // records why that is wrong: reading the LIVE value makes the honest option a ONE-WAY DOOR.
    // It is in the list only because the stored row carries it, so the moment the planner selects
    // anything else the option that was keeping the selector honest disappears and there is no way
    // back without cancelling the dialog. The saved value cannot do that, and it cannot lose an
    // option either: a live value is always one the planner just picked FROM the list, so anchoring
    // on the stored row is a superset. Create's real create path is unaffected — with no activity
    // there is no out-of-set type to keep.
    const hammock = row({ type: 'HAMMOCK' });

    const created = mountCreate({ activity: hammock });
    expect(optionValues(screen.getByLabelText('Type'))).toContain('HAMMOCK');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'TASK' } });
    expect(optionValues(screen.getByLabelText('Type'))).toContain('HAMMOCK');
    created.unmount();

    mountEditor({ activity: hammock });
    expect(optionValues(screen.getByLabelText('Type'))).toContain('HAMMOCK');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'TASK' } });
    expect(optionValues(screen.getByLabelText('Type'))).toContain('HAMMOCK');
  });
});

describe('divergence D5 (CLOSED, M2-T2 commit A2) — the work explanations', () => {
  it.each([
    ['LEVEL_OF_EFFORT' as const, /A level-of-effort activity’s duration is derived from its span/],
    ['WBS_SUMMARY' as const, /A WBS summary’s dates roll up from the activities grouped under it/],
    // Matched on its leading text node only: the sentence is broken by a `<strong>`, and
    // Testing Library's text matcher reads a node's OWN text, not its descendants'.
    ['RESOURCE_DEPENDENT' as const, 'A resource-dependent activity is scheduled on its'],
  ])('both hosts explain a %s', (type, sentence) => {
    // An **addition** to the editor rather than a choice between two positions. Each of these three
    // types has no duration field at all, or has one whose meaning is not what the label suggests
    // — so the editor's Work section showed a control vanishing with nothing saying why, on the
    // surface a planner reaches by editing an activity that is already one of these types.
    const created = mountCreate({ activity: row({ type }) });
    expect(screen.getByText(sentence, { exact: false })).toBeInTheDocument();
    created.unmount();

    mountEditor({ activity: row({ type }) });
    expect(screen.getByText(sentence, { exact: false })).toBeInTheDocument();
  });
});

describe('divergence D6 (CLOSED, M3-T3) — “Schedule as late as possible”', () => {
  it('both hosts gate it behind VITE_ADVANCED_CONSTRAINTS', () => {
    // A flag's off-branch should be coherent: the editor hid the expected-finish field the checkbox
    // belongs with and left the checkbox itself standing. **No shipped image differs** — every
    // `VITE_` flag is inlined at build time and none is passed to the image build (ADR-0088 D1) —
    // so this makes the off-branch honest rather than changing anything a user sees.
    flags.advancedConstraints = false;

    const created = mountCreate();
    expect(screen.queryByLabelText(/schedule as late as possible/i)).not.toBeInTheDocument();
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    expect(screen.queryByLabelText(/schedule as late as possible/i)).not.toBeInTheDocument();
  });

  it('both hosts file it under Placement & targets, not under Constraints', () => {
    // It changes where the bar is DRAWN and touches neither dates nor float — so a checkbox sitting
    // among five controls that pin a date invited exactly the wrong reading.
    const created = mountCreate();
    expect(sectionHeadings()).toContain('Placement & targets');
    const createConstraints = screen.getByRole('group', { name: /Constraints/ });
    expect(
      within(createConstraints).queryByLabelText(/schedule as late as possible/i),
    ).not.toBeInTheDocument();
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    expect(sectionHeadings()).toContain('Placement & targets');
  });
});

describe('divergence D7 (CLOSED, M3-T3) — levelling priority', () => {
  it('both hosts hide levelling for a type levelling never moves', () => {
    // ADR-0041 delays activities that consume a resource for an entered duration. A milestone
    // consumes nothing; a level of effort and a WBS summary derive their span from other work. A
    // priority field on one of those is a control whose value can have no effect.
    const milestone = row({ type: 'FINISH_MILESTONE' });

    const created = mountCreate({ activity: milestone });
    expect(screen.queryByLabelText('Levelling priority')).not.toBeInTheDocument();
    created.unmount();

    mountEditor({ activity: milestone });
    openTab('Scheduling');
    expect(screen.queryByLabelText('Levelling priority')).not.toBeInTheDocument();
  });

  it('NEW (CLOSED) — the levelling input carries a step and an inputMode on both', () => {
    const created = mountCreate();
    const createInput = screen.getByLabelText('Levelling priority');
    expect(createInput).toHaveAttribute('step', '1');
    expect(createInput).toHaveAttribute('inputmode', 'numeric');
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    const editorInput = screen.getByLabelText('Levelling priority');
    expect(editorInput).toHaveAttribute('min', '0');
    expect(editorInput).toHaveAttribute('step', '1');
    expect(editorInput).toHaveAttribute('inputmode', 'numeric');
  });
});

describe('divergence D8 (CLOSED, M4) — the money inputs', () => {
  it('both hosts take hundredths, from zero up, on a decimal keypad', () => {
    // **The union, and each half is the better answer to a different question.** Hundredths are
    // the editor's: money is stored in minor units, so `step="any"` invites a third decimal that
    // is then silently rounded. The floor and the keypad are create's: a negative expense is not a
    // thing, and `decimal` is the difference between a phone offering a number pad and a keyboard.
    const created = mountCreate();
    for (const label of ['Budgeted expense', 'Actual expense']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('step', '0.01');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('inputmode', 'decimal');
    }
    created.unmount();

    mountEditor();
    openTab('Cost');
    for (const label of ['Budgeted expense', 'Actual expense']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('step', '0.01');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('inputmode', 'decimal');
    }
  });

  it('NEW (CLOSED) — both tell the reader a blank expense means none', () => {
    const created = mountCreate();
    expect(hintOf(screen.getByLabelText('Budgeted expense'))).toContain('Leave blank for none.');
    created.unmount();

    mountEditor();
    openTab('Cost');
    expect(hintOf(screen.getByLabelText('Budgeted expense'))).toContain('Leave blank for none.');
  });

  it('NEW (CLOSED) — the “never a date” disclaimer is a section description on both', () => {
    // Converged onto the EDITOR's placement rather than its wording: the disclaimer is true of the
    // whole section, so saying it once above the section beats repeating it inside one field's
    // hint — and create had only one field there to attach it to.
    const created = mountCreate();
    expect(
      screen.getByText('Changes only when cost is recognised in Earned value — never a date.'),
    ).toBeInTheDocument();
    expect(hintOf(screen.getByLabelText('Cost accrual'))).not.toContain('never a date');
    created.unmount();

    mountEditor();
    openTab('Cost');
    expect(
      screen.getByText('Changes only when cost is recognised in Earned value — never a date.'),
    ).toBeInTheDocument();
    expect(hintOf(screen.getByLabelText('Cost accrual'))).not.toContain('never a date');
  });
});

describe('divergence D9 (CLOSED, M4) — where cost and earned value live', () => {
  it('both hosts offer every cost and EV field to a finish milestone', () => {
    // A payment milestone is precisely an activity with cost and no duration, and create is the
    // only surface that makes one — so withholding these fields meant the value could never be
    // entered. The API accepts it, confirmed by running it (`apps/api/test/activities.e2e-spec.ts`)
    // rather than by reading the DTO.
    const paymentMilestone = row({ type: 'FINISH_MILESTONE', percentCompleteType: 'PHYSICAL' });

    const created = mountCreate({ activity: paymentMilestone });
    for (const label of ['Budgeted expense', 'Actual expense', 'Cost accrual', 'Earn value from']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    created.unmount();

    mountEditor({ activity: paymentMilestone });
    openTab('Cost');
    for (const label of ['Budgeted expense', 'Actual expense', 'Cost accrual']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('NEW (CLOSED) — create names the same sections the editor does, in the same order', () => {
    // One "Cost & earned value" heading spanned two write scopes — the value MEASURE, which earns
    // value and moves nothing, and the COST itself. A group owns its section (ADR-0089 D5), so
    // splitting them was forced by the extraction rather than chosen for tidiness.
    const created = mountCreate();
    expect(sectionHeadings()).toEqual([
      'Identity',
      'Work',
      'Breakdown',
      'Working time',
      'Levelling',
      'How value is measured',
      'Expenses',
      'Recognition',
      'Constraints',
      'Placement & targets',
      'External interfaces',
    ]);
    created.unmount();

    mountEditor();
    expect(sectionHeadings()).toEqual(['Identity', 'Work', 'Breakdown']);
    openTab('Scheduling');
    expect(sectionHeadings()).toEqual([
      'Working time',
      'Constraints',
      'Placement & targets',
      'External interfaces',
      'Levelling',
    ]);
    openTab('Cost');
    expect(sectionHeadings()).toEqual(['Expenses', 'Recognition']);
  });
});

describe('divergence D10 (CLOSED, M4) — `physicalPercentComplete` visibility', () => {
  it.each(['DURATION' as const, 'UNITS' as const, 'PHYSICAL' as const])(
    'with percentCompleteType %s, create renders the physical %% too',
    (percentCompleteType) => {
      // ADR-0060 §6: shading implies a value is there, hiding claims there is none. The field
      // holds a STORED value, so hiding it from a reader whose measure is Duration says the
      // activity has no physical progress when it may well have some.
      mountCreate({ activity: row({ percentCompleteType }) });
      expect(screen.getByLabelText('Physical % complete')).toBeInTheDocument();
    },
  );

  it.each(['DURATION' as const, 'UNITS' as const, 'PHYSICAL' as const])(
    'with percentCompleteType %s, the editor renders the physical %% always, shading it only when weighted steps win',
    async (percentCompleteType) => {
      mountEditor({ activity: row({ percentCompleteType }) });
      openTab('Progress');
      const field = await screen.findByLabelText('Physical % complete');
      expect(field).toBeInTheDocument();
      expect(field).not.toHaveAttribute('readonly');
    },
  );

  it('NEW (CLOSED, label) — both hosts label the chooser “Earn value from”', async () => {
    // The editor's label, which says what the control DOES; create's "% complete type" named a
    // taxonomy. Its hint keeps create's extra sentence, which is the clause answering the question
    // the label raises: this changes no dates.
    const created = mountCreate({ activity: row({ percentCompleteType: 'PHYSICAL' }) });
    const createSelect = screen.getByLabelText('Earn value from');
    expect(hintOf(createSelect)).toBe(
      'Earns value from a hand-entered physical %-complete, independent of dates. It changes no dates — only how Earned value measures progress.',
    );
    created.unmount();

    mountEditor({ activity: row({ percentCompleteType: 'PHYSICAL' }) });
    openTab('Progress');
    expect(screen.queryByLabelText('% complete type')).not.toBeInTheDocument();
    const editorSelect = await screen.findByLabelText('Earn value from');
    expect(hintOf(editorSelect)).toBe(
      'Earns value from a hand-entered physical %-complete, independent of dates.',
    );
  });

  it('NEW — the physical %% input keeps its step, inputMode and 0–100 hint on create and loses all three in the editor', async () => {
    const created = mountCreate({ activity: row({ percentCompleteType: 'PHYSICAL' }) });
    const createInput = screen.getByLabelText('Physical % complete');
    expect(createInput).toHaveAttribute('step', '1');
    expect(createInput).toHaveAttribute('inputmode', 'numeric');
    expect(hintOf(createInput)).toContain('0–100.');
    created.unmount();

    mountEditor({ activity: row({ percentCompleteType: 'PHYSICAL' }) });
    openTab('Progress');
    const editorInput = await screen.findByLabelText('Physical % complete');
    expect(editorInput).not.toHaveAttribute('step');
    expect(editorInput).not.toHaveAttribute('inputmode');
    expect(hintOf(editorInput)).not.toContain('0–100');
  });
});

describe('NEW divergence (CLOSED, M2-T1 commit A) — the Name field’s autocomplete', () => {
  it('both hosts switch browser autofill off for Name and Code', () => {
    // **Converged onto create, and the direction is not arbitrary.** A control registered as
    // `name` is the classic autofill trigger: with autocomplete left at its default a browser is
    // free to offer the reader's OWN name for an activity called "Pour slab". Create had said
    // `off` since it was written; the editor said it on `code` and not on `name`, which is the
    // shape of a line that was copied and then edited rather than a decision.
    const created = mountCreate();
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'off');
    created.unmount();

    mountEditor();
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'off');
  });
});

describe('NEW divergence (CLOSED, M2-T2 commit A2) — the duration-type hint', () => {
  it('both hosts explain the default and both fixed-units directions', () => {
    // Converged onto create, which is a strict superset in substance: it names the default (the
    // value three quarters of activities will keep) and describes BOTH directions of the triad,
    // where the editor described one. Nothing in the editor's wording was lost — it was shorter,
    // not different.
    const created = mountCreate();
    const createHint = hintOf(screen.getByLabelText('Duration type'));
    expect(createHint).toContain('Defaults to “Fixed duration & units/time”.');
    expect(createHint).toContain('the driving resource’s units ÷ rate derive this activity’s');
    created.unmount();

    mountEditor();
    expect(hintOf(screen.getByLabelText('Duration type'))).toBe(createHint);
  });
});

describe('NEW divergence (CLOSED, M3-T4 commit A) — the external-dates copy', () => {
  it('both hosts warn that a date before the data date cannot pull work earlier', () => {
    // The clause answers the question the field invites: an external early start is a bound, not a
    // pull, so a date in the past is honoured and changes nothing. Without it a planner who sets
    // one and sees no movement has been told nothing.
    const created = mountCreate();
    expect(hintOf(screen.getByLabelText('External early start'))).toContain(
      'A date before the data date is honoured but can’t pull work earlier.',
    );
    created.unmount();

    mountEditor();
    openTab('Scheduling');
    expect(hintOf(screen.getByLabelText('External early start'))).toContain(
      'A date before the data date is honoured but can’t pull work earlier.',
    );
  });

  it('both hosts flag an externally-driven activity in the section aside', () => {
    // The editor's, converged the other way: `externalDriven` is engine-computed, and it is the
    // only thing on this section that says the imported date is currently WINNING rather than
    // merely being present.
    const driven = row({ externalDriven: true });

    const created = mountCreate({ activity: driven });
    expect(screen.getByText('Driving this activity')).toBeInTheDocument();
    created.unmount();

    mountEditor({ activity: driven });
    openTab('Scheduling');
    expect(screen.getByText('Driving this activity')).toBeInTheDocument();
  });

  it('neither shows the aside for an activity the external dates do not drive', () => {
    const created = mountCreate({ activity: row() });
    expect(screen.queryByText('Driving this activity')).not.toBeInTheDocument();
    created.unmount();

    mountEditor({ activity: row() });
    openTab('Scheduling');
    expect(screen.queryByText('Driving this activity')).not.toBeInTheDocument();
  });
});

describe('the fields that have NOT drifted — the extraction must keep these equal', () => {
  it('the duration field is byte-identical: same label, same hint, same input mode (ADR-0070)', () => {
    const created = mountCreate();
    const createInput = screen.getByLabelText('Duration');
    const createHint = hintOf(createInput);
    expect(createHint).toBe(
      'Days, hours or minutes — for example 5d, 4h, 90m or 2d 4h. A day is 8 working hours on this activity’s calendar.',
    );
    expect(createInput).toHaveAttribute('inputmode', 'text');
    created.unmount();

    mountEditor();
    const editorInput = screen.getByLabelText('Duration');
    expect(hintOf(editorInput)).toBe(createHint);
    expect(editorInput).toHaveAttribute('inputmode', 'text');
  });

  it('the constraint date, expected finish, external late finish and ALAP hints are already equal', () => {
    const withConstraint = row({ constraintType: 'SNET', constraintDate: '2026-03-02' });
    const read = (): Record<string, string> => ({
      alap: hintOf(screen.getByLabelText(/schedule as late as possible/i)),
      expectedFinish: hintOf(screen.getByLabelText('Expected finish')),
      externalLateFinish: hintOf(screen.getByLabelText('External late finish')),
      constraintDateType: screen.getByLabelText('Constraint date').getAttribute('type') ?? '',
    });

    const created = mountCreate({ activity: withConstraint });
    const createValues = read();
    created.unmount();

    mountEditor({ activity: withConstraint });
    openTab('Scheduling');
    expect(read()).toEqual(createValues);
  });
});
