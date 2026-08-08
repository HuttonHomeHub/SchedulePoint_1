import type { ActivitySummary, ActivityType, ConstraintType, ProgressWarning } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { durationWriteFields } from '../model/duration-field';
import { remainingWriteFields } from '../model/remaining-field';
import {
  isDurationDerivedType,
  type ActivityFormValues,
  type ProgressFormValues,
} from '../schemas/activity-schemas';

import { apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { majorInputToMinor } from '@/lib/format-money';
import { activityKeys, assignmentKeys, baselineKeys } from '@/lib/query/hierarchy-keys';

export { activityKeys };

/**
 * The list-plus-detail invalidation a **single-activity** write settles into: the plan's
 * activities list (dates/lane/version moved) and that one activity's detail. Returned so the
 * mutation's `onSettled` can await it (#24e — the shared shape across update/reposition/progress).
 */
function invalidateActivity(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
  activityId: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
    queryClient.invalidateQueries({ queryKey: activityKeys.detail(orgSlug, activityId) }),
  ]);
}

/**
 * The list-plus-baseline-variance invalidation a **create/delete** settles into: the variance set
 * itself changed (a new "Added"/"Removed" row), so it is refreshed alongside the activities list.
 *
 * Exported for `features/activity-copy`, which posts its own create body (a clone carries a
 * different field set from the form — see `use-clone-activities.ts`) but must settle into exactly
 * this invalidation. A second copy of the policy would drift the day a third key joined it.
 */
export function invalidatePlanActivities(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
    queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
  ]);
}

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The whole-form write input: the form's values plus the activity's effective working-hours factor
 * (ADR-0070), which decides which of the two mutually-exclusive duration fields the body carries.
 * Optional — absent means "the factor is not known", the degraded whole-days path.
 */
export type ActivityDefinitionInput = ActivityFormValues & {
  hoursPerDay?: number;
  /**
   * An exact stored minute count that **overrides** `duration`. Used by round-trip callers — a
   * canvas move, an undo restore — which hold the activity's stored value and must resend it
   * byte-exactly, and which have no calendar list to resolve a factor from.
   *
   * This closes a live defect rather than avoiding a new one: those callers previously resent
   * `durationDays`, so dragging a four-hour activity across the canvas silently rounded it to zero.
   */
  durationMinutes?: number;
  /**
   * A day-denominated override, for the canvas resize: dragging a bar edge is a **day** decision on
   * a day-scaled diagram, so it sets days directly rather than routing through the text field.
   * Takes precedence over `durationMinutes` for exactly that reason — a caller sending both is
   * a round-trip spread plus a deliberate day edit, and the day edit is the one the user made.
   */
  durationDays?: number;
};

/** Exactly one of the two mutually-exclusive duration fields, or none when the text is unreadable. */
function durationFields(
  input: ActivityDefinitionInput,
): { durationDays: number } | { durationMinutes: number } | Record<string, never> {
  if (isDurationDerivedType(input.type)) return { durationDays: 0 };
  if (input.durationDays !== undefined) return { durationDays: input.durationDays };
  if (input.durationMinutes !== undefined) return { durationMinutes: input.durationMinutes };
  return durationWriteFields(input.duration, input.hoursPerDay) ?? {};
}

