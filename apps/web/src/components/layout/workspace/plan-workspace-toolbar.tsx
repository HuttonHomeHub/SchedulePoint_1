import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActivityBottomPanel, ActivityPanelCollapsedBar } from './activity-bottom-panel';
import { ActivityCrudDialogs } from './activity-crud-dialogs';
import { PlanChromeDialogs } from './plan-chrome-dialogs';
import { PlanDialogs } from './plan-dialogs';
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
import { Toolbar } from '@/components/ui/toolbar';
import { useMediaQuery } from '@/components/ui/use-media-query';
import { CANVAS_AUTHORING_ENABLED, SCHEDULING_MODES_ENABLED } from '@/config/env';
import { CompactPenStatus, PenReadOnlyNote } from '@/features/plan-lock';
import { PLAN_STATUS_LABELS } from '@/features/plans';
import { TsldPanel, barDateSourceFor } from '@/features/tsld';
import { buildTsldToolbarItems } from '@/features/tsld/toolbar/tsld-toolbar-items';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import {
  useTsldToolbarContext,
  type PlanDialogKind,
} from '@/features/tsld/toolbar/use-tsld-toolbar-context';
import { cn } from '@/lib/utils';

/** The `md` breakpoint (48rem) — at/above it the canvas + bottom panel split; below it, one pane. */
const MD_QUERY = '(min-width: 48rem)';

/**
 * The **canvas-maximal, toolbar-hosted** plan workspace (ADR-0031) — the `VITE_CANVAS_TOOLBAR`
 * evolution of {@link PlanWorkspace}. It collapses the ADR-0030 chrome bands into a **slim header**
 * (breadcrumb + plan identity + compact pen status) plus **one registry-driven `<Toolbar>` row**,
 * over a **full-height chromeless canvas** with the activities panel **collapsed by default** — so
 * the canvas gets the room. Every former band (view toggles, legend, summary, plan actions,
 * shortcuts) is one click away in the toolbar's popovers / `⋯` overflow. Flag-off keeps the
 * ADR-0030 layout untouched.
 */
