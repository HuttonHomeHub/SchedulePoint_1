import type { JSX } from 'react';

import type { GroupProps } from './group-props';

import { TextField } from '@/components/ui/form';
import { FieldGrid, FormSection } from '@/components/ui/form-layout';
import { EARNED_VALUE_ENABLED } from '@/config/env';
import type { ActivityCostValues } from '@/features/activities/schemas/activity-scope-schemas';

/** Both members are behind `VITE_EARNED_VALUE`. */
export const EXPENSE_FIELDS = [
  'budgetedExpense',
  'actualExpense',
] as const satisfies readonly (keyof ActivityCostValues)[];

/**
 * Expenses — lump sums carried directly on the activity, on top of any resource-derived cost.
 *
 * **Offered for every activity type, including the ones with no duration.** These were withheld
 * from milestones on the reasoning that a milestone has no duration to cost — but a *payment*
 * milestone is exactly an activity with cost and no duration, and it is the commonest reason a
 * milestone carries money at all. The API accepts it (`apps/api/test/activities.e2e-spec.ts`,
 * established by running it rather than by reading the DTO).
 *
 * **The three numeric attributes are a union of what the two hosts each had right.** `step="0.01"`
 * because money is stored in minor units, so allowing a third decimal invites a value that is then
 * silently rounded; `min={0}` because a negative expense is not a thing; `inputMode="decimal"`
 * because it is the difference between a phone offering a number pad and offering a keyboard.
 */
export function ActivityExpenseFields({
  form,
}: GroupProps<ActivityCostValues>): JSX.Element | null {
  if (!EARNED_VALUE_ENABLED) return null;

  const { errors } = form.formState;

  return (
    <FormSection
      title="Expenses"
      description="Lump sums carried directly on this activity, on top of any resource-derived cost."
    >
      <FieldGrid>
        <TextField
          label="Budgeted expense"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          hint="A lump-sum budgeted cost for this activity, in the plan’s currency, on top of any resource-derived cost. Leave blank for none."
          error={errors.budgetedExpense?.message}
          {...form.register('budgetedExpense', {
            setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)),
          })}
        />
        <TextField
          label="Actual expense"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          hint="The lump-sum cost booked against this activity so far, in the plan’s currency. Leave blank for none."
          error={errors.actualExpense?.message}
          {...form.register('actualExpense', {
            setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)),
          })}
        />
      </FieldGrid>
    </FormSection>
  );
}