function createBody(input: ActivityDefinitionInput) {
  const hasConstraint = Boolean(input.constraintType);
  const hasSecondary = Boolean(input.secondaryConstraintType);
  return {
    name: input.name,
    code: optional(input.code),
    type: input.type,
    // A milestone has no duration — the API rejects a non-zero one. Otherwise exactly one of
    // `durationDays` / `durationMinutes` (ADR-0070); sending both is a 422 by design.
    ...durationFields(input),
    // The P6 duration type (ADR-0040). A plain activity attribute like `type`; always sent (the form
    // seeds it from the row) — the API default equals the form default, so this stays inert until a
    // driving assignment carries a rate.
    durationType: input.durationType,
    description: optional(input.description),
    ...(hasConstraint
      ? { constraintType: input.constraintType, constraintDate: input.constraintDate }
      : {}),
    // M4 advanced constraints (ADR-0035): paired secondary, ALAP flag, expected-finish date. Sent only
    // when set (absent = the API's default), so a create without the flag on stays byte-identical.
    ...(hasSecondary
      ? {
          secondaryConstraintType: input.secondaryConstraintType,
          secondaryConstraintDate: input.secondaryConstraintDate,
        }
      : {}),
    ...(input.scheduleAsLateAsPossible ? { scheduleAsLateAsPossible: true } : {}),
    ...(input.expectedFinish ? { expectedFinish: input.expectedFinish } : {}),
    // External / inter-project dates (ADR-0043): imported commitments from another project. Sent only
    // when set (absent = none), so a create without the section on stays byte-identical.
    ...(input.externalEarlyStart ? { externalEarlyStart: input.externalEarlyStart } : {}),
    ...(input.externalLateFinish ? { externalLateFinish: input.externalLateFinish } : {}),
    // `''` = inherit the plan calendar → omit the field (the API treats absent as inherit).
    ...(input.calendarId ? { calendarId: input.calendarId } : {}),
    // `''` = top-level → omit (absent = no WBS parent). The picker offers only the plan's summaries.
    ...(input.parentId ? { parentId: input.parentId } : {}),
    // Levelling priority (ADR-0041): omit when blank so an unprioritised activity stays unprioritised.
    ...(input.levelingPriority === undefined ? {} : { levelingPriority: input.levelingPriority }),
    // Earned-Value inputs (EV4b, ADR-0042). `percentCompleteType` is a plain attribute like
    // `durationType` — always sent (the API default equals the form default, so it stays inert until an
    // EV read reads it). The physical %/expense fields are omitted when blank so a create without them
    // stays byte-identical; the money fields carry MAJOR → minor units.
    percentCompleteType: input.percentCompleteType,
    // Cost accrual (M7 rung 5, ADR-0044 §32): a plain attribute like `percentCompleteType` — always
    // sent (the API default UNIFORM equals the form default, so it stays inert until an EV read reads it).
    accrualType: input.accrualType,
    ...(input.physicalPercentComplete === undefined
      ? {}
      : { physicalPercentComplete: input.physicalPercentComplete }),
    ...(majorInputToMinor(input.budgetedExpense) === undefined
      ? {}
      : { budgetedExpense: majorInputToMinor(input.budgetedExpense) }),
    ...(majorInputToMinor(input.actualExpense) === undefined
      ? {}
      : { actualExpense: majorInputToMinor(input.actualExpense) }),
  };
}

