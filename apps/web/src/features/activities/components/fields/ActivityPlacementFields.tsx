import type { ActivityType } from '@repo/types';
import type { JSX } from 'react';

import type { GroupProps } from './group-props';

import { CheckboxField, TextField } from '@/components/ui/form';
import { FieldGrid, FormSection } from '@/components/ui/form-layout';
import { isDurationDerivedType } from '@/features/activities/schemas/activity-schemas';
import type { ActivitySchedulingValues } from '@/features/activities/schemas/activity-scope-schemas';

/** Expected finish is type-dependent. */
export const PLACEMENT_FIELDS = [
  'scheduleAsLateAsPossible',
  'expectedFinish',
] as const satisfies readonly (keyof ActivitySchedulingValues)[];

/**
 * Placement & targets — where the activity sits once its dates are known.
 *
 * **Neither of these is a constraint, and the section says so.** "Schedule as late as possible"
 * changes where the bar is DRAWN and touches neither dates nor float; expected finish is a target
 * the engine sizes work towards when the plan's option is on. Create had both inside Constraints,
 * beside five controls that pin a date, which is the reading a planner would most reasonably take
 * from a checkbox in that company.
 *
 */
export function ActivityPlacementFields({
  form,
  activityType,
}: GroupProps<ActivitySchedulingValues> & {
  /** The live type from the GENERAL scope (ADR-0089 D2b): expected finish is meaningless without an
   * entered duration. */
  activityType: ActivityType | undefined;
}): JSX.Element {
  return (
    <FormSection
      title="Placement &amp; targets"
      description="How the activity is positioned once its dates are known."
    >
      <FieldGrid>
        <CheckboxField
          label="Schedule as late as possible"
          hint="Draws the activity at its latest position without changing its dates or float. A display preference, not a date constraint."
          {...form.register('scheduleAsLateAsPossible')}
        />
        {/* Expected finish sizes work to a target finish, so it is meaningless for a type whose
          duration is not entered — a milestone (a point in time) or a level of effort (span-derived)
          — hidden for those, mirroring the Duration field. */}
        {activityType !== undefined && isDurationDerivedType(activityType) ? null : (
          <TextField
            label="Expected finish"
            type="date"
            hint="A target finish date. When the plan’s “Expected-finish scheduling” option is on, the engine sizes this activity’s work so it finishes on this date (Recalculate to apply)."
            error={form.formState.errors.expectedFinish?.message}
            {...form.register('expectedFinish')}
          />
        )}
      </FieldGrid>
    </FormSection>
  );
}
