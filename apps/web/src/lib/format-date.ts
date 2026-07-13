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