function updateBody(input: ActivityDefinitionInput & { version: number; laneIndex?: number }) {
  const hasConstraint = Boolean(input.constraintType);
  const hasSecondary = Boolean(input.secondaryConstraintType);
  return {
    name: input.name,
    code: optional(input.code) ?? null,
    type: input.type,
    // Exactly one of `durationDays` / `durationMinutes` (ADR-0070). Text the parser cannot read
    // emits neither, so the PATCH leaves the stored duration alone rather than zeroing it.
    ...durationFields(input),
    // The P6 duration type (ADR-0040), always sent (seeded from the row so a hidden picker round-trips).
    // Editing the duration on an activity with a driving assignment carrying a rate recomputes that
    // assignment's units/rate server-side per this type — see the assignment refetch in onSettled.
    durationType: input.durationType,
    description: optional(input.description) ?? null,
    // Clear both sides together when the constraint is removed (API pairs them).
    constraintType: hasConstraint ? input.constraintType : null,
    constraintDate: hasConstraint ? input.constraintDate : null,
    // M4 advanced constraints (ADR-0035). The dialog always seeds these from the row (even with the
    // fields hidden), so an edit round-trips a stored value; clearing a field sends null / false.
    secondaryConstraintType: hasSecondary ? input.secondaryConstraintType : null,
    secondaryConstraintDate: hasSecondary ? input.secondaryConstraintDate : null,
    scheduleAsLateAsPossible: input.scheduleAsLateAsPossible ?? false,
    expectedFinish: input.expectedFinish ? input.expectedFinish : null,
    // External / inter-project dates (ADR-0043). The dialog always seeds these from the row (even with
    // the section hidden), so an edit round-trips a stored value; a cleared field sends null.
    externalEarlyStart: input.externalEarlyStart ? input.externalEarlyStart : null,
    externalLateFinish: input.externalLateFinish ? input.externalLateFinish : null,
    // `''` (inherit) clears the activity's own calendar → null. The dialog always seeds this from
    // the row (even with the picker hidden), so an edit round-trips the stored value unchanged.
    calendarId: input.calendarId ? input.calendarId : null,
    // `''` (top-level) clears the WBS parent → null. Seeded from the row so an edit with the picker
    // hidden (flag off) round-trips the stored parent unchanged rather than silently un-nesting it.
    parentId: input.parentId ? input.parentId : null,
    // Levelling priority (ADR-0041): a blank field clears the tie-break → null. Seeded from the row
    // so an edit with the field hidden (flag off) round-trips the stored value unchanged.
    levelingPriority: input.levelingPriority === undefined ? null : input.levelingPriority,
    // Earned-Value inputs (EV4b, ADR-0042). `percentCompleteType` is always sent (seeded from the row).
    // The physical %/expense fields are always seeded from the row (even with the inputs hidden), so an
    // edit round-trips a stored value; a cleared field sends null. The money fields carry MAJOR → minor
    // units (`majorInputToMinor` maps a blank field to `undefined` → null here).
    percentCompleteType: input.percentCompleteType,
    // Cost accrual (M7 rung 5, ADR-0044 §32): always sent (seeded from the row so a hidden picker round-trips).
    accrualType: input.accrualType,
    physicalPercentComplete:
      input.physicalPercentComplete === undefined ? null : input.physicalPercentComplete,
    budgetedExpense: majorInputToMinor(input.budgetedExpense) ?? null,
    actualExpense: majorInputToMinor(input.actualExpense) ?? null,
    // Carry a lane change through the same write when a free-2D drag moved both axes (M4); the
    // canvas is the only caller that sets this — the form dialog never sends it.
    ...(input.laneIndex !== undefined ? { laneIndex: input.laneIndex } : {}),
    version: input.version,
  };
}

export function activitiesQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: activityKeys.listByPlan(orgSlug, planId),
    // The plan workspace (canvas + table + logic) needs the WHOLE plan, not the endpoint's default
    // 20-row page: a dependency edge only draws when both its endpoint bars are loaded, so a partial
    // page silently hides activities and their links (a large imported plan showed ~20 of 144 with no
    // logic drawn). Page through every activity via the shared cursor helper.
    queryFn: () =>
      apiFetchAllPages<ActivitySummary>(`/organizations/${orgSlug}/plans/${planId}/activities`),
  });
}

export function useActivities(orgSlug: string, planId: string): UseQueryResult<ActivitySummary[]> {
  return useQuery(activitiesQueryOptions(orgSlug, planId));
}

export function useCreateActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityDefinitionInput) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/plans/${planId}/activities`, {
        method: 'POST',
        body: JSON.stringify(createBody(input)),
      }),
    // Adding an activity introduces a new "Added" row in the baseline variance, so refresh it too.
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

/**
 * A canvas-placed create: name + type + duration + **laneIndex** + an optional placement
 * constraint. Reuses `POST /activities` but is shaped for the TSLD create-by-drag gesture
 * (M2), which sets the lane and an SNET constraint the form UI doesn't expose.
 */
export interface PlacedActivityInput {
  name: string;
  type: ActivityType;
  durationDays: number;
  laneIndex: number;
  constraintType?: ConstraintType;
  constraintDate?: string;
  /** Visual-Planning placement (ADR-0033): set instead of an SNET constraint when a bar is drawn in
   * VISUAL mode — the drop hand-places the start, no implicit constraint. */
  visualStart?: string;
}

export function useCreatePlacedActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlacedActivityInput) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/plans/${planId}/activities`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

