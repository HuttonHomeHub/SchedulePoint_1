/**
 * Working minutes as the product's own duration text — `2d 4h`, `4h`, `45m` — for the sentences the
 * API composes itself (the revision comparison and the health check).
 *
 * This is the server half of `apps/web/src/lib/duration-text.ts`'s `formatDurationText`, kept to
 * the same rule: largest unit first, zero parts omitted, remainder in minutes, so a number is exact
 * and reads the way the Gantt and the activity editor print it. The web copy cannot be imported
 * from here, so the arithmetic is duplicated and `duration-text.spec.ts` pins the web formatter's
 * own cases; a change to one is a change to the other. They differ in one place, on purpose: the
 * web returns `0d` when the day length is not positive, while this falls back to hours and minutes
 * (the figure is a reading aid and must not hide a real lag).
 *
 * `minutesPerDay` is the working day of whichever calendar frames the figure (ADR-0068).
 */
export function formatWorkingMinutes(minutes: number, minutesPerDay: number): string {
  if (minutes <= 0) return '0d';
  const days = minutesPerDay > 0 ? Math.floor(minutes / minutesPerDay) : 0;
  const afterDays = minutes - days * Math.max(minutesPerDay, 0);
  const hours = Math.floor(afterDays / 60);
  const remainder = afterDays - hours * 60;
  const parts = [
    days > 0 ? `${String(days)}d` : '',
    hours > 0 ? `${String(hours)}h` : '',
    remainder > 0 ? `${String(remainder)}m` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/** A signed lag or lead: `+1d`, `−2h` (the typographic minus, as the lag field prints it). */
export function formatSignedWorkingMinutes(minutes: number, minutesPerDay: number): string {
  const magnitude = formatWorkingMinutes(Math.abs(minutes), minutesPerDay);
  return minutes < 0 ? `−${magnitude}` : `+${magnitude}`;
}
