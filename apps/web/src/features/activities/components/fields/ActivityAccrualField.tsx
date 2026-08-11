import type { JSX } from 'react';

import type { GroupProps } from './group-props';

import { SelectField } from '@/components/ui/form';
import { FieldGrid, FormSection } from '@/components/ui/form-layout';
import { COST_ACCRUAL_ENABLED } from '@/config/env';
import {
  ACCRUAL_TYPE_LABELS,
  ACCRUAL_TYPE_OPTIONS,
} from '@/features/activities/schemas/activity-schemas';
import type { ActivityCostValues } from '@/features/activities/schemas/activity-scope-schemas';

/** The one field this group renders. */
export const ACCRUAL_FIELDS = [
  'accrualType',
] as const satisfies readonly (keyof ActivityCostValues)[];

/**
 * Recognition — *when* this activity's cost is recognised in the Earned-Value planned-value curve
 * (ADR-0044 §32).
 *
 * **The disclaimer is the section's description rather than the field's hint**, which is the one
 * thing about this control a reader is most likely to get wrong: it changes no date and moves no
 * bar. It is true of the whole section, so it is said once above it rather than repeated inside a
 * hint — and create had only the one field there to attach it to, which is how it ended up in a
 * hint on one host and a description on the other.
 */
export function ActivityAccrualField({ form }: GroupProps<ActivityCostValues>): JSX.Element | null {
  if (!COST_ACCRUAL_ENABLED) return null;

  return (
    <FormSection
      title="Recognition"
      description="Changes only when cost is recognised in Earned value — never a date."
    >
      <FieldGrid>
        <SelectField
          label="Cost accrual"
          hint={
            'Sets when this activity’s cost is recognised: Start (all at the start), Uniform ' +
            '(spread evenly), or End (all at the finish).'
          }
          {...form.register('accrualType')}
        >
          {ACCRUAL_TYPE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {ACCRUAL_TYPE_LABELS[value]}
            </option>
          ))}
        </SelectField>
      </FieldGrid>
    </FormSection>
  );
}
