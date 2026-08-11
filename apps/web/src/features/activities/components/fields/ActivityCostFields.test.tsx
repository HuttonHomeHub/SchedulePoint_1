import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ACCRUAL_FIELDS, ActivityAccrualField } from './ActivityAccrualField';
import { ActivityExpenseFields, EXPENSE_FIELDS } from './ActivityExpenseFields';
import {
  ActivityMeasureFields,
  MEASURE_FIELDS,
  MEASURE_SECTION_DESCRIPTION,
  MEASURE_SECTION_TITLE,
} from './ActivityMeasureFields';

import { FieldGateProvider } from '@/components/ui/field-gate';
import { FieldGridContainer } from '@/components/ui/form-layout';
import {
  activityCostSchema,
  activityMeasureSchema,
  type ActivityCostValues,
  type ActivityMeasureValues,
} from '@/features/activities/schemas/activity-scope-schemas';

/**
 * The three groups that make up an activity's money and its value measure.
 *
 * They are tested together because the thing worth pinning spans them: **a milestone is offered all
 * of it.** Every one of these fields was withheld from a duration-derived type on create, and a
 * payment milestone — cost with no duration — is the commonest reason a milestone carries money at
 * all.
 */

function Cost({ children }: { children: (form: never) => JSX.Element }): JSX.Element {
  const form = useForm<ActivityCostValues>({
    resolver: zodResolver(activityCostSchema as never) as never,
    defaultValues: {
      budgetedExpense: undefined,
      actualExpense: undefined,
      accrualType: 'UNIFORM',
    } as never,
  });
  return <FieldGridContainer>{children(form as never)}</FieldGridContainer>;
}

function Measure({
  percentCompleteType = 'DURATION',
  gated = false,
}: {
  percentCompleteType?: ActivityMeasureValues['percentCompleteType'];
  gated?: boolean;
}): JSX.Element {
  const form = useForm<ActivityMeasureValues>({
    resolver: zodResolver(activityMeasureSchema as never) as never,
    defaultValues: { percentCompleteType, physicalPercentComplete: undefined } as never,
  });
  const fields = (
    <ActivityMeasureFields
      form={form}
      {...(gated
        ? {
            physicalGate: {
              writable: false,
              reason:
                'Weighted steps are setting this to 75%. Clear the steps to enter a value by hand.',
            },
          }
        : {})}
    />
  );
  return (
    <FieldGridContainer>
      {gated ? (
        fields
      ) : (
        <FieldGateProvider gate={{ writable: true, reason: null }}>{fields}</FieldGateProvider>
      )}
    </FieldGridContainer>
  );
}

