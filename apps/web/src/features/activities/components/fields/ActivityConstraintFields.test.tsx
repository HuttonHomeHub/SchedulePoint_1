import { zodResolver } from '@hookform/resolvers/zod';
import type { ConstraintType } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ActivityConstraintFields, CONSTRAINT_FIELDS } from './ActivityConstraintFields';

import { FieldGridContainer } from '@/components/ui/form-layout';
import {
  activitySchedulingSchema,
  type ActivitySchedulingValues,
} from '@/features/activities/schemas/activity-scope-schemas';

function Harness({
  constraintType = '',
  secondaryConstraintType = '',
}: {
  constraintType?: ConstraintType | '';
  secondaryConstraintType?: ConstraintType | '';
}): JSX.Element {
  const form = useForm<ActivitySchedulingValues>({
    resolver: zodResolver(activitySchedulingSchema as never) as never,
    defaultValues: {
      calendarId: '',
      constraintType,
      constraintDate: constraintType ? '2026-03-02' : '',
      secondaryConstraintType,
      secondaryConstraintDate: secondaryConstraintType ? '2026-04-01' : '',
      scheduleAsLateAsPossible: false,
      expectedFinish: '',
      externalEarlyStart: '',
      externalLateFinish: '',
    } as never,
  });

  return (
    <FieldGridContainer>
      <ActivityConstraintFields form={form} />
    </FieldGridContainer>
  );
}

const primary = (): HTMLSelectElement => screen.getByLabelText('Constraint');
const secondary = (): HTMLSelectElement => screen.getByLabelText('Secondary constraint');
const labelsOf = (select: HTMLSelectElement): string[] =>
  [...select.options].map((option) => option.textContent ?? '');

describe('ActivityConstraintFields', () => {
  it('offers only the kinds the scheduler applies exactly as named', () => {
    render(<Harness />);
    expect([...primary().options].map((option) => option.value)).toEqual([
      '',
      'SNET',
      'SNLT',
      'FNET',
      'FNLT',
      'MSO',
      'MFO',
    ]);
  });

  it('says “None set” while nothing is constrained', () => {
    render(<Harness />);
    expect(screen.getByText('None set')).toBeVisible();
  });

  it('shows the date only once a type is chosen', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Constraint date')).toBeNull();

    fireEvent.change(primary(), { target: { value: 'SNET' } });
    expect(screen.getByLabelText('Constraint date')).toBeVisible();
  });

  const LABELS: Record<(typeof CONSTRAINT_FIELDS)[number], string> = {
    constraintType: 'Constraint',
    constraintDate: 'Constraint date',
    secondaryConstraintType: 'Secondary constraint',
    secondaryConstraintDate: 'Secondary constraint date',
  };

  it.each(CONSTRAINT_FIELDS)('renders a control registered as %s', (field) => {
    // Both dates are conditional on their type, so the loop sets both types rather than mounting a
    // bare form — which is the state in which all four exist at once. Found by label, not by role:
    // a `type="date"` input has no `textbox` role at all.
    render(<Harness constraintType="SNET" secondaryConstraintType="FNLT" />);
    expect(screen.getByLabelText(LABELS[field])).toHaveAttribute('name', field);
  });

  it('renders its controls in the tuple’s order', () => {
    render(<Harness constraintType="SNET" secondaryConstraintType="FNLT" />);
    const rendered = Array.from(document.querySelectorAll<HTMLElement>('input[name], select[name]'))
      .map((element) => element.getAttribute('name'))
      .filter((name): name is string => CONSTRAINT_FIELDS.includes(name as never));
    expect(rendered).toEqual([...CONSTRAINT_FIELDS]);
  });

  describe('a parked MANDATORY_* value the row already carries', () => {
    it('keeps its place under a label saying what it actually does', () => {
      // Without this the select renders NOTHING selected and reads back `''` — the "None" option's
      // own value — so a constraint that is set displays as no constraint, with its date filled in
      // below it.
      render(<Harness constraintType="MANDATORY_START" />);
      expect(primary()).toHaveValue('MANDATORY_START');
      expect(labelsOf(primary())).toContain('Mandatory start — applied as Must start on');
      expect(screen.getByLabelText('Constraint date')).toHaveValue('2026-03-02');
    });

    it('drops out the moment the planner chooses something else', () => {
      // Derived from the LIVE value, not the stored one: an honest option that cannot be got rid of
      // is a different defect from the one it fixes.
      render(<Harness constraintType="MANDATORY_START" />);
      fireEvent.change(primary(), { target: { value: 'SNET' } });
      expect(labelsOf(primary())).not.toContain('Mandatory start — applied as Must start on');
    });

    it('does the same for the secondary constraint', () => {
      render(<Harness secondaryConstraintType="MANDATORY_FINISH" />);
      expect(secondary()).toHaveValue('MANDATORY_FINISH');
      expect(labelsOf(secondary())).toContain('Mandatory finish — applied as Must finish on');
    });
  });
});
