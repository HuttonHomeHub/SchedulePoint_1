import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { expectInert } from '@/components/ui/scope-save-bar-assertions';
import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

const PATCHES: { url: string; body: Record<string, unknown> }[] = [];

/** What the steps GET returns. Mutable so a test can open the Progress tab on an activity that has them. */
let STEPS: { name: string; weight: number; percentComplete: number }[] = [];

/** A row whose `version` the test can advance, to prove the editor re-reads it per save. */
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

const PLANNER_NO_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const NO_COST = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: false,
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

beforeEach(() => {
  PATCHES.length = 0;
  STEPS = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      // Record WRITES only. The Progress tab issues a steps GET on mount (the rollup needs them),
      // and counting it would make every "the first request was the save" assertion a lie.
      if (method !== 'GET') {
        const body: string = typeof init?.body === 'string' ? init.body : '{}';
        PATCHES.push({ url, body: JSON.parse(body) as Record<string, unknown> });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        // Both shapes the hooks read: the step list for `…/steps`, the row for a definition write.
        json: () =>
          Promise.resolve(url.includes('/steps') ? { data: STEPS } : { data: row({ version: 2 }) }),
      } as unknown as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('ActivityEditorDialog — structure', () => {
  it('renders one tab per readable scope', () => {
    mount();
    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Scheduling' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cost' })).toBeInTheDocument();
  });

  it('omits Cost entirely when the role cannot read it', () => {
    mount({ gating: NO_COST });
    expect(screen.queryByRole('tab', { name: 'Cost' })).not.toBeInTheDocument();
  });

  it('gives each scope its own Save', () => {
    mount();
    expect(screen.getByRole('button', { name: /save general/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    expect(screen.getByRole('button', { name: /save scheduling/i })).toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — copy review applied', () => {
  it('drops the “(optional)” suffix from labels', () => {
    mount();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.queryByLabelText(/\(optional\)/)).not.toBeInTheDocument();
  });

  it('names the WBS field as the parent it selects', () => {
    mount();
    // The old label was "WBS summary", which collided with the Type option of the same name.
    // Since M2-T3 that reasoning is the CREATE dialog's too, which had kept the colliding label.
    expect(screen.getByLabelText('Parent WBS summary')).toBeInTheDocument();
    expect(screen.queryByLabelText('WBS summary')).not.toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — per-scope save', () => {
  it('sends only the edited scope’s keys', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab B' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    const body = PATCHES[0]!.body;
    expect(body.name).toBe('Pour slab B');
    // Not one Scheduling or Cost key rides along — the capability-regression vector.
    expect(body).not.toHaveProperty('constraintType');
    expect(body).not.toHaveProperty('calendarId');
    expect(body).not.toHaveProperty('budgetedExpense');
    expect(body).not.toHaveProperty('accrualType');
  });

  it('reads `version` from the live row at submit time, not from when it opened', async () => {
    const { rerender } = mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body.version).toBe(1);

    // The row comes back with a bumped version, as it would after any scope save.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ActivityEditorDialog
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={() => {}}
          activity={row({ version: 2 })}
          gating={PLANNER_WITH_PEN}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    fireEvent.change(screen.getByLabelText('Calendar'), { target: { value: '' } });
    // Dirty the scope so its Save enables.
    fireEvent.click(screen.getByLabelText(/schedule as late as possible/i));
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(2));
    // The second save must carry the version the FIRST one produced, or it 409s every time.
    expect(PATCHES[1]!.body.version).toBe(2);
  });

  it('keeps the editor open after a save', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Still here' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — gating', () => {
  it('disables a scope’s Save and states the reason when the pen is elsewhere', () => {
    mount({ gating: PLANNER_NO_PEN });
    expectInert(screen.getByRole('button', { name: /save general/i }));
    expect(screen.getByText(/start editing to change this activity/i)).toBeInTheDocument();
  });

  it('shuts the fields too, not only the Save — and leaves their values readable', () => {
    mount({ gating: PLANNER_NO_PEN });
    const name = screen.getByLabelText('Name');
    // `readOnly`, NOT `disabled` (ADR-0083 D1). The distinction is the whole ruling: a disabled
    // field leaves the tab order and takes its value out of reach of a keyboard user and of copy,
    // so "you may not edit this" was being implemented as "you may not read it either".
    expect(name).toHaveAttribute('readonly');
    expect(name).toBeEnabled();
    // And NOT `aria-disabled`, which would be a false statement about a control that is operable.
    expect(name).not.toHaveAttribute('aria-disabled');
  });

  it('states the reason ONCE, and every shut field points at that one node', () => {
    mount({ gating: PLANNER_NO_PEN });
    // The duplication this replaces was real and shipped for exactly one test run: the group
    // provider printed the sentence above the fields while `ScopeSaveBar` printed it again beside
    // Save (ADR-0077 §9 — a field's problem belongs to the field; the alert belongs to the form).
    const reasons = screen.getAllByText(/start editing to change this activity/i);
    expect(reasons).toHaveLength(1);
    const reasonId = reasons[0]!.id;
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-describedby', reasonId);
    expect(screen.getByRole('button', { name: /save general/i })).toHaveAttribute(
      'aria-describedby',
      reasonId,
    );
  });

  it('keeps Save disabled until the scope is dirty', () => {
    mount();
    expectInert(screen.getByRole('button', { name: /save general/i }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });
    expect(screen.getByRole('button', { name: /save general/i })).toBeEnabled();
  });
});

describe('ActivityEditorDialog — tab markers', () => {
  it('marks a dirty scope so an unsaved edit is visible from another tab', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited' } });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'General, unsaved changes' })).toBeInTheDocument(),
    );
  });

  it('marks an invalid scope with a counted, worded marker', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /General, 1 problem/ })).toBeInTheDocument(),
    );
  });
});

