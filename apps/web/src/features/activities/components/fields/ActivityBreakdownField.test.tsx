import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ActivityBreakdownField, BREAKDOWN_FIELDS } from './ActivityBreakdownField';

import { FieldGridContainer } from '@/components/ui/form-layout';
import {
  activityGeneralSchema,
  type ActivityGeneralValues,
} from '@/features/activities/schemas/activity-scope-schemas';

const SUMMARY = {
  id: 'sum-1',
  name: 'Phase 1',
  code: 'W1',
  type: 'WBS_SUMMARY',
} as ActivitySummary;

function Harness({
  parentId = '',
  parentOptions = [SUMMARY],
  loading = false,
  errored = false,
}: {
  parentId?: string;
  parentOptions?: ActivitySummary[];
  loading?: boolean;
  errored?: boolean;
}): JSX.Element {
  const form = useForm<ActivityGeneralValues>({
    resolver: zodResolver(activityGeneralSchema as never) as never,
    defaultValues: {
      name: 'Pour slab',
      code: '',
      description: '',
      type: 'TASK',
      durationType: 'FIXED_DURATION_AND_UNITS_TIME',
      duration: '1',
      parentId,
    } as never,
  });

  return (
    <FieldGridContainer>
      <ActivityBreakdownField
        form={form}
        parentOptions={parentOptions}
        loading={loading}
        errored={errored}
      />
    </FieldGridContainer>
  );
}

const select = (): HTMLSelectElement => screen.getByLabelText('Parent WBS summary');
const labels = (): string[] => [...select().options].map((option) => option.textContent ?? '');
const hint = (): string =>
  (select().getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('ActivityBreakdownField', () => {
  it.each(BREAKDOWN_FIELDS)('renders a control registered as %s', (field) => {
    render(<Harness />);
    expect(select()).toHaveAttribute('name', field);
  });

  it('names the parent it selects, not the type of the same name', () => {
    // The Type selector on the same form offers an option labelled exactly "WBS summary".
    render(<Harness />);
    expect(screen.queryByLabelText('WBS summary')).toBeNull();
  });

  it('shows a summary’s code beside its name', () => {
    render(<Harness />);
    expect(labels()).toEqual(['None (top-level)', 'W1 · Phase 1']);
  });

  describe('a stored parent the list cannot resolve', () => {
    it('keeps it selected under an honest label rather than reading as top-level', () => {
      render(<Harness parentId="gone-1" />);
      expect(select().value).toBe('gone-1');
      expect(labels()).toContain('Unavailable');
    });

    it('says “Loading…” instead while the list is still in flight', () => {
      render(<Harness parentId="gone-1" loading />);
      expect(labels()).toContain('Loading…');
      expect(labels()).not.toContain('Unavailable');
    });

    it('drops the option once the reader clears the field', () => {
      // Watched, not read from the row: selecting "None" has to remove the honest option, or the
      // picker would keep offering a parent the planner has just detached from.
      render(<Harness parentId="gone-1" />);
      fireEvent.change(select(), { target: { value: '' } });
      expect(labels()).not.toContain('Unavailable');
    });

    it('withholds the “no summaries yet” guidance, which would contradict it', () => {
      render(<Harness parentId="gone-1" parentOptions={[]} />);
      expect(hint()).not.toContain('There are no WBS summaries in this plan yet');
    });
  });

  describe('the list’s own states', () => {
    it('disables and marks itself busy while loading', () => {
      render(<Harness loading />);
      expect(select()).toBeDisabled();
      expect(select()).toHaveAttribute('aria-busy', 'true');
    });

    it('says the load failed rather than reading as an empty plan', () => {
      render(<Harness errored parentOptions={[]} />);
      expect(
        screen.getByText(
          'Couldn’t load the plan’s activities, so no WBS summaries are available to choose.',
        ),
      ).toBeVisible();
      expect(hint()).not.toContain('There are no WBS summaries in this plan yet');
    });

    it('appends the guidance only once the list has resolved genuinely empty', () => {
      render(<Harness parentOptions={[]} />);
      expect(hint()).toContain('There are no WBS summaries in this plan yet');
    });

    it('keeps the hint free of any state claim while loading', () => {
      // Mirrors the calendar picker: a hint that changes with loading asserts a fact about the
      // plan before the plan has answered.
      render(<Harness parentOptions={[]} loading />);
      expect(hint()).not.toContain('There are no WBS summaries in this plan yet');
    });
  });
});
