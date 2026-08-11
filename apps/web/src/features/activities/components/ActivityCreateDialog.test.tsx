import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

// This is the BASE form suite — the M4/M5 flag surfaces (advanced constraints, per-activity calendar,
// advanced activity types) are on by default, so pin them off here; their flag-on behaviour lives in the
// dedicated `.advanced-constraints.test.tsx` / `.calendar.test.tsx` / `.activity-types.test.tsx` suites.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_CONSTRAINTS_ENABLED: false,
  ACTIVITY_CALENDAR_ENABLED: false,
  ADVANCED_ACTIVITY_TYPES_ENABLED: false,
}));

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
  durationMinutes: 2400,
  constraintType: 'SNET',
  constraintDate: '2026-05-01',
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: null,
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
      <ActivityCreateDialog orgSlug="acme" planId="pl1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityCreateDialog', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates a task with name, type and duration', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    // "Duration type" (VITE_DURATION_TYPES defaults on) is a separate field/label — target the
    // working-days field by its exact label so the two don't collide.
    fireEvent.change(screen.getByLabelText('Duration (working days)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      type: 'TASK',
      durationDays: 10,
    });
  });

  it('hides duration for a milestone and sends 0', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kickoff' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.queryByLabelText(/Duration/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string);
    expect(body).toMatchObject({ type: 'START_MILESTONE', durationDays: 0 });
  });

  it('does not offer advanced activity types (Level of effort) while the flag is off', () => {
    // This suite pins VITE_ADVANCED_ACTIVITY_TYPES off (it defaults on), so the picker shows only the
    // three fully-supported types — no Level of effort (or Hammock).
    renderDialog();
    expect(screen.queryByRole('option', { name: 'Level of effort' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hammock' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Task' })).toBeInTheDocument();
  });

  // "still shows a seeded Level-of-effort value when editing with the flag off (honest selector)"
  // moved: `ActivityCreateDialog` lost its edit path in the activity-dialog-unification epic
  // (create-only now, no `activity` prop). The mechanism it pinned — `selectableActivityTypes`
  // always adds the CURRENT value even when the advanced-types flag would not otherwise offer it —
  // is proven generically, flag-independently, by
  // `fields/ActivityWorkFields.test.tsx`'s "the type option list" describe block (using `HAMMOCK`,
  // a type never offered even with the flag ON, which is the stronger case).

  // "round-trips a seeded WBS parentId on a no-op save with the flag off" moved to
  // `ActivityEditorDialog.flag-off-round-trips.test.tsx` — "round-trips a seeded parentId on a
  // no-op General save with the flag off".

  it('reveals the date once a constraint is chosen and sends the pair', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slab' } });
    expect(screen.queryByLabelText('Constraint date')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Constraint'), { target: { value: 'SNET' } });
    fireEvent.change(screen.getByLabelText('Constraint date'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string);
    expect(body).toMatchObject({ constraintType: 'SNET', constraintDate: '2026-06-01' });
  });

  it('offers only the six honoured constraint types (no parked MANDATORY_*)', () => {
    renderDialog();
    const select = screen.getByLabelText('Constraint');
    const values = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO']);
    expect(values).not.toContain('MANDATORY_START');
    expect(values).not.toContain('MANDATORY_FINISH');
    // The field explains itself (G3).
    expect(
      screen.getByText(/Only constraints the scheduler applies exactly as named/),
    ).toBeInTheDocument();
  });

  // "shows a legacy parked value honestly and round-trips it on a no-op save (no silent coercion)"
  // split: the SELECT's own honest display is `ActivityConstraintFields.test.tsx`'s "a parked
  // MANDATORY_* value the row already carries" describe block; the PATCH round-trip ported to
  // `ActivityEditorDialog.round-trips.test.tsx` — "re-sends a seeded parked constraint and its date
  // unchanged on a Scheduling save".

  // "drops the parked option once the planner switches to a honoured type" is covered by
  // `ActivityConstraintFields.test.tsx`'s "drops out the moment the planner chooses something else".

  // "seeds edit mode and clears the constraint by sending nulls with the version" is covered by the
  // combination of `activity-body-builders.structural.test.ts` (`constraintType`/`constraintDate`
  // are in its `CLEARABLE_KEYS`), `ActivityEditorDialog.test.tsx` ("reads `version` from the live
  // row at submit time" pins the version behaviour; the base `mount()` seeds Name from the row) and
  // `ActivityConstraintFields.test.tsx` (the select renders the row's constraint type).

  // "calls onSaved with the pre-edit and server post-edit rows on a successful edit (ADR-0048)"
  // moved to `ActivityEditorDialog.round-trips.test.tsx` — "calls onSaved with the pre-save row and
  // the server's post-save row on a successful scope save".

  // "does not call onSaved when creating (create-undo is a later milestone)" is now structurally
  // impossible rather than merely untested: `ActivityCreateDialog` has no `onSaved` prop at all
  // (create-only since the activity-dialog-unification epic), so there is no seam through which it
  // could ever be called.

  // "round-trips seeded advanced-constraint values on a no-op save with the flag off" moved to
  // `ActivityEditorDialog.flag-off-round-trips.test.tsx` — "round-trips seeded
  // secondary-constraint/ALAP/expected-finish values on a no-op Scheduling save".
});

