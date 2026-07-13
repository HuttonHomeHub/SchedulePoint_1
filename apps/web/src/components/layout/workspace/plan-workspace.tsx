import { useCallback, useEffect, useRef, useState } from 'react';

import { ActivityBottomPanel, ActivityPanelCollapsedBar } from './activity-bottom-panel';
import { PlanDialogs } from './plan-dialogs';
import {
  CANVAS_MIN_HEIGHT,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_OPEN,
  useActivityPanelPrefs,
} from './use-activity-panel-prefs';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { Button } from '@/components/ui/button';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { BaselinesPanel } from '@/features/baselines';
import { EditLockBanner, PenReadOnlyNote } from '@/features/plan-lock';
import { PLAN_STATUS_LABELS, PlanCalendarPicker } from '@/features/plans';
import { RecalculateButton, ScheduleSummaryStrip } from '@/features/schedule';
import { TsldPanel } from '@/features/tsld';

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
 * {@link CANVAS_MIN_HEIGHT}. **M3** consolidates the header chrome into an overflow menu; **M4**
 * adds the responsive single-pane toggle.
 */
export function PlanWorkspace({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanHeaderBar model={model} plan={plan} />

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Canvas region — fills the height left by the panel. */}
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
