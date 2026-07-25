import {
  ALL_WEEKDAYS_MASK,
  CALENDAR_SCOPES,
  STANDARD_WEEKDAYS_MASK,
  WorkingWeekdays,
  type CalendarScope,
} from '@repo/types';
import { z } from 'zod';

/**
 * The tier filter the organisation calendar list accepts (`?scope=`, ADR-0053 §1) — mirrors the
 * API's `CalendarListQueryDto`. `org` is the default and returns exactly the pre-ADR-0053 result
 * set, so an unfiltered read is unchanged.
 */
export const CALENDAR_SCOPE_FILTERS = ['org', 'project', 'all'] as const;

/** Which calendar tier(s) a list request asks for — see {@link CALENDAR_SCOPE_FILTERS}. */
export type CalendarScopeFilter = (typeof CALENDAR_SCOPE_FILTERS)[number];

/** The filter's visible option labels, in the order they are offered. */
export const CALENDAR_SCOPE_FILTER_LABELS: Record<CalendarScopeFilter, string> = {
  org: 'Organisation',
  project: 'Project',
  all: 'All',
};

/**
 * How each tier is named to a planner. "Organisation" and "Project" (not the wire's `ORG`/`PROJECT`)
 * — one place, so the badge, the filter, the create control and every picker's group heading agree.
 */
export const CALENDAR_SCOPE_LABELS: Record<CalendarScope, string> = {
  ORG: 'Organisation',
  PROJECT: 'Project',
};

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
export const calendarFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
    workingWeekdays: z
      .number()
      .refine((mask) => WorkingWeekdays.isValid(mask), 'Select at least one working day.'),
    // The tier to create in (ADR-0053 §1). Optional so the field is simply ABSENT from the submitted
    // body unless a scope control was rendered (flag-off), leaving the server's ORG default to apply
    // — the same JSON the form sent before. `projectId` is required with `PROJECT` and forbidden with
    // `ORG`, mirroring the API's paired validator, so an impossible pair can't leave the browser.
    scope: z.enum(CALENDAR_SCOPES).optional(),
    projectId: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.scope === 'PROJECT' && !values.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'Choose the project this calendar belongs to.',
      });
    }
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
