import { useCallback, useEffect, useRef, useState } from 'react';

import { ActivityBottomPanel, ActivityPanelCollapsedBar } from './activity-bottom-panel';
import { PlanActionsMenu } from './plan-actions-menu';
import { PlanDialogs } from './plan-dialogs';
import {
  CANVAS_MIN_HEIGHT,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_OPEN,
  useActivityPanelPrefs,
} from './use-activity-panel-prefs';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { PanelResizer } from '@/components/ui/panel-resizer';
import { useMediaQuery } from '@/components/ui/use-media-query';
import { EditLockBanner, PenReadOnlyNote } from '@/features/plan-lock';
import { PLAN_STATUS_LABELS } from '@/features/plans';
import { RecalculateButton, ScheduleSummaryStrip } from '@/features/schedule';
import { TsldPanel } from '@/features/tsld';
import { cn } from '@/lib/utils';

/** The `md` breakpoint (48rem) — at/above it the split; below it, one pane via the view toggle. */
const MD_QUERY = '(min-width: 48rem)';

type WorkspacePane = 'diagram' | 'activities';

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
 * {@link CANVAS_MIN_HEIGHT}. The header's lower-frequency chrome (Edit / Baselines / Calendar)
 * lives in the {@link PlanActionsMenu} overflow.
 *
 * **Responsive (below `md`):** the vertical split gives way to a **Diagram / Activities view
 * toggle** showing one pane at a time (the canvas can't usefully share a phone's height with a
 * table). Both panes stay mounted and are toggled with `hidden`, so switching preserves the
 * canvas viewport and the table scroll.
 */
export function PlanWorkspace({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  const isWide = useMediaQuery(MD_QUERY, true);
  const [pane, setPane] = useState<WorkspacePane>('diagram');
  const panel = useActivityPanelPrefs();
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
  );
  const penNote = model.penReadOnly ? <PenReadOnlyNote /> : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanHeaderBar model={model} plan={plan} />

      {isWide ? (
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Canvas region — fills the height left by the panel. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-3 pb-2">
            {penNote}
            {canvas}
          </div>

          {panel.collapsed ? (
            <ActivityPanelCollapsedBar onExpand={panel.expand} />
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
                <ActivityBottomPanel model={model} onCollapse={panel.collapse} />
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
            {penNote}
            {canvas}
          </div>
          <div className={cn('min-h-0 flex-1', pane === 'activities' ? 'block' : 'hidden')}>
            <ActivityBottomPanel model={model} />
          </div>
        </div>
      )}

      <PlanDialogs model={model} plan={plan} />
    </div>
  );
}

/**
 * The mobile (below `md`) view switch: a two-option segmented control choosing whether the
 * single pane shows the **Diagram** (canvas) or the **Activities** table. Rendered only below
 * `md`, where the vertical split can't give both surfaces useful height.
 */
function WorkspaceViewToggle({
  value,
  onChange,
}: {
  value: WorkspacePane;
  onChange: (value: WorkspacePane) => void;
}): React.ReactElement {
  const OPTIONS: { value: WorkspacePane; label: string }[] = [
    { value: 'diagram', label: 'Diagram' },
    { value: 'activities', label: 'Activities' },
  ];
  return (
    <div
      role="group"
      aria-label="Workspace view"
      className="border-border flex shrink-0 gap-1 border-b p-2"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-9 flex-1 rounded-md px-3 py-1.5 text-sm font-medium',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The workspace header: plan identity + the primary schedule controls (Recalculate, the pen
 * banner, the summary strip). The lower-frequency chrome — Edit plan, Baselines, Calendar —
 * lives in the {@link PlanActionsMenu} overflow so the header stays slim and canvas-first
 * (ADR-0030 spec re-homing table).
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
          <PlanActionsMenu model={model} plan={plan} />
        </div>
      </div>

      {/* The single "who holds the pen" surface (ADR-0028); renders nothing when the pen is off. */}
      <EditLockBanner
        pen={model.pen}
        {...(model.currentUserId ? { currentUserId: model.currentUserId } : {})}
      />
      <ScheduleSummaryStrip orgSlug={orgSlug} planId={planId} />
    </header>
  );
}
