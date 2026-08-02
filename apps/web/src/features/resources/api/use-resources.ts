import type {
  ArchivedFilter,
  EditedField,
  HistogramGranularity,
  PageMeta,
  ResourceAssignmentSummary,
  ResourceCurveType,
  ResourceHistogramBucket,
  ResourceHistogramSeries,
  ResourceKind,
  ResourceSummary,
} from '@repo/types';
import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { AssignmentFormValues, ResourceFormValues } from '../schemas/resource-schemas';

import { apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { majorInputToMinor } from '@/lib/format-money';
import {
  activityKeys,
  assignmentKeys,
  resourceKeys,
  scheduleKeys,
} from '@/lib/query/hierarchy-keys';

export { assignmentKeys, resourceKeys };

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A `GROUP` is a grouping node, not a resource (ADR-0053 §3): it carries no calendar, capacity or
 * cost, and the API rejects one that does (422 `GROUP_HAS_NO_SCHEDULING_FIELDS`). The form hides
 * those fields for a group, but a kind switched AFTER they were filled would otherwise still send
 * the stale values — so they are stripped here, at the one place every write goes through.
 */
function schedulingFieldsFor(input: ResourceFormValues) {
  const isGroup = input.kind === 'GROUP';
  return {
    calendarId: isGroup ? undefined : optional(input.calendarId),
    maxUnitsPerHour: isGroup ? undefined : input.maxUnitsPerHour,
    costPerUnit: isGroup ? undefined : majorInputToMinor(input.costPerUnit),
  };
}

function createResourceBody(input: ResourceFormValues) {
  const { calendarId, maxUnitsPerHour, costPerUnit } = schedulingFieldsFor(input);
  return {
    name: input.name,
    kind: input.kind,
    code: optional(input.code),
    description: optional(input.description),
    calendarId,
    // Resource-tree position (ADR-0053 §3): omit when blank so a resource is created top-level.
    ...(optional(input.parentId) === undefined ? {} : { parentId: optional(input.parentId) }),
    // Levelling capacity (ADR-0041): omit when blank so an uncapped resource stays uncapped.
    ...(maxUnitsPerHour === undefined ? {} : { maxUnitsPerHour }),
    // Cost rate (EV4b, ADR-0042), major → minor units. Omit when blank so a rate-less resource stays so.
    ...(costPerUnit === undefined ? {} : { costPerUnit }),
  };
}

function updateResourceBody(input: ResourceFormValues & { version: number }) {
  const { calendarId, maxUnitsPerHour, costPerUnit } = schedulingFieldsFor(input);
  return {
    name: input.name,
    kind: input.kind,
    code: optional(input.code) ?? null,
    description: optional(input.description) ?? null,
    calendarId: calendarId ?? null,
    // Resource-tree position (ADR-0053 §3): a blank picker means top level, so this sends an
    // explicit null — the API distinguishes "omitted" (unchanged) from "null" (promote to top).
    parentId: optional(input.parentId) ?? null,
    // Levelling capacity (ADR-0041): a blank field clears the ceiling → null (uncapped). The form
    // always seeds this from the row (even with the field hidden), so an edit round-trips the stored
    // value rather than silently clearing it.
    maxUnitsPerHour: maxUnitsPerHour === undefined ? null : maxUnitsPerHour,
    // Cost rate (EV4b, ADR-0042): a blank field clears the rate → null. The form always seeds this from
    // the row (even with the field hidden), so an edit round-trips the stored value in minor units.
    costPerUnit: costPerUnit === undefined ? null : costPerUnit,
    version: input.version,
  };
}

/**
 * The management filters a resource list may carry (ADR-0053 §4 / US-8): a case-insensitive `q`
 * over name OR code, a `kind`, and how archived rows are treated. Every field defaults to "as
 * before" — no search, every kind, active rows only — so an unfiltered read is byte-for-byte the
 * pre-M4 request.
 */
export interface ResourceListFilters {
  q?: string | undefined;
  kind?: ResourceKind | undefined;
  archived?: ArchivedFilter | undefined;
}

/**
 * The filter half of a resource list query string, empty when every filter is at its default.
 * One spelling of the parameters, shared by the whole-library read and the picker search, so the
 * two can never drift.
 */
function resourceQueryParams(filters: ResourceListFilters): string[] {
  const parts: string[] = [];
  const q = filters.q?.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (filters.kind) parts.push(`kind=${filters.kind}`);
  if (filters.archived && filters.archived !== 'exclude')
    parts.push(`archived=${filters.archived}`);
  return parts;
}

export function resourcesQueryOptions(orgSlug: string, filters: ResourceListFilters = {}) {
  const params = resourceQueryParams(filters);
  const query = params.length === 0 ? '' : `?${params.join('&')}`;
  return queryOptions({
    queryKey: resourceKeys.filtered(orgSlug, filters),
    // Keep the current rows on screen while a new search settles, rather than flashing the table's
    // loading state on every keystroke (the `resourceHistogramQueryOptions` precedent).
    placeholderData: keepPreviousData,
    // The resource library screen and every resource picker need the WHOLE org library, not the
    // endpoint's default 20-row page — past 20 resources the table simply stopped listing them and a
    // picker could not select them. Page through every row via the shared cursor helper.
    queryFn: () => apiFetchAllPages<ResourceSummary>(`/organizations/${orgSlug}/resources${query}`),
  });
}

/** The org's resource library. `enabled` lets a host keep the query mounted but idle (e.g. a panel
 * that is mounted behind an inactive tab). */
export function useResources(
  orgSlug: string,
  filters: ResourceListFilters = {},
  enabled = true,
): UseQueryResult<ResourceSummary[]> {
  return useQuery({ ...resourcesQueryOptions(orgSlug, filters), enabled });
}

/** How many rows one picker page asks for — the endpoint's own default, and a comfortable popover. */
const PICKER_PAGE_SIZE = 20;

/** One fetched page of the picker search: the rows plus the cursor state from the envelope. */
interface ResourcePage {
  resources: ResourceSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * The **picker** read of the resource library (ADR-0053 §4 / US-8): one server-filtered page at a
 * time, with the rest reachable through an explicit "Load more".
 *
 * Deliberately a different read from {@link resourcesQueryOptions}. A library TABLE must show every
 * row, so it pages the whole library eagerly; a picker over thousands of resources must not, so it
 * pushes the filtering to the server (`?q=`) and pages on demand. What it must never become is a
 * silent single page with no way to reach the rest — hence `getNextPageParam` + the combobox's
 * "Load more" row, and never a bare `?limit=20`.
 *
 * `keepPreviousData` keeps the popover populated while a new search term settles, so the list
 * refines rather than blinking empty between keystrokes.
 */
export function resourceSearchQueryOptions(orgSlug: string, filters: ResourceListFilters = {}) {
  const params = resourceQueryParams(filters);
  return infiniteQueryOptions({
    queryKey: resourceKeys.search(orgSlug, filters),
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<ResourcePage> => {
      const query = [...params, `limit=${PICKER_PAGE_SIZE}`];
      if (pageParam) query.push(`cursor=${encodeURIComponent(pageParam)}`);
      const { data, meta } = await apiFetchEnvelope<ResourceSummary[], PageMeta>(
        `/organizations/${orgSlug}/resources?${query.join('&')}`,
      );
      return {
        resources: data,
        nextCursor: meta?.nextCursor ?? null,
        hasMore: meta?.hasMore ?? false,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
  });
}

/** The flattened state a combobox consumer needs from {@link resourceSearchQueryOptions}. */
export interface ResourceSearchResult {
  resources: ResourceSummary[];
  isPending: boolean;
  isError: boolean;
  /** A page (or a new search) is in flight — drives the combobox's busy/loading row. */
  isFetching: boolean;
  /** Another page exists — drives the combobox's "Load more" row. */
  hasMore: boolean;
  loadMore: () => void;
}

/**
 * The resource picker's server search, flattened for {@link Combobox}. `enabled` lets a host keep
 * the query mounted but idle (a closed dialog, or the flag off) so nothing fetches until it is
 * actually shown — and so the flag-off path issues exactly the requests it always did.
 */
export function useResourceSearch(
  orgSlug: string,
  filters: ResourceListFilters = {},
  enabled = true,
): ResourceSearchResult {
  const query = useInfiniteQuery({ ...resourceSearchQueryOptions(orgSlug, filters), enabled });
  return {
    resources: (query.data?.pages ?? []).flatMap((page) => page.resources),
    isPending: query.isPending,
    isError: query.isError,
    isFetching: query.isFetching,
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
}

export function resourceQueryOptions(orgSlug: string, resourceId: string) {
  return queryOptions({
    queryKey: resourceKeys.detail(orgSlug, resourceId),
    queryFn: () => apiFetch<ResourceSummary>(`/organizations/${orgSlug}/resources/${resourceId}`),
    // Don't fire for an absent id — avoids a bad `/resources/` GET.
    enabled: Boolean(resourceId),
    retry: false,
  });
}

export function useResource(orgSlug: string, resourceId: string): UseQueryResult<ResourceSummary> {
  return useQuery(resourceQueryOptions(orgSlug, resourceId));
}

export function useCreateResource(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResourceFormValues) =>
      apiFetch<ResourceSummary>(`/organizations/${orgSlug}/resources`, {
        method: 'POST',
        body: JSON.stringify(createResourceBody(input)),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKeys.list(orgSlug) }),
  });
}

export function useUpdateResource(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { resourceId: string; version: number } & ResourceFormValues) =>
      apiFetch<ResourceSummary>(`/organizations/${orgSlug}/resources/${input.resourceId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateResourceBody(input)),
      }),
    // Refetch on settle (not just success) so a 409 conflict refreshes the cached
    // row's version — the retry then carries the current version.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: resourceKeys.list(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: resourceKeys.detail(orgSlug, input.resourceId) }),
      ]),
  });
}

/** What an archive/unarchive action needs: the row, and its optimistic-locking `version`. */
export interface ResourceArchiveInput {
  resourceId: string;
  version: number;
}

/**
 * Archive or unarchive a resource (ADR-0053 §4 / US-7) — a `POST …/archive` | `…/unarchive`
 * carrying only `{ version }`, answering **204**.
 *
 * Archive is **not** delete and **not** soft delete: every existing assignment survives and keeps
 * scheduling, levelling, loading the histogram and earning value exactly as before (nothing in the
 * engine reads `archived_at`), and those assignments stay editable. Only a NEW assignment is
 * refused (422 `RESOURCE_ARCHIVED`). It is likewise not blocked by use — retiring a resource that
 * `RESOURCE_IN_USE` refuses to delete is precisely what it is for.
 */
function useSetResourceArchived(orgSlug: string, archived: boolean) {
  const queryClient = useQueryClient();
  const action = archived ? 'archive' : 'unarchive';
  return useMutation({
    mutationFn: (input: ResourceArchiveInput) =>
      apiFetch<void>(`/organizations/${orgSlug}/resources/${input.resourceId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: input.version }),
      }),
    // Settle, not success: a 409 (stale version) must still refresh the cached row so a retry
    // carries the current version. The `list` prefix sweeps every filtered list and picker search.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: resourceKeys.list(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: resourceKeys.detail(orgSlug, input.resourceId) }),
      ]),
  });
}

