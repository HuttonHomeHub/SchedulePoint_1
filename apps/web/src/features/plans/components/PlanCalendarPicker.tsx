import type { CalendarSummary, PlanSummary } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import { useSetPlanCalendar } from '../api/use-plans';
import { useOptimisticSelect } from '../hooks/use-optimistic-select';

import { useAnnounce } from '@/components/ui/announcer';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { calendarScopeErrorMessage } from '@/lib/api/calendar-scope-errors';
import {
  CALENDAR_TIER_GROUP_LABELS,
  groupCalendarsByTier,
  offerableCalendars,
  toCalendarOptions,
} from '@/lib/calendar-tiers';
import { matchesLibraryQuery } from '@/lib/library-filters';

const NONE_LABEL = 'None (all days work)';

/**
 * The focus-restore ref serves whichever control the flag renders — a `<select>` or the combobox's
 * `<input>`. Exactly one exists at a time (the flag is a build-time constant), so one ref typed as
 * the intersection satisfies both consumers without a cast or a second hook instance.
 */
type CalendarControl = HTMLSelectElement & HTMLInputElement;

/**
 * The plan's default working-day calendar (M5, ADR-0024). Writers (`canEdit`, the
 * plan-update roles) pick from the org's calendar library or clear it; everyone
 * else sees the assigned calendar read-only. Changing it persists immediately (a
 * targeted PATCH) and a later Recalculate applies it to the dates. `calendars` is
 * supplied by the plan view (which may import the calendars feature) so this
 * plan-owned control needs no cross-feature import.
 *
 * The picked value is held locally (`optimistic`) and shown straight away, so the
 * control never snaps back to the stale cache mid-save, and the field stays busy
 * until the invalidated plan query refetches the new `version` — closing the
 * optimistic-lock race a rapid re-edit would otherwise hit. Focus is restored after
 * the busy state clears (disabling the focused control drops focus otherwise).
 *
 * Behind `LIBRARY_SCOPING_ENABLED` the control is the shared APG {@link Combobox}
 * (ADR-0053 §4 / US-8) rather than a native `<select>`: a planner can TYPE to find a
 * calendar in a large library, tiers become labelled option groups, and an archived
 * current value stays selected under an `Archived` badge. Flag off it is the same
 * `<Select>` markup it has always been.
 */
