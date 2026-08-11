import { SELECTABLE_CONSTRAINT_TYPES, isParkedConstraintType } from '@repo/types';
import type { JSX } from 'react';
import { useWatch } from 'react-hook-form';

import type { GroupProps } from './group-props';

import { SelectField, TextField } from '@/components/ui/form';
import { FieldGrid, FormSection } from '@/components/ui/form-layout';
import { ADVANCED_CONSTRAINTS_ENABLED } from '@/config/env';
import { CONSTRAINT_TYPE_LABELS } from '@/features/activities/schemas/activity-schemas';
import type { ActivitySchedulingValues } from '@/features/activities/schemas/activity-scope-schemas';
import { PARKED_CONSTRAINT_LABELS } from '@/lib/constraint-format';

/**
 * The two constraint pairs, in the order the reader meets them. Each date is conditional on its
 * type being set, and the secondary pair is behind `VITE_ADVANCED_CONSTRAINTS`.
 */
export const CONSTRAINT_FIELDS = [
  'constraintType',
  'constraintDate',
  'secondaryConstraintType',
  'secondaryConstraintDate',
] as const satisfies readonly (keyof ActivitySchedulingValues)[];

/**
 * Constraints — dates imposed on the network, overriding what the logic would decide.
 *
 * **Why the selector offers six kinds and the field may hold eight.** The engine *parks* the two
 * `MANDATORY_*` kinds: it accepts them and applies each as the nearest honoured constraint. Offering
 * them would let a planner set a constraint that behaves differently from how it reads, so the list
 * is the six that do not. But an activity — imported, or authored before the rule — may already
 * carry one, and a `<select>` given a value none of its options match renders as **nothing
 * selected** and reads back `''`, which is the "None" option's own value. A set constraint would
 * display as no constraint, with its date sitting filled in below it.
 *
 * So a parked value present on the row keeps its place under a label saying what it actually does.
 * It is derived from the **live** field value, not the stored one, so it appears while selected and
 * drops out the moment the planner chooses something else — which is the difference between an
 * honest option and one that cannot be got rid of.
 *
 * The type/date pair is `columns="lead"` because a constraint and its date are **one decision**;
 * stacking them made the flat list read as two.
 */
export function ActivityConstraintFields({
  form,
}: GroupProps<ActivitySchedulingValues>): JSX.Element {
  const { errors } = form.formState;
  const constraintType = useWatch({ control: form.control, name: 'constraintType' });
  const secondaryConstraintType = useWatch({
    control: form.control,
    name: 'secondaryConstraintType',
  });

  const parkedValue =
    constraintType && isParkedConstraintType(constraintType) ? constraintType : null;
  const secondaryParkedValue =
    secondaryConstraintType && isParkedConstraintType(secondaryConstraintType)
      ? secondaryConstraintType
      : null;

  return (
    <FormSection
      title="Constraints"
      description="Dates you impose on the network. A constraint overrides what the logic would otherwise decide."
      aside={constraintType ? undefined : 'None set'}
    >
      <FieldGrid columns="lead">
        <SelectField
          label="Constraint"
          error={errors.constraintType?.message}
          hint={
            'Pins the activity’s start or finish to a date. Only constraints the scheduler applies ' +
            'exactly as named are listed (an existing value keeps its own label).'
          }
          {...form.register('constraintType')}
        >
          <option value="">None</option>
          {SELECTABLE_CONSTRAINT_TYPES.map((value) => (
            <option key={value} value={value}>
              {CONSTRAINT_TYPE_LABELS[value]}
            </option>
          ))}
          {parkedValue ? (
            <option value={parkedValue}>{PARKED_CONSTRAINT_LABELS[parkedValue]}</option>
          ) : null}
        </SelectField>
        {constraintType ? (
          <TextField
            label="Constraint date"
            type="date"
            error={errors.constraintDate?.message}
            {...form.register('constraintDate')}
          />
        ) : null}

        {ADVANCED_CONSTRAINTS_ENABLED ? (
          <>
            <SelectField
              label="Secondary constraint"
              error={errors.secondaryConstraintType?.message}
              hint={
                'A second date constraint that drives the activity’s late dates — e.g. a primary ' +
                '“start no earlier than” with a secondary “finish no later than”. The primary ' +
                'constraint drives its early dates.'
              }
              {...form.register('secondaryConstraintType')}
            >
              <option value="">None</option>
              {SELECTABLE_CONSTRAINT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {CONSTRAINT_TYPE_LABELS[value]}
                </option>
              ))}
              {secondaryParkedValue ? (
                <option value={secondaryParkedValue}>
                  {PARKED_CONSTRAINT_LABELS[secondaryParkedValue]}
                </option>
              ) : null}
            </SelectField>
            {secondaryConstraintType ? (
              <TextField
                label="Secondary constraint date"
                type="date"
                error={errors.secondaryConstraintDate?.message}
                {...form.register('secondaryConstraintDate')}
              />
            ) : null}
          </>
        ) : null}
      </FieldGrid>
    </FormSection>
  );
}
