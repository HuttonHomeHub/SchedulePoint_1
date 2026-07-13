import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { CANVAS_AUTHORING_ENABLED } from '@/config/env';
import {
  useActivities,
  useCreatePlacedActivity,
  useUpdateActivity,
  useRepositionLane,
  useBatchPositions,
} from '@/features/activities';
import { useSession } from '@/features/auth';
import { useBaselineVariance } from '@/features/baselines';
import { useCalendar, useCalendars } from '@/features/calendars';
import { useClient } from '@/features/clients';
import { useCreateDependency, usePlanDependencies } from '@/features/dependencies';
import { derivePlanGating, usePlanPen } from '@/features/plan-lock';
import { usePlan, useSetPlanStart } from '@/features/plans';
import { useProject } from '@/features/projects';
import { useRecalculate, usePlanAutoRecalc } from '@/features/schedule';
import {
  addCalendarDays,
  type TsldCreateInput,
  type TsldCreateOutcome,
  type TsldLinkInput,
  type TsldLinkOutcome,
  type TsldRepositionInput,
  type TsldRepositionOutcome,
  type TsldEditOutcome,
} from '@/features/tsld';
import {
  canCalculateSchedule,
  canManageHierarchy,
  canReportProgress,
  useOrgRole,
} from '@/hooks/use-org-role';
import { ApiFetchError } from '@/lib/api/client';

/**
 * The single source of a plan surface's route-composed orchestration — every query, the
 * gating matrix, and the TSLD edit callbacks (create / reposition / link / auto-arrange /
 * refresh) that compose a mutation + authoritative recalc across features (ADR-0026 D8).
 *
 * Extracted from `PlanDetailScreen` so the legacy stacked page and the canvas-first
 * `PlanWorkspace` (ADR-0030) render the **same** behaviour from one implementation — the
 * flag only chooses the layout, never the logic. The callbacks are lifted verbatim; this
 * hook adds no new behaviour.
 */
