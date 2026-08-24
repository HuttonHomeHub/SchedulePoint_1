import type { ActivitySummary } from '@repo/types';
import { SquarePen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActivityBottomPanel, ActivityPanelCollapsedBar } from './activity-bottom-panel';
import { ActivityCrudDialogs } from './activity-crud-dialogs';
import { CanvasDock, CanvasDockProvider } from './canvas-dock';
import { PlanChromeDialogs } from './plan-chrome-dialogs';
import { PlanDialogs } from './plan-dialogs';
import { PlanShortcutsHelp } from './PlanShortcutsHelp';
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
import { usePlanWorkspaceKeyScope } from './use-plan-workspace-key-scope';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';
import { WorkspaceViewToggle, type WorkspacePane } from './workspace-view-toggle';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ChromePortal } from '@/components/layout/chrome/chrome-slot';
import { useRegisterShortcutsAction } from '@/components/layout/chrome/help-action';
import { PlanStatusBar } from '@/components/layout/status/plan-status-bar';
import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { SheetHeader } from '@/components/ui/sheet';
import { Deck, Toolbar, splitByRow } from '@/components/ui/toolbar';
import { ToolbarBandProvider } from '@/components/ui/toolbar/toolbar-band';
import { useMediaQuery } from '@/components/ui/use-media-query';
import {
  CANVAS_AUTHORING_ENABLED,
  CANVAS_ACTIVITY_TYPES_ENABLED,
  ACTIVITY_COPY_PASTE_ENABLED,
  CANVAS_LENSES_ENABLED,
  CANVAS_SEARCH_NAV_ENABLED,
  CANVAS_RESOURCE_VIEW_ENABLED,
  ENTRY_ROUTES_ENABLED,
  FLOAT_PATHS_ENABLED,
  NOTES_ENABLED,
  PROGRAMME_SCHEDULING_ENABLED,
  SCHEDULING_MODES_ENABLED,
  UNDO_REDO_ENABLED,
} from '@/config/env';
import { isDurationDerivedType } from '@/features/activities';
import { useUpdateActivityParents } from '@/features/activities';
import { useUpdateActivityFields } from '@/features/activities/api/use-activities';
import {
  FloatPathsPanel,
  useFloatPathsPanelPrefs,
  FLOAT_PATHS_PANEL_MIN_WIDTH,
} from '@/features/float-paths';
import { GanttPanel, usePlanViewMode } from '@/features/gantt';
import type { GanttBarDrag } from '@/features/gantt/model/bar-drag';
import { useGanttGridEditing } from '@/features/gantt/model/use-gantt-grid-editing';
import { useGanttViewState } from '@/features/gantt/model/use-gantt-view-state';
import { PlanNotesSection } from '@/features/notes';
import {
  buildSelectionBarContext,
  type SelectionContextInput,
} from '@/features/plan-actions/build-selection-context';
import { SelectionActionsBar } from '@/features/plan-actions/selection-actions';
import { CompactPenStatus } from '@/features/plan-lock';
import { PLAN_STATUS_LABELS } from '@/features/plans';
import { ProgrammeScheduleSection, useScheduleSummary } from '@/features/schedule';
import { TsldPanel, barDateSourceFor } from '@/features/tsld';
import { EditConflictBanner } from '@/features/tsld/components/EditConflictBanner';
import { type LensLegendInfo } from '@/features/tsld/components/TsldLegend';
import { TsldLegendPanel } from '@/features/tsld/components/TsldLegendPanel';
import { buildColourLegend } from '@/features/tsld/render/lenses';
import { lensLegendVarPalette } from '@/features/tsld/render/palette';
import type { ResourceStripSnapshot } from '@/features/tsld/render/resource-strip';
import { clearVisualPlacementGate } from '@/features/tsld/toolbar/conflict-remedy';
import { buildTsldToolbarItems } from '@/features/tsld/toolbar/tsld-toolbar-items';
import { useLegendPanelPrefs } from '@/features/tsld/toolbar/use-legend-panel-prefs';
import { useMinimapPanelPrefs } from '@/features/tsld/toolbar/use-minimap-panel-prefs';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import {
  useTsldToolbarContext,
  type PlanDialogKind,
} from '@/features/tsld/toolbar/use-tsld-toolbar-context';
import { effectiveHoursPerDay } from '@/lib/effective-hours-per-day';
import { cn } from '@/lib/utils';

/** The `md` breakpoint (48rem) — at/above it the canvas + bottom panel split; below it, one pane. */
const MD_QUERY = '(min-width: 48rem)';

/**
 * The mode row's `lens` group name (ADR-0091 D1). Overridden because the shared default is
 * "Display", which is simultaneously Row 1's `lens` group name — leaving two on-screen regions with
 * one name, and announcing "Plan mode, toolbar" then "Display, group" for a cluster that is neither.
 */
const ROW_MODE_GROUP_LABELS = { lens: 'Scheduling and view' } as const;

/**
 * **The row-purpose captions are gone** (ADR-0090 M2-T6, landed at M5 — see below).
 *
 * A ux review once asked for them, and the plan committed to removing them again with the
 * replacement stated: each `role="group"` keeps its own visible hairline and its own accessible
 * name, and after M2's consolidation the rows are short enough to read without a gutter telling you
 * what they are. That is the trade, said out loud rather than quietly reversed.
 *
 * **One edit fixed three things.** 64 px of gutter per row; the collision where "Navigate" was both
 * the visible Row-1 caption and the `frame` group's `aria-label`, so AT announced it twice; and the
 * ux finding that neither caption described more than a fraction of its row — Row 1's "Navigate"
 * captioned five taxonomy groups, most of which do not navigate.
 *
 * **It is recorded here because it did not ship when it was supposed to.** M2-T6 specified this as
 * concrete steps, M2 shipped without them, and neither ADR-0090's "as built" section nor
 * `docs/TECH_DEBT.md` recorded the omission — a committed-to fix that silently did not happen,
 * which is the mirror image of the drift ADR-0058 was written about. The M5 ux gate found it.
 */

