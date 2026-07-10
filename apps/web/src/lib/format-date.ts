/**
 * Format a `YYYY-MM-DD` calendar day for display (en-GB `dd MMM yyyy`), UTC-safe
 * so the day never shifts across timezones. `null`/empty renders as an em dash.
 * The wire format for calendar dates stays `YYYY-MM-DD` (see the API).
 */
export function formatCalendarDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