export function ToolbarPlanWorkspace({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  // One shared canvas UI state drives both the chromeless canvas and the toolbar (ADR-0031).
  const canvasUi = useTsldCanvasUiState();
  const [dialog, setDialog] = useState<PlanDialogKind | null>(null);
  const ctx = useTsldToolbarContext({ model, plan, canvasUi, openDialog: setDialog });
  const items = useMemo(() => buildTsldToolbarItems(), []);

  // Below `md` the vertical split can't give the canvas and the table useful height at once, so
  // (like the ADR-0030 layout) one pane shows at a time via the Diagram/Activities toggle — never
  // squeezing the canvas to its minimum on a phone. Both stay mounted (toggled with `hidden`) so
  // switching preserves the canvas viewport and the table scroll.
  const isWide = useMediaQuery(MD_QUERY, true);
  const [pane, setPane] = useState<WorkspacePane>('diagram');

  // Activities panel: collapsed by default on this surface (drag up / Expand to reveal). Collapse
  // is session-local here; the resizer still persists the height via the shared prefs.
  const panel = useActivityPanelPrefs();
  const [collapsed, setCollapsed] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const collapse = useCallback(() => {
    setInteracted(true);
    setCollapsed(true);
  }, []);
  const expand = useCallback(() => {
    setInteracted(true);
    setCollapsed(false);
  }, []);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBodyHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const effectiveMax = Math.min(
    PANEL_MAX_HEIGHT,
    Math.max(PANEL_MIN_OPEN, bodyHeight - CANVAS_MIN_HEIGHT),
  );
  const panelHeight = Math.min(panel.size, effectiveMax);
  const pointerToSize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) =>
      (bodyRef.current?.getBoundingClientRect().bottom ?? 0) - event.clientY,
    [],
  );
  const onResize = useCallback(
    (next: number) => panel.setSize(Math.min(next, effectiveMax)),
    [panel, effectiveMax],
  );

  // Canvas-first authoring makes the empty canvas an *interactive, drawable* surface, so it must not
  // be shown while the activities/dependencies are still loading — an empty array then reads as a
  // genuinely blank plan and invites a draw into data that's about to arrive (ux review). Until they
  // resolve, show a loading placeholder distinct from the empty state. (Flag-off the empty canvas is
  // inert, so this window is harmless and we keep the byte-for-byte render.)
  const canvasLoading =
    CANVAS_AUTHORING_ENABLED && (model.activities.isPending || model.dependencies.isPending);

  // The chromeless canvas is built once and placed in whichever layout (wide split / narrow pane) is
  // active, so it isn't described twice and its viewport survives a pane switch. Remount per plan so
  // selection/viewport state never leaks across a plan→plan nav.
  const canvas = canvasLoading ? (
    <div
      role="status"
      aria-label="Loading the plan…"
      className="bg-muted/40 h-full min-h-0 flex-1 animate-pulse rounded-md"
    />
  ) : (
    <TsldPanel
      key={model.planId}
      fill
      chromeless
      canvasUi={canvasUi}
      activities={model.activities.data ?? []}
      dependencies={model.dependencies.data ?? []}
      dataDate={plan.plannedStart}
      barDateSource={
        // ADR-0033: VISUAL plans render the effective-Visual dates; the Late overlay (M4) will feed
        // the second arg. Flag-off the mode is always EARLY, so this stays `early` (byte-for-byte).
        SCHEDULING_MODES_ENABLED ? barDateSourceFor(plan.schedulingMode, false) : 'early'
      }
      canEdit={model.canEditSchedule}
      onCreate={model.onTsldCreate}
      onReposition={model.onTsldReposition}
      onLink={model.onTsldLink}
      onAutoArrange={model.onTsldAutoArrange}
      onOpenLogic={model.setLogicActivity}
      onEditActivity={model.onEditActivity}
      onDeleteActivity={model.onDeleteActivity}
      onRefresh={model.onTsldRefresh}
      calendar={model.tsldCalendar}
      todayIso={model.todayIso}
    />
  );

  const crumbs: Crumb[] = [
    { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug: model.orgSlug } },
    {
      label: model.client.data?.name ?? 'Client',
      to: '/orgs/$orgSlug/clients/$clientId',
      params: { orgSlug: model.orgSlug, clientId: model.project.data?.clientId ?? '' },
    },
    {
      label: model.project.data?.name ?? 'Project',
      to: '/orgs/$orgSlug/projects/$projectId',
      params: { orgSlug: model.orgSlug, projectId: plan.projectId },
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Slim header: two lines — breadcrumb, then identity + compact pen status. */}
      <header className="border-border flex flex-col gap-1.5 border-b px-4 py-2">
        <Breadcrumbs items={crumbs} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight">{plan.name}</h1>
            <span className="text-muted-foreground shrink-0 text-sm">
              {PLAN_STATUS_LABELS[plan.status]}
            </span>
          </div>
          <CompactPenStatus
            pen={model.pen}
            {...(model.currentUserId ? { currentUserId: model.currentUserId } : {})}
          />
        </div>
      </header>

      {/* The single command surface (ADR-0031). Authoring group flips as a set on the pen. */}
      <div className="border-border border-b px-2 py-1">
        <Toolbar
          items={items}
          context={ctx}
          label="Plan toolbar"
          authoringEnabled={model.canEditSchedule}
        />
      </div>

      {model.penReadOnly ? (
        <div className="px-4 pt-2">
          <PenReadOnlyNote />
        </div>
      ) : null}

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isWide ? (
          <>
            {/* Full-height chromeless canvas — the toolbar hosts its controls. */}
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-2 pb-2">{canvas}</div>

            {collapsed ? (
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
          </>
        ) : (
          <>
            <WorkspaceViewToggle value={pane} onChange={setPane} />
            <div
              className={cn(
                'min-h-0 flex-1 flex-col gap-2 px-4 pt-2 pb-2',
                pane === 'diagram' ? 'flex' : 'hidden',
              )}
            >
              {canvas}
            </div>
            <div className={cn('min-h-0 flex-1', pane === 'activities' ? 'block' : 'hidden')}>
              <ActivityBottomPanel model={model} />
            </div>
          </>
        )}
      </div>

      {/* Plan-chrome dialogs the toolbar overflow opens (shared with the ADR-0030 header menu). */}
      <PlanChromeDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        model={model}
        plan={plan}
      />

      {/* Edit-plan form + logic editor (shared with the ADR-0030 layout). */}
      <PlanDialogs model={model} plan={plan} />

      {/* Activity edit/delete dialogs the floating selection bar opens (ADR-0031). */}
      <ActivityCrudDialogs model={model} />
    </div>
  );
}
