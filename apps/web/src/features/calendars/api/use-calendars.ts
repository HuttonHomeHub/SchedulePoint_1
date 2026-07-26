import type {
  ArchivedFilter,
  CalendarDetail,
  CalendarExceptionSummary,
  CalendarScope,
  CalendarSummary,
} from '@repo/types';
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  CalendarFormValues,
  CalendarScopeFilter,
  ExceptionFormValues,
} from '../schemas/calendar-schemas';

import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';
import { calendarKeys } from '@/lib/query/hierarchy-keys';

export { calendarKeys };

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The tier half of a create/update body (ADR-0053 §1–§2). Both fields are **omitted entirely**
 * unless a scope was chosen, so a caller that never touches scope — every caller while
 * `VITE_LIBRARY_SCOPING` is off — sends byte-identical JSON to before, and the server applies its
 * `ORG` default. `projectId` rides only with `scope: 'PROJECT'`, matching the API's paired validator.
 */
function scopeBody(input: { scope?: CalendarScope | undefined; projectId?: string | undefined }) {
  if (input.scope === undefined) return {};
  return input.scope === 'PROJECT'
    ? { scope: input.scope, projectId: input.projectId }
    : { scope: input.scope };
}

function createBody(input: CalendarFormValues) {
  return {
    name: input.name,
    workingWeekdays: input.workingWeekdays,
    description: optional(input.description),
    ...scopeBody(input),
  };
}

function updateBody(input: CalendarFormValues & { version: number }) {
  return {
    name: input.name,
    workingWeekdays: input.workingWeekdays,
    description: optional(input.description) ?? null,
    version: input.version,
    ...scopeBody(input),
  };
}

/**
 * The management filters a calendar list may carry (ADR-0053 §4 / US-8): a case-insensitive `q`
 * over the name, and how archived rows are treated. Both default to "as before" — no search,
 * active rows only — so an unfiltered read is byte-for-byte the pre-M4 request.
 */
export interface CalendarListFilters {
  q?: string | undefined;
  archived?: ArchivedFilter | undefined;
}

/**
 * The `q`/`archived` half of a list query string, empty when both are at their defaults. Kept in
 * one place so the two calendar list reads can never disagree about the parameter spelling — and so
 * the "send nothing, get today's result set" contract is enforced by construction, not by care.
 */
function libraryQueryParams(filters: CalendarListFilters): string[] {
  const parts: string[] = [];
  const q = filters.q?.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (filters.archived && filters.archived !== 'exclude')
    parts.push(`archived=${filters.archived}`);
  return parts;
}

