import { ActivityBottomPanel } from './activity-bottom-panel';
import { PlanDialogs } from './plan-dialogs';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { Button } from '@/components/ui/button';
import { BaselinesPanel } from '@/features/baselines';
import { EditLockBanner, PenReadOnlyNote } from '@/features/plan-lock';
import { PLAN_STATUS_LABELS, PlanCalendarPicker } from '@/features/plans';
import { RecalculateButton, ScheduleSummaryStrip } from '@/features/schedule';
import { TsldPanel } from '@/features/tsld';

/** M1 static height for the bottom activity panel. M2 replaces this with the resizable splitter. */
const PANEL_STATIC_HEIGHT = 'h-72';

/**
 * The canvas-first plan workspace (ADR-0030): opened in the app-shell's workspace region
 * next to the Project Explorer, with the **TSLD canvas as the primary surface** filling the
 * available height and the **activity table docked as a bottom panel**. Replaces the legacy
 * long-scrolling plan-detail page (kept as the flag-off fallback, `VITE_CANVAS_WORKSPACE`).
 *
 * **M1** lands the layout skeleton: a slim header (plan identity + Recalculate + pen banner +
 * summary, with baselines/calendar behind a disclosure), the full-height canvas, and a
 * *static-height* bottom activity panel. Later milestones make the panel drag-resizable/
 * collapsible (M2), consolidate the header chrome into an overflow menu (M3), and add the
 * responsive single-pane toggle (M4).
 */
export function PlanWorkspace({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanHeaderBar model={model} plan={plan} />

      {/* Canvas region — fills the height left by the header and the bottom panel. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-3 pb-2">
        {model.penReadOnly ? <PenReadOnlyNote /> : null}
        <TsldPanel
          // Remount per plan so selection/viewport state never leaks across a same-route
          // plan→plan navigation (mirrors the legacy layout).
          key={model.planId}
          fill
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

      {/* Bottom activity panel — static height in M1; M2 makes it drag-resizable/collapsible. */}
      <div className={`${PANEL_STATIC_HEIGHT} shrink-0`}>
        <ActivityBottomPanel model={model} />
      </div>

      <PlanDialogs model={model} plan={plan} />
    </div>
  );
}

/**
 * The workspace header: plan identity + the primary schedule controls (Recalculate, the pen
 * banner, the summary strip), with baselines + calendar behind a disclosure to keep it slim.
 * **M3 consolidates the disclosure into an overflow `Menu`** (spec re-homing table); for now a
 * native `<details>` keeps every capability reachable and accessible without new UI.
 */
function PlanHeaderBar({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  const { orgSlug, planId } = model;
  return (
    <header className="border-border flex flex-col gap-3 border-b px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-lg font-semibold tracking-tight">{plan.name}</h1>
          <span className="text-muted-foreground shrink-0 text-sm">
            {PLAN_STATUS_LABELS[plan.status]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RecalculateButton orgSlug={orgSlug} planId={planId} canCalculate={model.canRecalc} />
          {model.canWrite ? (
            <Button variant="outline" size="sm" onClick={() => model.setEditing(true)}>
              Edit plan
            </Button>
          ) : null}
        </div>
      </div>

      {/* The single "who holds the pen" surface (ADR-0028); renders nothing when the pen is off. */}
      <EditLockBanner
        pen={model.pen}
        {...(model.currentUserId ? { currentUserId: model.currentUserId } : {})}
      />
      <ScheduleSummaryStrip orgSlug={orgSlug} planId={planId} />

      <details className="group">
        <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-sm select-none">
          Baselines &amp; calendar
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <PlanCalendarPicker
            orgSlug={orgSlug}
            plan={plan}
            calendars={model.calendars.data ?? []}
            calendarsLoading={model.calendars.isPending}
            canEdit={model.canWrite}
          />
          <BaselinesPanel orgSlug={orgSlug} planId={planId} canManage={model.canWrite} />
        </div>
      </details>
    </header>
  );
}
