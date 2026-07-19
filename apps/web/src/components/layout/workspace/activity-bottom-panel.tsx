import { PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { Button } from '@/components/ui/button';
import { ActivitiesTable, CreateActivityButton } from '@/features/activities';
import { BaselineVarianceSummary } from '@/features/baselines';

/**
 * The activity list docked at the bottom of the canvas-first {@link PlanWorkspace}
 * (ADR-0030). It fills the height its container gives it and scrolls internally, so the
 * canvas above keeps the rest. The workspace owns the drag-resizer (the shared
 * resizable-panel primitive) and the panel's height; this component is the panel *content*.
 *
 * Reuses the same `ActivitiesTable` (computed columns, variance, progress editor, CRUD,
 * virtualization) the stacked page used, driven off the shared model so behaviour is
 * identical to the legacy layout. The pen read-only note is **not** shown here — the
 * workspace shows a single consolidated note above the whole body (ADR-0030 US-4).
 */
export function ActivityBottomPanel({
  model,
  onCollapse,
  focusCollapseOnMount = false,
}: {
  model: PlanWorkspaceModel;
  /** Collapse the panel to its handle. Omitted on the mobile single-pane view (the view toggle
   * switches away from Activities instead), where no collapse control is shown. */
  onCollapse?: () => void;
  /** After a user *expand*, the panel remounts — move focus onto the collapse control so a
   * keyboard/AT user isn't dropped to `<body>` (mirrors the rail's toggle focus). */
  focusCollapseOnMount?: boolean;
}): React.ReactElement {
  const collapseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusCollapseOnMount) collapseRef.current?.focus();
  }, [focusCollapseOnMount]);

  return (
    <section
      // "Activities panel", not "Activities": the inner DataTable's scroll region is already named
      // "Activities", so a bare match would announce two identical landmarks (axe landmark-unique,
      // TECH_DEBT #30h). The visible <h2> stays "Activities".
      aria-label="Activities panel"
      className="border-border flex h-full min-h-0 flex-col border-t"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium">Activities</h2>
          {model.variance.data ? (
            <BaselineVarianceSummary summary={model.variance.data.summary} />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {model.canEditSchedule ? (
            <CreateActivityButton
              orgSlug={model.orgSlug}
              planId={model.planId}
              calendars={model.calendars.data ?? []}
              calendarsLoading={model.calendars.isPending}
              calendarsError={model.calendars.isError}
              planActivities={model.activities.data ?? []}
              planActivitiesLoading={model.activities.isPending}
              planActivitiesError={model.activities.isError}
            />
          ) : null}
          {onCollapse ? (
            <Button
              ref={collapseRef}
              variant="ghost"
              size="icon"
              aria-label="Collapse activities panel"
              onClick={onCollapse}
            >
              <PanelBottomClose aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <ActivitiesTable
          orgSlug={model.orgSlug}
          planId={model.planId}
          canWrite={model.canEditSchedule}
          canReportProgress={model.canProgress}
          onOpenLogic={model.setLogicActivity}
          calendars={model.calendars.data ?? []}
          calendarsLoading={model.calendars.isPending}
          calendarsError={model.calendars.isError}
          {...(model.varianceByActivityId
            ? { varianceByActivityId: model.varianceByActivityId }
            : {})}
          {...(model.noteCountByActivityId
            ? { noteCountByActivityId: model.noteCountByActivityId }
            : {})}
        />
      </div>
    </section>
  );
}

/**
 * The collapsed activity panel: a slim bar pinned to the bottom with a single control to
 * reopen it — so the activity list is never more than one click away (mirrors the collapsed
 * rail's affordance). On a user *collapse* it takes focus so the keyboard user lands on the
 * expand control rather than `<body>`.
 */
export function ActivityPanelCollapsedBar({
  onExpand,
  focusExpandOnMount = false,
}: {
  onExpand: () => void;
  focusExpandOnMount?: boolean;
}): React.ReactElement {
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusExpandOnMount) expandRef.current?.focus();
  }, [focusExpandOnMount]);

  return (
    <div className="border-border flex h-9 shrink-0 items-center justify-between gap-2 border-t px-4">
      <span className="text-sm font-medium">Activities</span>
      <Button
        ref={expandRef}
        variant="ghost"
        size="icon"
        aria-label="Expand activities panel"
        onClick={onExpand}
      >
        <PanelBottomOpen aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