export function usePlanWorkspaceModel(orgSlug: string, planId: string) {
  const role = useOrgRole(orgSlug);
  const session = useSession();
  const currentUserId = session.data?.user.id;
  // The edit-lock "pen" (ADR-0028). When the pen layer is off (`VITE_PLAN_EDIT_LOCK`
  // unset) `penManaged` is false and gating falls back to role only — today's behaviour.
  const pen = usePlanPen(orgSlug, planId);
  const canWrite = canManageHierarchy(role); // role only — plan metadata + baselines
  // The on-canvas schedule model (activities/dependencies/positions/recalculate) is
  // additionally pen-gated: a Planner must hold the pen to edit it (spec §3.1 / ADR-0028).
  const { canEditSchedule, canRecalc, canProgress, penReadOnly } = derivePlanGating({
    penManaged: pen.penManaged,
    holdsPen: pen.holdsPen,
    canWrite,
    canProgress: canReportProgress(role),
    canCalculate: canCalculateSchedule(role),
  });
  const [editing, setEditing] = useState(false);
  const [logicActivity, setLogicActivity] = useState<ActivitySummary | undefined>(undefined);

  const plan = usePlan(orgSlug, planId);
  const project = useProject(orgSlug, plan.data?.projectId ?? '');
  const client = useClient(orgSlug, project.data?.clientId ?? '');
  // Shares the activities cache with the table (same query key); used to populate the
  // logic-editor's add picker and the TSLD canvas.
  const activities = useActivities(orgSlug, planId);
  // The plan's dependency edges — drawn as logic lines on the TSLD canvas.
  const dependencies = usePlanDependencies(orgSlug, planId);
  // The org's calendars, for the plan calendar picker (read for every member).
  const calendars = useCalendars(orgSlug);
  // The plan's working-day calendar (mask + holiday exceptions) drives the TSLD's non-working
  // shading. The mask comes from the already-loaded list; the exceptions from the (cached) detail.
  const planCalendarId = plan.data?.calendarId ?? null;
  const calendarDetail = useCalendar(orgSlug, planCalendarId ?? '');
  const tsldCalendar = useMemo(() => {
    const mask =
      calendars.data?.find((c) => c.id === planCalendarId)?.workingWeekdays ??
      calendarDetail.data?.workingWeekdays;
    if (mask == null) return null;
    const exceptions = new Map<string, boolean>(
      (calendarDetail.data?.exceptions ?? []).map((e) => [e.date, e.isWorking]),
    );
    return { workingWeekdays: mask, exceptions };
  }, [calendars.data, calendarDetail.data, planCalendarId]);
  // Today as a local calendar day (`YYYY-MM-DD`), for the TSLD's "today" marker — resolved here so
  // the diagram does no wall-clock math.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Variance vs the plan's active baseline (M7). The route composes it and passes a
  // per-activity map into the activities table, so that feature imports no baseline code.
  const variance = useBaselineVariance(orgSlug, planId);
  const varianceByActivityId = useMemo(() => {
    if (!variance.data || variance.data.summary.baselineId === null) return undefined;
    return new Map<string, BaselineVarianceRow>(
      variance.data.rows.map((row) => [row.activityId, row]),
    );
  }, [variance.data]);
  const canManageLogic = canEditSchedule; // dependency write is pen-gated schedule editing

  // Unified auto-recalc (ADR-0032 M3): behind `VITE_CANVAS_AUTHORING`, any structural edit — from
  // the canvas *or* the activities table — triggers a coalesced recalculation, so the canvas plots
  // new/changed rows without a manual Recalculate. Enabled only when a recalc could succeed (role +
  // pen + a start date); guarded live at fire time. Recalc failures announce (rare). The manual
  // button becomes `flush()`. Flag-off: this stays inert and the callbacks keep their inline recalc.
  const announce = useAnnounce();
  const autoRecalc = usePlanAutoRecalc(orgSlug, planId, {
    enabled: CANVAS_AUTHORING_ENABLED && canRecalc && plan.data?.plannedStart != null,
    onMessage: announce,
  });
  // Create/delete of an activity or dependency (any surface — canvas, table, logic editor) changes
  // the structure size; the canvas edit callbacks also `notify()` explicitly for repositions (no
  // size change). Coalesced + single-flight, so overlapping notifies collapse to one recalc. Skip
  // the first observed size so opening a plan never fires a gratuitous recalc.
  const structureSizeRef = useRef<string | null>(null);
  const activityCount = activities.data?.length ?? 0;
  const dependencyCount = dependencies.data?.length ?? 0;
  useEffect(() => {
    if (!CANVAS_AUTHORING_ENABLED) return;
    const key = `${activityCount}:${dependencyCount}`;
    if (structureSizeRef.current === null) {
      structureSizeRef.current = key;
      return;
    }
    if (structureSizeRef.current !== key) {
      structureSizeRef.current = key;
      autoRecalc.notify();
    }
  }, [activityCount, dependencyCount, autoRecalc]);

  // TSLD create-by-drag (M2): the route composes the create + recalc so features/tsld imports
  // no other feature (ADR-0026 D8). A drag becomes a 1-day-min TASK pinned at the dropped day
  // with an SNET constraint, then the authoritative recalc places it.
  const createPlacedActivity = useCreatePlacedActivity(orgSlug, planId);
  const recalculate = useRecalculate(orgSlug, planId);
  const setPlanStart = useSetPlanStart(orgSlug);
  const onTsldCreate = async (input: TsldCreateInput): Promise<TsldCreateOutcome> => {
    let plannedStart = plan.data?.plannedStart ?? null;
    if (!plannedStart) {
      // Canvas-first authoring (ADR-0032): a start-less plan is drawable — the canvas anchors to
      // today. The first draw silently pins `plannedStart` to that anchor (Critical Q1) so the SNET
      // dates are coherent, then proceeds. Flag-off keeps today's no-op (needs a start first).
      if (!CANVAS_AUTHORING_ENABLED || !plan.data) return { recalcConflict: null };
      const updated = await setPlanStart.mutateAsync({
        planId,
        version: plan.data.version,
        plannedStart: todayIso,
      });
      plannedStart = updated.plannedStart ?? todayIso;
    }
    // The create must land first (this throw keeps the popover open with the error). Only
    // then recalc — a recalc failure is non-fatal: the row persisted, so we report the
    // conflict without re-prompting (never a second POST). The next recalc reconciles dates.
    await createPlacedActivity.mutateAsync({
      name: input.name,
      type: 'TASK',
      durationDays: input.endDay - input.startDay + 1,
      laneIndex: input.laneIndex,
      constraintType: 'SNET',
      constraintDate: addCalendarDays(plannedStart, input.startDay),
    });
    // Canvas-first authoring (ADR-0032 M3): hand the recalc to the coalescer and return — the new
    // bar plots a beat later (the optimistic pending bar covers the gap). Flag-off keeps the inline
    // await + recalc-conflict semantics byte-for-byte.
    if (CANVAS_AUTHORING_ENABLED) {
      autoRecalc.notify();
      return { recalcConflict: null };
    }
    try {
      await recalculate.mutateAsync();
      return { recalcConflict: null };
    } catch {
      return {
        recalcConflict:
          'Activity added, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
      };
    }
  };

  // TSLD free-2D reposition (M4): a body drag moves a bar in time and/or lane at once, reported
  // as the axes that changed. A day change is an SNET-at-new-start + recalc (M2); a lane change is
  // a layout-only `laneIndex` write with NO recalc. Both go through the single-activity PATCH with
  // the live version (optimistic lock) — a stale version is a non-destructive conflict, never re-sent.
  const updateActivity = useUpdateActivity(orgSlug, planId);
  const repositionLane = useRepositionLane(orgSlug, planId);
  const moveConflict =
    'This plan changed since you opened it — your move wasn’t applied. Refresh to see the latest.';
  const onTsldReposition = async ({
    activityId,
    startDay,
    laneIndex,
  }: TsldRepositionInput): Promise<TsldRepositionOutcome> => {
    const activity = (activities.data ?? []).find((a) => a.id === activityId);
    if (!activity) return { applied: false, conflict: null };

    // Pure lane move: the cheap, layout-only PATCH — no constraint change, no recalc.
    if (startDay === undefined) {
      if (laneIndex === undefined) return { applied: false, conflict: null };
      try {
        await repositionLane.mutateAsync({ activityId, laneIndex, version: activity.version });
        return { applied: true, conflict: null };
      } catch (err) {
        if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
        if (err instanceof ApiFetchError && err.status === 409) {
          return { applied: false, conflict: moveConflict };
        }
        throw err;
      }
    }

    // Day changed (optionally lane too): one PATCH imposing an SNET-at-new-start (ADR-0023) — which
    // by design overwrites any prior constraint, re-pinning a pinned bar where it was dropped —
    // plus the lane if it moved, then recalc. Resent definition fields are unchanged.
    const plannedStart = plan.data?.plannedStart;
    if (!plannedStart) return { applied: false, conflict: null };
    try {
      await updateActivity.mutateAsync({
        activityId,
        version: activity.version,
        name: activity.name,
        code: activity.code ?? undefined,
        type: activity.type,
        durationDays: activity.durationDays,
        description: activity.description ?? undefined,
        constraintType: 'SNET',
        constraintDate: addCalendarDays(plannedStart, startDay),
        ...(laneIndex !== undefined ? { laneIndex } : {}),
      });
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && err.status === 409) {
        // Stale version — the move was NOT applied (nothing changed); never re-send.
        return { applied: false, conflict: moveConflict };
      }
      throw err;
    }
    // The move landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
    if (CANVAS_AUTHORING_ENABLED) {
      autoRecalc.notify();
      return { applied: true, conflict: null };
    }
    try {
      await recalculate.mutateAsync();
      return { applied: true, conflict: null };
    } catch {
      return {
        applied: true,
        conflict:
          'Moved, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
      };
    }
  };

  // TSLD dependency-draw (M2): a drag from one bar's edge to another becomes a link. The route
  // composes the create + recalc (ADR-0026 D8). A cycle or duplicate (ADR-0021) is a 422/409 the
  // engine rejects — surfaced non-destructively (nothing was created), never retried.
  const createDependency = useCreateDependency(orgSlug);
  const onTsldLink = async ({
    predecessorId,
    successorId,
    type,
  }: TsldLinkInput): Promise<TsldLinkOutcome> => {
    try {
      await createDependency.mutateAsync({ planId, predecessorId, successorId, type, lagDays: 0 });
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 422)) {
        // A cycle/duplicate the engine refused — nothing was created; show the reason, don't retry.
        return { applied: false, conflict: err.error.message };
      }
      throw err;
    }
    // The link landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
    if (CANVAS_AUTHORING_ENABLED) {
      autoRecalc.notify();
      return { applied: true, conflict: null };
    }
    try {
      await recalculate.mutateAsync();
      return { applied: true, conflict: null };
    } catch {
      return {
        applied: true,
        conflict:
          'Linked, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
      };
    }
  };

  // TSLD auto-arrange (M4 4.3): persist the packed lane changes through the batch positions
  // endpoint — all-or-nothing, no recalc (lane is layout). The panel computed the moves with the
  // pure packer; here we attach each row's live version and surface the batch's N-row 409.
  const batchPositions = useBatchPositions(orgSlug, planId);
  const onTsldAutoArrange = async (
    changes: readonly { id: string; laneIndex: number }[],
  ): Promise<TsldEditOutcome> => {
    const versionById = new Map((activities.data ?? []).map((a) => [a.id, a.version]));
    const positions = changes.flatMap((c) => {
      const version = versionById.get(c.id);
      return version === undefined ? [] : [{ id: c.id, laneIndex: c.laneIndex, version }];
    });
    if (positions.length === 0) return { applied: false, conflict: null };
    try {
      await batchPositions.mutateAsync({ positions });
      return { applied: true, conflict: null };
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && err.status === 409) {
        // All-or-nothing: one stale row rejected the whole pack — nothing moved.
        return {
          applied: false,
          conflict:
            'The plan changed since you opened it, so auto-arrange wasn’t applied. Refresh and try again.',
        };
      }
      throw err;
    }
  };

  // The conflict banner's Refresh: re-pull the plan's server truth (diagram + variance) so a
  // "changed elsewhere" 409 has a real recovery action, not just copy telling the user to refresh.
  const onTsldRefresh = (): void => {
    void activities.refetch();
    void dependencies.refetch();
    void variance.refetch();
  };

  return {
    orgSlug,
    planId,
    // Queries
    plan,
    project,
    client,
    activities,
    dependencies,
    calendars,
    variance,
    // Derived
    tsldCalendar,
    todayIso,
    varianceByActivityId,
    // Gating / identity
    pen,
    currentUserId,
    canWrite,
    canEditSchedule,
    canRecalc,
    canProgress,
    canManageLogic,
    penReadOnly,
    // Unified auto-recalc (ADR-0032 M3): the manual Recalculate button flushes it; inert flag-off.
    autoRecalc,
    // Local UI state
    editing,
    setEditing,
    logicActivity,
    setLogicActivity,
    // TSLD edit callbacks
    onTsldCreate,
    onTsldReposition,
    onTsldLink,
    onTsldAutoArrange,
    onTsldRefresh,
  };
}

export type PlanWorkspaceModel = ReturnType<typeof usePlanWorkspaceModel>;

/** The plan detail, narrowed to loaded — the screen guards pending/error before rendering a layout. */
export type LoadedPlan = NonNullable<PlanWorkspaceModel['plan']['data']>;
