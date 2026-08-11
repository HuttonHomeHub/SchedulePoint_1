import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivityType } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ActivityWorkFields, WORK_FIELDS } from './ActivityWorkFields';

import { FieldGridContainer } from '@/components/ui/form-layout';
import {
  activityGeneralSchema,
  type ActivityGeneralValues,
} from '@/features/activities/schemas/activity-scope-schemas';

/**
 * The work group, mounted on its own scope form.
 *
 * `hoursPerDay` and `savedType` are **props**, which is the point of ADR-0089 D2b: the first is
 * resolved from the scheduling scope's calendar and the second from the host's stored row, and a
 * group that reached across for either would need a second form — the one erosion path the
 * one-form rule has.
 */

function Harness({
  type = 'TASK',
  hoursPerDay,
  savedType,
}: {
  type?: ActivityType;
  hoursPerDay?: number;
  savedType?: ActivityType;
}): JSX.Element {
  const form = useForm<ActivityGeneralValues>({
    resolver: zodResolver(activityGeneralSchema as never) as never,
    defaultValues: {
      name: 'Pour slab',
      code: '',
      description: '',
      type,
      durationType: 'FIXED_DURATION_AND_UNITS_TIME',
      duration: '1',
      parentId: '',
    } as never,
  });

  return (
    <FieldGridContainer>
      <ActivityWorkFields
        form={form}
        hoursPerDay={hoursPerDay}
        {...(savedType === undefined ? {} : { savedType })}
      />
    </FieldGridContainer>
  );
}

const LABELS: Record<(typeof WORK_FIELDS)[number], string> = {
  type: 'Type',
  duration: 'Duration (working days)',
  durationType: 'Duration type',
};

describe('ActivityWorkFields', () => {
  it('renders its section heading', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Work' })).toBeVisible();
  });

  it.each(WORK_FIELDS)('renders a control registered as %s', (field) => {
    // A plain TASK is the only type for which all three render: a derived type has neither a
    // duration nor a duration type, which is what the explanations below replace.
    render(<Harness />);
    const control = screen.getByLabelText(LABELS[field]);
    expect(control).toBeVisible();
    expect(control).toHaveAttribute('name', field);
  });

  it('renders its controls in the tuple’s order', () => {
    render(<Harness />);
    const rendered = Array.from(document.querySelectorAll<HTMLElement>('input[name], select[name]'))
      .map((element) => element.getAttribute('name'))
      .filter((name): name is string => WORK_FIELDS.includes(name as never));
    expect(rendered).toEqual([...WORK_FIELDS]);
  });

  describe('a type with no duration of its own', () => {
    it.each([
      ['LEVEL_OF_EFFORT' as const, /duration is derived from its span/],
      ['WBS_SUMMARY' as const, /dates roll up from the activities grouped under it/],
    ])('replaces the duration field with why it is absent — %s', (type, sentence) => {
      render(<Harness type={type} />);
      expect(screen.queryByLabelText('Duration (working days)')).toBeNull();
      expect(screen.queryByLabelText('Duration type')).toBeNull();
      expect(screen.getByText(sentence)).toBeVisible();
    });

    it('keeps the duration for a RESOURCE_DEPENDENT and explains what moves instead', () => {
      // The one that is easy to get wrong: this type behaves exactly like a task for logic and
      // keeps its own duration — only the CALENDAR it is measured on changes.
      render(<Harness type="RESOURCE_DEPENDENT" />);
      expect(screen.getByLabelText('Duration (working days)')).toBeVisible();
      expect(
        screen.getByText('A resource-dependent activity is scheduled on its', { exact: false }),
      ).toBeVisible();
    });
  });

  describe('the type option list', () => {
    it('offers the stored row’s own type even when the selector would not', () => {
      render(<Harness type="HAMMOCK" savedType="HAMMOCK" />);
      const values = Array.from(screen.getByLabelText('Type').querySelectorAll('option')).map(
        (option) => option.getAttribute('value'),
      );
      expect(values).toContain('HAMMOCK');
    });

    it('keeps that option after the reader changes away from it', () => {
      // The M2-T2 A1 converge, pinned where the markup now lives. Anchored on the LIVE value this
      // was a one-way door: the option exists only because the row carries the type, so selecting
      // anything else removed it with no way back.
      render(<Harness type="HAMMOCK" savedType="HAMMOCK" />);
      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'TASK' } });
      const values = Array.from(screen.getByLabelText('Type').querySelectorAll('option')).map(
        (option) => option.getAttribute('value'),
      );
      expect(values).toContain('HAMMOCK');
    });
  });

  describe('the hours-per-day factor', () => {
    it('labels the duration in whole working days when it cannot be resolved', () => {
      render(<Harness />);
      expect(screen.getByLabelText('Duration (working days)')).toBeVisible();
    });

    it('accepts a sub-day duration once the factor is known', () => {
      render(<Harness hoursPerDay={8} />);
      const control = screen.getByLabelText('Duration');
      expect(control).toBeVisible();
      expect(control).toHaveAttribute('name', 'duration');
    });
  });
});
