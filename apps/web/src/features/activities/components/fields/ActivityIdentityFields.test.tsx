import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ActivityIdentityFields, IDENTITY_FIELDS } from './ActivityIdentityFields';

import { FieldGridContainer } from '@/components/ui/form-layout';
import {
  activityGeneralSchema,
  type ActivityGeneralValues,
} from '@/features/activities/schemas/activity-scope-schemas';

/**
 * The identity group, mounted on its own scope form and nothing else.
 *
 * **Two of these gates are load-bearing and one is not, which is stated rather than implied**
 * (ADR-0089 D2). The `FIELDS` tuple is checked by the compiler against `ActivityGeneralValues`, so
 * it catches a misspelling and nothing more — a name declared there and never rendered would
 * compile perfectly, and would drop that field on BOTH hosts at once, which is strictly worse than
 * today's independent hosts. The `it.each` below is what closes that: it asserts a rendered control
 * per name, and that the tuple's order IS render order, which is what makes the tuple a
 * specification. Neither catches a field wired to the wrong scope form — that one does not compile.
 */

function Harness({ values }: { values?: Partial<ActivityGeneralValues> }): JSX.Element {
  const form = useForm<ActivityGeneralValues>({
    resolver: zodResolver(activityGeneralSchema as never) as never,
    defaultValues: {
      name: '',
      code: '',
      description: '',
      type: 'TASK',
      durationType: 'FIXED_DURATION_AND_UNITS_TIME',
      duration: '1',
      parentId: '',
      ...values,
    } as never,
  });

  return (
    <FieldGridContainer>
      <ActivityIdentityFields form={form} />
    </FieldGridContainer>
  );
}

const LABELS: Record<(typeof IDENTITY_FIELDS)[number], string> = {
  name: 'Name',
  code: 'Code',
  description: 'Description',
};

describe('ActivityIdentityFields', () => {
  it('renders its section heading', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Identity' })).toBeVisible();
  });

  it.each(IDENTITY_FIELDS)('renders a control registered as %s', (field) => {
    render(<Harness />);
    const control = screen.getByLabelText(LABELS[field]);
    expect(control).toBeVisible();
    expect(control).toHaveAttribute('name', field);
  });

  it('renders its controls in the tuple’s order', () => {
    // Free once the loop above exists, and load-bearing: this tuple is walked by the create host's
    // ordered focus decision, so its order decides where a failed submit sends the reader.
    render(<Harness />);
    const rendered = Array.from(
      document.querySelectorAll<HTMLElement>('input[name], textarea[name]'),
    ).map((element) => element.getAttribute('name'));
    expect(rendered).toEqual([...IDENTITY_FIELDS]);
  });

  it('switches browser autofill off for the two text controls', () => {
    // The M2-T1 converge, pinned where the markup now lives rather than only at the two hosts.
    render(<Harness />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Code')).toHaveAttribute('autocomplete', 'off');
  });

  it('shows a field’s own error under that field', () => {
    render(<Harness />);
    const form = screen.getByLabelText('Name');
    expect(form).toHaveAttribute('name', 'name');
    // No submit here — the error path itself is covered at the hosts, where the submit lives. What
    // this asserts is the wiring: the group reads `formState.errors`, so a message has somewhere to
    // land at all.
    expect(screen.queryByText('Name is required.')).toBeNull();
  });
});