export function useUpdateActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { activityId: string; version: number; laneIndex?: number } & ActivityDefinitionInput,
    ) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody(input)),
      }),
    // A definition edit can change the duration, which (ADR-0040) recomputes the driving assignment's
    // units/rate server-side — so refresh this activity's assignments too, alongside the list + detail,
    // in case the resource editor holds a now-stale row. A no-op unless that query is mounted.
    onSettled: (_data, _error, input) =>
      Promise.all([
        invalidateActivity(queryClient, orgSlug, planId, input.activityId),
        queryClient.invalidateQueries({
          queryKey: assignmentKeys.listByActivity(orgSlug, input.activityId),
        }),
      ]),
  });
}

/**
 * A **partial** definition PATCH: the caller supplies the exact field slice to send (ADR-0060 §4).
 * Added beside {@link useUpdateActivity}, which is unchanged and still serves the flag-off dialog.
 *
 * The tabbed editor saves one write scope at a time, so it cannot use the whole-form mutation
 * without resending — and potentially clobbering — fields the user never opened. `UpdateActivityDto`
 * already treats every field as optional, so no API change is needed; the caller's `patch` is built
 * by one of the `scope-bodies` builders, whose exact key sets are asserted in tests.
 *
 * The invalidations deliberately match `useUpdateActivity`'s: any scope may change the duration
 * (General) or a date bound (Scheduling), and the assignment refetch costs nothing when that query
 * is not mounted. Divergent invalidation would make a tab's save leave a staler cache than the
 * whole-form save it replaces.
 */
export function useUpdateActivityFields(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; version: number; patch: Record<string, unknown> }) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...input.patch, version: input.version }),
      }),
    onSettled: (_data, _error, input) =>
      Promise.all([
        invalidateActivity(queryClient, orgSlug, planId, input.activityId),
        queryClient.invalidateQueries({
          queryKey: assignmentKeys.listByActivity(orgSlug, input.activityId),
        }),
      ]),
  });
}

/**
 * A canvas Visual-Planning placement (ADR-0033 M3): the minimal `{ visualStart, laneIndex?, version }`
 * PATCH on the single-activity endpoint. In VISUAL mode a day-drag hand-places the bar's start via
 * `visualStart` (never an SNET constraint) and — unlike {@link useRepositionLane} — it *does* feed the
 * effective-Visual pass, so the route recalculates after it (the pass pins this bar and pushes its
 * unplaced successors, server-side). `visualStart: null` clears the placement (revert to computed).
 * It resends no definition fields, so it can never clobber a constraint — the ONE exception is the
 * optional `durationDays` the VISUAL start-edge resize sends alongside its placement (ADR-0052 §3:
 * `PATCH {visualStart, durationDays}` in one call), absent for every other caller.
 */
export function useSetActivityVisualStart(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      activityId: string;
      visualStart: string | null;
      durationDays?: number;
      laneIndex?: number;
      version: number;
    }) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          visualStart: input.visualStart,
          ...(input.durationDays !== undefined ? { durationDays: input.durationDays } : {}),
          ...(input.laneIndex !== undefined ? { laneIndex: input.laneIndex } : {}),
          version: input.version,
        }),
      }),
    onSettled: (_data, _error, input) =>
      invalidateActivity(queryClient, orgSlug, planId, input.activityId),
  });
}

/**
 * A canvas lane move (TSLD M4): the minimal `{ laneIndex, version }` PATCH on the single-activity
 * endpoint. It changes only vertical layout — no constraint/definition, so the CPM output is
 * untouched and it needs **no recalc**; it therefore invalidates only the activities list (dates,
 * criticality and variance don't move). Backs a pure vertical drag and the `Alt+↑/↓` lane nudge.
 */
export function useRepositionLane(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; laneIndex: number; version: number }) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify({ laneIndex: input.laneIndex, version: input.version }),
      }),
    onSettled: (_data, _error, input) =>
      invalidateActivity(queryClient, orgSlug, planId, input.activityId),
  });
}