export function PlanCalendarPicker({
  orgSlug,
  plan,
  calendars,
  calendarsLoading = false,
  canEdit,
}: {
  orgSlug: string;
  plan: PlanSummary;
  calendars: CalendarSummary[];
  /** The calendars query is still loading (list may not yet contain the plan's calendar). */
  calendarsLoading?: boolean;
  canEdit: boolean;
}): React.ReactElement {
  const setCalendar = useSetPlanCalendar(orgSlug);
  const announce = useAnnounce();
  const selectId = useId();
  const hintId = useId();
  const errorId = useId();
  // The combobox's search term. Local, not debounced: the list handed in is already the COMPLETE
  // project-usable library (it is paged in full), so filtering is a client-side array pass with
  // nothing to wait for — debouncing would only add lag (see `useDebouncedValue`'s note).
  const [query, setQuery] = useState('');
  // The optimistic/busy/focus-restore machinery is shared with the recalc-mode picker
  // (`useOptimisticSelect`); the calendar picker also stays busy while the calendars list loads
  // (can't pick from an incomplete list). '' means "None".
  const { displayed, busy, selectRef, choose, rollback } = useOptimisticSelect<
    string,
    CalendarControl
  >({
    serverValue: plan.calendarId ?? '',
    isPending: setCalendar.isPending,
    extraBusy: calendarsLoading,
  });

  // The delete-in-use guard means a plan's calendar is always in the org list once
  // loaded, so an unmatched non-empty value only happens while `calendars` is still
  // loading. Inject a synthetic option for it so the Select shows the calendar as
  // selected (not silently blank, which would read as "None").
  const missingCurrent = displayed !== '' && !calendars.some((c) => c.id === displayed);

  // Behind `LIBRARY_SCOPING_ENABLED` the list spans two tiers (ADR-0053 §1), so the options are
  // grouped under named `<optgroup>`s — a native grouping screen readers announce as the option's
  // group, so "Site shutdown, This project's calendars" is unambiguous next to an identically-named
  // organisation calendar (the tiers deliberately allow the same name). A group with no members is
  // not rendered, so a project with no calendars of its own shows one flat, unheaded list.
  const tiers = groupCalendarsByTier(calendars);
  const grouped = LIBRARY_SCOPING_ENABLED && tiers.project.length > 0;

  // Archived calendars are offered only when one IS the current value (US-8), and the search runs
  // over what is left — so typing can never surface a calendar the write seam would refuse.
  const options = useMemo(() => {
    if (!LIBRARY_SCOPING_ENABLED) return [];
    const offerable = offerableCalendars(calendars, displayed).filter((calendar) =>
      matchesLibraryQuery(query, calendar.name),
    );
    return toCalendarOptions(offerable, { grouped });
  }, [calendars, displayed, query, grouped]);

  const selectedName = plan.calendarId
    ? (calendars.find((calendar) => calendar.id === plan.calendarId)?.name ?? '—')
    : NONE_LABEL;

  if (!canEdit) {
    return (
      <dl className="flex flex-col gap-1 text-sm">
        <dt className="text-muted-foreground">Calendar</dt>
        <dd>{selectedName}</dd>
      </dl>
    );
  }

  const commit = (value: string): void => {
    if (busy) return;
    choose(value);
    const calendarId = value === '' ? null : value;
    setCalendar.mutate(
      { planId: plan.id, version: plan.version, calendarId },
      {
        onSuccess: () => {
          const name = calendarId
            ? (calendars.find((calendar) => calendar.id === calendarId)?.name ?? 'calendar')
            : NONE_LABEL;
          announce(`Plan calendar set to ${name}.`);
        },
        // Roll the visible choice back to the server value on failure (the error shows).
        onError: () => rollback(),
      },
    );
  };

  const describedBy = setCalendar.isError ? `${hintId} ${errorId}` : hintId;

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor={selectId}>Calendar</Label>
      {LIBRARY_SCOPING_ENABLED ? (
        <Combobox
          id={selectId}
          inputRef={selectRef}
          value={displayed}
          onChange={commit}
          query={query}
          onQueryChange={setQuery}
          options={options}
          selectedLabel={calendars.find((calendar) => calendar.id === displayed)?.name}
          groupLabels={CALENDAR_TIER_GROUP_LABELS}
          emptyOption={{ label: NONE_LABEL }}
          loading={calendarsLoading}
          disabled={busy}
          describedBy={describedBy}
          invalid={setCalendar.isError}
          toggleLabel="Show calendars"
          emptyMessage="No calendars match your search."
        />
      ) : (
        <Select
          ref={selectRef}
          id={selectId}
          value={displayed}
          disabled={busy}
          aria-busy={busy}
          aria-invalid={setCalendar.isError}
          aria-describedby={describedBy}
          onChange={(event) => commit(event.target.value)}
        >
          <option value="">{NONE_LABEL}</option>
          {missingCurrent ? <option value={displayed}>Loading…</option> : null}
          {calendars.map((calendar) => (
            <option key={calendar.id} value={calendar.id}>
              {calendar.name}
            </option>
          ))}
        </Select>
      )}
      <p id={hintId} className="text-muted-foreground text-sm">
        {busy ? 'Saving…' : 'Recalculate to apply the calendar to the schedule’s dates.'}
      </p>
      {setCalendar.isError ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {/* A scope or archive rejection (ADR-0053 §2/§4) reads as its own actionable sentence;
              anything else keeps the server's message verbatim, exactly as before. */}
          {calendarScopeErrorMessage(setCalendar.error) ?? setCalendar.error.message}
        </p>
      ) : null}
    </div>
  );
}
