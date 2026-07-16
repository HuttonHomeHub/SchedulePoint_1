import { Link, useParams } from '@tanstack/react-router';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { PlanDialogs } from '@/components/layout/workspace/plan-dialogs';
import { PlanWorkspace } from '@/components/layout/workspace/plan-workspace';
import {
  usePlanWorkspaceModel,
  type LoadedPlan,
  type PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  ADVANCED_CONSTRAINTS_ENABLED,
  CANVAS_WORKSPACE_ENABLED,
  PROGRESS_INGESTION_ENABLED,
} from '@/config/env';
import { ActivitiesTable, CreateActivityButton } from '@/features/activities';
import { BaselinesPanel, BaselineVarianceSummary } from '@/features/baselines';
import { EditLockBanner, PenReadOnlyNote } from '@/features/plan-lock';
import {
  PLAN_STATUS_LABELS,
  PlanCalendarPicker,
  PlanExpectedFinishToggle,
  PlanRecalcModePicker,
} from '@/features/plans';
import { RecalculateButton, ScheduleSummaryStrip } from '@/features/schedule';
import { TsldPanel } from '@/features/tsld';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * A single plan (`/orgs/$orgSlug/plans/$planId`). Route-composed orchestration (queries,
 * gating, TSLD edit callbacks) lives in {@link usePlanWorkspaceModel} so the two layouts
 * share one behaviour. `VITE_CANVAS_WORKSPACE` (ADR-0030) selects the canvas-first
 * {@link PlanWorkspace}; flag-off keeps the legacy stacked page below, byte-for-byte.
 */
export function PlanDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const planId = 'planId' in params ? params.planId : '';
  const model = usePlanWorkspaceModel(orgSlug, planId);
  const planQuery = model.plan;

  if (planQuery.isPending) {
    // A workspace-shaped skeleton (header + canvas + panel) on the canvas-first path so the load
    // → loaded transition doesn't jump from a small centred box to a full-bleed column (ADR-0030).
    return CANVAS_WORKSPACE_ENABLED ? (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
        <div className="border-border flex flex-col gap-2 border-b px-4 py-3">
          <div className="bg-muted h-3 w-56 animate-pulse rounded" />
          <div className="bg-muted h-6 w-64 animate-pulse rounded" />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Spinner label="Loading plan…" />
        </div>
        <div className="border-border h-40 shrink-0 border-t px-4 py-3">
          <div className="bg-muted h-4 w-32 animate-pulse rounded" />
        </div>
      </div>
    ) : (
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Spinner label="Loading plan…" />
      </div>
    );
  }

  if (planQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
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
      </div>
    );
  }

  const plan = planQuery.data;

  return CANVAS_WORKSPACE_ENABLED ? (
    <PlanWorkspace model={model} plan={plan} />
  ) : (
    <LegacyPlanLayout model={model} plan={plan} />
  );
}

/**
 * The legacy long-scrolling plan page — today's surface, kept as the `VITE_CANVAS_WORKSPACE`
 * flag-off fallback. Renders exactly as before; only its data now comes from the shared model.
 */
function LegacyPlanLayout({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  const { orgSlug, planId } = model;
  const crumbs: Crumb[] = [
    { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
    {
      label: model.client.data?.name ?? 'Client',
      to: '/orgs/$orgSlug/clients/$clientId',
      params: { orgSlug, clientId: model.project.data?.clientId ?? '' },
    },
    {
      label: model.project.data?.name ?? 'Project',
      to: '/orgs/$orgSlug/projects/$projectId',
      params: { orgSlug, projectId: plan.projectId },
    },
    { label: plan.name },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={crumbs} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
        {model.canWrite ? (
          <Button variant="outline" onClick={() => model.setEditing(true)}>
            Edit plan
          </Button>
        ) : null}
      </div>

      <dl className="mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>{PLAN_STATUS_LABELS[plan.status]}</dd>
        <dt className="text-muted-foreground">Planned start</dt>
        <dd>{formatCalendarDate(plan.plannedStart)}</dd>
      </dl>
      {plan.description ? (
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm">{plan.description}</p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Schedule</h2>
        <RecalculateButton orgSlug={orgSlug} planId={planId} canCalculate={model.canRecalc} />
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        The computed critical path and early/late dates. Recalculate after changing activities,
        durations, logic or the calendar to bring them up to date.
      </p>
      {/* The single "who holds the pen" surface — governs all schedule-model editing below
          (ADR-0028). Renders nothing when the pen layer is flag-off. */}
      <div className="mt-3">
        <EditLockBanner
          pen={model.pen}
          {...(model.currentUserId ? { currentUserId: model.currentUserId } : {})}
        />
      </div>
      <div className="mt-3">
        <PlanCalendarPicker
          orgSlug={orgSlug}
          plan={plan}
          calendars={model.calendars.data ?? []}
          calendarsLoading={model.calendars.isPending}
          canEdit={model.canWrite}
        />
      </div>
      {PROGRESS_INGESTION_ENABLED ? (
        <div className="mt-3">
          <PlanRecalcModePicker orgSlug={orgSlug} plan={plan} canEdit={model.canWrite} />
        </div>
      ) : null}
      {ADVANCED_CONSTRAINTS_ENABLED ? (
        <div className="mt-3">
          <PlanExpectedFinishToggle orgSlug={orgSlug} plan={plan} canEdit={model.canWrite} />
        </div>
      ) : null}
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
          <BaselinesPanel orgSlug={orgSlug} planId={planId} canManage={model.canWrite} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium">Logic diagram</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The Time-Scaled Logic Diagram: activities plotted on the timeline and connected by their
          logic.
        </p>
        {model.penReadOnly ? <PenReadOnlyNote /> : null}
        <div className="mt-3">
          <TsldPanel
            key={planId}
            activities={model.activities.data ?? []}
            dependencies={model.dependencies.data ?? []}
            dataDate={plan.plannedStart}
            canEdit={model.canEditSchedule}
            onCreate={model.onTsldCreate}
            onReposition={model.onTsldReposition}
            onLink={model.onTsldLink}
            onAutoArrange={model.onTsldAutoArrange}
            onOpenLogic={model.setLogicActivity}
            onRefresh={model.onTsldRefresh}
            calendar={model.tsldCalendar}
            todayIso={model.todayIso}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Activities</h2>
        {model.canEditSchedule ? (
          <CreateActivityButton
            orgSlug={orgSlug}
            planId={planId}
            calendars={model.calendars.data ?? []}
            calendarsLoading={model.calendars.isPending}
            calendarsError={model.calendars.isError}
          />
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        The activities that make up this plan. Edit their details here; the logic diagram above
        plots them on the timeline.
      </p>
      {model.penReadOnly ? <PenReadOnlyNote /> : null}
      {model.variance.data ? (
        <div className="mt-2">
          <BaselineVarianceSummary summary={model.variance.data.summary} />
        </div>
      ) : null}
      <div className="mt-3">
        <ActivitiesTable
          orgSlug={orgSlug}
          planId={planId}
          canWrite={model.canEditSchedule}
          canReportProgress={model.canProgress}
          onOpenLogic={model.setLogicActivity}
          calendars={model.calendars.data ?? []}
          calendarsLoading={model.calendars.isPending}
          calendarsError={model.calendars.isError}
          {...(model.varianceByActivityId
            ? { varianceByActivityId: model.varianceByActivityId }
            : {})}
        />
      </div>

      <PlanDialogs model={model} plan={plan} />
    </div>
  );
}