/**
 * Batch lane-position write (TSLD M4 auto-arrange): move many activities to new lanes in one
 * all-or-nothing PATCH on the plan's positions endpoint (per-row optimistic lock; no recalc — lane
 * is layout). Layout only, so it invalidates just the activities list. Backs the "Auto-arrange
 * lanes" action; a single stale `version` rejects the whole batch (409).
 */
export function useBatchPositions(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { positions: { id: string; laneIndex: number; version: number }[] }) =>
      apiFetch<ActivitySummary[]>(
        `/organizations/${orgSlug}/plans/${planId}/activities/positions`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ),
    // Activities list only — deliberately NOT per-row `detail` (unlike useRepositionLane): a bulk
    // reorder touches many rows and no open detail view renders laneIndex, so an N-key invalidation
    // would be waste. No variance/summary either — lane is layout, dates don't move.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
  });
}

/**
 * Batch WBS membership write: file many activities under a summary — or, on a `null` parentId, back
 * at the top level — in one all-or-nothing PATCH (per-row optimistic lock, so a single stale
 * `version` rejects the whole batch with a 409).
 *
 * Deliberately **no optimistic update**. This is not a per-keystroke surface — it is one Save on a
 * panel the user has finished ticking — and an optimistic write here would have to lie convincingly
 * about a batch that fails atomically: on a 409 the UI would have to unpick every row it had
 * already moved, from a cache that may also be stale. Invalidate-and-refetch on settle costs one
 * round trip and cannot disagree with the server.
 *
 * Unlike its lane-position sibling this is **structural**: `parentId` feeds the engine's WBS
 * rollup, so a committed batch leaves the plan's computed dates stale until the next
 * recalculation. That is why the baseline variance is invalidated too — the rollup rows it
 * describes have moved.
 */
export function useUpdateActivityParents(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { parents: { id: string; parentId: string | null; version: number }[] }) =>
      apiFetch<ActivitySummary[]>(`/organizations/${orgSlug}/plans/${planId}/activities/parents`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

/**
 * `hoursPerDay` is a **required** parameter, never defaulted (ADR-0070 §3): the remaining duration
 * is day-denominated text and after ADR-0068 a day is a per-calendar quantity, so defaulting to 24
 * would read a planner's `1d` on an eight-hour calendar as three days of remaining work and
 * defaulting to 8 would do the reverse — both silent, both moving dates. `undefined` is a real
 * answer meaning "not resolved", and the field degrades to whole days for it.
 */
function progressBody(
  input: ProgressFormValues & { version: number; hoursPerDay: number | undefined },
) {
  return {
    percentComplete: input.percentComplete,
    // A blank date field clears the value (null), matching the API.
    actualStart: input.actualStart ? input.actualStart : null,
    actualFinish: input.actualFinish ? input.actualFinish : null,
    // M2 progress-ingestion fields (ADR-0035). The dialog seeds these from the row, so a stored
    // value round-trips even with the inputs hidden; a cleared field sends null (derive remaining
    // from percent / drop the suspend/resume pause). Exactly one of the two remaining spellings
    // goes out — sending both is a 422 by design (surface audit F3).
    ...(remainingWriteFields(input.remaining, input.hoursPerDay) ?? {}),
    suspendDate: input.suspendDate ? input.suspendDate : null,
    resumeDate: input.resumeDate ? input.resumeDate : null,
    version: input.version,
  };
}

export function useUpdateActivityProgress(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  // Uses the envelope form so the caller can read `meta.warnings` — the server-side repairs it
  // applied to keep the report self-consistent (M2, ADR-0035 §6). An ordinary report has no meta.
  return useMutation({
    mutationFn: (
      input: {
        activityId: string;
        version: number;
        /** The activity's effective working hours per day, or `undefined` when unresolved. */
        hoursPerDay: number | undefined;
      } & ProgressFormValues,
    ) =>
      apiFetchEnvelope<ActivitySummary, { warnings?: ProgressWarning[] }>(
        `/organizations/${orgSlug}/activities/${input.activityId}/progress`,
        {
          method: 'PATCH',
          body: JSON.stringify(progressBody(input)),
        },
      ),
    onSettled: (_data, _error, input) =>
      invalidateActivity(queryClient, orgSlug, planId, input.activityId),
  });
}

export function useDeleteActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) =>
      // Typed to its body now, not `void`: the route answers `200 { deleteBatchId }` so a caller
      // can restore exactly what it deleted (`docs/TECH_DEBT.md` #113). Callers that ignore the
      // return are unaffected.
      apiFetch<{ deleteBatchId: string }>(`/organizations/${orgSlug}/activities/${activityId}`, {
        method: 'DELETE',
      }),
    // Removing an activity changes the baseline variance (it reads as "Removed" or drops out).
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