/** Retire a resource from the pickers, keeping every existing assignment live — see above. */
export function useArchiveResource(orgSlug: string) {
  return useSetResourceArchived(orgSlug, true);
}

/** Return an archived resource to the library and the pickers. */
export function useUnarchiveResource(orgSlug: string) {
  return useSetResourceArchived(orgSlug, false);
}

export function useDeleteResource(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/resources/${resourceId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceKeys.list(orgSlug) }),
  });
}

export function assignmentsQueryOptions(orgSlug: string, activityId: string) {
  return queryOptions({
    queryKey: assignmentKeys.listByActivity(orgSlug, activityId),
    queryFn: () =>
      apiFetch<ResourceAssignmentSummary[]>(
        `/organizations/${orgSlug}/activities/${activityId}/assignments`,
      ),
    // Don't fire without an activity (e.g. the dialog is mounted but closed).
    enabled: Boolean(activityId),
  });
}

/** One activity's resource assignments. `enabled` lets a host keep the query mounted but idle
 * (e.g. a panel that is mounted behind an inactive tab). */
export function useAssignments(
  orgSlug: string,
  activityId: string,
  enabled = true,
): UseQueryResult<ResourceAssignmentSummary[]> {
  // Both gates must hold: the caller's, and the options' own "don't fire without an activity".
  return useQuery({
    ...assignmentsQueryOptions(orgSlug, activityId),
    enabled: enabled && Boolean(activityId),
  });
}

