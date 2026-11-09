import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivityType } from '@repo/types';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ActivityLevellingField, LEVELLING_FIELDS } from './ActivityLevellingField';
import { ActivityPlacementFields, PLACEMENT_FIELDS } from './ActivityPlacementFields';

import { FieldGridContainer } from '@/components/ui/form-layout';
import {
  activitySchedulingSchema,
  type ActivitySchedulingValues,
} from '@/features/activities/schemas/activity-scope-schemas';

/**
 * The two single-purpose scheduling groups, which share a rule worth stating once: **a control
 * whose value cannot have an effect is not shown**. Expected finish sizes work towards a target, so
 * it is meaningless for a type with no entered duration; levelling priority breaks a tie between
 * activities competing for a resource, and levelling never moves a milestone, a level of effort or
 * a WBS summary. Both were create's rules and neither was the editor's.
 */

function useScheduling(): ReturnType<typeof useForm<ActivitySchedulingValues>> {
  return useForm<ActivitySchedulingValues>({
    resolver: zodResolver(activitySchedulingSchema as never) as never,
    defaultValues: {
      calendarId: '',
      constraintType: '',
      constraintDate: '',
      secondaryConstraintType: '',
      secondaryConstraintDate: '',
      scheduleAsLateAsPossible: false,
      expectedFinish: '',
      externalEarlyStart: '',
      externalLateFinish: '',
    } as never,
  });
}

function Placement({ activityType }: { activityType?: ActivityType }): JSX.Element {
  return (
    <FieldGridContainer>
      <ActivityPlacementFields form={useScheduling()} activityType={activityType} />
    </FieldGridContainer>
  );
}

function Levelling({ activityType }: { activityType?: ActivityType }): JSX.Element {
  return (
    <FieldGridContainer>
      <ActivityLevellingField form={useScheduling()} activityType={activityType} />
    </FieldGridContainer>
  );
}

const LABELS: Record<(typeof PLACEMENT_FIELDS)[number], string> = {
  scheduleAsLateAsPossible: 'Schedule as late as possible',
  expectedFinish: 'Expected finish',
};

describe('ActivityPlacementFields', () => {
  it('files itself under a heading that is not “Constraints”', () => {
    // Neither control pins a date, and the previous heading invited exactly that reading.
    render(<Placement activityType="TASK" />);
    expect(screen.getByRole('heading', { name: 'Placement & targets' })).toBeVisible();
  });

  it.each(PLACEMENT_FIELDS)('renders a control registered as %s', (field) => {
    render(<Placement activityType="TASK" />);
    expect(screen.getByLabelText(LABELS[field])).toHaveAttribute('name', field);
  });

  it('renders its controls in the tuple’s order', () => {
    // ADR-0089 D2 gate 2, which the ADR claims for every group — and did not have here. The
    // create host's `SUBMIT_FIELD_ORDER` relies on this order for where a failed submit sends the
    // reader, so it is load-bearing rather than tidy.
    render(<Placement activityType="TASK" />);
    const rendered = Array.from(document.querySelectorAll<HTMLElement>('input[name], select[name]'))
      .map((element) => element.getAttribute('name') ?? '')
      .filter((name) => (PLACEMENT_FIELDS as readonly string[]).includes(name));
    expect(rendered).toEqual([...PLACEMENT_FIELDS]);
  });

  it.each(['FINISH_MILESTONE', 'LEVEL_OF_EFFORT', 'WBS_SUMMARY'] as const)(
    'hides expected finish for a %s, whose duration is not entered',
    (activityType) => {
      render(<Placement activityType={activityType} />);
      expect(screen.queryByLabelText('Expected finish')).toBeNull();
      // The checkbox stays: where a milestone is drawn is still a question.
      expect(screen.getByLabelText('Schedule as late as possible')).toBeVisible();
    },
  );

  it('shows expected finish while the type is not yet known', () => {
    // `undefined` is "the host has not resolved a type", not "a derived type" — withholding the
    // field would be asserting something the form has not been told.
    render(<Placement />);
    expect(screen.getByLabelText('Expected finish')).toBeVisible();
  });
});

describe('ActivityLevellingField', () => {
  it.each(LEVELLING_FIELDS)('renders a control registered as %s', (field) => {
    render(<Levelling activityType="TASK" />);
    expect(screen.getByLabelText('Levelling priority')).toHaveAttribute('name', field);
  });

  it('offers a numeric keypad and integer steps', () => {
    render(<Levelling activityType="TASK" />);
    const input = screen.getByLabelText('Levelling priority');
    expect(input).toHaveAttribute('step', '1');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('min', '0');
  });

  it.each(['FINISH_MILESTONE', 'LEVEL_OF_EFFORT', 'WBS_SUMMARY'] as const)(
    'renders nothing for a %s, which levelling never moves',
    (activityType) => {
      render(<Levelling activityType={activityType} />);
      expect(screen.queryByRole('heading', { name: 'Levelling' })).toBeNull();
    },
  );
});