/** `?a=1&b=2`, or `''` for no params — so an unfiltered read keeps its bare path. */
function queryString(parts: string[]): string {
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/**
 * The organisation calendar list. `scope` selects the tier(s) (ADR-0053 §1): `org` (the default) is
 * the shared library — exactly today's result set — while `project`/`all` opt into project-scoped
 * rows. `filters` adds the M4 search/archive controls (ADR-0053 §4). Every default deliberately
 * sends **no** param at all, so the flag-off request is the same URL it always was.
 */
export function calendarsQueryOptions(
  orgSlug: string,
  scope: CalendarScopeFilter = 'org',
  filters: CalendarListFilters = {},
) {
  const query = queryString([
    ...(scope === 'org' ? [] : [`scope=${scope}`]),
    ...libraryQueryParams(filters),
  ]);
  return queryOptions({
    queryKey: calendarKeys.scoped(orgSlug, scope, filters),
    // Keep the current rows on screen while a new search settles, rather than flashing the
    // table's loading state on every keystroke (the `resourceHistogramQueryOptions` precedent).
    placeholderData: keepPreviousData,
    // The calendar library screen and every calendar picker (plan, activity, resource) need the WHOLE
    // org library, not the endpoint's default 20-row page — past 20 calendars the table stopped
    // listing them and a picker could not select them. Page through every row.
    queryFn: () => apiFetchAllPages<CalendarSummary>(`/organizations/${orgSlug}/calendars${query}`),
  });
}

export function useCalendars(
  orgSlug: string,
  scope: CalendarScopeFilter = 'org',
  filters: CalendarListFilters = {},
): UseQueryResult<CalendarSummary[]> {
  return useQuery(calendarsQueryOptions(orgSlug, scope, filters));
}

/**
 * The calendars **usable in** a project (ADR-0053 §1): the project's own PROJECT-scoped calendars
 * plus every ORG-scoped one. This is precisely the set the API's `assertCalendarUsableBy` write
 * guard accepts for a plan or activity in that project, so a picker fed from here can never offer a
 * calendar the write seam would reject — the 422 mapping is defence in depth, not the happy path.
 *
 * Paged in full for the same reason as the org list: a picker must be able to select every row.
 */
export function projectCalendarsQueryOptions(
  orgSlug: string,
  projectId: string,
  filters: CalendarListFilters = {},
) {
  const query = queryString(libraryQueryParams(filters));
  return queryOptions({
    queryKey: calendarKeys.forProject(orgSlug, projectId, filters),
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiFetchAllPages<CalendarSummary>(
        `/organizations/${orgSlug}/projects/${projectId}/calendars${query}`,
      ),
    // Don't fire for an absent id (e.g. while the parent plan is still loading).
    enabled: Boolean(projectId),
  });
}

export function useProjectCalendars(
  orgSlug: string,
  projectId: string,
  filters: CalendarListFilters = {},
): UseQueryResult<CalendarSummary[]> {
  return useQuery(projectCalendarsQueryOptions(orgSlug, projectId, filters));
}

/**
 * What a calendar PICKER asks the server for behind `VITE_LIBRARY_SCOPING`: archived rows included,
 * so a picker can label an archived current value honestly (it filters them out of the OFFERED
 * options itself). Exported so the resource screen — whose org-only picker is composed at the
 * route — applies the same rule as the plan/activity ones. Flag off it is never applied, and the
 * request keeps its bare path.
 */
export const PICKER_CALENDAR_FILTERS: CalendarListFilters = { archived: 'include' };

/**
 * The calendars a **plan's** pickers (plan default + per-activity) may offer, resolved for the
 * plan's project.
 *
 * Flag off ⇒ the shared organisation library, byte-for-byte the pre-ADR-0053 read: the same hook,
 * key, URL and rows. Flag on ⇒ {@link useProjectCalendars} for that project (its own + every org
 * one). Both queries are declared unconditionally (rules of hooks) but only ONE is ever enabled, so
 * exactly one request fires either way — the switch lives here, in the feature that owns the tier
 * rules, rather than being re-derived by every composing screen.
 *
 * Flag on it also asks for `?archived=include`. That looks backwards for a picker — until you note
 * the alternative: with archived rows absent, a plan whose calendar was archived AFTER it was
 * chosen would show "Unavailable" instead of its name. The pickers filter archived rows out of the
 * offered options themselves, keeping only the CURRENT value and badging it `Archived` (ADR-0053 §4
 * / US-8's "current value outside the filtered page" rule) — one request, and never a selection
 * that reads as broken.
 */
export function usePlanScopedCalendars(
  orgSlug: string,
  projectId: string,
): UseQueryResult<CalendarSummary[]> {
  const org = useQuery({ ...calendarsQueryOptions(orgSlug), enabled: !LIBRARY_SCOPING_ENABLED });
  const project = useQuery({
    ...projectCalendarsQueryOptions(orgSlug, projectId, PICKER_CALENDAR_FILTERS),
    enabled: LIBRARY_SCOPING_ENABLED && Boolean(projectId),
  });
  return LIBRARY_SCOPING_ENABLED ? project : org;
}

export function calendarQueryOptions(orgSlug: string, calendarId: string) {
  return queryOptions({
    queryKey: calendarKeys.detail(orgSlug, calendarId),
    queryFn: () => apiFetch<CalendarDetail>(`/organizations/${orgSlug}/calendars/${calendarId}`),
    // Don't fire for an absent id (e.g. a plan with no calendar) — avoids a bad `/calendars/` GET.
    enabled: Boolean(calendarId),
    retry: false,
  });
}

/** A single calendar with its exceptions — used by the exceptions editor. */
export function useCalendar(orgSlug: string, calendarId: string): UseQueryResult<CalendarDetail> {
  return useQuery(calendarQueryOptions(orgSlug, calendarId));
}

export function useCreateCalendar(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarFormValues) =>
      apiFetch<CalendarDetail>(`/organizations/${orgSlug}/calendars`, {
        method: 'POST',
        body: JSON.stringify(createBody(input)),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.list(orgSlug) }),
  });
}

