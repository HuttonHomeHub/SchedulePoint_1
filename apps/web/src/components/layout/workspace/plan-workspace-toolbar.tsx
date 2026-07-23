import { SquarePen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActivityBottomPanel, ActivityPanelCollapsedBar } from './activity-bottom-panel';
import { ActivityCrudDialogs } from './activity-crud-dialogs';
import { PlanChromeDialogs } from './plan-chrome-dialogs';
import { PlanDialogs } from './plan-dialogs';
import { ResourceStripPanel } from './resource-strip-panel';
import {
  CANVAS_MIN_HEIGHT,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_OPEN,
  useActivityPanelPrefs,
} from './use-activity-panel-prefs';
import {
  CANVAS_MIN_WIDTH,
  NOTES_PANEL_MAX_WIDTH,
  NOTES_PANEL_MIN_WIDTH,
  useNotesPanelPrefs,
} from './use-notes-panel-prefs';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';
import { WorkspaceViewToggle, type WorkspacePane } from './workspace-view-toggle';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { SheetHeader } from '@/components/ui/sheet';
import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { useMediaQuery } from '@/components/ui/use-media-query';
import {
  CANVAS_AUTHORING_ENABLED,
  CANVAS_ACTIVITY_TYPES_ENABLED,
  CANVAS_LENSES_ENABLED,
  CANVAS_RESOURCE_VIEW_ENABLED,
  ENTRY_ROUTES_ENABLED,
  NOTES_ENABLED,
  PROGRAMME_SCHEDULING_ENABLED,
  SCHEDULING_MODES_ENABLED,
  UNDO_REDO_ENABLED,
} from '@/config/env';
import { isDurationDerivedType } from '@/features/activities';
import { PlanNotesSection } from '@/features/notes';
import { CompactPenStatus } from '@/features/plan-lock';
import { PLAN_STATUS_LABELS } from '@/features/plans';
import { ProgrammeScheduleSection } from '@/features/schedule';
import { TsldPanel, barDateSourceFor } from '@/features/tsld';
import { EditConflictBanner } from '@/features/tsld/components/EditConflictBanner';
import { type LensLegendInfo } from '@/features/tsld/components/TsldLegend';
import { TsldLegendPanel } from '@/features/tsld/components/TsldLegendPanel';
import { buildColourLegend } from '@/features/tsld/render/lenses';
import { lensLegendVarPalette } from '@/features/tsld/render/palette';
import type { ResourceStripSnapshot } from '@/features/tsld/render/resource-strip';
import { buildTsldToolbarItems } from '@/features/tsld/toolbar/tsld-toolbar-items';
import { useLegendPanelPrefs } from '@/features/tsld/toolbar/use-legend-panel-prefs';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import {
  useTsldToolbarContext,
  type PlanDialogKind,
} from '@/features/tsld/toolbar/use-tsld-toolbar-context';
import { useUndoRedoKeybindings } from '@/features/undo-redo';
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
  // The on-canvas floating Legend panel (ADR-0031 amendment): open state + drag position persist here,
  // toggled from the toolbar's Legend control and rendered over the canvas below.
  const legend = useLegendPanelPrefs();
  // Resource-view lens (Stage E, ADR-0049, VITE_CANVAS_RESOURCE_VIEW): the DOM `ResourceStripPanel`
  // publishes its strip snapshot here; the workspace forwards it (and the active flag) to the canvas,
  // which paints the demand bars on its sibling strip layer. `resourceViewActive` reserves the band +
  // mounts the panel — only when the lens is open, the flag is on, and the plan is diagrammable (has a
  // data date). Flag-off ⇒ always inactive ⇒ byte-for-byte today's canvas + no panel.
  const [stripSnapshot, setStripSnapshot] = useState<ResourceStripSnapshot | null>(null);
  const onStripSnapshot = useCallback(
    (snapshot: ResourceStripSnapshot | null) => setStripSnapshot(snapshot),
    [],
  );
  const resourceViewActive =
    CANVAS_RESOURCE_VIEW_ENABLED && model.resourceViewOpen && plan.plannedStart !== null;
  // The **Comments** button's reveal target (toolbar quick-wins F2): a ref on the plan-notes heading +
  // a stable, guarded callback that scrolls it into view and moves focus to it. A no-op when the
  // section isn't mounted (the responsive single-pane toggle / `VITE_NOTES` off), so it never throws.
  const notesHeadingRef = useRef<HTMLHeadingElement>(null);
  const setNotesOpen = model.setNotesOpen;
  const revealComments = useCallback(() => {
    // Entry-route win 1 (`VITE_ENTRY_ROUTES`): the Comments button is a genuine TOGGLE for the docked
    // notes panel (open when closed, close when open) — the panel docks in the layout below and pushes
    // the canvas, never overlays. Flag-off keeps the original behaviour — scroll the inline notes
    // heading into view + focus it.
    if (ENTRY_ROUTES_ENABLED) {
      setNotesOpen((open) => !open);
      return;
    }
    const el = notesHeadingRef.current;
    // No explicit `behavior` — let the app's global `prefers-reduced-motion` CSS `scroll-behavior`
    // opt-out govern it (A3); an explicit `behavior: 'smooth'` would bypass that (mirrors
    // `features/plan-lock/lib/use-pen-lock-view.ts`, which omits `behavior` deliberately).
    el?.scrollIntoView({ block: 'start' });
    el?.focus();
  }, [setNotesOpen]);
  const ctx = useTsldToolbarContext({
    model,
    plan,
    canvasUi,
    openDialog: setDialog,
    legend: { open: legend.open, toggle: legend.toggle },
    revealComments,
  });
  const items = useMemo(() => buildTsldToolbarItems(), []);
  // Split the registry into the two rows (ADR-0031 two-row amendment): Row 1 · Look (view/navigate,
  // always live) and Row 2 · Do (build/manage, its authoring cluster pen-gated). Each row is its own
  // <Toolbar> so grouping/overflow stay per-row and the primitive is unchanged.
  const rows = useMemo(() => splitByRow(items), [items]);

  // "Press ? for keyboard shortcuts" (ADR-0031 amendment) — scoped to the workspace region rather than
  // the whole document (WCAG 2.1.4: a single-character shortcut must not be globally active). The
  // listener is attached to the workspace root element, so it only fires when focus is inside it
  // (keydown bubbles from the canvas or a toolbar control), mirroring the listbox-scoped `?` in
  // TsldPanel. Ignore it while typing in a field, and don't stack the sheet on an already-open plan
  // dialog / edit form (whose modal keydown still bubbles to this root).
  const openShortcuts = canvasUi.setShowHelp;
  const rootRef = useRef<HTMLDivElement>(null);
  // "A modal is open" — the plan dialogs + the edit-plan form + the activity edit/delete dialogs.
  // Gates both the `?` shortcut (don't stack the sheet on an open modal) and the undo/redo keybindings
  // (don't mutate plan state from beneath an open `ConfirmDialog`/`ActivityFormDialog`, ADR-0048).
  const anotherDialogOpen =
    dialog !== null ||
    model.editing ||
    model.editActivityId !== null ||
    model.deleteActivityId !== null;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (anotherDialogOpen) return;
      event.preventDefault();
      openShortcuts(true);
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [openShortcuts, anotherDialogOpen]);

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
  const [bodyWidth, setBodyWidth] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setBodyHeight(rect.height);
      setBodyWidth(rect.width);
    });
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

  // Docked notes panel (entry-route win 1): a right-side sibling of the bottom activity panel — a
  // resizable, collapsible RIGHT column that participates in the layout (pushes the canvas, never
  // overlays), toggled by the Comments button (`model.notesOpen`). Width is persisted like the activity
  // panel's height. The effective max reserves {@link CANVAS_MIN_WIDTH} for the canvas as a best-effort
  // FLOOR — like the activity panel's height variant, it's clamped only against this body's width, so a
  // narrow viewport (or another panel/rail open near the breakpoint) can still leave the canvas below it.
  const notesPanel = useNotesPanelPrefs();
  const notesDockActive = NOTES_ENABLED && ENTRY_ROUTES_ENABLED && model.notesOpen;
  const notesEffectiveMax = Math.min(
    NOTES_PANEL_MAX_WIDTH,
    Math.max(NOTES_PANEL_MIN_WIDTH, bodyWidth - CANVAS_MIN_WIDTH),
  );
  const notesWidth = Math.min(notesPanel.size, notesEffectiveMax);
  // A right-docked panel grows as the pointer moves left: width = the body's right edge − X.
  const notesPointerToSize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) =>
      (bodyRef.current?.getBoundingClientRect().right ?? 0) - event.clientX,
    [],
  );
  const onNotesResize = useCallback(
    (next: number) => notesPanel.setSize(Math.min(next, notesEffectiveMax)),
    [notesPanel, notesEffectiveMax],
  );
  // Close the dock AND return focus to the Comments toggle (its stable `data-toolbar-item` node under
  // the workspace root) — otherwise unmounting the panel under the focused Close button / focused dock
  // strands focus on <body> (a11y). Used by the header Close button and the Escape handler. Closing via
  // the Comments button itself doesn't go through here (it stays mounted + focused), so no double-move.
  const closeNotes = useCallback(() => {
    setNotesOpen(false);
    rootRef.current?.querySelector<HTMLElement>('[data-toolbar-item="comments"]')?.focus();
  }, [setNotesOpen]);

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

  // Undo/Redo keybindings (ADR-0048 M3.2), scoped to the workspace root (like the `?` shortcut above) —
  // `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` / `Ctrl+Y`, suppressing the browser default via preventDefault
  // (TECH_DEBT #25). Enabled only when the flag is on AND the user can author (holds the pen, not the
  // read-only Late overlay) — the same `authoringEnabled` predicate the toolbar's pen-gated cluster
  // uses, so the keyboard path and the buttons gate identically. Flag-off ⇒ no listener (byte-identical).
  useUndoRedoKeybindings({
    rootRef,
    enabled: UNDO_REDO_ENABLED && model.canEditSchedule && !lateOverlayActive,
    // Inert while any modal is open, so `Ctrl+Z` never mutates plan state under a dialog (ADR-0048).
    modalOpen: anotherDialogOpen,
    undo: model.undoRedo.undo,
    redo: model.undoRedo.redo,
  });

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
      // Bar-end resize (ADR-0052 M2/M3) + lag-anchor drag (M3). Always passed like onReposition;
      // the canvas only arms them under `VITE_CANVAS_DIRECT_MANIPULATION`, so flag-off is
      // byte-for-byte.
      onResize={model.onTsldResize}
      onLag={model.onTsldLag}
      onLink={model.onTsldLink}
      // LOE endpoint-pick span (Stage D, `VITE_CANVAS_ACTIVITY_TYPES`). Gated on the flag so flag-off is
      // byte-for-byte today's canvas — the LOE tool-mode is then unreachable (the Add-menu item is also
      // flag-gated), so the prop is simply absent.
      {...(CANVAS_ACTIVITY_TYPES_ENABLED ? { onLoeSpan: model.createLoeSpan } : {})}
      onAutoArrange={model.onTsldAutoArrange}
      onOpenLogic={model.setLogicActivity}
      onEditActivity={model.onEditActivity}
      onDeleteActivity={model.onDeleteActivity}
      // Entry-route selection-bar actions (Resources / Report progress / Steps). Always passed; each
      // toolbar item is flag-gated, so flag-off is byte-for-byte. Progress is role-gated via
      // `canReportProgress`; Steps hides for a duration-derived selection via `isStepsEligible`.
      onResources={model.onResourcesActivity}
      onProgress={model.onProgressActivity}
      onSteps={model.onStepsActivity}
      canReportProgress={model.canProgress}
      isStepsEligible={(a) => !isDurationDerivedType(a.type)}
      onSelectionChange={model.onSelectionChange}
      onRefresh={model.onTsldRefresh}
      calendar={model.tsldCalendar}
      todayIso={model.todayIso}
      // Baseline overlay lens (VITE_CANVAS_LENSES): reuse the shipped variance rows (route-composed for
      // the activities table) — no new fetch. Absent when the flag is off ⇒ no ghost layer.
      {...(CANVAS_LENSES_ENABLED ? { varianceRows: model.variance.data?.rows } : {})}
      // Resource-view strip (Stage E, ADR-0049): reserve the band + paint the demand bars from the
      // snapshot the ResourceStripPanel below publishes. Inactive ⇒ no band, byte-for-byte today's.
      resourceStripActive={resourceViewActive}
      resourceStrip={stripSnapshot}
      // Over-allocation highlight (Stage E M2): flag the engine-flagged over-allocated bars. Its own
      // mode, independent of the demand strip being open. Flag-off ⇒ false ⇒ byte-for-byte today's.
      overAllocationHighlight={CANVAS_RESOURCE_VIEW_ENABLED && model.overAllocationHighlight}
    />
  );

  // The DOM chrome for the resource strip (picker + reused bucket Select + reused accessible table),
  // overlaid on whichever canvas region is active (its container is `relative`), like the Legend panel.
  // Mounts only when the lens is active; on reveal it moves focus into itself (mirrors the activities
  // panel). It publishes the strip snapshot into the canvas via `onStripSnapshot`.
  const resourceStripPanel =
    resourceViewActive && plan.plannedStart ? (
      <ResourceStripPanel
        orgSlug={model.orgSlug}
        planId={model.planId}
        dataDate={plan.plannedStart}
        onSnapshot={onStripSnapshot}
        focusOnMount
      />
    ) : null;

  // The floating Legend panel is overlaid on whichever canvas region is active (its container is
  // `relative`); it renders null when closed, so dropping it in both layout branches is cheap. Under
  // VITE_CANVAS_LENSES it renders the ACTIVE Colour-by mode's key + the baseline-overlay entry. The band
  // colours come from the **var()** legend palette (`lensLegendVarPalette`), so the swatches are raw
  // `var(--color-*)` inline styles — inherently theme-reactive with zero JS, so the legend never goes
  // theme-stale on a light/dark switch (C1/U3; the canvas fills, which can't use `var()`, re-resolve via
  // `themeVersion` instead). Flag-off it renders today's default key, byte-for-byte.
  const lensLegend = useMemo<LensLegendInfo | undefined>(() => {
    if (!CANVAS_LENSES_ENABLED) return undefined;
    const { colourMode, baselineOverlay } = canvasUi.lensState;
    return {
      colourMode,
      baselineOverlay,
      lateOverlay: lateOverlayActive,
      colour: buildColourLegend(model.activities.data ?? [], colourMode, lensLegendVarPalette()),
    };
  }, [canvasUi.lensState, model.activities.data, lateOverlayActive]);
  const legendPanel = (
    <TsldLegendPanel
      open={legend.open}
      position={legend.position}
      onClose={legend.close}
      onPositionChange={legend.setPosition}
      {...(lensLegend ? { lens: lensLegend } : {})}
    />
  );

  // The docked-notes panel content (entry-route win 1) — the shared `SheetHeader` (title + Close, which
  // toggles the dock shut) over a scrollable, unbounded `PlanNotesSection`. Built once and placed in the
  // wide right column or the narrow single pane. `headingRef` keeps the flag-off scroll target wired.
  const notesDockContent = (
    // A named landmark for the dock (a11y) — "Plan notes panel" so it doesn't collide with the inner
    // note-thread region. Escape closes it (the non-modal dock has no native cancel) and returns focus
    // to Comments; scoped here + `stopPropagation` so it doesn't reach the workspace/canvas handlers.
    // The `onKeyDown` only OBSERVES Escape (it doesn't make the section a widget), so the a11y rule is
    // disabled deliberately, like the PanelResizer separator's listeners.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-label="Plan notes panel"
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          closeNotes();
        }
      }}
    >
      <SheetHeader title="Plan notes" onClose={closeNotes} closeLabel="Close plan notes" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* `chromeless`: the SheetHeader "Plan notes" above is the single header + this `<section>` is
            the landmark, so PlanNotesSection drops its own heading/description/card (ux review). */}
        <PlanNotesSection
          orgSlug={model.orgSlug}
          planId={model.planId}
          canWrite={model.canWriteNotes}
          bounded={false}
          chromeless
        />
      </div>
    </section>
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
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      {/* Slim header: one line — breadcrumb (…→ plan name) + status pill, then compact pen status. */}
      <header className="border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2">
        <h1 className="sr-only">{plan.name}</h1>
        <div className="flex min-w-0 items-center gap-2">
          <Breadcrumbs items={crumbs} />
          <Badge variant="neutral">{PLAN_STATUS_LABELS[plan.status]}</Badge>
          {/* Quick edit-plan affordance for writers, beside the status pill (ADR-0031 amendment) —
              the standalone toolbar Edit-plan button was folded into here + the Summary popover. */}
          {model.canWrite ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => model.setEditing(true)}
              title="Edit plan…"
              aria-label="Edit plan"
              className="text-muted-foreground shrink-0"
            >
              <SquarePen aria-hidden="true" className="size-4" />
            </Button>
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

      {/* Export/print failures surface here as a dismissable `role="alert"` banner (UX review B2) — the
          toolbar commands only announce (sr-only), so this is the sighted-user error surface. Renders
          nothing until an export/print fails; `null` when the flag is off. */}
      {ctx.exportError ? (
        <div className="px-4 pt-2">
          <EditConflictBanner message={ctx.exportError} onDismiss={ctx.dismissExportError} />
        </div>
      ) : null}

      {/* A lossy-but-successful interchange export (ADR-0050 M4d) surfaces here as a dismissable INFO
          banner with an opt-in "Download report" button — the export already downloaded; the report is
          offered on click (not auto-fired, which the browser's multi-download guard can silently block). */}
      {ctx.exportNotice ? (
        <div className="px-4 pt-2">
          <EditConflictBanner
            message={ctx.exportNotice.message}
            severity="info"
            action={{ label: 'Download report', onClick: ctx.exportNotice.downloadReport }}
            onDismiss={ctx.dismissExportNotice}
          />
        </div>
      ) : null}

      {/* Programme scheduling (ADR-0045, VITE_PROGRAMME_SCHEDULING) — renders nothing unless the plan
          has live cross-plan links, so the slim toolbar layout is unchanged for an ordinary plan. */}
      {PROGRAMME_SCHEDULING_ENABLED ? (
        <div className="px-4 pt-2">
          <ProgrammeScheduleSection
            orgSlug={model.orgSlug}
            planId={model.planId}
            canRecalc={model.canRecalc}
          />
        </div>
      ) : null}

      {/* Notes (ADR-0046, VITE_NOTES). Entry-route win 1 (`VITE_ENTRY_ROUTES`): when on, the notes live
          in a docked, resizable RIGHT panel inside the body below (toggled by Comments), so the always-
          inline block renders ONLY flag-off — byte-for-byte the prior behaviour. */}
      {NOTES_ENABLED && !ENTRY_ROUTES_ENABLED ? (
        <div className="px-4 pt-2">
          <PlanNotesSection
            orgSlug={model.orgSlug}
            planId={model.planId}
            canWrite={model.canWriteNotes}
            bounded
            headingRef={notesHeadingRef}
          />
        </div>
      ) : null}

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
          // Wide: a HORIZONTAL split — the canvas+activities vertical stack (left) beside the docked
          // notes panel (right, when open). Opening notes narrows the canvas; closing restores it.
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {/* Full-height chromeless canvas — the toolbar hosts its controls; the floating Legend
                  panel (when open) is overlaid via the `relative` container. */}
              <div className="relative flex min-h-0 flex-1 flex-col gap-2 px-4 pt-2 pb-2">
                {canvas}
                {legendPanel}
                {resourceStripPanel}
              </div>

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
            </div>

            {/* Docked notes panel (entry-route win 1) — a resizable RIGHT column that pushes the canvas,
                never overlays; toggled by Comments. Its vertical splitter sets the width. */}
            {notesDockActive ? (
              <>
                <PanelResizer
                  orientation="vertical"
                  size={notesWidth}
                  min={NOTES_PANEL_MIN_WIDTH}
                  max={notesEffectiveMax}
                  label="Resize notes panel"
                  onResize={onNotesResize}
                  pointerToSize={notesPointerToSize}
                  // End-anchored (right dock): pointer-drag LEFT grows it, so invert the arrow keys to
                  // match (Left = grow, Right = shrink) — otherwise keyboard contradicts the pointer.
                  reverseKeys
                  className="bg-border/60 hover:bg-border focus-visible:bg-ring"
                />
                <div
                  style={{ width: notesWidth }}
                  className="border-border bg-card shrink-0 border-l"
                >
                  {notesDockContent}
                </div>
              </>
            ) : null}
          </div>
        ) : notesDockActive ? (
          // Narrow: a right dock doesn't fit — notes takes the single pane (the one-pane-at-a-time
          // narrow philosophy). Closing (the header Close, or the Comments toggle) restores the toggle.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{notesDockContent}</div>
        ) : (
          <>
            <WorkspaceViewToggle value={pane} onChange={setPane} />
            <div
              className={cn(
                'relative min-h-0 flex-1 flex-col gap-2 px-4 pt-2 pb-2',
                pane === 'diagram' ? 'flex' : 'hidden',
              )}
            >
              {canvas}
              {legendPanel}
              {/* Below `md` the strip rides the Diagram pane (no third pane) — Q3 / ADR-0049. */}
              {resourceStripPanel}
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

      {/* The progress editor (toolbar Report-progress + the entry-route selection-bar Report-progress)
          now lives in the shared `PlanDialogs`, so it's mounted once for whichever canvas layout is
          active and both entry points open the same dialog. */}
    </div>
  );
}
