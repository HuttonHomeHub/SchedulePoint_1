import { useEffect, useRef } from 'react';

import { seedDurationText } from './duration-field';

/**
 * Re-seed the duration field once — and only once — when the activity's working-hours factor
 * finally resolves (ADR-0070 §4).
 *
 * ## The trap this closes
 *
 * The calendar list is a query, so a dialog can open before the factor is known. In that window the
 * field degrades to whole working days, which for a **sub-day** activity means it shows `0` — and a
 * save then writes zero over a four-hour duration. That is today's shipped behaviour (the days box
 * has always rounded), so it is not a regression, but it *is* the exact defect this ADR exists to
 * remove, and leaving it alive in a one-second window would be leaving it alive.
 *
 * So when the factor arrives, the field is re-seeded from the row's exact minutes. **Only if the
 * planner has not touched it**: their typing always wins over a late-arriving default.
 *
 * It fires at most once per opening — pinned by a ref rather than by comparing values, because the
 * factor legitimately changes again when the planner picks a different calendar, and re-seeding
 * *then* would discard a duration they had just typed.
 */
export function useDurationSeed({
  open,
  hoursPerDay,
  activity,
  isDirty,
  setDuration,
}: {
  open: boolean;
  hoursPerDay: number | undefined;
  activity: { durationDays: number; durationMinutes: number } | undefined;
  /** Has the planner edited the duration field since it was seeded? Their value wins. */
  isDirty: boolean;
  setDuration: (text: string) => void;
}): void {
  const resolved = useRef(false);

  useEffect(() => {
    if (!open) {
      resolved.current = false;
      return;
    }
    if (hoursPerDay === undefined || resolved.current) return;
    resolved.current = true;
    if (!isDirty) setDuration(seedDurationText(activity, hoursPerDay));
    // `isDirty`/`setDuration`/`activity` are read at the moment the factor lands; adding them here
    // would re-run this on every keystroke and every list refetch, which is the opposite of "once".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hoursPerDay]);
}
