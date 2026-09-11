// Constructing an `Intl.DateTimeFormat` is expensive (tens of µs) and these options never
// vary, so the formatters are built once at module scope and reused. This matters on hot
// paths that format per row — e.g. the TSLD's accessible listbox formats every activity's
// dates on each render (a plan with thousands of activities was measured at ~1.3s/render
// when each cell built its own formatter; reuse cuts that ~50×).
const CALENDAR_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Format a `YYYY-MM-DD` calendar day for display (en-GB `dd MMM yyyy`), UTC-safe
 * so the day never shifts across timezones. `null`/empty renders as an em dash.
 * The wire format for calendar dates stays `YYYY-MM-DD` (see the API).
 */
export function formatCalendarDate(value: string | null): string {
  if (!value) return '—';
  return CALENDAR_DATE_FORMAT.format(new Date(`${value}T00:00:00Z`));
}

/**
 * Format an ISO date-time instant for display (en-GB `dd MMM yyyy, HH:mm`) in the
 * viewer's local timezone — used for event timestamps like when a row was
 * deleted. `null`/empty (or an unparseable value) renders as an em dash.
 */
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return TIMESTAMP_FORMAT.format(date);
}

/**
 * **The inverse of {@link formatCalendarDate}, and deliberately in the same file as it.**
 *
 * ADR-0134 D5: the date a cell prints and the date a cell accepts are one implementation, not two.
 * Two answers to "what does this string mean" is the ADR-0065 `routeOrthogonal` argument — each
 * looks right alone, and the drift is invisible until somebody round-trips a value. Keeping them
 * adjacent is what makes `format-date.round-trip.test.ts` a statement about a pair rather than
 * about one function.
 *
 * **The month names are DERIVED from the formatter, never listed.** A hardcoded table would be
 * correct today and would silently stop being the inverse the first time ICU changed an
 * abbreviation — the failure would be a planner's own re-typed date being refused, with nothing
 * red anywhere.
 *
 * Two forms are accepted and everything else is refused:
 *
 * - `dd MMM yyyy` — exactly what the cell shows, so re-typing what is on screen always works. The
 *   day may be written with or without its leading zero and the month in any case.
 * - `YYYY-MM-DD` — unambiguous, and what somebody who knows the wire format will type.
 *
 * **All-numeric forms like `05/03/2026` are refused on purpose.** They mean 5 March to this
 * product's audience and 3 May to a different one, and a date that silently means two things is
 * worse in a scheduling tool than a refusal a planner can act on.
 *
 * Returns `YYYY-MM-DD`, or `null` when the text is not one of the two forms or names a day that
 * does not exist (`31 Feb 2026`).
 */
const SHORT_MONTHS: readonly string[] = Array.from({ length: 12 }, (_, month) =>
  CALENDAR_DATE_FORMAT.format(new Date(Date.UTC(2026, month, 1)))
    .replace(/[\d\s]/g, '')
    .replace(/2026/, '')
    .toLowerCase(),
);

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const SPOKEN_DAY = /^(\d{1,2})\s+([\p{L}.]+)\s+(\d{4})$/u;

export function parseCalendarDate(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const iso = ISO_DAY.exec(trimmed);
  if (iso) return isRealDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const spoken = SPOKEN_DAY.exec(trimmed);
  if (!spoken) return null;
  const month = SHORT_MONTHS.indexOf(spoken[2]!.replace(/\./g, '').toLowerCase());
  if (month < 0) return null;
  return isRealDay(Number(spoken[3]), month + 1, Number(spoken[1]));
}

/**
 * `YYYY-MM-DD` if that day exists, else `null`.
 *
 * `Date.UTC` rolls an impossible day forward rather than failing — `31 Feb` becomes 3 March — so
 * the components are compared back out. Without this, a typo would be accepted as a different,
 * plausible-looking date, which is the worst available outcome for a field that moves a schedule.
 */
function isRealDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}
