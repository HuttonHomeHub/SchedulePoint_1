import { ALL_WEEKDAYS_MASK, STANDARD_WEEKDAYS_MASK, WorkingWeekdays } from '@repo/types';
import { z } from 'zod';

/**
 * Short weekday labels, indexed 0 = Monday … 6 = Sunday to match the
 * {@link WorkingWeekdays} bitmask order. Used by the table summary and the
 * form's weekday toggle group.
 */
export const WEEKDAY_SHORT_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Full weekday names (index 0 = Monday … 6 = Sunday) for accessible labels. */
export const WEEKDAY_LONG_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * Render a working-weekday bitmask as a compact human summary. Special-cases the
 * two common patterns; otherwise lists the worked days' short names.
 */
export function formatWorkingWeekdays(mask: number): string {
  if (mask === ALL_WEEKDAYS_MASK) return 'Every day';
  if (mask === STANDARD_WEEKDAYS_MASK) return 'Mon–Fri';
  const indices = WorkingWeekdays.toIndices(mask);
  if (indices.length === 0) return 'No working days';
  return indices.map((index) => WEEKDAY_SHORT_LABELS[index]).join(', ');
}

/**
 * Calendar create/edit form schema — mirrors the API DTO. `workingWeekdays` is
 * the 7-bit pattern (bit 0 = Monday … bit 6 = Sunday) bound to the toggle group;
 * it must be a valid mask (≥ 1 working day). Name ≤ 120, description ≤ 2000.
 */
export const calendarFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
  workingWeekdays: z
    .number()
    .refine((mask) => WorkingWeekdays.isValid(mask), 'Select at least one working day.'),
});

export type CalendarFormValues = z.infer<typeof calendarFormSchema>;

/** A `YYYY-MM-DD` value that is also a real calendar day (round-trips through Date). */
function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Calendar-exception add form schema — mirrors the API DTO. `date` is the raw
 * `<input type="date">` value (`YYYY-MM-DD`); `isWorking` defaults to a holiday
 * (false); `label` is an optional name (e.g. "Christmas Day").
 */
export const exceptionFormSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
    .refine(isRealDate, 'Enter a valid date.'),
  // Defaults to a holiday (false) via the form's default values.
  isWorking: z.boolean(),
  label: z.string().trim().max(120, 'Label is too long.').optional(),
});

export type ExceptionFormValues = z.infer<typeof exceptionFormSchema>;

/** 409 conflict reason: the calendar is referenced by one or more plans. */
export const CALENDAR_IN_USE = 'CALENDAR_IN_USE';
/** 409 conflict reason: an exception already exists for that date. */
export const DUPLICATE_EXCEPTION = 'DUPLICATE_EXCEPTION';
