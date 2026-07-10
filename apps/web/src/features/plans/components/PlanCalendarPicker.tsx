import type { CalendarSummary, PlanSummary } from '@repo/types';
import { useEffect, useId, useRef, useState } from 'react';

import { useSetPlanCalendar } from '../api/use-plans';

import { useAnnounce } from '@/components/ui/announcer';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const NONE_LABEL = 'None (all days work)';

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
 * the busy state clears (disabling the focused select drops focus otherwise).
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
  const selectRef = useRef<HTMLSelectElement>(null);
  const wasBusy = useRef(false);
  // The just-picked value, shown until the refetched plan confirms it (or a failure
  // rolls it back). '' means "None"; null means "no pending choice".
  const [optimistic, setOptimistic] = useState<string | null>(null);

  const serverValue = plan.calendarId ?? '';
  // Drop the optimistic value once the server truth catches up — the documented
  // "reset state during render" pattern (no effect, no extra committed render).
  if (optimistic !== null && optimistic === serverValue) setOptimistic(null);

  // Busy from the moment of change until the plan cache reflects the new value (not just
  // until the mutation settles), so a second change can't send a stale version; also
  // while the calendars list is still loading (can't pick from an incomplete list).
  const busy =
    setCalendar.isPending ||
    calendarsLoading ||
    (optimistic !== null && optimistic !== serverValue);
  const displayed = optimistic ?? serverValue;
  // The delete-in-use guard means a plan's calendar is always in the org list once
  // loaded, so an unmatched non-empty value only happens while `calendars` is still
  // loading. Inject a synthetic option for it so the Select shows the calendar as
  // selected (not silently blank, which would read as "None").
  const missingCurrent = displayed !== '' && !calendars.some((c) => c.id === displayed);

  // Disabling the focused select drops focus to <body>; restore it once busy clears
  // (WCAG 2.4.3), but only if focus was actually lost (not moved away by the user).
  useEffect(() => {
    if (
      wasBusy.current &&
      !busy &&
      (document.activeElement === document.body || document.activeElement === null)
    ) {
      selectRef.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

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

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    if (busy) return;
    const value = event.target.value;
    setOptimistic(value);
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
        onError: () => setOptimistic(null),
      },
    );
  };

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor={selectId}>Calendar</Label>
      <Select
        ref={selectRef}
        id={selectId}
        value={displayed}
        disabled={busy}
        aria-busy={busy}
        aria-invalid={setCalendar.isError}
        aria-describedby={setCalendar.isError ? `${hintId} ${errorId}` : hintId}
        onChange={onChange}
      >
        <option value="">{NONE_LABEL}</option>
        {missingCurrent ? <option value={displayed}>Loading…</option> : null}
        {calendars.map((calendar) => (
          <option key={calendar.id} value={calendar.id}>
            {calendar.name}
          </option>
        ))}
      </Select>
      <p id={hintId} className="text-muted-foreground text-sm">
        {busy ? 'Saving…' : 'Recalculate to apply the calendar to the schedule’s dates.'}
      </p>
      {setCalendar.isError ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {setCalendar.error.message}
        </p>
      ) : null}
    </div>
  );
}
