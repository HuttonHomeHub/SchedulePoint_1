import type { ActivityType } from '@repo/types';
import type { JSX } from 'react';

import type { GroupProps } from './group-props';

import { TextField } from '@/components/ui/form';
import { FieldGrid, FormSection } from '@/components/ui/form-layout';
import { RESOURCE_LEVELLING_ENABLED } from '@/config/env';
import { isDurationDerivedType } from '@/features/activities/schemas/activity-schemas';
import type { ActivitySchedulingValues } from '@/features/activities/schemas/activity-scope-schemas';

/** The one field this group renders. */
export const LEVELLING_FIELDS = [
  'levelingPriority',
] as const satisfies readonly (keyof ActivitySchedulingValues)[];

/**
 * Levelling — which activity wins a contended resource when the plan is levelled.
 *
 * Hidden for a duration-derived type, which is create's rule and not the editor's. Levelling moves
 * activities that consume a resource for an entered duration; a milestone consumes nothing, and a
 * level of effort or WBS summary derives its span from other activities — ADR-0041 never moves any
 * of them. A priority field on one is a control whose value can have no effect, which is the
 * lit-but-inert shape this codebase keeps re-finding.
 */
export function ActivityLevellingField({
  form,
  activityType,
}: GroupProps<ActivitySchedulingValues> & {
  /** The live type from the GENERAL scope (ADR-0089 D2b). */
  activityType: ActivityType | undefined;
}): JSX.Element | null {
  if (
    !RESOURCE_LEVELLING_ENABLED ||
    (activityType !== undefined && isDurationDerivedType(activityType))
  )
    return null;

  return (
    <FormSection title="Levelling" description="Used only when the plan is levelled.">
      <FieldGrid>
        <TextField
          label="Levelling priority"
          type="number"
          min={0}
          // `step` and `inputMode` are create's, and they matter on the surface where the number is
          // typed rather than read: priority is an integer, and `numeric` is the difference between
          // a phone offering a keypad and offering a full keyboard.
          step={1}
          inputMode="numeric"
          hint="Lower wins the resource when two activities contend under resource levelling. Leave blank for lowest priority."
          error={form.formState.errors.levelingPriority?.message}
          {...form.register('levelingPriority', {
            setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)),
          })}
        />
      </FieldGrid>
    </FormSection>
  );
}
