import type { JSX } from 'react';

import type { GroupProps } from './group-props';

import { TextField } from '@/components/ui/form';
import { FieldGrid, FormSection } from '@/components/ui/form-layout';
import { INTER_PROJECT_DATES_ENABLED } from '@/config/env';
import type { ActivitySchedulingValues } from '@/features/activities/schemas/activity-scope-schemas';

/** Both members are behind `VITE_INTER_PROJECT_DATES`. */
export const EXTERNAL_DATES_FIELDS = [
  'externalEarlyStart',
  'externalLateFinish',
] as const satisfies readonly (keyof ActivitySchedulingValues)[];

/**
 * External interfaces — dates imported from outside this plan (ADR-0043 / ADR-0035 §30).
 *
 * Shown for **every** type, milestones included: a milestone can carry an external late finish, and
 * A12500 in the conformance fixture is exactly that case.
 *
 * **Two things a reader cannot work out from the fields themselves, so both are said.** These are
 * bounds and never pins — the later of the activity's logic and the external early start drives its
 * start, an external late finish earlier than the logic can achieve shows as negative float, and a
 * hard constraint still wins. And an early start *before the data date* is honoured while changing
 * nothing, which is the one case where setting a date and seeing no movement is correct rather than
 * broken.
 *
 * {@link externalDriven} is engine-computed and arrives as a prop (ADR-0089 D2b). It is the only
 * thing on this section that distinguishes an imported date that is currently **winning** from one
 * that is merely present — which is the question a planner opens this section to answer.
 */
export function ActivityExternalDatesFields({
  form,
  externalDriven = false,
}: GroupProps<ActivitySchedulingValues> & {
  /** The engine says an external bound is currently driving this activity's dates. */
  externalDriven?: boolean;
}): JSX.Element | null {
  if (!INTER_PROJECT_DATES_ENABLED) return null;

  return (
    <FormSection
      title="External interfaces"
      description="Imported commitments from outside this plan (a vendor delivery, a downstream commissioning window). The later of the activity’s logic and the external early start drives its start; an external late finish earlier than the logic can achieve shows as negative float. They never override a hard constraint."
      aside={externalDriven ? 'Driving this activity' : undefined}
    >
      <FieldGrid>
        <TextField
          label="External early start"
          type="date"
          hint="The earliest an upstream plan or project hands this activity over. Recalculate to apply; the later of this and the activity’s logic wins. A date before the data date is honoured but can’t pull work earlier."
          error={form.formState.errors.externalEarlyStart?.message}
          {...form.register('externalEarlyStart')}
        />
        <TextField
          label="External late finish"
          type="date"
          hint="The latest a downstream plan or project allows this activity to finish. Earlier than the logic can achieve, it shows as negative float."
          error={form.formState.errors.externalLateFinish?.message}
          {...form.register('externalLateFinish')}
        />
      </FieldGrid>
    </FormSection>
  );
}