export function useCreateAssignment(orgSlug: string, activityId: string, planId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignmentFormValues & { lagMinutes?: number }) =>
      apiFetch<ResourceAssignmentSummary>(
        `/organizations/${orgSlug}/activities/${activityId}/assignments`,
        {
          method: 'POST',
          body: JSON.stringify({
            resourceId: input.resourceId,
            budgetedUnits: input.budgetedUnits,
            // Set an initial rate when given (ADR-0040); no `editedField` on create, so the triad stays
            // inert — a plain store. The duration derivation happens later, on an explicit units/rate
            // edit in the row editor, where the "edited field" is unambiguous.
            ...(input.unitsPerHour !== undefined ? { unitsPerHour: input.unitsPerHour } : {}),
            isDriving: input.isDriving,
            // Resource loading curve (M7 rung 5, ADR-0044 §3): omit when blank so an absent curve stays
            // UNIFORM (a flat load, the API default).
            ...(input.curveType ? { curveType: input.curveType } : {}),
            // Assignment cost & actuals (EV4b, ADR-0042): the money fields carry major → minor units.
            // Omit when blank so an absent value stays absent (the API derives budgeted cost from
            // units × rate, and defaults actuals to 0).
            ...(majorInputToMinor(input.budgetedCost) === undefined
              ? {}
              : { budgetedCost: majorInputToMinor(input.budgetedCost) }),
            ...(majorInputToMinor(input.actualCost) === undefined
              ? {}
              : { actualCost: majorInputToMinor(input.actualCost) }),
            ...(input.actualUnits === undefined ? {} : { actualUnits: input.actualUnits }),
            // The join lag (ADR-0071 §1), in working minutes on the activity's calendar. Omitted when
            // absent or zero, so an unlagged assign sends the body it always did.
            ...(input.lagMinutes === undefined ? {} : { lagMinutes: input.lagMinutes }),
          }),
        },
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: assignmentKeys.listByActivity(orgSlug, activityId),
        }),
        // A new assignment adds demand to the resource histogram (M7 rung 5, ADR-0044 §3) — refresh
        // every bucket size for the plan (prefix). Only when the plan is known (the dialog passes it).
        ...(planId
          ? [
              queryClient.invalidateQueries({
                queryKey: scheduleKeys.resourceHistogram(orgSlug, planId),
              }),
            ]
          : []),
      ]),
  });
}