/**
 * M4 — the Progress tab. The property under test is not "it renders": it is that the three write
 * paths stay separate. A Contributor reporting progress while a Planner holds the pen is the
 * capability a single merged Save would have destroyed, and it is asserted here through the
 * component, not only in the gating unit test.
 */
describe('ActivityEditorDialog — Progress tab', () => {
  const CONTRIBUTOR_NO_PEN = deriveActivityEditorGating({
    penManaged: true,
    holdsPen: false,
    canWrite: false,
    canProgress: true,
    canReadCost: false,
  });

  it('states what each panel does to the schedule', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    expect(screen.getByText(/moves the activity’s dates/i)).toBeInTheDocument();
    expect(
      screen.getByText(/earns value in earned value\. changes no dates\./i),
    ).toBeInTheDocument();
  });

  it('gives progress and measure separate Saves', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    expect(screen.getByRole('button', { name: /save progress/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save measure/i })).toBeInTheDocument();
  });

  it('lets a Contributor without the pen report progress while the measure stays locked', () => {
    mount({ gating: CONTRIBUTOR_NO_PEN });
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));

    const percent = screen.getByLabelText('Percent complete');
    expect(percent).toBeEnabled();
    fireEvent.change(percent, { target: { value: '40' } });
    expect(screen.getByRole('button', { name: /save progress/i })).toBeEnabled();

    // …while the measure beside it is shut, with the reason shown. This contrast IS the design:
    // one merged Save could not produce it.
    //
    // The reason is ROLE, not the pen — a Contributor may never edit a definition field whatever
    // the lock says, so naming the lock here would send them to take a pen that would not help.
    expectInert(screen.getByRole('button', { name: /save measure/i }));
    expect(screen.getByText(/your role cannot edit activity details/i)).toBeInTheDocument();
  });

  it('names the PEN, not the role, when a Planner is merely without the lock', () => {
    mount({ gating: PLANNER_NO_PEN });
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    // A Planner CAN edit the measure — they just need the lock, so the sentence must say so.
    expect(screen.getByText(/start editing to change this activity/i)).toBeInTheDocument();
    // …and progress stays open for them regardless, because it is never pen-gated.
    expect(screen.getByLabelText('Percent complete')).toBeEnabled();
  });

  it('sends progress to the progress endpoint, carrying no definition keys', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /save progress/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.url).toContain('/progress');
    expect(PATCHES[0]!.body.percentComplete).toBe(25);
    expect(PATCHES[0]!.body).not.toHaveProperty('name');
    expect(PATCHES[0]!.body).not.toHaveProperty('percentCompleteType');
  });

  it('previews the status the server will derive', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '100' } });
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });
});

