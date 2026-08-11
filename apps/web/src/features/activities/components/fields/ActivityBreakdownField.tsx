import type { ActivitySummary } from '@repo/types';
import type { JSX } from 'react';
import { useWatch } from 'react-hook-form';

import type { GroupProps } from './group-props';

import { SelectField } from '@/components/ui/form';
import { FormSection } from '@/components/ui/form-layout';
import type { ActivityGeneralValues } from '@/features/activities/schemas/activity-scope-schemas';

/** The one field this group renders. */
export const BREAKDOWN_FIELDS = [
  'parentId',
] as const satisfies readonly (keyof ActivityGeneralValues)[];

/**
 * Breakdown — which WBS summary this activity is grouped under.
 *
 * **The whole point of this group is the option it renders when it cannot resolve the stored
 * value.** A parent may be soft-deleted, outside the loaded page, or still in flight, and a
 * `<select>` given a value none of its options carry renders as *nothing selected* — which reads
 * as "None (top-level)" and is indistinguishable from it in the DOM. The save still re-sends the
 * real parent, so the screen and the record disagree, which is the worst of the three possible
 * behaviours. So an unresolvable value keeps its place under an honest label instead.
 *
 * "Parent WBS summary", not "WBS summary": the Type selector on the same form offers an OPTION
 * labelled exactly "WBS summary", so the shorter label reads as if it sets the type.
 *
 * The hint is invariant to loading — mirroring the calendar picker — so it never asserts a false
 * state while the list is resolving; the "no summaries yet" guidance is a separate appended clause
 * shown only once the list has resolved genuinely empty. There is deliberately no section `aside`
 * saying "no summaries in this plan": that would be shown exactly when an unresolvable parent is
 * most likely, i.e. to the one activity that disproves it.
 */
export function ActivityBreakdownField({
  form,
  parentOptions,
  loading = false,
  errored = false,
}: GroupProps<ActivityGeneralValues> & {
  /** The plan's summaries, minus the activity being edited (no self-parent; the API rejects it). */
  parentOptions: ActivitySummary[];
  /** The plan's activities are still in flight. */
  loading?: boolean;
  /** The plan's activities failed to load. */
  errored?: boolean;
}): JSX.Element {
  // Watched rather than read from the row, because clearing the picker must remove the honest
  // option rather than leave it selected.
  const parentId = useWatch({ control: form.control, name: 'parentId' });
  const missingParent = Boolean(parentId) && !parentOptions.some((p) => p.id === parentId);

  return (
    <FormSection title="Breakdown">
      <SelectField
        label="Parent WBS summary"
        disabled={loading}
        aria-busy={loading}
        errorRole="alert"
        error={
          errored
            ? 'Couldn’t load the plan’s activities, so no WBS summaries are available to choose.'
            : undefined
        }
        hint={
          'Groups this activity under a WBS summary, whose dates roll up from its members.' +
          // The honest option says the stored parent cannot be resolved; on its own it does not say
          // what to do about it, and "Unavailable" invites the reading that the SAVE will drop it.
          // It will not — the value is re-sent untouched — so the sentence says both halves.
          (missingParent && !loading
            ? ' Its current summary isn’t in this plan’s list — it may have been deleted. Saving keeps it as it is; choose another to change it.'
            : !loading && !errored && parentOptions.length === 0
              ? ' There are no WBS summaries in this plan yet — create a “WBS summary” activity to nest others under it.'
              : '')
        }
        {...form.register('parentId')}
      >
        <option value="">None (top-level)</option>
        {missingParent ? (
          <option value={parentId}>{loading ? 'Loading…' : 'Unavailable'}</option>
        ) : null}
        {parentOptions.map((summary) => (
          <option key={summary.id} value={summary.id}>
            {summary.code ? `${summary.code} · ${summary.name}` : summary.name}
          </option>
        ))}
      </SelectField>
    </FormSection>
  );
}
