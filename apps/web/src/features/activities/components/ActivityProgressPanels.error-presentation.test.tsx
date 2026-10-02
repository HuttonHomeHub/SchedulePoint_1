import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { progressFormSchema, type ProgressFormValues } from '../schemas/activity-schemas';
import {
  activityMeasureSchema,
  type ActivityMeasureValues,
} from '../schemas/activity-scope-schemas';

import { seedMeasure, seedProgress } from './activity-editor-seeds';
import { ReportedProgressPanel, ValueMeasurePanel } from './ActivityProgressPanels';
import { useScopeForm } from './useScopeForm';

/**
 * M0.5 — how the **Progress tab's** two form panels report their problems
 * (`ReportedProgressPanel` and `ValueMeasurePanel`). The third panel, `WeightedStepsPanel`, is
 * covered in `WeightedStepsPanel.test.tsx` beside its own suite.
 *
 * **Mounted through a harness since M4 (ADR-0169).** The forms are owned by `ActivityEditorSession`,
 * so a panel cannot be mounted alone: each host below makes the form the way the session does and
 * hands it down, which is also why "no write was attempted" is now `onSave` not being called.
 *
 * The rule, from `FormProblemCount`'s docblock and ADR-0077 §9: a field's problem belongs to the
 * field; the alert belongs to the form. One problem is silent, because `handleSubmit` has already
 * moved focus to the control carrying it — the case WCAG 4.1.3 exempts. Two or more earn a count.
 *
 * **Why this is a separate file from `ActivityEditorDialog.test.tsx`.** Reported progress is never
 * pen-gated (ADR-0028 Q-C, ADR-0060's whole reason for per-scope save): a Contributor reports it
 * while a Planner holds the lock. Asserting it through the editor would route this coverage through
 * `deriveActivityEditorGating`, so a change to the pen rule could take the progress cases with it
 * and nothing would say so. Each panel is therefore mounted directly, with its gate passed in as a
 * literal — the panel's own contract, independent of who derived it.
 */

const ACTIVITY = {
  id: 'a1',
  planId: 'pl1',
  name: 'Pour foundations',
  code: 'A100',
  type: 'TASK',
  durationDays: 5,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  percentCompleteType: 'PHYSICAL',
  accrualType: 'UNIFORM',
  percentComplete: 0,
  physicalPercentComplete: null,
  version: 3,
} as ActivitySummary;

/**
 * A Contributor's gate: writable, with nothing withheld. Passed as a literal rather than derived,
 * so this suite says what the panel does with an open gate and asserts nothing about who opens it.
 */
const OPEN_GATE = { writable: true, reason: null, readable: true };

/**
 * The session's side of the seam (ADR-0169 M4): the forms are created OUTSIDE the panels, by the
 * same `useScopeForm` the editor uses, and the panel only renders them. "Nothing was written" is
 * therefore `onSave` not being called — the panel no longer reaches a network layer at all.
 */
function ProgressHost({ onSave }: { onSave: (values: ProgressFormValues) => void }) {
  const { form, isDirty } = useScopeForm<ProgressFormValues>(
    progressFormSchema,
    (row) => seedProgress(row, 8),
    ACTIVITY,
  );
  return (
    <ReportedProgressPanel
      form={form}
      isDirty={isDirty}
      hoursPerDay={8}
      gate={OPEN_GATE}
      onSave={onSave}
      pending={false}
      saved={false}
      error={null}
    />
  );
}

function MeasureHost({ onSave }: { onSave: (values: ActivityMeasureValues) => void }) {
  const { form, isDirty } = useScopeForm<ActivityMeasureValues>(
    activityMeasureSchema,
    seedMeasure,
    ACTIVITY,
  );
  return (
    <ValueMeasurePanel
      form={form}
      isDirty={isDirty}
      // No steps: the manual physical % stays editable, so the measure panel's only validated field is
      // reachable. (Steps winning would shade it, which is a different case with its own test.)
      steps={[]}
      gate={OPEN_GATE}
      onSave={onSave}
      pending={false}
      saved={false}
      error={null}
    />
  );
}

