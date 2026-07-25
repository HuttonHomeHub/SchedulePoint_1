import { useCallback, useEffect, useRef, useState } from 'react';

import { ActivityBottomPanel, ActivityPanelCollapsedBar } from './activity-bottom-panel';
import { ActivityCrudDialogs } from './activity-crud-dialogs';
import { PlanActionsMenu } from './plan-actions-menu';
import { PlanDialogs } from './plan-dialogs';
import { ToolbarPlanWorkspace } from './plan-workspace-toolbar';
import {
  CANVAS_MIN_HEIGHT,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_OPEN,
  useActivityPanelPrefs,
} from './use-activity-panel-prefs';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';
import { WorkspaceViewToggle, type WorkspacePane } from './workspace-view-toggle';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { useMediaQuery } from '@/components/ui/use-media-query';
import {
  CANVAS_TOOLBAR_ENABLED,
  NOTES_ENABLED,
  PROGRAMME_SCHEDULING_ENABLED,
  SCHEDULING_MODES_ENABLED,
} from '@/config/env';
import { isDurationDerivedType } from '@/features/activities';
import { PlanNotesSection } from '@/features/notes';
import { EditLockBanner, PenReadOnlyNote } from '@/features/plan-lock';
import { PLAN_STATUS_LABELS } from '@/features/plans';
import {
  ProgrammeScheduleSection,
  RecalculateButton,
  ScheduleSummaryStrip,
} from '@/features/schedule';
import { TsldPanel, barDateSourceFor } from '@/features/tsld';
import { cn } from '@/lib/utils';

/** The `md` breakpoint (48rem) — at/above it the split; below it, one pane via the view toggle. */
const MD_QUERY = '(min-width: 48rem)';

/**
 * The canvas-first plan workspace (ADR-0030): opened in the app-shell's workspace region
 * next to the Project Explorer, with the **TSLD canvas as the primary surface** filling the
 * available height and the **activity table docked as a drag-resizable, collapsible bottom
 * panel**. Replaces the legacy long-scrolling plan-detail page (kept as the flag-off fallback,
 * `VITE_CANVAS_WORKSPACE`).
 *
 * The bottom panel is resized via the shared {@link PanelResizer} (the same splitter primitive
 * the rail uses) with its height persisted ({@link useActivityPanelPrefs}); the panel's height
 * is clamped at render against the live workspace height so the canvas always keeps at least
 * {@link CANVAS_MIN_HEIGHT}. The header's lower-frequency chrome (Edit / Baselines / Calendar /
 * Plan details) lives in the {@link PlanActionsMenu} overflow.
 *
 * **Responsive (below `md`):** the vertical split gives way to a **Diagram / Activities view
 * toggle** (a `radiogroup`) showing one pane at a time (the canvas can't usefully share a phone's
 * height with a table). Both panes stay mounted and are toggled with `hidden`, so switching
 * preserves the canvas viewport and the table scroll.
 */
/**
 * The plan workspace surface. `VITE_CANVAS_TOOLBAR` (ADR-0031) selects the canvas-maximal,
 * toolbar-hosted {@link ToolbarPlanWorkspace}; flag-off keeps the ADR-0030 layout below, byte-for-byte.
 */
