import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Strict `YYYY-MM-DD` shape (a calendar day, no time, no timezone). */
export const CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a real calendar day in strict `YYYY-MM-DD` form. Rejects both the
 * wrong shape and impossible dates (e.g. `2026-02-30`, which a naive `Date`
 * would silently roll over to March).
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !CALENDAR_DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  // The round-trip also fails safe for the JS legacy two-digit-year remap
  // (`Date.UTC(0..99)` → 1900–1999): a `00xx` year won't equal `getUTCFullYear()`
  // and is rejected — acceptable for calendar dates, which never need years 0–99.
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Parse a validated `YYYY-MM-DD` string to a UTC-midnight `Date`. Storing the
 * day at UTC midnight keeps a `@db.Date` column free of timezone drift.
 */
export function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a date-only value back to `YYYY-MM-DD` (UTC). */
export function formatCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** class-validator decorator: a strict `YYYY-MM-DD` calendar date. */
export function IsCalendarDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate: (value: unknown) => isCalendarDate(value),
        defaultMessage: () => `${propertyName} must be a calendar date in YYYY-MM-DD format.`,
      },
    });
  };
}