function renderProgress() {
  const onSave = vi.fn();
  render(<ProgressHost onSave={onSave} />);
  return onSave;
}

function renderMeasure() {
  const onSave = vi.fn();
  render(<MeasureHost onSave={onSave} />);
  return onSave;
}

const COUNT = /problems — check the highlighted fields below\./;

describe('ReportedProgressPanel — how problems are reported', () => {
  it('states a single problem once, beside its field', async () => {
    const onSave = renderProgress();
    // A blank number field reads back as NaN, which is the commonest way this form fails.
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    expect(await screen.findAllByText('Enter a percentage from 0 to 100.')).toHaveLength(1);
    expect(screen.queryByText(COUNT)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('counts two problems without repeating either sentence', async () => {
    const onSave = renderProgress();
    // Two cross-field rules, each attached by `path` so it lands on a control like any other: a
    // finish with no start, and a resume before the suspend it resumes from.
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-05-08' } });
    fireEvent.change(screen.getByLabelText('Suspend date'), { target: { value: '2026-05-06' } });
    fireEvent.change(screen.getByLabelText('Resume date'), { target: { value: '2026-05-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    const count = await screen.findByText('2 problems — check the highlighted fields below.');
    expect(screen.getAllByText('Set an actual start before a finish.')).toHaveLength(1);
    expect(screen.getAllByText('Resume cannot be before the suspend.')).toHaveLength(1);
    expect(count).not.toHaveTextContent('Set an actual start before a finish.');
    expect(count).not.toHaveTextContent('Resume cannot be before the suspend.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reports its problems with no pen and no role attached to the gate', async () => {
    // The capability ADR-0060's per-scope save exists to protect: this panel is reachable while the
    // definition scopes are shut, so its error presentation has to work on its own. Asserted here
    // rather than through the editor, where it would depend on the pen derivation.
    renderProgress();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Remaining duration'), { target: { value: '1w' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    expect(
      await screen.findByText('2 problems — check the highlighted fields below.'),
    ).toBeVisible();
  });
});

describe('ValueMeasurePanel — how problems are reported', () => {
  it('states a single problem once, beside its field', async () => {
    renderMeasure();
    fireEvent.change(screen.getByLabelText('Physical % complete'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save measure' }));

    expect(await screen.findAllByText('Percentage cannot exceed 100.')).toHaveLength(1);
    expect(screen.queryByText(COUNT)).toBeNull();
  });

  it('cannot reach two problems, so it never speaks a count', async () => {
    // **This panel has no two-problem case, and that is a property of the scope rather than of the
    // test.** The measure scope holds exactly two fields: `percentCompleteType`, a `<select>` whose
    // every option is a valid enum member, and `physicalPercentComplete`. A select cannot be driven
    // to a value it does not offer, so at most one message is reachable and the count is silent on
    // every state a reader can produce.
    //
    // The assertion is written as "both controls in their worst state still yield one problem"
    // rather than as a note, so that adding a third validated field to this scope — or making the
    // measure free-typed — turns the silence into a visible failure instead of leaving it as an
    // untested assumption.
    const onSave = renderMeasure();
    const measure = screen.getByLabelText('Earn value from');
    fireEvent.change(measure, { target: { value: 'PHYSICAL' } });
    fireEvent.change(screen.getByLabelText('Physical % complete'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save measure' }));

    expect(await screen.findAllByText('Percentage cannot be negative.')).toHaveLength(1);
    expect(screen.queryByText(COUNT)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    // The select survived the submit with a valid value — there was never a second problem to count.
    expect(within(measure as HTMLSelectElement).getAllByRole('option').length).toBeGreaterThan(1);
    expect(measure).toHaveValue('PHYSICAL');
  });
});