/**
 * M0.5 — the error presentation on the **create/edit host's one wide form**
 * (`ActivityCreateDialog.tsx:366`). The rule, from `FormProblemCount`'s docblock and ADR-0077 §9: a
 * field's problem belongs to the field; the alert belongs to the form. One problem is silent,
 * because `handleSubmit` has already moved focus to the control carrying it — the case WCAG 4.1.3
 * exempts. Two or more earn a count, which restates nothing and says the one thing an inline
 * message cannot say from where the reader is standing.
 *
 * This host is the one M1 changes: it validates through `handleSubmit` today (which focuses) and
 * moves to four `trigger()` calls (which do not). The focus case below is therefore the assertion
 * that has to keep passing through that swap, and is the reason the silence is lawful at all.
 */
describe('ActivityCreateDialog — how problems are reported', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('states a single problem once, beside its field', async () => {
    renderDialog();
    // Name is the only invalid field: `duration` defaults to '1' and every other control is a
    // select over its own values.
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    expect(await screen.findAllByText('Name is required.')).toHaveLength(1);
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('counts two problems without repeating either sentence', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'C'.repeat(33) } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    expect(
      await screen.findByText('2 problems — check the highlighted fields below.'),
    ).toBeVisible();
    // Each field's own sentence still appears exactly once, and the count adds no third copy.
    expect(screen.getAllByText('Name is required.')).toHaveLength(1);
    expect(screen.getAllByText('Code is too long.')).toHaveLength(1);
    // The count says how many, never which — restating them here is the duplication ADR-0077 §9
    // removed, in a new costume.
    const alert = screen.getByText('2 problems — check the highlighted fields below.');
    expect(alert).not.toHaveTextContent('Name is required.');
    expect(alert).not.toHaveTextContent('Code is too long.');
  });

  it('moves focus to exactly one control when a submit fails with two problems', async () => {
    // The property that makes the silence lawful. It is asserted with two problems rather than one
    // because the failure M1 risks is *plural* focus: four `trigger()` calls each focusing their own
    // scope's first invalid field would leave the reader wherever the last one landed, having
    // dragged them past the others. Counting `focusin` is the only way to see that — `activeElement`
    // is a single value by definition and cannot report how many times it moved.
    const focused: string[] = [];
    const record = (event: FocusEvent): void => {
      const target = event.target as HTMLElement;
      focused.push(target.getAttribute('name') ?? target.tagName);
    };
    document.addEventListener('focusin', record);
    try {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'C'.repeat(33) } });
      fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
      await screen.findByText('2 problems — check the highlighted fields below.');

      expect(focused).toEqual(['name']);
      expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    } finally {
      document.removeEventListener('focusin', record);
    }
  });

  it('focuses the offending control when the only problem is outside the general scope', async () => {
    // The M1 acceptance gate, and it is only meaningful CROSS-SCOPE. Before M1, focus was RHF's own
    // (`handleSubmit` walks the one form's registration order); now the host walks
    // `SUBMIT_FIELD_ORDER` across four forms, so a lone problem in `scheduling` is the case that
    // proves the walk reaches past the first form rather than stopping at it. `levelingPriority`
    // is deliberate: it is a scheduling field the base flags render, sitting mid-list.
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Slab' } });
    fireEvent.change(screen.getByLabelText('Levelling priority'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    expect(await screen.findByText('Priority cannot be negative.')).toBeVisible();
    expect(document.activeElement).toBe(screen.getByLabelText('Levelling priority'));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('moves focus exactly once when the two problems are in different scopes', async () => {
    // The plural-focus failure mode, in the shape that can actually produce it: one problem in
    // `general` and one in `scheduling`, i.e. two DIFFERENT forms. Each form validating with its
    // own focus switched on would move focus twice and leave the reader on whichever settled last
    // — dragged past the problem `SUBMIT_FIELD_ORDER` says comes first. Counting `focusin` is the
    // only way to see that: `activeElement` is a single value by definition and would report the
    // correct final control in both the correct and the broken world.
    const focused: string[] = [];
    const record = (event: FocusEvent): void => {
      const target = event.target as HTMLElement;
      focused.push(target.getAttribute('name') ?? target.tagName);
    };
    document.addEventListener('focusin', record);
    try {
      renderDialog();
      // Name left empty (general), levelling priority negative (scheduling).
      fireEvent.change(screen.getByLabelText('Levelling priority'), { target: { value: '-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
      await screen.findByText('2 problems — check the highlighted fields below.');

      // `name` is first in SUBMIT_FIELD_ORDER; `levelingPriority` is never focused at all.
      expect(focused).toEqual(['name']);
      expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    } finally {
      document.removeEventListener('focusin', record);
    }
  });

  // "reports an edit's problems the same way it reports a create's" is now `ActivityEditorDialog`'s
  // own concern, since editing has no other host: covered by `ActivityEditorDialog.test.tsx`'s "how
  // a scope reports its problems" describe block — "General: counts two problems without repeating
  // either sentence" pins the identical two-problem, one-count shape on the one remaining edit
  // surface.
});

/**
 * Recovery from a failed submit — `reValidateMode: 'onChange'`, which is RHF's default and which
 * this form has always had.
 *
 * **Pinned because M1 lost it silently.** The four-form submit first validated with
 * `trigger(undefined, { shouldFocus: false })`. `trigger()` runs the resolver and writes the
 * errors, but it never sets `isSubmitted` — RHF sets that flag only in `handleSubmit`'s own state
 * emission (`react-hook-form@7.84.0`, `dist/index.esm.mjs:3075`) — and `isSubmitted` is exactly
 * what the change handler passes to `skipValidation` to decide whether re-validation is on
 * (`dist/index.esm.mjs:2608`). With the form's mode at the default `onSubmit` and the flag never
 * set, every keystroke was skipped: a corrected field kept showing its old error until the planner
 * submitted again. Nothing failed, because nothing covered it.
 *
 * That is a behaviour change riding along inside a refactor declared DARK with zero user value,
 * which is the drift this epic exists to remove. The fix validates through each scope's own
 * `handleSubmit` with `shouldFocusError: false`, so the flag is set and the host still owns the one
 * ordered focus decision.
 */
describe('ActivityCreateDialog — recovering from a failed submit', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('clears a corrected field’s error without a second submit', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    expect(await screen.findByText('Name is required.')).toBeVisible();

    // Fix the offending field — and do nothing else. No second submit.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });

    await waitFor(() => expect(screen.queryByText('Name is required.')).toBeNull());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('clears a corrected problem outside the general scope too', async () => {
    // Re-validation is a property of EACH scope form, not of the one the host happens to check
    // first — so a scheduling field is pinned alongside a general one. The count alert falling
    // silent is the second reader-visible half of the same recovery.
    renderDialog();
    fireEvent.change(screen.getByLabelText('Levelling priority'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    expect(
      await screen.findByText('2 problems — check the highlighted fields below.'),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Levelling priority'), { target: { value: '3' } });
    await waitFor(() => expect(screen.queryByText('Priority cannot be negative.')).toBeNull());
    // One problem remains (the empty name), so the count goes silent rather than reading "1".
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
    expect(screen.getByText('Name is required.')).toBeVisible();
  });
});