/**
 * Dissolve a WBS summary: remove the grouping and **keep the work** — the children are promoted to
 * the summary's own parent and the now-childless summary is soft-deleted, in one server-side
 * transaction.
 *
 * Deliberately a separate hook from {@link useDeleteActivity} rather than a flag on it, mirroring
 * the API: `DELETE` cascades to the whole subtree, and the destructive reading must never be
 * reachable by accident from the non-destructive one.
 *
 * Structural — every promoted child's `parentId` changed — so it settles like a delete, refreshing
 * the activities list and the baseline variance whose rollup rows have moved.
 */
export function useDissolveSummary(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The response names the promoted children at their NEW versions — rows the client could not
    // have predicted, since it did not know which activities the summary held. The blanket
    // invalidation below already refetches them, so the body is not read here; it is typed rather
    // than discarded so a caller that needs the ids (an undo, a targeted cache patch) can have
    // them without changing the endpoint.
    mutationFn: (activityId: string) =>
      apiFetch<{ promoted: { id: string; parentId: string | null; version: number }[] }>(
        `/organizations/${orgSlug}/activities/${activityId}/dissolve`,
        { method: 'POST' },
      ),
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

/**
 * Batch **placement** write (`docs/specs/canvas-multi-select/` M1): move many activities in time
 * and/or lane in one all-or-nothing PATCH.
 *
 * The sibling of `useBatchPositions`, and deliberately a **separate** hook rather than a widened
 * one: lane is layout and needs no recalculation, whereas a placement carries the constraint and
 * `visualStart` columns the CPM engine reads, so a committed batch leaves the plan's computed dates
 * stale. That difference decides the invalidation, and one hook doing both would have to pick the
 * wider sweep for every lane-only drag in the product.
 *
 * Every row is complete: `constraintType`/`constraintDate`/`visualStart`/`laneIndex` are all sent,
 * `null` where they are to be cleared. The DTO refuses an omitted field rather than defaulting it,
 * so a caller cannot silently unpin a constraint by forgetting to mention it.
 */
export function useBatchPlacements(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      placements: {
        id: string;
        version: number;
        constraintType: ConstraintType | null;
        constraintDate: string | null;
        visualStart: string | null;
        laneIndex: number | null;
      }[];
    }) =>
      apiFetch<ActivitySummary[]>(
        `/organizations/${orgSlug}/plans/${planId}/activities/placements`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ),
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

/**
 * Bulk soft-delete: sweep many activities and their incident links in ONE batch.
 *
 * The response's `deleteBatchId` is the point rather than a diagnostic — it is what
 * {@link useRestoreDeleteBatch} needs to put the whole gesture back id-stably, which is the only
 * way the dependencies **between** the deleted activities survive an undo (CQ-4). Discarding it
 * would leave undo able to re-create the bars and not the logic between them.
 */
export function useBulkDeleteActivities(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { activities: { id: string; version: number }[] }) =>
      apiFetch<{ deleteBatchId: string; activityCount: number; dependencyCount: number }>(
        `/organizations/${orgSlug}/plans/${planId}/activities/bulk-delete`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

/** Undo a bulk delete: restore every row the batch swept, ids and links intact. */
export function useRestoreDeleteBatch(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { deleteBatchId: string }) =>
      apiFetch<ActivitySummary[]>(
        `/organizations/${orgSlug}/plans/${planId}/activities/restore-batch/${input.deleteBatchId}`,
        { method: 'POST' },
      ),
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}
