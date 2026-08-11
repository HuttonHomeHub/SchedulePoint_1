import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ActivityExternalDatesFields, EXTERNAL_DATES_FIELDS } from './ActivityExternalDatesFields';

import { FieldGridContainer } from '@/components/ui/form-layout';
import {
  activitySchedulingSchema,
  type ActivitySchedulingValues,
} from '@/features/activities/schemas/activity-scope-schemas';

function Harness({ externalDriven = false }: { externalDriven?: boolean }): JSX.Element {
  const form = useForm<ActivitySchedulingValues>({
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

  return (
    <FieldGridContainer>
      <ActivityExternalDatesFields form={form} externalDriven={externalDriven} />
    </FieldGridContainer>
  );
}

const LABELS: Record<(typeof EXTERNAL_DATES_FIELDS)[number], string> = {
  externalEarlyStart: 'External early start',
  externalLateFinish: 'External late finish',
};

const hintOf = (control: HTMLElement): string =>
  (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('ActivityExternalDatesFields', () => {
  it.each(EXTERNAL_DATES_FIELDS)('renders a control registered as %s', (field) => {
    render(<Harness />);
    expect(screen.getByLabelText(LABELS[field])).toHaveAttribute('name', field);
  });

  it('renders its controls in the tuple’s order', () => {
    render(<Harness />);
    const rendered = Array.from(document.querySelectorAll<HTMLElement>('input[name]')).map(
      (element) => element.getAttribute('name'),
    );
    expect(rendered).toEqual([...EXTERNAL_DATES_FIELDS]);
  });

  it('says these are bounds rather than pins', () => {
    render(<Harness />);
    expect(screen.getByText(/They never override a hard constraint\./)).toBeVisible();
  });

  it('warns that a date before the data date cannot pull work earlier', () => {
    // The one case where setting a date and seeing nothing move is correct rather than broken —
    // which a planner cannot work out from the field itself.
    render(<Harness />);
    expect(hintOf(screen.getByLabelText('External early start'))).toContain(
      'A date before the data date is honoured but can’t pull work earlier.',
    );
  });

  describe('the engine’s own verdict', () => {
    it('says so when an external bound is currently driving the activity', () => {
      // The only thing here distinguishing an imported date that is WINNING from one that is
      // merely present, which is the question this section is opened to answer.
      render(<Harness externalDriven />);
      expect(screen.getByText('Driving this activity')).toBeVisible();
    });

    it('stays quiet when it is not', () => {
      render(<Harness />);
      expect(screen.queryByText('Driving this activity')).toBeNull();
    });
  });
});
