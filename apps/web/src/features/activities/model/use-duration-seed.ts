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
 * So when the factor arrives, the field is re-seeded from the row's exact minutes — **unless the
 * planner has already typed something**, whose value always wins over a late-arriving default.
 *
 * ## Why "already typed" is a value comparison and not a dirty flag
 *
 * The first version asked React Hook Form's `dirtyFields.duration`, passed in as a prop. That is a
 * value captured by the render the effect belongs to, and the two events here are independent: a
 * keystroke, and a network response. If the calendar list lands before RHF has re-rendered with the
 * field marked dirty, the effect reads a stale `false` and overwrites what was just typed — no
 * error, no cue, the planner's `4h` silently becomes the seeded default.
 *
 * That is not theoretical. It is `docs/TECH_DEBT.md` #83, found by `apps/web/e2e-sub-day/` on its
 * first run: an automated journey types and submits far faster than a human, so it hit the window
 * that hand-testing never did.
 *
 * The fix is to stop asking a flag and start asking the field. {@link ReadDuration} is called
 * **inside** the effect, so it returns what the input holds at that instant, and the re-seed happens
 * only if that is still character-for-character the text this hook saw at open. A planner who typed
 * cannot lose their value, whatever order the two events arrive in — and one who typed exactly the
 * seed loses nothing either, because the two are then the same string.
 *
 * It fires at most once per opening — pinned by a ref rather than by comparing factors, because the
 * factor legitimately changes again when the planner picks a different calendar, and re-seeding
 * *then* would discard a duration they had just typed.
 */
export type ReadDuration = () => string;

export function useDurationSeed({
  open,
  hoursPerDay,
  activity,
  readDuration,
  setDuration,
}: {
  open: boolean;
  hoursPerDay: number | undefined;
  activity: { durationDays: number; durationMinutes: number } | undefined;
  /**
   * The field's value **right now**. Called inside the effect, never captured from a prop — that
   * distinction is the whole fix (see above).
   */
  readDuration: ReadDuration;
  setDuration: (text: string) => void;
}): void {
  const resolved = useRef(false);
  const seededAtOpen = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      resolved.current = false;
      seededAtOpen.current = null;
      return;
    }
    // What the field held when this opening began — the baseline the "has it been typed in?"
    // question is asked against. Recorded on the first pass, before the factor can have arrived.
    seededAtOpen.current ??= readDuration();
    if (hoursPerDay === undefined || resolved.current) return;
    resolved.current = true;
    if (readDuration() === seededAtOpen.current) {
      setDuration(seedDurationText(activity, hoursPerDay));
    }
    // `readDuration`/`setDuration`/`activity` are read at the moment the factor lands; adding them
    // here would re-run this on every keystroke and every list refetch, which is the opposite of
    // "once". The values they return are read live inside, so nothing here goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hoursPerDay]);
}