export function PlanWorkspace({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  return CANVAS_TOOLBAR_ENABLED ? (
    <ToolbarPlanWorkspace model={model} plan={plan} />
  ) : (
    <Adr0030PlanWorkspace model={model} plan={plan} />
  );
}

function Adr0030PlanWorkspace({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  const isWide = useMediaQuery(MD_QUERY, true);
  const [pane, setPane] = useState<WorkspacePane>('diagram');
  const panel = useActivityPanelPrefs();
  // Only move focus onto the (re)mounted collapse/expand control after a *user* toggle, never on
  // first paint (mirrors the rail's `interacted` pattern) — so focus is never lost on the swap.
  const [interacted, setInteracted] = useState(false);
  const collapse = useCallback(() => {
    setInteracted(true);
    panel.collapse();
  }, [panel]);
  const expand = useCallback(() => {
    setInteracted(true);
    panel.expand();
  }, [panel]);

  // Measure the workspace body (below the header) so the panel's max reserves the canvas.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBodyHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Effective max height = whatever leaves the canvas its minimum, bounded by the static cap.
  const effectiveMax = Math.min(
    PANEL_MAX_HEIGHT,
    Math.max(PANEL_MIN_OPEN, bodyHeight - CANVAS_MIN_HEIGHT),
  );
  const panelHeight = Math.min(panel.size, effectiveMax);

  // A bottom-docked panel grows as the pointer moves up: height = the body's bottom edge − Y.
  const pointerToSize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) =>
      (bodyRef.current?.getBoundingClientRect().bottom ?? 0) - event.clientY,
    [],
  );
  const onResize = useCallback(
    (next: number) => panel.setSize(Math.min(next, effectiveMax)),
    [panel, effectiveMax],
  );

  // The canvas is built once and placed in whichever layout is active, so it isn't described
  // twice. Remount per plan so selection/viewport state never leaks across a plan→plan nav.
  const canvas = (
    <TsldPanel
      key={model.planId}
      fill
      activities={model.activities.data ?? []}
      dependencies={model.dependencies.data ?? []}
      dataDate={plan.plannedStart}
      barDateSource={
        SCHEDULING_MODES_ENABLED ? barDateSourceFor(plan.schedulingMode, false) : 'early'
      }
      canEdit={model.canEditSchedule}
      onCreate={model.onTsldCreate}
      onReposition={model.onTsldReposition}
      // Bar-end resize (ADR-0052 M2/M3) + lag-anchor drag (M3); armed only under the flag,
      // byte-for-byte off.
      onResize={model.onTsldResize}
      onLag={model.onTsldLag}
      onLink={model.onTsldLink}
      onAutoArrange={model.onTsldAutoArrange}
      onOpenLogic={model.setLogicActivity}
      onEditActivity={model.onEditActivity}
      onDeleteActivity={model.onDeleteActivity}
      // Entry-route selection-bar actions (Resources / Report progress / Steps). Always passed; each
      // toolbar item is flag-gated, so flag-off is byte-for-byte. Their dialogs are mounted in the
      // shared `PlanDialogs` below, so they work in this ADR-0030 layout too.
      onResources={model.onResourcesActivity}
      onProgress={model.onProgressActivity}
      onSteps={model.onStepsActivity}
      canReportProgress={model.canProgress}
      isStepsEligible={(a) => !isDurationDerivedType(a.type)}
      onSelectionChange={model.onSelectionChange}
      onRefresh={model.onTsldRefresh}
      calendar={model.tsldCalendar}
      todayIso={model.todayIso}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanHeaderBar model={model} plan={plan} />

      {/* One consolidated pen read-only note above the whole body (ADR-0030 US-4) — never repeated
          per pane, so a would-be editor sees the "you don't hold the pen" hint exactly once. */}
      {model.penReadOnly ? (
        <div className="px-4 pt-2">
          <PenReadOnlyNote />
        </div>
      ) : null}

      {isWide ? (
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Canvas region — fills the height left by the panel. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-3 pb-2">{canvas}</div>

          {panel.collapsed ? (
            <ActivityPanelCollapsedBar onExpand={expand} focusExpandOnMount={interacted} />
          ) : (
            <>
              <PanelResizer
                orientation="horizontal"
                size={panelHeight}
                min={PANEL_MIN_OPEN}
                max={effectiveMax}
                label="Resize activities panel"
                onResize={onResize}
                pointerToSize={pointerToSize}
                className="bg-border/60 hover:bg-border focus-visible:bg-ring"
              />
              <div style={{ height: panelHeight }} className="shrink-0">
                <ActivityBottomPanel
                  model={model}
                  onCollapse={collapse}
                  focusCollapseOnMount={interacted}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspaceViewToggle value={pane} onChange={setPane} />
          <div
            className={cn(
              'min-h-0 flex-1 flex-col gap-2 px-4 pt-3 pb-2',
              pane === 'diagram' ? 'flex' : 'hidden',
            )}
          >
            {canvas}
          </div>
          <div className={cn('min-h-0 flex-1', pane === 'activities' ? 'block' : 'hidden')}>
            <ActivityBottomPanel model={model} />
          </div>
        </div>
      )}

      {/* Shared dialogs (dependency editor, edit-plan, and the entry-route resources/progress/steps
          editors) — so the canvas selection bar's Report-progress / Resources / Steps actions work in
          this ADR-0030 layout too. */}
      <PlanDialogs model={model} plan={plan} />

      {/* Activity edit/delete dialogs the floating selection bar opens (ADR-0031). */}
      <ActivityCrudDialogs model={model} />
    </div>
  );
}

/**
 * The workspace header: a breadcrumb trail (Client → Project — the plan is the `<h1>`) + plan
 * identity + the primary schedule controls (Recalculate, the pen banner, the summary strip). The
 * lower-frequency chrome — Edit plan, Baselines, Calendar, Plan details — lives in the
 * {@link PlanActionsMenu} overflow so the header stays slim and canvas-first (ADR-0030).
 */
function PlanHeaderBar({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  const { orgSlug, planId } = model;
  // The plan is the deepest hierarchy node; keep the ancestor trail visible for deep-links and
  // when the rail is a collapsed drawer (UX_STANDARDS: breadcrumbs ≥ 2 levels deep).
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
  ];
  return (
    <header className="border-border flex flex-col gap-2 border-b px-4 py-3">
      <Breadcrumbs items={crumbs} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-lg font-semibold tracking-tight">{plan.name}</h1>
          <span className="text-muted-foreground shrink-0 text-sm">
            {PLAN_STATUS_LABELS[plan.status]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RecalculateButton orgSlug={orgSlug} planId={planId} canCalculate={model.canRecalc} />
          <PlanActionsMenu model={model} plan={plan} />
        </div>
      </div>

      {/* The single "who holds the pen" surface (ADR-0028); renders nothing when the pen is off. */}
      <EditLockBanner
        pen={model.pen}
        {...(model.currentUserId ? { currentUserId: model.currentUserId } : {})}
      />
      <ScheduleSummaryStrip orgSlug={orgSlug} planId={planId} />
      {PROGRAMME_SCHEDULING_ENABLED ? (
        <ProgrammeScheduleSection orgSlug={orgSlug} planId={planId} canRecalc={model.canRecalc} />
      ) : null}
      {NOTES_ENABLED ? (
        // Mounted under the header's plan `h1`, so the default `h2` heading is correct (ADR-0046),
        // at the same site as the programme section.
        <PlanNotesSection
          orgSlug={orgSlug}
          planId={planId}
          canWrite={model.canWriteNotes}
          bounded
        />
      ) : null}
    </header>
  );
}
