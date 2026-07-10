import type { CalendarDetail, CalendarExceptionSummary, CalendarSummary } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { CalendarFormValues, ExceptionFormValues } from '../schemas/calendar-schemas';

import { apiFetch } from '@/lib/api/client';
import { calendarKeys } from '@/lib/query/hierarchy-keys';

export { calendarKeys };

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createBody(input: CalendarFormValues) {
  return {
    name: input.name,
    workingWeekdays: input.workingWeekdays,
    description: optional(input.description),
  };
}

function updateBody(input: CalendarFormValues & { version: number }) {
  return {
    name: input.name,
    workingWeekdays: input.workingWeekdays,
    description: optional(input.description) ?? null,
    version: input.version,
  };
}

export function calendarsQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: calendarKeys.list(orgSlug),
    queryFn: () => apiFetch<CalendarSummary[]>(`/organizations/${orgSlug}/calendars`),
  });
}

export function useCalendars(orgSlug: string): UseQueryResult<CalendarSummary[]> {
  return useQuery(calendarsQueryOptions(orgSlug));
}

export function calendarQueryOptions(orgSlug: string, calendarId: string) {
  return queryOptions({
    queryKey: calendarKeys.detail(orgSlug, calendarId),
    queryFn: () => apiFetch<CalendarDetail>(`/organizations/${orgSlug}/calendars/${calendarId}`),
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