describe('ActivityExpenseFields', () => {
  const LABELS: Record<(typeof EXPENSE_FIELDS)[number], string> = {
    budgetedExpense: 'Budgeted expense',
    actualExpense: 'Actual expense',
  };

  it.each(EXPENSE_FIELDS)('renders a control registered as %s', (field) => {
    render(<Cost>{(form) => <ActivityExpenseFields form={form} />}</Cost>);
    expect(screen.getByLabelText(LABELS[field])).toHaveAttribute('name', field);
  });

  it.each(EXPENSE_FIELDS)('takes hundredths from zero up on a decimal keypad — %s', (field) => {
    // The union of what each host had right. Hundredths because money is stored in minor units, so
    // a third decimal would be accepted and then silently rounded; the floor because a negative
    // expense is not a thing; the keypad because it changes what a phone offers.
    render(<Cost>{(form) => <ActivityExpenseFields form={form} />}</Cost>);
    const input = screen.getByLabelText(LABELS[field]);
    expect(input).toHaveAttribute('step', '0.01');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('renders its controls in the tuple’s order', () => {
    // ADR-0089 D2 gate 2, which the ADR claims for every group — and did not have here. The
    // create host's `SUBMIT_FIELD_ORDER` relies on this order for where a failed submit sends the
    // reader, so it is load-bearing rather than tidy.
    render(<Cost>{(form) => <ActivityExpenseFields form={form} />}</Cost>);
    const rendered = Array.from(document.querySelectorAll<HTMLElement>('input[name], select[name]'))
      .map((element) => element.getAttribute('name') ?? '')
      .filter((name) => (EXPENSE_FIELDS as readonly string[]).includes(name));
    expect(rendered).toEqual([...EXPENSE_FIELDS]);
  });

  it.each(EXPENSE_FIELDS)('says a blank %s means none', (field) => {
    // Both fields say it, which is why this is a loop rather than a single lookup — asserting one
    // and finding two is how a shared sentence gets attributed to the wrong control.
    render(<Cost>{(form) => <ActivityExpenseFields form={form} />}</Cost>);
    const control = screen.getByLabelText(LABELS[field]);
    const described = (control.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(described).toContain('Leave blank for none.');
  });
});

describe('ActivityAccrualField', () => {
  it.each(ACCRUAL_FIELDS)('renders a control registered as %s', (field) => {
    render(<Cost>{(form) => <ActivityAccrualField form={form} />}</Cost>);
    expect(screen.getByLabelText('Cost accrual')).toHaveAttribute('name', field);
  });

  it('puts the “never a date” disclaimer above the field, not inside its hint', () => {
    // It is true of the whole section, and it is the one thing about this control a reader is most
    // likely to get wrong — so it is said once above rather than repeated in a hint.
    render(<Cost>{(form) => <ActivityAccrualField form={form} />}</Cost>);
    expect(
      screen.getByText('Changes only when cost is recognised in Earned value — never a date.'),
    ).toBeVisible();
  });
});

describe('ActivityMeasureFields', () => {
  const LABELS: Record<(typeof MEASURE_FIELDS)[number], string> = {
    percentCompleteType: 'Earn value from',
    physicalPercentComplete: 'Physical % complete',
  };

  it.each(MEASURE_FIELDS)('renders a control registered as %s', (field) => {
    render(<Measure />);
    expect(screen.getByLabelText(LABELS[field])).toHaveAttribute('name', field);
  });

  it.each(['DURATION', 'UNITS', 'PHYSICAL'] as const)(
    'renders the physical %% whatever the measure — %s',
    (percentCompleteType) => {
      // ADR-0060 §6: shading implies a value is there, hiding claims there is none. The field holds
      // a stored value, so withholding it says this activity has no physical progress.
      render(<Measure percentCompleteType={percentCompleteType} />);
      expect(screen.getByLabelText('Physical % complete')).toBeVisible();
    },
  );

  it('renders its controls in the tuple’s order', () => {
    // ADR-0089 D2 gate 2, which the ADR claims for every group — and did not have here. The
    // create host's `SUBMIT_FIELD_ORDER` relies on this order for where a failed submit sends the
    // reader, so it is load-bearing rather than tidy.
    render(<Measure />);
    const rendered = Array.from(document.querySelectorAll<HTMLElement>('input[name], select[name]'))
      .map((element) => element.getAttribute('name') ?? '')
      .filter((name) => (MEASURE_FIELDS as readonly string[]).includes(name));
    expect(rendered).toEqual([...MEASURE_FIELDS]);
  });

  it('renders no section of its own — the frame belongs to the host', () => {
    // Its two hosts frame it differently and correctly: a progress panel with an effect heading in
    // the editor, an ordinary form section on create. Only the controls are shared.
    render(<Measure />);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('publishes its heading copy for both hosts rather than each typing it', () => {
    // The exception to "a group owns its FormSection" is that its two hosts FRAME it differently —
    // a progress panel in the editor, a form section on create. They were also typing the same
    // WORDS twice, in two files, with nothing asserting they agreed: the drift this epic exists to
    // close, reintroduced by the exception meant to accommodate two honest framings.
    expect(MEASURE_SECTION_TITLE).toBe('How value is measured');
    expect(MEASURE_SECTION_DESCRIPTION).toBe('Earns value in Earned Value. Changes no dates.');
  });

  it('shows the panel’s reason on the physical field when it is given one', () => {
    // A panel fact, not a field fact: "weighted steps are setting this to 75%" is knowable only
    // where the steps are. The field renders the reason it is handed.
    render(<Measure gated />);
    expect(screen.getByText(/Weighted steps are setting this to 75%/)).toBeVisible();
  });
});
