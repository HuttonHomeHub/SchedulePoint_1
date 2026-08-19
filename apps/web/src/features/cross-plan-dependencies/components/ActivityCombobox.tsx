import type { ActivitySummary } from '@repo/types';
import { useMemo, useState } from 'react';

import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { matchesLibraryQuery } from '@/lib/library-filters';

/**
 * The upstream **activity** picker for a cross-plan link.
 *
 * The only `Combobox` in `AddCrossPlanLinkDialog`, and the rule that decides it is written down
 * (ADR-0097 Landing F1): a `Combobox` when the option set is **unbounded by the data model**,
 * searchable or annotated; a native `Select` otherwise. Client, Project and Plan are tens and stay
 * native — a native picker gets the platform's own list, and on touch the iOS wheel or Android
 * sheet, for free. A plan's activities are bounded by nothing: 2,000 is an ordinary programme, and
 * 2,000 `<option>`s is a scroll rather than a choice.
 *
 * **Filtering is local because the data already is.** `useOtherPlanActivities` fetches every page
 * before rendering, so there is nothing to ask the server for; `matchesLibraryQuery` is the same
 * helper the calendar and resource pickers use, so "type to find" behaves identically in all three.
 * That the fetch is eager is a separate problem — a symptom this control makes visible rather than
 * one it causes.
 *
 * **The code is matched as well as the name.** A planner who knows an activity by its code should
 * be able to type the code; the visible label already shows both, so searching only the name would
 * make the picker refuse a string it is displaying.
 */
export function ActivityCombobox({
  value,
  onChange,
  activities,
  disabled,
  loading,
  errored,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  activities: readonly ActivitySummary[];
  disabled: boolean;
  loading: boolean;
  errored: boolean;
  error?: string;
}): React.ReactElement {
  const [query, setQuery] = useState('');

  const options = useMemo<ComboboxOption[]>(
    () =>
      activities
        .filter((activity) => matchesLibraryQuery(query, activity.name, activity.code))
        .map((activity) => ({
          value: activity.id,
          label: activity.code ? `${activity.code} — ${activity.name}` : activity.name,
        })),
    [activities, query],
  );

  // The current value's label, so a selection made before the reader typed does not blank when the
  // query filters its row out — the `Combobox` contract, and the trap every native picker in this
  // codebase had to work around by hand before that primitive existed.
  const selected = activities.find((activity) => activity.id === value);

  const errorId = 'cross-plan-activity-error';

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="cross-plan-activity">Activity</Label>
      <Combobox
        id="cross-plan-activity"
        value={value}
        onChange={onChange}
        query={query}
        onQueryChange={setQuery}
        options={options}
        disabled={disabled}
        loading={loading}
        errored={errored}
        invalid={error !== undefined}
        {...(error === undefined ? {} : { describedBy: errorId })}
        {...(selected === undefined
          ? {}
          : {
              selectedLabel: selected.code ? `${selected.code} — ${selected.name}` : selected.name,
            })}
        placeholder={disabled ? 'Choose a plan first…' : 'Type to find an activity…'}
        emptyMessage="No activity matches that."
        toggleLabel="Show activities"
      />
      {error === undefined ? null : (
        <p id={errorId} className="text-destructive-text text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