/**
 * M4 Task 4.3 — the weighted steps, now beside the physical % they override. Two properties matter
 * beyond "it renders": steps are **pen-gated** (ADR-0060 §5, which M0 made the server enforce too),
 * and the focus choreography survived the port out of `ActivityStepsDialog` — the risk the plan
 * named. A dropped focus is invisible to a mouse and total to a keyboard.
 */
describe('ActivityEditorDialog — weighted steps panel', () => {
  async function openSteps(props: Parameters<typeof mount>[0] = {}) {
    mount(props);
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    // The steps query resolves on a microtask; until then the panel shows its loading state.
    return screen.findByRole('button', { name: /save steps/i });
  }

  it('sits on the Progress tab with its own Save and its effect stated', async () => {
    await openSteps();
    expect(
      screen.getByText(/sets the physical % complete\. changes no dates\./i),
    ).toBeInTheDocument();
    // Three panels, three Saves — the shape the gate table forces.
    expect(screen.getByRole('button', { name: /save progress/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save measure/i })).toBeInTheDocument();
  });

  it('is pen-gated: a Planner without the lock cannot even add a row', async () => {
    await openSteps({ gating: PLANNER_NO_PEN });
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled();
    expectInert(screen.getByRole('button', { name: /save steps/i }));
    // …while progress beside it stays open, which is the whole reason these are separate saves.
    expect(screen.getByLabelText('Percent complete')).toBeEnabled();
  });

  it('focuses the new row’s name field on add, not the button below the list', async () => {
    await openSteps();
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    const name = screen.getByLabelText('Step 1 name');
    expect(name).toBeInTheDocument();
    expect(document.activeElement).toBe(name);
  });

  it('restores focus after a remove instead of dropping it to the body', async () => {
    await openSteps();
    const add = screen.getByRole('button', { name: 'Add step' });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 2' }));

    expect(screen.queryByLabelText('Step 2 name')).not.toBeInTheDocument();
    // The previous row's Remove button — never <body>.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove step 1' }));
  });

  it('keeps focus on a move that disables the button just pressed', async () => {
    await openSteps();
    const add = screen.getByRole('button', { name: 'Add step' });
    fireEvent.click(add);
    fireEvent.click(add);
    // Row 2 to the top: "Move up" becomes disabled there, so focus must fall through to "Move down"
    // rather than to <body>. This is the case the source dialog did not handle.
    fireEvent.click(screen.getByRole('button', { name: 'Move up, step 2' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move down, step 1' }));
  });

  it('bulk-replaces via PUT …/steps, carrying the live row version', async () => {
    await openSteps();
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.change(screen.getByLabelText('Step 1 name'), { target: { value: 'Formwork' } });
    fireEvent.change(screen.getByLabelText('Step 1 % complete'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /save steps/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.url).toContain('/steps');
    expect(PATCHES[0]!.body.version).toBe(1);
    expect(PATCHES[0]!.body.steps).toEqual([{ name: 'Formwork', weight: 1, percentComplete: 50 }]);
  });

  it('previews the rollup the server will compute', async () => {
    await openSteps();
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.change(screen.getByLabelText('Step 1 % complete'), { target: { value: '40' } });
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shuts the manual physical % when steps are winning, and says why', async () => {
    STEPS = [{ name: 'Formwork', weight: 1, percentComplete: 60 }];
    await openSteps();
    const physical = await screen.findByLabelText('Physical % complete');
    // `readOnly`, not `disabled` (ADR-0083 D1): the rolled-up figure is precisely what the reader
    // came to see, and a disabled field takes it out of the tab order and out of copy.
    expect(physical).toHaveAttribute('readonly');
    // The reason names what would re-enable it — a bare "Read-only" is the dead end this epic
    // exists to remove, and this field was previously editable while being silently ignored.
    expect(screen.getByText(/weighted steps are setting this to 60%/i)).toBeInTheDocument();
  });
});

/**
 * The M6 review fold. Every case here pins a defect the specialist gates found in code that had
 * already passed a human read — which is the epic's own premise, arriving on schedule.
 */
describe('ActivityEditorDialog — review findings', () => {
  it('keeps Save in the tab order while it is inert, and explains itself', () => {
    mount({ gating: PLANNER_NO_PEN });
    const save = screen.getByRole('button', { name: /save general/i });
    // Native `disabled` would blur to <body> the moment it flips — and it flips on every save.
    expectInert(save);
    // …and the reason is ASSOCIATED, not merely nearby. Proximity in the DOM is not association.
    const describedBy = save.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/start editing/i);
  });

  it('says a scope saved, rather than going silently blank', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    expect(screen.getByText('Unsaved changes in this section.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    // Without this the helper text goes to null and the button greys — pixel-identical to a tab
    // nobody has touched. A sighted user got no signal at all that the save happened.
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('asks before discarding, naming the scopes that would be lost', () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dirty' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/General has unsaved changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes straight away when there is nothing to lose', () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps a failed save with the tab that owns it, and offers a way out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: { message: 'This activity changed elsewhere.' } }),
        } as unknown as Response),
      ),
    );
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Conflicting' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    // Scoped to General — not one dialog-level banner that any other scope's save would wipe.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const refresh = screen.getByRole('button', { name: 'Refresh this section' });
    fireEvent.click(refresh);
    // Re-seeded from the live row: the error is gone and the scope is clean again, so a retry
    // carries the CURRENT version instead of the one that just conflicted.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Pour slab');
  });

  it('keeps the visible label inside the accessible name on the step move buttons', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));
    await screen.findByRole('button', { name: /save steps/i });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    // WCAG 2.5.3: "Move step 1 up" does not contain the visible "Move up", so a speech-input user
    // saying "click Move up" could not activate it.
    const up = screen.getByRole('button', { name: 'Move up, step 1' });
    expect(up.getAttribute('aria-label')).toContain(up.textContent);
  });
});