/**
 * The **canvas-maximal, toolbar-hosted** plan workspace (ADR-0031) — and, since ADR-0088 D3 retired
 * `VITE_CANVAS_TOOLBAR` and deleted the ADR-0030 layout that flag selected, the **only** plan
 * workspace there is (`PlanWorkspace` is now a thin re-export of this component).
 * It collapses the ADR-0030 chrome bands into a **one-line header**
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
  const minimap = useMinimapPanelPrefs();
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
      // The other half of the one-dock-at-a-time rule: revealing Comments closes Float paths.
      model.floatPaths.close();
      setNotesOpen((open) => !open);
      return;
    }
    const el = notesHeadingRef.current;
    // No explicit `behavior` — let the app's global `prefers-reduced-motion` CSS `scroll-behavior`
    // opt-out govern it (A3); an explicit `behavior: 'smooth'` would bypass that (mirrors
    // `features/plan-lock/lib/use-pen-lock-view.ts`, which omits `behavior` deliberately).
    el?.scrollIntoView({ block: 'start' });
    el?.focus();
  }, [setNotesOpen, model.floatPaths]);
  // **The right edge holds one dock at a time** (audit F4). Notes and Float paths are both docked
  // right columns, and each reserves `CANVAS_MIN_WIDTH` for the diagram only as a best-effort floor
  // (see `notesEffectiveMax` below) — two of them plus the Project Explorer rail on a 1280 px screen
  // leaves the picture unreadable, which is the half of the analysis that needs the pixels. So
  // opening one closes the other, here in the workspace that lays them out rather than in either
  // feature, which would have to know about a column it does not render.
  const floatPaths = model.floatPaths;
  const openFloatPathsWith = floatPaths.openWith;
  const closeFloatPaths = floatPaths.close;
  const floatPathsSelectedId = model.selectedActivityId;
  // Close the dock AND return focus to the toolbar item — the notes dock's `closeNotes` rule,
  // copied deliberately. The panel's own Close button and its Escape handler both go through this,
  // not through the raw `close`: unmounting the focused Close button with nothing to catch focus
  // strands it on `<body>` (WCAG 2.4.3), which is what shipped until the a11y gate found it.
  //
  // Searched from `document`, not `rootRef`: the toolbar lives in the chrome band and is not a
  // DOM descendant of the workspace root.
  const closeFloatPathsAndFocus = useCallback(() => {
    closeFloatPaths();
    // **Falls back to the `⋯` trigger, and that is not defensive coding.** ADR-0090 M2 moved this
    // command to tier 3, so it is a menu item that UNMOUNTS with the menu the moment it is chosen —
    // by the time the panel closes there is no `[data-toolbar-item="float-paths"]` to return to, and
    // focus was landing on `<body>` (WCAG 2.4.3). The `⋯` is the stable ancestor of wherever the
    // command actually lives, so it is the honest destination: the planner is returned to the
    // control they opened this from. Found by `e2e-float-paths`, which asserts the restore — no unit
    // test could, because the element only goes missing once a real menu closes.
    const target =
      document.querySelector<HTMLElement>('[data-toolbar-item="float-paths"]') ??
      document.querySelector<HTMLElement>('[data-toolbar-item="__overflow__"]');
    target?.focus();
  }, [closeFloatPaths]);

  const toggleFloatPaths = useCallback(() => {
    if (floatPaths.open) {
      closeFloatPathsAndFocus();
      return;
    }
    // The ladder already refuses the no-selection case, so this is a guard rather than a branch a
    // planner reaches: a target is required, never inferred (CQ-2).
    if (floatPathsSelectedId === null) return;
    setNotesOpen(false);
    openFloatPathsWith(floatPathsSelectedId);
  }, [
    floatPaths.open,
    closeFloatPathsAndFocus,
    openFloatPathsWith,
    floatPathsSelectedId,
    setNotesOpen,
  ]);

  // The view switch is router-backed, so the workspace (which is inside the router) owns it and
  // passes it down — exactly like `legend` and `revealComments`. Keeping `useNavigate` out of the
  // toolbar-context builder means the six spec files that render that builder standalone need no
  // router of their own.
  const [planView, setPlanView] = usePlanViewMode();
  // Hoisted above the toolbar context because the PRINT path needs both, and re-deriving them
  // there would be the second derivation `host-parity.structural.test.ts` exists to prevent —
  // on the one artefact where a disagreement is least visible and most costly.
  const lateOverlayActive = SCHEDULING_MODES_ENABLED && canvasUi.viewToggles.lateOverlay;

  const barDateSource = SCHEDULING_MODES_ENABLED
    ? barDateSourceFor(plan.schedulingMode, canvasUi.viewToggles.lateOverlay)
    : 'early';

  /**
   * The Duration column's day↔minute factor, per activity (ADR-0068), resolved HERE rather than in
   * `GanttPanel`.
   *
   * That panel has never known what a calendar is, and handing it the list so it could `.find()` per
   * row would make a display component a consumer of the calendar query — ADR-0089 D2b's rule for a
   * cross-scope fact is that the host resolves it and passes a plain value.
   *
   * One derivation, deliberately, even though only one host consumes it today: the canvas needs the
   * same factor the moment M3's drag parses a typed duration, and two spellings of "how long is a
   * day here" would disagree about what `4h` means in two views of one plan — `barDateSource` one
   * field along. `host-parity.structural.test.ts` names this as its next candidate row and cannot
   * express it yet, because its `pending` rule asserts a fact reaching the Gantt has also reached
   * the canvas, and this one legitimately has not.
   */
  const hoursPerDayFor = useCallback(
    (activity: ActivitySummary): number | undefined =>
      effectiveHoursPerDay(model.calendars.data ?? [], {
        activityCalendarId: activity.calendarId ?? '',
        ...(plan.calendarId == null ? {} : { planCalendarId: plan.calendarId }),
      }),
    [model.calendars.data, plan.calendarId],
  );

  // The Gantt's view memory (ADR-0095 M5-T6): sort, hidden columns and the collapse set in the URL.
  // Held HERE rather than in the panel because two surfaces read it — the grid itself and the
  // `View ▾` Columns chooser — and a second copy is the drift `barDateSource` and the float-path
  // set were both lifted to this file to end.
  const ganttViewState = useGanttViewState();
  const updateParents = useUpdateActivityParents(model.orgSlug, model.planId);

  const ctx = useTsldToolbarContext({
    model,
    plan,
    canvasUi,
    openDialog: setDialog,
    legend: { open: legend.open, toggle: legend.toggle },
    minimap: { open: minimap.open, toggle: minimap.toggle },
    revealComments,
    toggleFloatPaths,
    planView,
    setPlanView,
    barDateSource,
    hoursPerDayFor,
    // Only in the Gantt: the diagram has no columns to choose, so the group is ABSENT there rather
    // than shaded (ADR-0082's omit branch — a thing the projection cannot do, not a permission).
    ganttColumns:
      planView === 'gantt'
        ? { hidden: ganttViewState.hiddenColumns, setHidden: ganttViewState.onHiddenColumnsChange }
        : undefined,
  });
  const items = useMemo(() => buildTsldToolbarItems(), []);
  // Split the registry into the two rows (ADR-0031 two-row amendment): Row 1 · Look (view/navigate,
  // always live) and Row 2 · Do (build/manage, its authoring cluster pen-gated). Each row is its own
  // <Toolbar> so grouping/overflow stay per-row and the primitive is unchanged.
  const rows = useMemo(() => splitByRow(items), [items]);

  // "Press ? for keyboard shortcuts" (ADR-0031 amendment) — scoped to the workspace region rather than
  // the whole document (WCAG 2.1.4: a single-character shortcut must not be globally active). The
  // handler is bound to the workspace root, so it only fires when focus is inside it (keydown
  // bubbles from the canvas or a toolbar control — through the chrome portal too, since React
  // events follow the React tree), mirroring the listbox-scoped `?` in TsldPanel. Ignore it while
  // typing in a field, and don't stack the sheet on an already-open plan dialog / edit form.
  const showShortcuts = useCallback(() => canvasUi.setShowHelp(true), [canvasUi]);
  // Offer the sheet to the shell's account menu for as long as a plan is open (ADR-0091 M7-S5).
  // The `?` binding below and the toolbar's former `shortcuts` item both opened this same callback;
  // only the entry point moved, so the dialog and its state stay exactly where they were.
  useRegisterShortcutsAction(showShortcuts);
  const rootRef = useRef<HTMLDivElement>(null);
  // "A modal is open" — the plan dialogs + the edit-plan form + the activity edit/delete dialogs.
  // Gates both the `?` shortcut (don't stack the sheet on an open modal) and the undo/redo keybindings
  // (don't mutate plan state from beneath an open `ConfirmDialog`/`ActivityCreateDialog`, ADR-0048).
  // `editorIntent` is listed because it is the state
  // that opens the editor — `editActivityId` is never set on that path, so without this line the
  // undo/redo chords were live underneath the open editor, which is the exact thing this guard
  // exists to prevent.
  const anotherDialogOpen =
    dialog !== null ||
    model.editing ||
    model.editActivityId !== null ||
    model.editorIntent !== null ||
    model.deleteActivityId !== null ||
    model.dissolveActivityId !== null ||
    // The band-copy confirmation is a modal like the rest: Ctrl+Z or Ctrl+V beneath it would mutate
    // the plan the dialog is asking about.
    model.duplicateBandId !== null;

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

  // The Float paths dock (audit F4) — the notes dock's sibling, on the same shared resizable-panel
  // prefs, with its own storage key and its own clamp. Mutually exclusive with notes; see
  // `toggleFloatPaths` above for why.
  const floatPathsPrefs = useFloatPathsPanelPrefs();
  const floatPathsDockActive = FLOAT_PATHS_ENABLED && floatPaths.open;
  const floatPathsEffectiveMax = Math.min(
    NOTES_PANEL_MAX_WIDTH,
    Math.max(FLOAT_PATHS_PANEL_MIN_WIDTH, bodyWidth - CANVAS_MIN_WIDTH),
  );
  const floatPathsWidth = Math.min(floatPathsPrefs.size, floatPathsEffectiveMax);
  const floatPathsPointerToSize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) =>
      (bodyRef.current?.getBoundingClientRect().right ?? 0) - event.clientX,
    [],
  );
  const onFloatPathsResize = useCallback(
    (next: number) => floatPathsPrefs.setSize(Math.min(next, floatPathsEffectiveMax)),
    [floatPathsPrefs, floatPathsEffectiveMax],
  );
  // Close the dock AND return focus to the Comments toggle (its stable `data-toolbar-item` node under
  // the workspace root) — otherwise unmounting the panel under the focused Close button / focused dock
  // strands focus on <body> (a11y). Used by the header Close button and the Escape handler. Closing via
  // the Comments button itself doesn't go through here (it stays mounted + focused), so no double-move.
  //
  // Searched from `document`, NOT from `rootRef`: the toolbar's DOM node lives in the chrome band
  // (ADR-0055 §3) and is not a DOM descendant of the workspace root, so a root-scoped query
  // silently found nothing and stranded focus. Only one plan workspace is mounted at a time, so
  // the attribute is unambiguous document-wide.
  const closeNotes = useCallback(() => {
    setNotesOpen(false);
    document.querySelector<HTMLElement>('[data-toolbar-item="comments"]')?.focus();
  }, [setNotesOpen]);

  // Canvas-first authoring makes the empty canvas an *interactive, drawable* surface, so it must not
  // be shown while the activities/dependencies are still loading — an empty array then reads as a
  // genuinely blank plan and invites a draw into data that's about to arrive (ux review). Until they
  // resolve, show a loading placeholder distinct from the empty state. (Flag-off the empty canvas is
  // inert, so this window is harmless and we keep the byte-for-byte render.)
  const canvasLoading =
    CANVAS_AUTHORING_ENABLED && (model.activities.isPending || model.dependencies.isPending);

  // The project finish, for the canvas's recalculation-settle announcement. The SAME query the
  // toolbar's pinned Finish chip already runs, so this is a cache read and adds no request; a recalc
  // invalidates the key, which is exactly the value the settle needs to compare.
  const scheduleSummary = useScheduleSummary(model.orgSlug, model.planId);

  // The read-only Late-start overlay (ADR-0033 M4) suppresses all editing. Derive it once so the
  // canvas, the toolbar's authoring group, and the explanatory note stay in lock-step — otherwise the
  // tools read as live while doing nothing on the canvas (ux/a11y review).
  // The canvas commands the docked selection bar offers (ADR-0090 M2-T1). Assembled HERE because
  // this is where both halves already live — `canvasUi` owns isolation, `ctx` owns the viewport
  // commands — and passed to `TsldPanel` as one prop, so that component never learns what isolating
  // means. Memoised: `selectionCtx` is a `useMemo` dependency down there, and a fresh object each
  // render would rebuild the bar's context on every frame of a pan.
  const selectionCanvas = useMemo(
    () => ({
      isolateActive: canvasUi.navState.isolateActive,
      isolateMode: canvasUi.navState.isolateMode,
      toggleIsolate: canvasUi.toggleIsolate,
      setIsolateMode: canvasUi.setIsolateMode,
      zoomToSelection: ctx.zoomToSelection,
    }),
    [
      canvasUi.navState.isolateActive,
      canvasUi.navState.isolateMode,
      canvasUi.toggleIsolate,
      canvasUi.setIsolateMode,
      ctx.zoomToSelection,
    ],
  );

  /**
   * May this reader change the schedule right now — role and pen fused (ADR-0060), minus the
   * Late-start overlay, which is read-only analysis (ADR-0033 M4).
   *
   * **Derived once and shared by both hosts** (M3). It was written inline at the `TsldPanel` mount
   * and `host-parity.structural.test.ts` carried it as a `pending` row with the milestone named,
   * because arming a Gantt drag from `canEditSchedule` alone would let bars move underneath a
   * banner reading "editing is paused" — a second expression of one rule, drifting where nobody
   * looks. That row flips to `required` in the same commit as this hoist.
   */
  const canEdit = model.canEditSchedule && !lateOverlayActive;
  const ganttAnnounce = useAnnounce();

  // The workspace keyboard scope — `?` plus the ADR-0048 undo/redo accelerators — as ONE React
  // handler bound to the workspace root. React events follow the React tree, so this keeps working
  // when the toolbar is portalled into the chrome band (ADR-0055 S2); the two native listeners it
  // replaces would have gone silently deaf there. Undo/redo is live only when the flag is on AND
  // the user can author (holds the pen, not the read-only Late overlay) — the same predicate the
  // toolbar's pen-gated cluster uses, so keyboard and buttons gate identically.
  const onWorkspaceKeyDown = usePlanWorkspaceKeyScope({
    modalOpen: anotherDialogOpen,
    onShowShortcuts: showShortcuts,
    undoRedoEnabled: UNDO_REDO_ENABLED && model.canEditSchedule && !lateOverlayActive,
    undo: model.undoRedo.undo,
    redo: model.undoRedo.redo,
    // Copy/paste ride the SAME gate as undo/redo — flag on, and the planner can actually author.
    // A copy alone is a read, but the paste it exists to feed is not, and a `Ctrl+C` that works
    // followed by a `Ctrl+V` that refuses is a worse dead end than a shortcut that is simply off.
    clipboardEnabled: ACTIVITY_COPY_PASTE_ENABLED && model.canEditSchedule && !lateOverlayActive,
    onCopy: model.copySelection,
    onPaste: () => void model.pasteClipboard(),
  });

  // The chromeless canvas is built once and placed in whichever layout (wide split / narrow pane) is
  // active, so it isn't described twice and its viewport survives a pane switch. Remount per plan so
  // selection/viewport state never leaks across a plan→plan nav.
  // ONE derivation of which persisted dates draw a bar, handed to both hosts (ADR-0033). Written as
  // a single binding rather than the same expression twice, for the reason the architecture review
  // gave about its sibling `canEdit`: two copies of a host-shared value drift, and a drift between
  // two views of one plan is invisible from either view alone. Pinned by
  // `gantt-canvas-bar-dates.test.tsx`, which asserts both hosts receive the identical value.

  // The partial PATCH (ADR-0060 §4), not the whole-definition one — a cell writes a slice.
  const updateActivityFields = useUpdateActivityFields(model.orgSlug, model.planId);

  /**
   * In-grid editing for the Gantt (M2). Built here because it needs the workspace's OWN mutation
   * and undo recorder — the grid must not open a second write path to an activity (spec F5), and
   * `recordActivityUpdate` is already a no-op when `VITE_UNDO_REDO` is off, so this needs no flag.
   *
   * Deliberately NOT a `host-parity` PLAN_FACT. The canvas edits an activity through its own
   * gestures and the editor dialog, not through grid cells, so there is nothing on the other host
   * for this to reach — the same reading that kept `hoursPerDayFor` out of that register, and for
   * the same reason: the rule there is about a fact BOTH projections must agree on, and a cell
   * editor is a property of one surface.
   */
  const ganttEditing = useGanttGridEditing({
    activities: model.activities.data ?? [],
    gating: model.activityEditorGating,
    // The same question the panel asks before it draws a chart: has anything been scheduled? Read
    // from the rows rather than a plan flag, so it cannot disagree with what the grid is showing.
    hasComputedSchedule: (model.activities.data ?? []).some((a) => a.earlyStart !== null),
    barDateSource,
    hoursPerDayFor,
    updateFields: updateActivityFields.mutateAsync,
    announce: ganttAnnounce,
    // Focus returns to the row the cell closed on (WCAG 2.4.3). The panel exposes no row handle, so
    // this asks the grid to restore its own roving stop — the smallest seam that keeps focus inside
    // the widget rather than dropping it to `<body>`.
    onCellClosed: () => {
      document.querySelector<HTMLElement>('[role="treegrid"] [role="row"][tabindex="0"]')?.focus();
    },
    recordUpdate: model.recordActivityUpdate,
  });

  /**
   * Moving a bar in the Gantt (M3).
   *
   * Both writes are the workspace's own — no new path — and both omit `laneIndex`, which makes "a
   * Gantt drag never changes lane" structural rather than a rule: the Gantt has no lane axis, and
   * a vertical drag there is a row-reorder question this milestone does not answer.
   *
   * The refusal sentence comes from the editor's gate object rather than being written here, so a
   * planner told why a bar will not move and a planner told why a field will not save are reading
   * the same rule (ADR-0060 §6).
   */
  const ganttDrag: GanttBarDrag = {
    canEdit,
    reason: model.activityEditorGating.general.reason,
    plannedStartIso: plan.plannedStart ?? null,
    moveTo: (activityId, startDay) => void model.onTsldReposition({ activityId, startDay }),
    resizeTo: (activityId, durationDays) => void model.onTsldResize({ activityId, durationDays }),
    // The SHARED polite live region (`components/ui/announcer`), not a second one. ADR-0073 C1
    // found two empty states collapsed into one sentence in the single channel a screen-reader user
    // has; a second region would be the same class of problem — two channels competing to be that
    // one channel.
    announce: ganttAnnounce,
  };

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
      // ADR-0033, via the single binding above — the Gantt receives the identical value.
      barDateSource={barDateSource}
      // The Late overlay is read-only analysis — suppress editing while it's on (ADR-0033 M4).
      canEdit={canEdit}
      scheduleRefusal={model.scheduleRefusal}
      onCreate={model.onTsldCreate}
      onReposition={model.onTsldReposition}
      // Bar-end resize (ADR-0052 M2/M3) + lag-anchor drag (M3). Always passed like onReposition;
      // the canvas only arms them under `VITE_CANVAS_DIRECT_MANIPULATION`, so flag-off is
      // byte-for-byte.
      onResize={model.onTsldResize}
      onLag={model.onTsldLag}
      onLink={model.onTsldLink}
      // What a recalculation SETTLED (M5): the shared ADR-0032 coalescer's in-flight flag marks the
      // settle edge, and the summary's finish is the second fact. Both read-only — supplying them
      // does not make the panel trigger a recalculation, only describe one.
      recalcPending={model.autoRecalc.isPending}
      projectFinish={scheduleSummary.data?.projectFinish ?? null}
      // LOE endpoint-pick span (Stage D, `VITE_CANVAS_ACTIVITY_TYPES`). Gated on the flag so flag-off is
      // byte-for-byte today's canvas — the LOE tool-mode is then unreachable (the Add-menu item is also
      // flag-gated), so the prop is simply absent.
      {...(CANVAS_ACTIVITY_TYPES_ENABLED ? { onLoeSpan: model.createLoeSpan } : {})}
      // Quiescence during an open two-click pick + the ADR-0048 inverse the link confirmation
      // offers (ADR-0064 T5/T7) — the same three the legacy layout passes.
      //
      // **They were absent here, and this is the host that ships** — `plan-workspace.tsx` selected
      // it whenever `CANVAS_TOOLBAR_ENABLED` (default-on) until ADR-0088 D3 retired that flag and
      // left this the only host: `docs/TECH_DEBT.md` #103. So ADR-0064's
      // recalculation hold was `undefined` on the one surface planners use — the mechanism built
      // because six link attempts produced zero dependencies — and `CanvasModeBand.tsx:98` renders
      // the confirmation's Undo only when `onUndo` is passed, so that button had never appeared at
      // all, including through the §7 gate pass that found a defect in it.
      //
      // The third was found by diffing the two hosts' whole prop lists rather than fixing the two
      // the register named. Do that, not this, when a host divergence turns up.
      recalcHold={model.autoRecalcHold}
      dropLinkPickSignal={model.dropLinkPickSignal}
      onUndoLastEdit={model.undoRedo.canUndo ? model.undoRedo.undo : undefined}
      onAutoArrange={model.onTsldAutoArrange}
      onOpenLogic={model.onOpenLogic}
      onEditActivity={model.onEditActivity}
      onDeleteActivity={model.onDeleteActivity}
      // The plural selection's three operations (`docs/specs/canvas-multi-select/` M4). This is the
      // layout the toolbar flag selects, i.e. the one a planner actually gets — wiring only its
      // sibling `plan-workspace.tsx` left the bar unreachable in the shipped app while every unit
      // suite passed. Found by the flag-on journey; the same "applied to one host and not its
      // neighbour" shape ADR-0064 §7 records.
      bulk={model.bulkOperations}
      onDissolveSummary={model.onDissolveSummary}
      onDuplicateActivity={(a) => void model.onDuplicateActivity(a)}
      onDuplicateBand={model.onDuplicateBand}
      // Entry-route selection-bar actions (Resources / Report progress / Steps). Always passed; each
      // toolbar item is flag-gated, so flag-off is byte-for-byte. Progress is role-gated via
      // `canReportProgress`; Steps hides for a duration-derived selection via `isStepsEligible`.
      onResources={model.onResourcesActivity}
      onProgress={model.onProgressActivity}
      onSteps={model.onStepsActivity}
      canReportProgress={model.canProgress}
      isStepsEligible={(a) => !isDurationDerivedType(a.type)}
      // The conflict remedies (ADR-0094 M4), and the `clear-visual-placement` action M4-T1 moved off
      // the command surface onto the selection bar. The gate is computed HERE because it reads the
      // plan's `schedulingMode` and the Late-start overlay, neither of which `TsldPanel` owns — and
      // it is the SHARED `clearVisualPlacementGate`, so the bar and any future caller cannot drift
      // about what "you cannot clear this" means. `hasSelection` is `true` by construction: this bar
      // renders only for a selection (the ADR-0090 M2-T1 argument).
      clearPlacement={clearVisualPlacementGate({
        schedulingMode: plan?.schedulingMode === 'VISUAL' ? 'VISUAL' : 'EARLY',
        canEditSchedule: model.canEditSchedule,
        lateOverlayActive,
        hasSelection: true,
        scheduleRefusal: model.scheduleRefusal,
      })}
      onClearVisualPlacement={(a) => void model.clearVisualPlacement(a.id, a.version)}
      onOpenEditorAt={model.onOpenActivityEditorAt}
      onSelectionChange={model.onSelectionChange}
      onPluralSelectionChange={model.onPluralSelectionChange}
      onRefresh={model.onTsldRefresh}
      calendar={model.tsldCalendar}
      todayIso={model.todayIso}
      todayFraction={model.todayFraction}
      // Baseline overlay lens (VITE_CANVAS_LENSES): reuse the shipped variance rows (route-composed for
      // the activities table) — no new fetch. Absent when the flag is off ⇒ no ghost layer.
      {...(CANVAS_LENSES_ENABLED ? { varianceRows: model.variance.data?.rows } : {})}
      // Resource-view strip (Stage E, ADR-0049): reserve the band + paint the demand bars from the
      // snapshot the ResourceStripPanel below publishes. Inactive ⇒ no band, byte-for-byte today's.
      resourceStripActive={resourceViewActive}
      resourceStrip={stripSnapshot}
      minimapActive={minimap.open}
      onMinimapClose={minimap.close}
      // Over-allocation highlight (Stage E M2): flag the engine-flagged over-allocated bars. Its own
      // mode, independent of the demand strip being open. Flag-off ⇒ false ⇒ byte-for-byte today's.
      overAllocationHighlight={CANVAS_RESOURCE_VIEW_ENABLED && model.overAllocationHighlight}
      // Float-path emphasis (audit F4): the ONE derived set, handed to the canvas here and to the
      // Gantt below. Empty unless a path is selected ⇒ no scene field ⇒ byte-for-byte today's paint.
      floatPathIds={floatPaths.emphasisIds}
      selectionCanvas={selectionCanvas}
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

  // The workspace's primary surface: the TSLD canvas, or the Gantt when the view switch says so
  // (ADR-0059 §3). One view at a time, full width — two time-scaled surfaces sharing a screen is
  // worse than either alone. Flag-off `ctx.planView` is hard-wired to `'tsld'`, so this
  // expression is byte-for-byte the canvas and the Gantt subtree never mounts.
  //
  // Selection is workspace state, not view state, so choosing a row here opens the same Logic panel
  // the canvas opens — switching views keeps the activity you were looking at.
  // The ONE emphasis set the Gantt receives (M4). The canvas gets the matches through its own dim
  // seam; both read `ctx.matchedIds`, which `useSearchNavigation` derives once — so the two views
  // cannot disagree about what the search matched, which is the whole point of lifting it.
  const searchNavActive = CANVAS_SEARCH_NAV_ENABLED && ctx.matchedIds.size > 0;
  const ganttEmphasisIds = useMemo<ReadonlySet<string>>(() => {
    if (!searchNavActive) return floatPaths.emphasisIds;
    if (floatPaths.emphasisIds.size === 0) return ctx.matchedIds;
    // Both active ⇒ intersection (see the prop's comment below for why, not union).
    const both = new Set<string>();
    for (const id of ctx.matchedIds) if (floatPaths.emphasisIds.has(id)) both.add(id);
    return both;
  }, [searchNavActive, ctx.matchedIds, floatPaths.emphasisIds]);

  /**
   * Hand focus back to the Gantt grid when the object bar unmounts while holding it.
   *
   * Queries rather than holding a ref because `GanttPanel` exposes none, and the alternative — a new
   * imperative handle — would be a wider change for one callback. It targets the row that is the
   * current roving tab stop (`tabIndex=0`), falling back to the grid itself, so focus lands where
   * the keyboard user left it rather than at the top.
   *
   * Referentially stable, which `SelectionActionsBar` asks for in its own docblock: an unstable
   * `restoreFocus` re-runs its unmount effect and can hand focus back on a render that was not an
   * unmount at all.
   */
  const focusGanttGrid = useCallback(() => {
    const grid = document.querySelector('[role="treegrid"]');
    const stop = grid?.querySelector<HTMLElement>('[role="row"][tabindex="0"]');
    (stop ?? (grid as HTMLElement | null))?.focus();
  }, []);

  /**
   * **The Gantt's object-action context — M1, discharging the ADR-0093 promise.**
   *
   * ADR-0093 took `Report progress` off the command surface because an object action belongs on the
   * object, and its replacement — the canvas dock — was canvas-only. The product owner accepted
   * that on 2026-08-13 **explicitly on the basis that the Gantt would pick it up here**, so until
   * this exists a Contributor working in the Gantt reaches progress only through the activities
   * table's row menu. That is the oldest thing outstanding in this epic.
   *
   * Built by the SAME `buildSelectionBarContext` the canvas uses, with `canvas: null`. Everything
   * else comes from `model`, which already supplies every one of these to `TsldPanel` a hundred
   * lines above — so this is a second CALL, never a second assembly. Two hosts each assembling the
   * object's context is the defect this epic found twice already at one layer up.
   */
  // Not wrapped in `useMemo`: passing `model` wholesale as a dependency made the React Compiler's
  // lint analysis report "Existing memoization could not be preserved". Building the object each
  // render is a handful of closures over values the host already holds.
  //
  // The reason is narrower than this comment first claimed, and the M6 performance gate was right
  // about that half: `babel-plugin-react-compiler` is **not** wired into `vite.config.ts`, so there
  // is no build-time compilation for a manual memo to opt out of. What runs is the analysis inside
  // `eslint-plugin-react-hooks` v7. The memo would also buy nothing today for a second reason
  // measured there — nothing downstream is `React.memo`'d, so a stable reference has no comparison
  // to pass.
  const ganttSelectionInput: SelectionContextInput = {
    // The whole of the difference. The two canvas-only items (zoom-to-selection, isolate) gate
    // on `canvas !== null` and therefore do not render here — absent rather than shaded, because
    // they are things the object cannot do in this projection, not things this reader may not
    // do (ADR-0082's omit branch).
    canvas: null,
    activities: model.activities.data ?? [],
    selectedId: model.selectedActivityId ?? model.logicActivity?.id,
    // The Gantt has no plural selection of its OWN yet (ADR-0080's model is canvas-derived and
    // lifting it is its own slice, spec D4) — but the workspace does, and it survives a view
    // switch. This read `1` unconditionally, so selecting several bars on the canvas and switching
    // to the Gantt offered single-activity actions on ONE of them, which is precisely the
    // inconsistency ADR-0093 recorded and corrected, re-appearing in a third view. Caught by
    // `e2e-workspace-chrome/progress-entry.spec.ts`, whose assertion is the product owner's own
    // condition for removing the command-surface copy.
    //
    // Above one the shared builder returns null, so the Gantt shows NO singular bar — matching the
    // canvas rule that a plural selection is not acted on one object at a time. It shows no plural
    // bar either, because it has no plural model; that is spec D4's slice and is a smaller gap
    // than offering the wrong action.
    selectionCount: model.pluralSelectionActive ? 2 : 1,
    canEditSchedule: model.canEditSchedule,
    scheduleRefusal: model.scheduleRefusal,
    canReportProgress: model.canProgress,
    isStepsEligible: (a) => !isDurationDerivedType(a.type),
    clearPlacement: clearVisualPlacementGate({
      schedulingMode: plan?.schedulingMode === 'VISUAL' ? 'VISUAL' : 'EARLY',
      canEditSchedule: model.canEditSchedule,
      lateOverlayActive,
      hasSelection: true,
      scheduleRefusal: model.scheduleRefusal,
    }),
    onOpenLogic: model.onOpenLogic,
    onEdit: model.onEditActivity,
    onDelete: model.onDeleteActivity,
    onDissolve: model.onDissolveSummary,
    onDuplicate: (a) => void model.onDuplicateActivity(a),
    onDuplicateBand: model.onDuplicateBand,
    onResources: model.onResourcesActivity,
    onProgress: model.onProgressActivity,
    onSteps: model.onStepsActivity,
    onClearVisualPlacement: (a) => void model.clearVisualPlacement(a.id, a.version),
    onOpenEditorAt: model.onOpenActivityEditorAt,
  };

  const ganttSelectionCtx = buildSelectionBarContext(ganttSelectionInput);

  /**
   * One row's menu context (M5-T3), from the SAME input object the bar above is built from — so a
   * row menu and the docked bar cannot offer different things for one activity, and there is no
   * second assembly to keep in step. That identity is the point of `buildSelectionBarContext`
   * existing at all.
   *
   * `selectionCount: 1` is restated rather than inherited: a row menu always acts on its own row,
   * and passing the live count would make every row menu vanish the moment a planner happened to
   * have two bars selected elsewhere.
   */
  const rowMenuContextFor = (activity: ActivitySummary) =>
    buildSelectionBarContext({
      ...ganttSelectionInput,
      selectedId: activity.id,
      selectionCount: 1,
    });

  /**
   * The grid's structure WRITE (M5-T4). The panel decides *where* a row goes — it is the only
   * thing that knows the display order Indent reads — and this supplies the mutation.
   *
   * `useUpdateActivityParents` is the ADR-0063 M4b batch the Members panel and the bulk-assign bar
   * already use, not a second reparent path: it carries each row's `version`, so a stale one
   * rejects the whole write with a 409 rather than half-moving a tree, and it invalidates the
   * baseline variance because `parentId` feeds the engine's WBS rollup.
   */
  const rowStructure = {
    canEditSchedule: model.canEditSchedule,
    penRefusal: model.scheduleRefusal?.('change the structure') ?? null,
    onReparent: (activity: ActivitySummary, parentId: string | null) => {
      updateParents.mutate(
        { parents: [{ id: activity.id, parentId, version: activity.version }] },
        {
          // **Both outcomes are announced, and the failure one is why this exists.**
          // The write has no optimistic update by design, so on a 409 — two planners indenting at
          // once, which this gesture makes easy — the row simply does not move after the refetch,
          // with nothing said. A keyboard or screen-reader planner who pressed Indent then has no
          // way to learn it failed, or why; and a silent no-op is indistinguishable from a control
          // that does nothing. `WbsBulkAssignBar` and `ActivityMembersPanel` already announce this
          // exact class of write (the same ADR-0063 M4b batch) — one correct pattern applied to two
          // controls and not their third, found by the 2026-08-18 reconciliation pass.
          onSuccess: () => {
            ganttAnnounce(
              parentId === null
                ? `${activity.name} moved to the top level.`
                : `${activity.name} filed under its summary.`,
            );
          },
          onError: (error: Error) => {
            ganttAnnounce(`${activity.name} could not be moved. ${error.message}`);
          },
        },
      );
    },
    // M5-T5. The dialog itself is mounted once by `ActivityCrudDialogs`, which already owns the
    // workspace's activity dialogs so their behaviour cannot drift; this only opens it.
    onInsert: model.openInsertActivity,
  };

  const surface =
    ctx.planView === 'gantt' ? (
      <>
        <GanttPanel
          key={`${model.planId}-gantt`}
          activities={model.activities.data ?? []}
          // One zoom control for both projections (ADR-0056 presets, ADR-0059 §2): the toolbar's
          // preset drives the diagram and the chart alike, so switching view keeps the scale.
          zoomLevel={ctx.zoomPreset}
          // Which persisted dates draw each bar — the SAME expression the canvas below receives, for
          // the same reason the float-path set above is shared: two derivations of "where does this
          // bar go" would drift, and the drift would be invisible because each view stays internally
          // consistent. It was worse than drift here — the Gantt had no such input at all and read
          // `earlyStart` unconditionally, so a VISUAL plan's chart and diagram disagreed about every
          // hand-placed bar (`docs/TECH_DEBT.md` #135). Flag-off this is always `early`.
          barDateSource={barDateSource}
          // The Duration column's factor (M2-T1). Host-resolved above, never looked up in the panel.
          hoursPerDayFor={hoursPerDayFor}
          // In-grid editing (M2). Its absence is the read-only grid byte-for-byte, so this prop is
          // the entry point the milestone claims (ADR-0081).
          editing={ganttEditing}
          // Bar movement (M3). `canEdit` is the SHARED binding the canvas receives — the same one,
          // not a second expression of it (`host-parity.structural.test.ts`).
          drag={ganttDrag}
          // The logic overlay (M4). The plan's dependencies are already fetched for the canvas, so
          // this adds no query — and `showAllLinks` reads the SAME `View ▾` toggle store the canvas
          // layers use, rather than a second piece of view state that could disagree about what the
          // planner asked for.
          dependencies={model.dependencies.data ?? []}
          showAllLinks={canvasUi.viewToggles.logicLinks === true}
          // The row menu's context (M5-T3). The SAME builder the dock uses, called per row — so
          // the menu and the bar cannot offer different things for one activity, and there is no
          // second assembly to keep in step.
          rowMenuContextFor={rowMenuContextFor}
          // Sort, columns and the collapse set, made to stick (M5-T6). The SAME object the `View ▾`
          // chooser writes through, so the menu and the grid cannot disagree about what is hidden.
          viewState={ganttViewState}
          // Indent / Outdent (M5-T4). The panel resolves WHERE from its own row order; this is the
          // write.
          rowStructure={rowStructure}
          // The baseline ghost + variance column (ADR-0025's deferred comparison), reusing the
          // variance rows the activities table already fetches — no extra query. Undefined when no
          // baseline is active, and the chart is then byte-for-byte what it was.
          varianceByActivityId={model.varianceByActivityId}
          loading={model.activities.isPending}
          // Selection is workspace state, not view state — which this file already claimed above and
          // did not do. The Gantt fed only `logicActivity`, so the toolbar's selection-aware items
          // (which read `selectedActivityId`) were answering with a stale CANVAS selection while the
          // Gantt showed something else, and were shaded forever in a session that started in the
          // Gantt. Both stores are now written together. Found by the ui-architect review of the
          // Float paths panel, whose "select a row, press Float paths" journey is unbuildable without
          // it (audit F4).
          onSelectActivity={(activity) => {
            model.onSelectionChange(activity.id);
            model.setLogicActivity(activity);
          }}
          selectedActivityId={model.selectedActivityId ?? model.logicActivity?.id}
          // Float-path emphasis (audit F4): the SAME derived set the canvas above receives, so the
          // two views cannot disagree about which activities are on the path. Bring-into-view follows
          // the workspace selection, which the panel lifts when a chain row is activated —
          // scroll only, never focus, so the planner stays in the panel they are reading.
          // Emphasis is one prop with two possible sources (M4). When BOTH a float path and a live
          // search are narrowing, it is their **intersection** — the planner asking for both means
          // "the matches that are also on the path", and a union would emphasise activities neither
          // question selected. Defined here rather than left to whichever happens to be non-empty,
          // because "whichever is set" is not a rule, it is an accident that only shows up when both
          // are on at once.
          emphasisIds={ganttEmphasisIds}
          {...(searchNavActive && ctx.currentMatchId !== null
            ? { bringIntoViewActivityId: ctx.currentMatchId }
            : floatPaths.emphasisIds.size > 0 && model.selectedActivityId !== null
              ? { bringIntoViewActivityId: model.selectedActivityId }
              : {})}
        />
        {/*
          The object-action bar, in the Gantt (M1). `CanvasDock` portals it into the Activities
          handle row when that outlet is registered and renders it in place when it is not — the
          ADR-0092 parity contract, unchanged. It is the SAME `SelectionActionsBar` the canvas
          renders, from the same registry, so the two views cannot offer different actions on the
          same object; only `canvas: null` differs.

          `restoreFocus` hands focus back to the grid when the bar unmounts while holding it. Without
          it, deselecting drops focus to `<body>` and silently disables the workspace accelerators —
          the WCAG 2.4.3 failure ADR-0080's journey found for the bulk delete, which this repo has
          now shipped three times in different costumes.
        */}
        <CanvasDock>
          <SelectionActionsBar context={ganttSelectionCtx} restoreFocus={focusGanttGrid} />
        </CanvasDock>
      </>
    ) : (
      canvas
    );

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

  // The Float paths dock's content (audit F4). `onActivateActivity` is ONE workspace-level seam,
  // so the panel never learns which view is mounted: it lifts the selection and each view reveals
  // it its own way — the canvas pans the selected bar in, the Gantt scrolls its row. Deliberately
  // not `centerOnDate`, which is null whenever the Gantt is showing and would leave half the work
  // silently skipped in half the product (the ADR-0059 M6 shape).
  const floatPathsDockContent = floatPathsDockActive ? (
    <FloatPathsPanel
      model={floatPaths.model}
      selectedPathIndex={floatPaths.selectedPathIndex}
      isPending={floatPaths.isPending}
      isError={floatPaths.isError}
      planNotScheduled={floatPaths.planNotScheduled}
      targetMissing={floatPaths.targetMissing}
      canShowMore={floatPaths.canShowMore}
      suggestedTargetId={floatPaths.suggestedTargetId}
      suggestedTargetName={
        floatPaths.suggestedTargetId === null
          ? null
          : ((model.activities.data ?? []).find((a) => a.id === floatPaths.suggestedTargetId)
              ?.name ?? null)
      }
      onSelectPath={floatPaths.selectPath}
      onSetTarget={floatPaths.setTarget}
      onShowMore={floatPaths.showMore}
      onRetry={floatPaths.retry}
      onClose={closeFloatPathsAndFocus}
      // Offered only to someone who may actually run it — a Viewer gets the explanation without a
      // button that would refuse them.
      {...(model.canRecalc ? { onRecalculate: () => ctx.recalculate() } : {})}
      onActivateActivity={(activityId) => {
        canvasUi.requestSelectActivity(activityId);
        model.onSelectionChange(activityId);
      }}
    />
  ) : null;

  // **Reveal a completed copy.** A clone lands below the plan's lowest lane, so on a 60-lane
  // imported programme a successful duplicate otherwise produces no visible change at all — the
  // planner reads "1 activity duplicated." and sees nothing move. The implementation plan named
  // this as M1's risk (c) and US-1 made it an acceptance criterion; `createdIds` was produced and
  // read by nothing but a count until the M5 enablement pass found it.
  //
  // Reuses the seam Next-conflict and search navigation already use — centre, then lift the
  // selection — rather than a new inbound prop on `TsldPanel`. A second way to say "select this"
  // would fight the panel's own selection, which is the thing that owns it.
  useEffect(() => {
    const id = model.revealActivityId;
    if (id === null) return;
    const activity = (model.activities.data ?? []).find((a) => a.id === id);
    // Only once the row has arrived in the refetched list — a clone the client has not seen yet has
    // no date to centre on, and selecting an unknown id would be a no-op the effect never retries.
    if (activity === undefined) return;
    if (activity.earlyStart !== null)
      canvasUi.canvasControlRef.current?.centerOnDate(activity.earlyStart);
    canvasUi.requestSelectActivity(id);
    model.onSelectionChange(id);
    model.onRevealHandled();
  }, [model, canvasUi]);

  return (
    // The workspace root is an event DELEGATION root, not a control masquerading as one: no role,
    // no tabIndex, no click handler, never focusable itself. It only observes keydowns bubbling
    // from the real focusable controls inside it — the case jsx-a11y cannot distinguish from a
    // fake button. Making it focusable to satisfy the rule would ADD a meaningless tab stop, so
    // the accessible answer here is the disable, not the "fix".
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={rootRef} onKeyDown={onWorkspaceKeyDown} className="flex min-h-0 flex-1 flex-col">
      {/*
        The plan's accessible name for the `<main>` landmark, and it **stays here** while the visible
        identity line moves into the chrome band with the commands (ADR-0090 M4-T2).
        `document.querySelector('h1')` is not the point: a screen-reader user navigating by landmark
        lands in `main`, and a `main` with no heading is a region that does not say what it is. The
        band is outside `main`, so an `<h1>` moved there would name the banner instead.
      */}
      <h1 className="sr-only">{plan.name}</h1>

      {/* The two-row command surface (ADR-0031 two-row amendment). Row 1 · Look is always live; Row 2 ·
          Do carries the pen-gated authoring cluster (shaded as a set when the pen isn't held) beside
          the always-live plan & deliverable actions. Both rows share one `authoringEnabled` — only
          Row 2's `penGated` items react. Row 1 right-aligns its status read-outs (Finish/Summary/Legend). */}
      {/* These two rows portal into the chrome band, so the top of the app reads as one surface.
          Only the DOM node moves — in the React tree they stay right here, which is why `ctx`, the
          registry predicates and the workspace key scope are all untouched by the move. */}
      {/* **The plan identity line, merged into the app header row** (ADR-0097 D1b) — the merge
          ADR-0092 M5 withdrew at "134 px short at 1646", which Landing D1a paid for by moving the
          organisation nav into the rail (+250 px of slack at 1440; `m0-landing-d1-measurement.md`).
          It is a second named slot rather than a second portal API, and the header receives a NODE
          rather than content, so the shell stays plan-unaware (ADR-0029).

          **Tidied, and each cut was measured rather than judged.** The breadcrumb PATH goes (455 px)
          — the Project Explorer shows where you are and now holds the organisation's destinations
          too, so a second answer to the same question is what this landing exists to remove. The
          plan NAME stays, because that is the identity. The pen's badge and its live-region
          sentence go (223–257 px, ADR-0092 M0) — they sat beside a button already reading
          `Stop editing`, which is the redundancy that measurement named.

          Flag-off `ChromePortal` is an identity wrapper, so this renders in place exactly as it did
          before the band existed. */}

      <ChromePortal>
        {/* Publishes the BAND's width to every `<Toolbar>` inside it (`toolbar-band.tsx`), so a
            row's density reflects the surface rather than whatever width is left after its
            siblings. Without it, the project-finish chip beside Row 1 silently costs the four
            viewport commands their labels — measured on a 1646 px screen, shipped in web-v0.86.0. */}
        <ToolbarBandProvider className="border-border flex flex-col border-b">
          {/* **The mode cluster stays in the band, and this is a withdrawal recorded rather than a
              design.** D1b moved it into the header with the rest of the identity line, and the
              header cannot hold it: measured, the identity wants ~1170 px against ~861 px available
              at 1280, so something has to give. Every arrangement that made the header FIT put
              `Early | Visual | Diagram | Gantt` behind a `⋯` — and `e2e-gantt` then failed on the
              view switch, twice, because the one control that gets a planner from the diagram to
              the Gantt was in an overflow menu at every width. Not a locator nit: a real regression
              a browser found.

              So the modes come back here, where ADR-0091 D1 put them, and the header keeps the
              breadcrumb, the status and the edit pencil — which is ~770 px and fits. The canvas
              gives back the 45 px D1b won. **Whether to re-attempt the merge is the product owner's
              call and is written up with its numbers at the end of
              `m0-landing-d1-measurement.md`**; this is not that decision, it is declining to leave
              a shipped regression in place while the decision is open. */}
          <div className="border-border flex items-center justify-end gap-3 border-b px-4 py-1">
            {/* **The plan identity line, merged into the mode row** (Graphite M3). It reached the
                app header through a portal until then (ADR-0097 D1b), and Graphite deleted that
                header — so without a home it would have taken a 44 px row of its own inside the
                band, and MEASUREMENT said so: deleting a 56 px bar bought 12 px, which is ADR-0092
                M4's "relocating a row inside one column removes nothing" happening again to the
                milestone that quotes it.

                It fits here because this row holds only four mode buttons and the pen status —
                none of the brand, switcher and account that made the header merge impossible at
                1280 (ADR-0091's retrospective: "the identity wants ~1170 px against ~861 px").
                Measured at 1920 / 1646 / 1440 / 1280 before it shipped, with the mode toolbar
                checked for demotion at each: an armed mode behind a `⋯` is the ADR-0064 dead end
                and the reason the header attempt was withdrawn.

                No portal any more: the identity and the modes are rendered by the same component,
                so the slot that carried it across the shell boundary has nothing left to carry. */}
            <div data-plan-identity className="flex min-w-0 flex-1 items-center gap-3">
              {/* **`flex-1` here, not on the toolbar** — this block is the one that should give way.
              It is text with a `title`, so shrinking it truncates a name a reader can still get at;
              shrinking the mode cluster puts `Early | Visual | Diagram | Gantt` behind a `⋯`, which
              is ADR-0091 D1's whole objection (a mode is not a command and must be visible beside
              the pen). Measured: with `flex-1` on the toolbar instead, all four demoted into the
              overflow at 1646 — the product owner's own width. */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {/* **Two crumbs: the project, then this plan.**
                D1b first shipped the plan name alone, on the measurement that the four-crumb trail
                cost 455 px and that the Project Explorer already answers "where am I". Right about
                orientation, wrong about navigation, and **three Playwright suites failed on one
                locator** saying so — `programme`, `multi-select` and `authoring-flow` all click a
                project link from inside an open plan.

                Checking rather than assuming made it worse than the failing assertion:
                `HierarchyTree.tsx:208-219` navigates only for `kind === 'plan'` — a client or a
                project row calls `tree.toggle`, which is what the chevron beside it already does —
                and the rows are `treeitem` divs, not links. So this crumb was the ONLY route from
                an open plan to its project, i.e. to the screen holding that project's calendars
                (ADR-0053 M2). The tree's own hole is older and is `docs/TECH_DEBT.md` #143.

                Two rather than four: the 455 px bought the whole trail, and Clients → client IS the
                duplicate of the rail that the tidy was right about. `variant="nowrap"` because this
                is a fixed-height band — a wrapped crumb grows it and hands back the 45 px the merge
                was measured to win. */}
                <Breadcrumbs
                  variant="nowrap"
                  items={[
                    {
                      label: model.project.data?.name ?? 'Project',
                      to: '/orgs/$orgSlug/projects/$projectId',
                      params: { orgSlug: model.orgSlug, projectId: plan.projectId },
                    },
                    { label: plan.name },
                  ]}
                />
                <Badge variant="neutral">{PLAN_STATUS_LABELS[plan.status]}</Badge>
                {/* **The project-finish read-out, moved out of the command strip** (Graphite M5).
                ADR-0090 M2-T3 took it off the toolbar; ADR-0091 M7-S4 put it back as a
                `presentational` registry item, so the `⋯` could stay the row's rightmost control.
                It came here in M5 because M5-T1 measured the reduced strip **not fitting** at 768,
                960, 1280 or 1440, and that entry called itself "the interim home, not a second
                decision". **M7 is the decision**: a finish date is a fact, the status bar carries
                facts, and it has gone there. This comment is kept rather than deleted so the two
                moves read as one argument reaching its end. */}
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
            </div>
            {/* **The mode cluster is back on the identity line, beside the pen** (workspace
                redesign, 2026-08-24) — where ADR-0091 D1 argued a mode belongs in the first place:
                a mode is not a command, it sets how every command behaves, which is exactly the
                pen's relationship to the deck.

                Graphite M5 had banished it to the vertical rail, and the reason it gave was
                sound at the time: on the horizontal band it was 400 px, a quarter of the room at
                1646, and squeezing it risked demoting an armed mode into the `⋯` — the ADR-0064
                dead end. **Both halves of that objection are now void.** The deck wraps instead of
                competing for this row's width, and there is no ladder and no `⋯` left to demote
                into. The constraint that moved these controls has been deleted, so they come back.

                Still a registry `Toolbar` rather than four hand-rolled buttons: arm/disarm, Escape
                precedence, announcement and pen gating are all the registry's, and hand-rolling is
                how one control gets a rule and its neighbour does not. `shrink-0` because the
                identity block beside it carries `flex-1` and is the one that should give way — it
                is text with a `title`, so shrinking truncates a name a reader can still reach. */}
            <div className="flex shrink-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="text-primary/70 text-micro font-bold tracking-wider uppercase"
              >
                Mode
              </span>
              <Toolbar
                items={rows.mode}
                context={ctx}
                label="Plan mode"
                authoringEnabled={model.canEditSchedule && !lateOverlayActive}
                // All four are `group: 'lens'`, whose default label is "Display" — also the deck's
                // `lens` group name, so unoverridden this announces a second, unrelated name for
                // the cluster AND collides with a region below (the ADR-0090 M5 `output` rename).
                groupLabels={ROW_MODE_GROUP_LABELS}
              />
            </div>
            <CompactPenStatus
              pen={model.pen}
              {...(model.currentUserId ? { currentUserId: model.currentUserId } : {})}
            />
          </div>
          {/*
            **The plan identity line** — breadcrumb, status, project finish, Edit plan, pen status —
            folded into the band **above** the commands it governs (ADR-0090 M4-T2). Measured gain:
            the 53 px row plus the 8 px that separated it from the workspace pane, against a 533 px
            canvas at 1080 — **~61 px, +11 %**. That is deliberately not the figure `design.md` §2.1
            implies (it puts 199 px above the canvas against a measured 257, and 717 px of canvas
            against a measured 533); see `docs/specs/workspace-layout/m4-vertical-stack.md`.

            **A `<div>`, not the `<header>` it used to be.** Inside `<main>` a `<header>` carries no
            landmark role; in the band it is outside `main`, where it would become a **second
            `banner`** beside the app header row's. Two banners is a worse outcome than the element
            name is worth, and nothing depended on the tag — the accessible name of this screen is
            the `sr-only <h1>` above, which is why that stayed behind.

            **No new focus-return code, which is the point rather than an omission.** The
            pre-approval review flagged that this file has shipped a `rootRef`-scoped
            `querySelector` twice (`:164-169`, `:330-338`), each time silently finding nothing
            because `ChromePortal` moves the node out of the workspace root's subtree, and required
            any new restore to be `document`-scoped. There is none to write: the only focusable
            control here is Edit plan, and the dialog it opens restores focus through its own
            `restoreFocusRef`, which holds an element reference and never queries the DOM at all.
          */}
          {/* `py-1`, not the `py-2` this row carried as a standalone header. Inside the band it sits
              directly above two rows that are `py-1` around a `min-h-9` control, and a third rhythm
              in one surface reads as three surfaces. Measured: 53 → 45 px, the same height as Row 1.
              `px-4` stays: the rows indent by their `w-16` caption gutter, which this line has no
              equivalent of, so matching their `px-2` would leave the breadcrumb hanging left of
              everything below it. */}
          {/* **The command deck** (workspace redesign, 2026-08-24) — `Deck`, not `Toolbar`, and the
              difference is the whole point rather than a styling choice.

              `Toolbar` answers "too many commands" by measuring its container and demoting the
              lowest-priority items into a `⋯`. Four epics (ADR-0090/0091/0092/0094) tuned that
              mechanism, and the product owner's verdict was that the overflow "is not what we
              agreed to — we need all commands visible when we can". Reading the OLD Flask app
              settled it: its toolbar wrapped over five labelled group cards and had no overflow
              because a row allowed to become two rows cannot run out of width. The entire ladder
              was a consequence of insisting this surface stay one row tall.

              So `Deck` wraps, groups into four foldable captioned cards, and has no `⋯` at all.
              `alignEndGroup` goes with the ladder — a trailing edge is a property of a single row,
              and there is no longer one to have an edge. `className="flex-1"` goes too: the deck
              fills the band by wrapping into it rather than by being told to grow, and a flex child
              that grows is exactly how a row ends up measuring its own leftover width, which is the
              defect class this replaces. */}
          <div className="px-2 py-1.5">
            <Deck
              items={rows.strip}
              context={ctx}
              label="Plan commands"
              authoringEnabled={model.canEditSchedule && !lateOverlayActive}
            />
          </div>
        </ToolbarBandProvider>
      </ChromePortal>

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

      {/*
        The keyboard-shortcuts sheet, mounted ONCE for the whole workspace (`docs/TECH_DEBT.md`
        #137). It used to live inside `TsldPanel`, so in the Gantt the `?` binding and the account
        menu set `showHelp` and nothing rendered — a lit-but-inert control in the view that had
        just gained six bindings and no other place documenting them. The state was always shared
        (`use-tsld-canvas-ui-state`); only the render was trapped one level down.

        `view` selects which set it shows. The two views share key NAMES and not meanings — Enter
        opens the logic editor on the canvas and commits a cell edit in the grid — so one merged
        list would qualify half its rows into unreadability.
      */}
      <PlanShortcutsHelp
        open={canvasUi.showHelp}
        onClose={() => canvasUi.setShowHelp(false)}
        editingEnabled={model.canEditSchedule}
        view={ctx.planView}
      />

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

      {/* The canvas dock (workspace-chrome M3) wraps the diagram AND the activities row, because
          the strips are produced by the first and land in the second. Provider here rather than at
          the shell, so the shell stays plan-unaware (ADR-0029). */}
      <CanvasDockProvider>
        {/* `px-3 pb-3` — the workspace's own inset, so the stage and the docked panels read as
            CARDS FLOATING on the gradient ground rather than as the window's inner walls
            (workspace redesign, 2026-08-24). It lives here, on the workspace body, and
            deliberately NOT on the shell's `<main>`: `<main>` carries every route, and the
            content screens already bring their own container padding, so putting it there would
            double the inset on a dozen screens to fix one. The chrome band above supplies the
            matching top and side gutters from the shell, because it is the shell that places it. */}
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3">
          {isWide ? (
            // Wide: a HORIZONTAL split — the canvas+activities vertical stack (left) beside the docked
            // notes panel (right, when open). Opening notes narrows the canvas; closing restores it.
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Full-height chromeless canvas — the toolbar hosts its controls; the floating Legend
                  panel (when open) is overlaid via the `relative` container. */}
                {/* No padding — see the single-pane branch below for why. */}
                {/* The stage is a CARD (workspace redesign, 2026-08-24): a radius, a hairline
                    and a shadow, so the diagram reads as a sheet of paper laid on the gradient
                    rather than as the window's own white. `overflow-hidden` is what makes the
                    radius real — the canvas paints to its own bounds and would otherwise square
                    off the corners it sits under. */}
                <div className="border-border relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border shadow-md">
                  {surface}
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
              {floatPathsDockActive ? (
                <>
                  <PanelResizer
                    orientation="vertical"
                    size={floatPathsWidth}
                    min={FLOAT_PATHS_PANEL_MIN_WIDTH}
                    max={floatPathsEffectiveMax}
                    label="Resize float paths panel"
                    onResize={onFloatPathsResize}
                    pointerToSize={floatPathsPointerToSize}
                    reverseKeys
                    className="bg-border/60 hover:bg-border focus-visible:bg-ring"
                  />
                  <div
                    style={{ width: floatPathsWidth }}
                    className="border-border bg-card shrink-0 border-l"
                  >
                    {floatPathsDockContent}
                  </div>
                </>
              ) : null}

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
          ) : floatPathsDockActive ? (
            // Narrow: a right dock doesn't fit — Float paths takes the single pane, exactly as notes
            // does below. The emphasis it drives is not visible while it holds the pane; that is the
            // honest consequence of one-pane-at-a-time, and closing the panel returns the diagram.
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {floatPathsDockContent}
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
                  // **No padding: the canvas fills its section** (workspace-chrome M1). The inset read as a
                  // card floating in a pane rather than as the surface the workspace exists to show, and it
                  // cost 8 px of height and 32 px of width for nothing. Separation from the band above is
                  // the band's own `border-b`; from the dock below, the dock's.
                  'relative min-h-0 flex-1 flex-col gap-2',
                  pane === 'diagram' ? 'flex' : 'hidden',
                )}
              >
                {surface}
                {legendPanel}
                {/* Below `md` the strip rides the Diagram pane (no third pane) — Q3 / ADR-0049. */}
                {resourceStripPanel}
              </div>
              <div className={cn('min-h-0 flex-1', pane === 'activities' ? 'block' : 'hidden')}>
                {/* `hostsDock={false}`: this pane is `display: none` whenever the planner is on the
                    diagram, which is the default, so an outlet here would register while invisible
                    and take every docked strip out of the accessibility tree. Without one,
                    `CanvasDock` renders in place — where those strips were before this epic, and
                    the right answer on a screen with no spare row to dock into. */}
                <ActivityBottomPanel model={model} hostsDock={false} />
              </div>
            </>
          )}
        </div>
      </CanvasDockProvider>

      {/* Plan-chrome dialogs the toolbar overflow opens (shared with the ADR-0030 header menu). */}
      <PlanChromeDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        model={model}
        plan={plan}
      />

      {/* Edit-plan form + logic editor (shared with the ADR-0030 layout). */}
      <PlanDialogs model={model} plan={plan} />

      {/* **The status bar** (Graphite M7). Portalled into the shell's row 3 for the same reason the
          command band and the mode cluster are portalled: the facts belong to the plan, the row
          belongs to the shell, and ADR-0029 says the shell must not learn the difference. */}
      <ChromePortal name="status">
        <PlanStatusBar
          activityCount={scheduleSummary.data?.activityCount}
          criticalCount={scheduleSummary.data?.criticalCount}
          dataDate={scheduleSummary.data?.dataDate}
          projectFinish={scheduleSummary.data?.projectFinish}
          recalculating={model.autoRecalc.isPending}
          pending={scheduleSummary.isPending}
        />
      </ChromePortal>

      {/* Activity edit/delete dialogs the floating selection bar opens (ADR-0031). */}
      <ActivityCrudDialogs model={model} />

      {/* The progress editor (toolbar Report-progress + the entry-route selection-bar Report-progress)
          now lives in the shared `PlanDialogs`, so it's mounted once for whichever canvas layout is
          active and both entry points open the same dialog. */}
    </div>
  );
}
