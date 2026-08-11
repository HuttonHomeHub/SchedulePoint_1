import type { ActivityType, CalendarSummary } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import { INHERIT_CALENDAR_LABEL } from '../../schemas/activity-schemas';
import type { ActivitySchedulingValues } from '../../schemas/activity-scope-schemas';

import { Combobox } from '@/components/ui/combobox';
import { FieldGateLock, useFieldGate } from '@/components/ui/field-gate';
import { Label } from '@/components/ui/label';
import {
  CALENDAR_TIER_GROUP_LABELS,
  groupCalendarsByTier,
  offerableCalendars,
  toCalendarOptions,
} from '@/lib/calendar-tiers';
import { matchesLibraryQuery } from '@/lib/library-filters';

/**
 * The one field this group renders.
 *
 * **Declared later than its siblings', and that is the point.** This component predates the group
 * convention — it takes `value`/`onChange` rather than a scope form, because it was extracted to
 * stop the editor re-implementing a combobox, not to partition a schema. Without this tuple the
 * partition gate (`field-group-partition.structural.test.ts`) could not see `calendarId` at all,
 * and would have reported the scheduling scope as complete while one field was rendered by
 * something it could not account for.
 */
export const CALENDAR_FIELDS = [
  'calendarId',
] as const satisfies readonly (keyof ActivitySchedulingValues)[];

/**
 * The per-activity working-time calendar picker (ADR-0037), shared by {@link ActivityCreateDialog} and
 * the tabbed {@link ActivityEditorDialog}'s Scheduling tab.
 *
 * **That sentence was false for a year and is worth leaving corrected rather than quietly fixed.**
 * the create dialog did not import this file; it inlined its own `Combobox` — so the docblock
 * asserting one implementation was itself the evidence that there were two, and the two had already
 * drifted (native `disabled` against `readOnly`, and a hint differing by one clause). Create adopted
 * it at M3-T1, which is what made the claim true.
 *
 * Extracted, not re-implemented. The tabbed editor's first draft rebuilt this as a plain
 * `SelectField` and lost four shipped behaviours at once — the ADR-0053 §4 `Combobox` (default-on
 * since 2026-07-26), the loading and error states, the "the seeded id isn't in the list yet"
 * fallback, and the `RESOURCE_DEPENDENT` disabled reason. Every one of those failures is silent:
 * the field still renders, still looks right, and reports a calendar the activity does not have.
 * That is the exact defect class this epic exists to remove, so the fix is one implementation both
 * dialogs call rather than two that agree today.
 *
 * Three states this field refuses to fake:
 *
 * - **Still loading / failed to load** — the picker says "Loading…"/"Unavailable" and keeps the
 *   bound value selected. Blank would read as "inherits the plan's", which is a different answer.
 * - **A calendar the list doesn't contain** — same rule: shown, never silently dropped.
 * - **`RESOURCE_DEPENDENT`** — the activity schedules on its driving resource's calendar (ADR-0035
 *   §23), so this control is shaded **with the reason**, not hidden: the binding an imported or
 *   re-typed activity carries stays visible.
 */
export function ActivityCalendarField({
  value,
  onChange,
  calendars,
  loading = false,
  errored = false,
  activityType,
}: {
  /** The bound `calendarId`, `''` meaning inherit the plan's. */
  value: string;
  onChange: (calendarId: string) => void;
  /** The project-usable library (ADR-0053 §1): the project's own plus the organisation's. */
  calendars: CalendarSummary[];
  loading?: boolean;
  errored?: boolean;
  /** Drives the `RESOURCE_DEPENDENT` shaded-with-a-reason state. */
  activityType: ActivityType | undefined;
}): React.ReactElement {
  const baseId = useId();
  const fieldId = `${baseId}-calendar`;
  const helpId = `${baseId}-help`;
  const errorId = `${baseId}-error`;

  // A RESOURCE_DEPENDENT activity schedules on its DRIVING RESOURCE's calendar (ADR-0035 §23 /
  // ADR-0039), so its own `calendarId` is resolved and then overridden by the service. Leaving the
  // picker live would be a control that saves a value with no effect.
  const resourceDependent = activityType === 'RESOURCE_DEPENDENT';
  // The scope's own gate (role/pen) now arrives through the enclosing `FieldGateProvider` rather
  // than a `disabled` prop the caller had to remember to pass (ADR-0083 D4). Either rule shades the
  // field; the RESOURCE_DEPENDENT sentence below is the more specific one and is what the reader
  // sees, which is exactly the nearest-reason rule the ADR states.
  const penShut = useFieldGate()?.writable === false;
  const shaded = penShut || resourceDependent;
  // A bound value that matches no option (the list is still loading, or failed): inject a synthetic
  // option so the Select shows it as selected — never blank, which would read as "inherit".

  const calendarTiers = groupCalendarsByTier(calendars);
  const grouped = calendarTiers.project.length > 0;
  // Not debounced: `calendars` is already the COMPLETE project-usable library, so this is a
  // client-side array pass.
  const [query, setQuery] = useState('');
  const options = useMemo(() => {
    const offerable = offerableCalendars(calendars, value).filter((calendar) =>
      matchesLibraryQuery(query, calendar.name),
    );
    return toCalendarOptions(offerable, { grouped });
  }, [calendars, value, query, grouped]);

  const describedBy = errored ? `${helpId} ${errorId}` : helpId;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className={shaded ? 'flex items-center gap-1.5' : undefined}>
        Calendar
        {shaded ? <FieldGateLock /> : null}
      </Label>
      <Combobox
        id={fieldId}
        value={value}
        onChange={onChange}
        query={query}
        onQueryChange={setQuery}
        options={options}
        selectedLabel={calendars.find((c) => c.id === value)?.name}
        groupLabels={CALENDAR_TIER_GROUP_LABELS}
        emptyOption={{ label: INHERIT_CALENDAR_LABEL }}
        // `readOnly`, not `disabled`: the picker still shows which calendar this activity is on,
        // and that value stays focusable and copyable (ADR-0083 D1 row 4).
        readOnly={shaded}
        loading={loading}
        errored={errored}
        describedBy={describedBy}
        invalid={errored}
        toggleLabel="Show calendars"
        emptyMessage="No calendars match your search."
      />
      <p id={helpId} className="text-muted-foreground text-sm">
        {resourceDependent
          ? // Says WHY it is unavailable, not merely that it is. A disabled control with no reason
            // reads as a bug; this one is disabled because another field already decides the answer.
            'Not used by a resource-dependent activity — it is scheduled on its driving resource’s calendar instead. Change the type back to set a calendar here.'
          : 'The working-time calendar this activity is scheduled on. Inherits the plan’s calendar unless you pick one. Recalculate to apply it to the activity’s dates.'}
      </p>
      {errored ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          Couldn’t load the calendar list, so only “{INHERIT_CALENDAR_LABEL}” is available.
        </p>
      ) : null}
    </div>
  );
}
