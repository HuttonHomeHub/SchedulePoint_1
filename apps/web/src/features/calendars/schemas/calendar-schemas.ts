import {
  ALL_WEEKDAYS_MASK,
  CALENDAR_SCOPES,
  STANDARD_WEEKDAYS_MASK,
  WorkingWeekdays,
  type ArchivedFilter,
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
 * The calendar library screen's filter state — the three controls above the table, as one value.
 * It is **URL state** (`docs/UX_STANDARDS.md`: filters are deep-linkable and reload-safe): the
 * route owns it via `useUrlFilterState` and hands it to `CalendarsTable`, so a filtered view can
 * be reloaded, bookmarked and pasted to a colleague.
 *
 * A `type` (not an `interface`) deliberately: only a type alias gets TypeScript's implicit index
 * signature, which is what lets it satisfy the `Record<string, string>` constraint the generic
 * URL-state hook uses.
 */
export type CalendarLibraryFilters = {
  /** Free-text term, matched server-side against the calendar name (`?q=`). */
  q: string;
  /** Which tier(s) to list (`?scope=`). */
  scope: CalendarScopeFilter;
  /** Archive state to include (`?archived=`). */
  archived: ArchivedFilter;
};

/** The untouched screen — every value here is omitted from the URL. */
export const DEFAULT_CALENDAR_LIBRARY_FILTERS: CalendarLibraryFilters = {
  q: '',
  scope: 'org',
  archived: 'exclude',
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
 * {@link WorkingWeekdays} bitmask order. Used by the table summary and the weekly shift editor.
 * (It also named the form's weekday toggle group until ADR-0088 D3 deleted that control.)
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
 * Calendar create/edit form schema — mirrors the API DTO. Name ≤ 120, description ≤ 2000.
 *
 * **`workingWeekdays` is deliberately absent.** It was the 7-bit weekday mask bound to the toggle
 * group, and ADR-0088 D3 deleted that control with `VITE_CALENDAR_SHIFT_EDITOR`: the shift editor
 * owns the week, and the form writes explicit `shifts`. Keeping a validated field with no control
 * to satisfy it is the ADR-0067 M4 dead end verbatim — a hidden rule refusing Save with nothing on
 * screen to fix. The empty week (mask 0) remains valid at the domain and the API (TECH_DEBT #79,
 * ADR-0036 §2); the API still ACCEPTS a mask, and `api/use-calendars.ts` keeps the record of why
 * sending one is destructive.
 */
export const calendarFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
    /**
     * The calendar's standard working day, in hours (P6 `day_hr_cnt`; ADR-0068) — the day↔minute
     * factor for every duration and lag measured on it. Optional so the field is simply ABSENT from
     * the body when the control is not rendered (flag-off), leaving the server to derive it from
     * the week being written, which is what it does for every calendar authored before this field.
     */
    hoursPerDay: z
      .number()
      .min(0.25, 'Enter at least 15 minutes.')
      .max(24, 'A day is at most 24 hours.')
      .optional(),
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

/** `YYYY-MM-DD`, and a day that actually exists. Shared by both ends of an exception's range. */
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
  .refine(isRealDate, 'Enter a valid date.');

/**
 * Calendar-exception add form schema — mirrors the API DTO. `date` is the raw
 * `<input type="date">` value (`YYYY-MM-DD`); `isWorking` defaults to a holiday
 * (false); `label` is an optional name (e.g. "Christmas Day").
 *
 * `endDate` is the range's last day, **inclusive** and optional — one exception for a shutdown or a
 * Christmas fortnight instead of fourteen separate entries (surface audit F2). Empty means a single
 * day, which is what every value entered before this existed meant.
 *
 * The ordering rule is checked here as well as at the API, and deliberately so: the API's 422 is
 * the enforcing boundary, but a planner who has typed both dates should be told at the field rather
 * than after a round trip. Both compare `YYYY-MM-DD` strings, which sort as dates.
 */
export const exceptionFormSchema = z
  .object({
    date: calendarDay,
    endDate: z.union([calendarDay, z.literal('')]).optional(),
    // Defaults to a holiday (false) via the form's default values.
    isWorking: z.boolean(),
    label: z.string().trim().max(120, 'Label is too long.').optional(),
  })
  .superRefine((values, ctx) => {
    if (values.endDate !== undefined && values.endDate !== '' && values.endDate < values.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'The last day cannot be before the first day.',
      });
    }
  });

export type ExceptionFormValues = z.infer<typeof exceptionFormSchema>;

/** 409 conflict reason: the calendar is referenced by one or more plans. */
export const CALENDAR_IN_USE = 'CALENDAR_IN_USE';
/** 409 conflict reason: an exception already exists for that date. */
export const DUPLICATE_EXCEPTION = 'DUPLICATE_EXCEPTION';