/**
 * M0.5 — how a scope reports its problems (`ActivityEditorDialog.tsx:493`, `:613`, `:896`).
 *
 * The rule, from `FormProblemCount`'s docblock and ADR-0077 §9: a field's problem belongs to the
 * field; the alert belongs to the form. One problem is silent, because `handleSubmit` has already
 * moved focus to the control carrying it — the case WCAG 4.1.3 exempts. Two or more earn a count,
 * which restates nothing.
 *
 * Three scopes, three forms, three counts — asserted per scope rather than once, because each is a
 * separate `useScopeForm` with its own `formState.errors` and its own resolver. A count wired to the
 * wrong scope's errors would be invisible from any other tab, and would look right on the tab it
 * was written for.
 *
 * These are the **Planner-facing** definition scopes. The Progress tab's panels are asserted in
 * their own file against their own gate prop, so a change to the pen rule cannot take that coverage
 * with it.
 */
describe('ActivityEditorDialog — how a scope reports its problems', () => {
  it('General: states a single problem once, beside its field', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    expect(await screen.findAllByText('Name is required.')).toHaveLength(1);
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
    expect(PATCHES).toHaveLength(0);
  });

  it('General: counts two problems without repeating either sentence', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'C'.repeat(33) } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    const count = await screen.findByText('2 problems — check the highlighted fields below.');
    expect(screen.getAllByText('Name is required.')).toHaveLength(1);
    expect(screen.getAllByText('Code is too long.')).toHaveLength(1);
    expect(count).not.toHaveTextContent('Name is required.');
    expect(count).not.toHaveTextContent('Code is too long.');
    expect(PATCHES).toHaveLength(0);
  });

  it('Scheduling: states a single problem once, beside its field', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    // A constraint type with no date — the cross-field rule, whose message is attached by `path`
    // and so lands on a control like any other.
    fireEvent.change(screen.getByLabelText('Constraint'), { target: { value: 'SNET' } });
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    expect(await screen.findAllByText('Choose a date for this constraint.')).toHaveLength(1);
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
    expect(PATCHES).toHaveLength(0);
  });

  it('Scheduling: counts two problems without repeating either sentence', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    fireEvent.change(screen.getByLabelText('Constraint'), { target: { value: 'SNET' } });
    fireEvent.change(screen.getByLabelText('Secondary constraint'), { target: { value: 'FNLT' } });
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    const count = await screen.findByText('2 problems — check the highlighted fields below.');
    expect(screen.getAllByText('Choose a date for this constraint.')).toHaveLength(1);
    expect(screen.getAllByText('Choose a date for the secondary constraint.')).toHaveLength(1);
    expect(count).not.toHaveTextContent('Choose a date for this constraint.');
    expect(count).not.toHaveTextContent('Choose a date for the secondary constraint.');
    expect(PATCHES).toHaveLength(0);
  });

  it('Cost: states a single problem once, beside its field', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Cost' }));
    fireEvent.change(screen.getByLabelText('Budgeted expense'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost/i }));

    expect(await screen.findAllByText('Cost cannot be negative.')).toHaveLength(1);
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
    expect(PATCHES).toHaveLength(0);
  });

  it('Cost: counts two problems without repeating either sentence', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Cost' }));
    fireEvent.change(screen.getByLabelText('Budgeted expense'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Actual expense'), { target: { value: '1.234' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost/i }));

    const count = await screen.findByText('2 problems — check the highlighted fields below.');
    expect(screen.getAllByText('Cost cannot be negative.')).toHaveLength(1);
    expect(screen.getAllByText('Use at most 2 decimal places.')).toHaveLength(1);
    expect(count).not.toHaveTextContent('Cost cannot be negative.');
    expect(count).not.toHaveTextContent('Use at most 2 decimal places.');
    expect(PATCHES).toHaveLength(0);
  });

  it('counts only the scope being saved, never its siblings’ problems', async () => {
    // The defect a per-scope count exists to avoid: three forms in one dialog, and a count reading
    // the wrong `errors` object would report a sibling tab's problems as this one's. Two problems on
    // General, none on Cost — so Cost must stay silent after its own (valid) submit.
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'C'.repeat(33) } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await screen.findByText('2 problems — check the highlighted fields below.');

    fireEvent.click(screen.getByRole('tab', { name: 'Cost' }));
    fireEvent.change(screen.getByLabelText('Budgeted expense'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(screen.queryByText(/problems — check the highlighted fields below\./)).toBeNull();
  });
});

