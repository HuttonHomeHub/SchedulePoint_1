import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  ActivitiesTable,
  CreateActivityButton,
  useActivities,
  useCreatePlacedActivity,
  useUpdateActivity,
  useRepositionLane,
  useBatchPositions,
} from '@/features/activities';
import { BaselinesPanel, BaselineVarianceSummary, useBaselineVariance } from '@/features/baselines';
import { useCalendars } from '@/features/calendars';
import { useClient } from '@/features/clients';
import {
  DependencyEditor,
  useCreateDependency,
  usePlanDependencies,
} from '@/features/dependencies';
import { PLAN_STATUS_LABELS, PlanCalendarPicker, PlanFormDialog, usePlan } from '@/features/plans';
import { useProject } from '@/features/projects';
import { RecalculateButton, ScheduleSummaryStrip, useRecalculate } from '@/features/schedule';
import {
  addCalendarDays,
  TsldPanel,
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
import { formatCalendarDate } from '@/lib/format-date';

/**
 * A single plan (`/orgs/$orgSlug/plans/$planId`): its metadata plus a region
 * reserved for the future Time-Scaled Logic Diagram canvas. Writers can edit the
 * plan's metadata here.
 */
export function PlanDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const planId = 'planId' in params ? params.planId : '';
  const role = useOrgRole(orgSlug);
  const canWrite = canManageHierarchy(role);
  const canProgress = canReportProgress(role);
  const canCalculate = canCalculateSchedule(role);
  const [editing, setEditing] = useState(false);
  const [logicActivity, setLogicActivity] = useState<ActivitySummary | undefined>(undefined);

  const plan = usePlan(orgSlug, planId);
  const project = useProject(orgSlug, plan.data?.projectId ?? '');
  const client = useClient(orgSlug, project.data?.clientId ?? '');
  // Shares the activities cache with the table below (same query key); used to
  // populate the logic-editor's add picker and the TSLD canvas.
  const activities = useActivities(orgSlug, planId);
  // The plan's dependency edges — drawn as logic lines on the TSLD canvas.
  const dependencies = usePlanDependencies(orgSlug, planId);
  // The org's calendars, for the plan calendar picker (read for every member).
  const calendars = useCalendars(orgSlug);
  // Variance vs the plan's active baseline (M7). The route composes it and passes a
  // per-activity map into the activities table, so that feature imports no baseline code.
  const variance = useBaselineVariance(orgSlug, planId);
  const varianceByActivityId = useMemo(() => {
    if (!variance.data || variance.data.summary.baselineId === null) return undefined;
    return new Map<string, BaselineVarianceRow>(
      variance.data.rows.map((row) => [row.activityId, row]),
    );
  }, [variance.data]);
  const canManageLogic = canWrite; // dependency write = the hierarchy-writer roles

  // TSLD create-by-drag (M2): the route composes the create + recalc so features/tsld imports
  // no other feature (ADR-0026 D8). A drag becomes a 1-day-min TASK pinned at the dropped day
  // with an SNET constraint, then the authoritative recalc places it.
  const createPlacedActivity = useCreatePlacedActivity(orgSlug, planId);
  const recalculate = useRecalculate(orgSlug, planId);
  const onTsldCreate = async (input: TsldCreateInput): Promise<TsldCreateOutcome> => {
    const plannedStart = plan.data?.plannedStart;
    if (!plannedStart) return { recalcConflict: null };
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
      if (err instanceof ApiFetchError && err.status === 409) {
        // Stale version — the move was NOT applied (nothing changed); never re-send.
        return { applied: false, conflict: moveConflict };
      }
      throw err;
    }
    // The move landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
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
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 422)) {
        // A cycle/duplicate the engine refused — nothing was created; show the reason, don't retry.
        return { applied: false, conflict: err.error.message };
      }
      throw err;
    }
    // The link landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
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

  if (plan.isPending) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Spinner label="Loading plan…" />
      </main>
    );
  }

  if (plan.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Breadcrumbs
          items={[
            { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
            { label: 'Not found' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Plan not found</h1>
        <div className="border-border text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
          <p>This plan doesn’t exist, was deleted, or you don’t have access to it.</p>
          <Link
            to="/orgs/$orgSlug/clients"
            params={{ orgSlug }}
            className="text-foreground mt-2 inline-block underline underline-offset-4"
          >
            Back to clients
          </Link>
        </div>
      </main>
    );
  }

  const crumbs: Crumb[] = [
    { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
    {
      label: client.data?.name ?? 'Client',
      to: '/orgs/$orgSlug/clients/$clientId',
      params: { orgSlug, clientId: project.data?.clientId ?? '' },
    },
    {
      label: project.data?.name ?? 'Project',
      to: '/orgs/$orgSlug/projects/$projectId',
      params: { orgSlug, projectId: plan.data.projectId },
    },
    { label: plan.data.name },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={crumbs} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{plan.data.name}</h1>
        {canWrite ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit plan
          </Button>
        ) : null}
      </div>

      <dl className="mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>{PLAN_STATUS_LABELS[plan.data.status]}</dd>
        <dt className="text-muted-foreground">Planned start</dt>
        <dd>{formatCalendarDate(plan.data.plannedStart)}</dd>
      </dl>
      {plan.data.description ? (
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm">{plan.data.description}</p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Schedule</h2>
        <RecalculateButton orgSlug={orgSlug} planId={planId} canCalculate={canCalculate} />
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        The computed critical path and early/late dates. Recalculate after changing activities,
        durations, logic or the calendar to bring them up to date.
      </p>
      <div className="mt-3">
        <PlanCalendarPicker
          orgSlug={orgSlug}
          plan={plan.data}
          calendars={calendars.data ?? []}
          calendarsLoading={calendars.isPending}
          canEdit={canWrite}
        />
      </div>
      <div className="mt-3">
        <ScheduleSummaryStrip orgSlug={orgSlug} planId={planId} />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-medium">Baselines</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Frozen snapshots of the schedule to compare against. The active baseline drives the
          variance shown in the activities table.
        </p>
        <div className="mt-3">
          <BaselinesPanel orgSlug={orgSlug} planId={planId} canManage={canWrite} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium">Logic diagram</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The Time-Scaled Logic Diagram: activities plotted on the timeline and connected by their
          logic.
        </p>
        <div className="mt-3">
          <TsldPanel
            // Remount per plan so selection/viewport state never leaks across a same-route
            // plan→plan navigation (else the delete-reconcile effect can mis-fire — a11y review).
            key={planId}
            activities={activities.data ?? []}
            dependencies={dependencies.data ?? []}
            dataDate={plan.data.plannedStart}
            canEdit={canWrite}
            onCreate={onTsldCreate}
            onReposition={onTsldReposition}
            onLink={onTsldLink}
            onAutoArrange={onTsldAutoArrange}
            onOpenLogic={setLogicActivity}
            onRefresh={onTsldRefresh}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Activities</h2>
        {canWrite ? <CreateActivityButton orgSlug={orgSlug} planId={planId} /> : null}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        The activities that make up this plan. Edit their details here; the logic diagram above
        plots them on the timeline.
      </p>
      {variance.data ? (
        <div className="mt-2">
          <BaselineVarianceSummary summary={variance.data.summary} />
        </div>
      ) : null}
      <div className="mt-3">
        <ActivitiesTable
          orgSlug={orgSlug}
          planId={planId}
          canWrite={canWrite}
          canReportProgress={canProgress}
          onOpenLogic={setLogicActivity}
          {...(varianceByActivityId ? { varianceByActivityId } : {})}
        />
      </div>

      <DependencyEditor
        orgSlug={orgSlug}
        planId={planId}
        planActivities={activities.data ?? []}
        canManageLogic={canManageLogic}
        open={logicActivity !== undefined}
        onClose={() => setLogicActivity(undefined)}
        {...(logicActivity ? { activity: logicActivity } : {})}
      />

      {canWrite ? (
        <PlanFormDialog
          orgSlug={orgSlug}
          projectId={plan.data.projectId}
          open={editing}
          onClose={() => setEditing(false)}
          plan={plan.data}
        />
      ) : null}
    </main>
  );
}