export function useUpdateAssignment(orgSlug: string, planId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      assignmentId: string;
      activityId: string;
      version: number;
      budgetedUnits: number;
      isDriving: boolean;
      /** Set/change the driving assignment's rate (ADR-0040); omit to leave it unchanged. */
      unitsPerHour?: number;
      /** Set the loading curve (M7 rung 5, ADR-0044 §3); omit to leave it unchanged. */
      curveType?: ResourceCurveType;
      /**
       * Which triad quantity the planner edited (ADR-0040) — sent only for a units/rate edit on the
       * driving assignment, so the server holds it and recomputes the dependent (a same-row Units/Rate,
       * or the owning activity's duration for a units-driven type). Omitted = a plain store.
       */
      editedField?: EditedField;
      /**
       * Assignment cost & actuals (EV4b, ADR-0042), already in **minor units** for the money fields.
       * Sent only when the caller edits the cost group, so a units/rate/driving save never touches them
       * (the PATCH treats absent fields as unchanged). `budgetedCost: null` clears the override.
       */
      budgetedCost?: number | null;
      actualCost?: number;
      actualUnits?: number;
      /**
       * The join lag in working minutes (ADR-0071 §1) — how far into the activity this resource
       * arrives. Sent only when the caller edits it, so a units/rate/driving/cost save never touches
       * it (the PATCH treats absent fields as unchanged). `0` is a real value: it clears the lag.
       */
      lagMinutes?: number;
    }) =>
      apiFetch<ResourceAssignmentSummary>(
        `/organizations/${orgSlug}/assignments/${input.assignmentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            budgetedUnits: input.budgetedUnits,
            ...(input.unitsPerHour !== undefined ? { unitsPerHour: input.unitsPerHour } : {}),
            ...(input.editedField ? { editedField: input.editedField } : {}),
            ...(input.curveType ? { curveType: input.curveType } : {}),
            isDriving: input.isDriving,
            ...(input.budgetedCost !== undefined ? { budgetedCost: input.budgetedCost } : {}),
            ...(input.actualCost !== undefined ? { actualCost: input.actualCost } : {}),
            ...(input.actualUnits !== undefined ? { actualUnits: input.actualUnits } : {}),
            ...(input.lagMinutes !== undefined ? { lagMinutes: input.lagMinutes } : {}),
            version: input.version,
          }),
        },
      ),
    // Refetch on settle so a 409 refreshes the row's version — setting one driving
    // resource also moves the flag off another, so the whole activity list refetches.
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: assignmentKeys.listByActivity(orgSlug, input.activityId),
        }),
        // A duration-type recompute (editedField present) can derive a new activity duration server-side
        // (ADR-0040), moving the activity's dates/version — refresh the org's activity lists/details so
        // the table + any open activity view aren't stale. Scoped to `activities` and only when a
        // recompute was actually requested, so a plain units edit keeps its existing behaviour.
        ...(input.editedField
          ? [queryClient.invalidateQueries({ queryKey: activityKeys.all(orgSlug) })]
          : []),
        // Editing units / driving flag / loading curve all reshape the resource histogram (M7 rung 5,
        // ADR-0044 §3) — refresh every bucket size for the plan (prefix). Only when the plan is known.
        ...(planId
          ? [
              queryClient.invalidateQueries({
                queryKey: scheduleKeys.resourceHistogram(orgSlug, planId),
              }),
            ]
          : []),
      ]),
  });
}

export function useDeleteAssignment(orgSlug: string, planId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { assignmentId: string; activityId: string }) =>
      apiFetch<void>(`/organizations/${orgSlug}/assignments/${input.assignmentId}`, {
        method: 'DELETE',
      }),
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: assignmentKeys.listByActivity(orgSlug, input.activityId),
        }),
        // Unassigning removes the resource's demand from the histogram (M7 rung 5, ADR-0044 §3) —
        // refresh every bucket size for the plan (prefix). Only when the plan is known.
        ...(planId
          ? [
              queryClient.invalidateQueries({
                queryKey: scheduleKeys.resourceHistogram(orgSlug, planId),
              }),
            ]
          : []),
      ]),
  });
}

/**
 * A plan's resource loading histogram (M7 rung 5, ADR-0044 §3 / ADR-0035 §31) — the `{ data, meta }`
 * shape of `GET …/schedule/resource-histogram`: `data` is the per-resource series, `meta` the shared
 * bucket axis + `granularity` + `curveNormalisedCount`. Read via {@link apiFetchEnvelope} because the
 * caller needs the `meta` roll-up (the shared axis + normalise count), like the baseline-variance read.
 */
export interface ResourceHistogramResult {
  series: ResourceHistogramSeries[];
  buckets: ResourceHistogramBucket[];
  granularity: HistogramGranularity;
  curveNormalisedCount: number;
}

export function resourceHistogramQueryOptions(
  orgSlug: string,
  planId: string,
  granularity: HistogramGranularity,
) {
  return queryOptions({
    // Keyed under the shared schedule namespace (ADR-0044 §3) so a recalc's and an assignment write's
    // schedule invalidation both sweep it (`scheduleKeys.resourceHistogram` prefix, all granularities).
    queryKey: scheduleKeys.resourceHistogram(orgSlug, planId, granularity),
    // Keep the previous bucket size's histogram on screen while switching Day/Week/Month, so the view
    // doesn't collapse to "Loading…" on every granularity change (ux review).
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ResourceHistogramResult> => {
      const { data, meta } = await apiFetchEnvelope<
        ResourceHistogramSeries[],
        {
          buckets: ResourceHistogramBucket[];
          granularity: HistogramGranularity;
          curveNormalisedCount: number;
        }
      >(
        `/organizations/${orgSlug}/plans/${planId}/schedule/resource-histogram?granularity=${granularity}`,
      );
      return {
        series: data,
        buckets: meta?.buckets ?? [],
        granularity: meta?.granularity ?? granularity,
        curveNormalisedCount: meta?.curveNormalisedCount ?? 0,
      };
    },
    enabled: Boolean(planId),
  });
}

export function useResourceHistogram(
  orgSlug: string,
  planId: string,
  granularity: HistogramGranularity,
): UseQueryResult<ResourceHistogramResult> {
  return useQuery(resourceHistogramQueryOptions(orgSlug, planId, granularity));
}
