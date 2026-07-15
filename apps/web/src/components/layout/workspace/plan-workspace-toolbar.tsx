import { SquarePen } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { useMediaQuery } from '@/components/ui/use-media-query';
import { CANVAS_AUTHORING_ENABLED, SCHEDULING_MODES_ENABLED } from '@/config/env';
import { CompactPenStatus } from '@/features/plan-lock';
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
 * evolution of {@link PlanWorkspace}. It collapses the ADR-0030 chrome bands into a **one-line header**
 * (breadcrumb ending at the plan name + status pill + compact pen status) plus a **two-row
 * registry-driven `<Toolbar>`** (Row 1 · Look — view/navigate, always live; Row 2 · Do — build/manage,
 * with a pen-gated authoring cluster that shades as a set), over a **full-height chromeless canvas**
 * with the activities panel **collapsed by default** so the canvas gets the room. Every former band
 * (view toggles, legend, summary, plan actions, shortcuts) lives inline in the two rows or one click
 * away in their popovers. Flag-off keeps the ADR-0030 layout untouched.
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
  // Split the registry into the two rows (ADR-0031 two-row amendment): Row 1 · Look (view/navigate,
  // always live) and Row 2 · Do (build/manage, its authoring cluster pen-gated). Each row is its own
  // <Toolbar> so grouping/overflow stay per-row and the primitive is unchanged.
  const rows = useMemo(() => splitByRow(items), [items]);

  // "Press ? for keyboard shortcuts" (ADR-0031 amendment) — the standard global affordance, alongside
  // the Row-1 help icon. Ignore it while typing in a field so `?` still types normally.
  const openShortcuts = canvasUi.setShowHelp;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      openShortcuts(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openShortcuts]);

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

  // The read-only Late-start overlay (ADR-0033 M4) suppresses all editing. Derive it once so the
  // canvas, the toolbar's authoring group, and the explanatory note stay in lock-step — otherwise the
  // tools read as live while doing nothing on the canvas (ux/a11y review).
  const lateOverlayActive = SCHEDULING_MODES_ENABLED && canvasUi.viewToggles.lateOverlay;

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
        // ADR-0033: VISUAL plans render the effective-Visual dates; the Late overlay (M4) wins for
        // display. Flag-off the mode is always EARLY and the overlay off, so this stays `early`.
        SCHEDULING_MODES_ENABLED
          ? barDateSourceFor(plan.schedulingMode, canvasUi.viewToggles.lateOverlay)
          : 'early'
      }
      // The Late overlay is read-only analysis — suppress editing while it's on (ADR-0033 M4).
      canEdit={model.canEditSchedule && !lateOverlayActive}
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

  // Breadcrumb ends at the plan name (the current page) so the whole trail — Clients → client →
  // project → plan — reads on one header line (ADR-0031 two-row amendment). A visually-hidden <h1>
  // keeps the document outline intact even though the visible title is the last (bold) crumb.
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
    { label: plan.name },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Slim header: one line — breadcrumb (…→ plan name) + status pill, then compact pen status. */}
      <header className="border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2">
        <h1 className="sr-only">{plan.name}</h1>
        <div className="flex min-w-0 items-center gap-2">
          <Breadcrumbs items={crumbs} />
          <Badge variant="neutral">{PLAN_STATUS_LABELS[plan.status]}</Badge>
          {/* Quick edit-plan affordance for writers, beside the status pill (ADR-0031 amendment) —
              the standalone toolbar Edit-plan button was folded into here + the Summary popover. */}
          {model.canWrite ? (
            <button
              type="button"
              onClick={() => model.setEditing(true)}
              title="Edit plan…"
              aria-label="Edit plan…"
              className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring shrink-0 rounded-md p-1 focus-visible:ring-2 focus-visible:outline-none"
            >
              <SquarePen aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
        <CompactPenStatus
          pen={model.pen}
          {...(model.currentUserId ? { currentUserId: model.currentUserId } : {})}
        />
      </header>

      {/* The two-row command surface (ADR-0031 two-row amendment). Row 1 · Look is always live; Row 2 ·
          Do carries the pen-gated authoring cluster (shaded as a set when the pen isn't held) beside
          the always-live plan & deliverable actions. Both rows share one `authoringEnabled` — only
          Row 2's `penGated` items react. Row 1 right-aligns its status read-outs (Finish/Summary/Legend). */}
      <div className="border-border flex flex-col border-b">
        <div className="border-border border-b px-2 py-1">
          <Toolbar
            items={rows.look}
            context={ctx}
            label="View and navigate"
            authoringEnabled={model.canEditSchedule && !lateOverlayActive}
            alignEndGroup="object"
          />
        </div>
        <div className="px-2 py-1">
          <Toolbar
            items={rows.do}
            context={ctx}
            label="Build and manage"
            authoringEnabled={model.canEditSchedule && !lateOverlayActive}
          />
        </div>
      </div>

      {/* Why the (otherwise-enabled) editing tools are greyed out while the Late-start overlay is on. */}
      {lateOverlayActive && model.canEditSchedule ? (
        <div className="px-4 pt-2">
          <p
            role="status"
            className="text-muted-foreground border-border rounded-md border border-dashed px-3 py-1.5 text-sm"
          >
            The Late-start overlay is on — editing is paused. Turn it off in{' '}
            <span className="font-medium">View</span> to edit.
          </p>
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