/**
 * The ADR-0061 layout. These assert what the *previous* editor could not do at all — say where the
 * activity sits while you edit it, and say which scopes are shut before you click into them.
 */
describe('editor layout (ADR-0061 Direction B)', () => {
  it('navigates its scopes with a rail, not a strip', () => {
    mount();
    expect(screen.getByRole('tablist', { name: 'Activity sections' })).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
  });

  it('keeps the computed dates and float on screen while they are being changed', () => {
    mount({
      activity: row({
        earlyStart: '2026-08-12',
        earlyFinish: '2026-08-27',
        totalFloat: 0,
        freeFloat: 0,
        percentComplete: 0,
        isCritical: true,
      }),
    });
    const strip = screen.getByLabelText('Computed schedule');
    expect(strip).toHaveTextContent('12 Aug 2026');
    expect(strip).toHaveTextContent('27 Aug 2026');
    expect(strip).toHaveTextContent('Critical');
  });

  it('shows no strip at all before the plan has been calculated', () => {
    // Not a row of em dashes: an uncalculated plan is a state, and a blank strip would read as a
    // rendering fault rather than "nothing has been computed yet".
    mount({ activity: row({ earlyStart: null }) });
    expect(screen.queryByLabelText('Computed schedule')).not.toBeInTheDocument();
  });

  it('marks every pen-gated scope read-only in the rail, in words', () => {
    // The reason the rail earns its width. Flag-off — and in the horizontal strip — a Contributor
    // discovered each shut form only by opening it.
    mount({ gating: PLANNER_NO_PEN });
    expect(screen.getByRole('tab', { name: 'General, read-only' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Scheduling, read-only' })).toBeInTheDocument();
    // …but never Progress, which the pen deliberately does not gate (ADR-0028 Q-C). A padlock here
    // would be a lie in exactly the case the rail exists to clarify.
    expect(screen.getByRole('tab', { name: 'Progress' })).toBeInTheDocument();
  });

  it('groups the scheduling fields instead of listing them', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    const constraints = screen.getByRole('group', { name: 'Constraints' });
    expect(within(constraints).getByLabelText('Constraint')).toBeInTheDocument();
    // The group says what it is for, linked to the group rather than floating beside it.
    expect(constraints).toHaveAccessibleDescription(/Dates you impose on the network/);
  });

  it('identifies the activity in the header rather than prefixing "Edit"', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Pour slab' })).toBeInTheDocument();
    expect(screen.getByText('A100 · Task · 5 working days')).toBeInTheDocument();
  });
});