export function useUpdateCalendar(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { calendarId: string; version: number } & CalendarFormValues) =>
      apiFetch<CalendarDetail>(`/organizations/${orgSlug}/calendars/${input.calendarId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody(input)),
      }),
    // Refetch on settle (not just success) so a 409 conflict refreshes the
    // cached row's version — the retry then carries the current version.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarKeys.list(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: calendarKeys.detail(orgSlug, input.calendarId) }),
      ]),
  });
}

/**
 * Move a calendar between tiers (ADR-0053 §2) — **promote** it into the shared organisation library
 * (`scope: 'ORG'`) or **narrow** it to one project (`scope: 'PROJECT'` + `projectId`). A dedicated
 * mutation rather than a flag on {@link useUpdateCalendar} so a tier move sends only the tier and
 * the optimistic-locking `version`: it never re-submits a name or pattern the user did not touch
 * (and so can never lose a concurrent edit to them). Narrowing is refused with a 409
 * `CALENDAR_SCOPE_NARROWING_BLOCKED` while anything outside the target project still uses it.
 */
export function useMoveCalendarScope(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      calendarId: string;
      version: number;
      scope: CalendarScope;
      projectId?: string;
    }) =>
      apiFetch<CalendarDetail>(`/organizations/${orgSlug}/calendars/${input.calendarId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: input.version, ...scopeBody(input) }),
      }),
    // Settle, not success: a 409 (stale version, or a blocked narrowing) must still refresh the
    // cached row so a retry carries the current version. Invalidating the `list` prefix sweeps the
    // org list, every scope-filtered list and every per-project list at once — the row moved tiers,
    // so it left one list and joined another.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarKeys.list(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: calendarKeys.detail(orgSlug, input.calendarId) }),
      ]),
  });
}

/** What an archive/unarchive action needs: the row, and its optimistic-locking `version`. */
export interface CalendarArchiveInput {
  calendarId: string;
  version: number;
}

/**
 * Archive or unarchive a calendar (ADR-0053 §4 / US-7) — a `POST …/archive` | `…/unarchive`
 * carrying only `{ version }`, answering **204**.
 *
 * It is an ACTION, not a PATCH field, because `archivedAt` is server-set; and it is deliberately
 * **not** blocked by use — that is the whole point. `CALENDAR_IN_USE` (correctly) refuses to delete
 * a calendar plans still reference, so archiving is the only way to retire one: every existing
 * binding stays live and keeps scheduling identically (the CPM engine never reads `archived_at`),
 * and only a NEW binding is refused (422 `CALENDAR_ARCHIVED`).
 *
 * Invalidating the `list` prefix sweeps the org list, every filtered/scoped list and every
 * per-project list at once — the row just left or rejoined most of them.
 */
function useSetCalendarArchived(orgSlug: string, archived: boolean) {
  const queryClient = useQueryClient();
  const action = archived ? 'archive' : 'unarchive';
  return useMutation({
    mutationFn: (input: CalendarArchiveInput) =>
      apiFetch<void>(`/organizations/${orgSlug}/calendars/${input.calendarId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: input.version }),
      }),
    // Settle, not success: a 409 (stale version) must still refresh the cached row so a retry
    // carries the current version.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarKeys.list(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: calendarKeys.detail(orgSlug, input.calendarId) }),
      ]),
  });
}

/** Retire a calendar from the pickers, keeping every existing binding live — see above. */
export function useArchiveCalendar(orgSlug: string) {
  return useSetCalendarArchived(orgSlug, true);
}

/** Return an archived calendar to the library and the pickers. */
export function useUnarchiveCalendar(orgSlug: string) {
  return useSetCalendarArchived(orgSlug, false);
}

export function useDeleteCalendar(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (calendarId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/calendars/${calendarId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.list(orgSlug) }),
  });
}

export function useAddException(orgSlug: string, calendarId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExceptionFormValues) =>
      apiFetch<CalendarExceptionSummary>(
        `/organizations/${orgSlug}/calendars/${calendarId}/exceptions`,
        {
          method: 'POST',
          body: JSON.stringify({
            date: input.date,
            isWorking: input.isWorking,
            label: optional(input.label),
          }),
        },
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarKeys.detail(orgSlug, calendarId) }),
        queryClient.invalidateQueries({ queryKey: calendarKeys.list(orgSlug) }),
      ]),
  });
}

export function useRemoveException(orgSlug: string, calendarId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (exceptionId: string) =>
      apiFetch<void>(
        `/organizations/${orgSlug}/calendars/${calendarId}/exceptions/${exceptionId}`,
        { method: 'DELETE' },
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarKeys.detail(orgSlug, calendarId) }),
        queryClient.invalidateQueries({ queryKey: calendarKeys.list(orgSlug) }),
      ]),
  });
}
