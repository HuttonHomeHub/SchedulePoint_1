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
import { usePlanWorkspaceKeyScope } from './use-plan-workspace-key-scope';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';
import { WorkspaceViewToggle, type WorkspacePane } from './workspace-view-toggle';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { ChromePortal } from '@/components/layout/chrome/chrome-slot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelResizer } from '@/components/ui/panel-resizer';
import { SheetHeader } from '@/components/ui/sheet';
import { Toolbar, splitByRow } from '@/components/ui/toolbar';
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
import {
  FloatPathsPanel,
  useFloatPathsPanelPrefs,
  FLOAT_PATHS_PANEL_MIN_WIDTH,
} from '@/features/float-paths';
import { GanttPanel, usePlanViewMode } from '@/features/gantt';
import { PlanNotesSection } from '@/features/notes';
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
import { buildTsldToolbarItems } from '@/features/tsld/toolbar/tsld-toolbar-items';
import { useLegendPanelPrefs } from '@/features/tsld/toolbar/use-legend-panel-prefs';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import {
  useTsldToolbarContext,
  type PlanDialogKind,
} from '@/features/tsld/toolbar/use-tsld-toolbar-context';
import { cn } from '@/lib/utils';

/** The `md` breakpoint (48rem) — at/above it the canvas + bottom panel split; below it, one pane. */
const MD_QUERY = '(min-width: 48rem)';

/** The visible row-purpose eyebrow's type treatment — kept as one constant so the two rows can't
 * drift apart on a future edit. `text-xs` is the design system's smallest type-scale step
 * (`docs/DESIGN_SYSTEM.md` "Captions, meta"), not an arbitrary size. */
const ROW_LABEL_CLASSNAME = 'text-muted-foreground text-xs font-semibold tracking-wide uppercase';

/** The eyebrow's **gutter**, not just its type (feature-spec.md §4.1): a fixed-width, right-ruled
 * column so the label reads as the row's gutter rather than a control sitting in the row's own
 * button rhythm — the defect a first pass left was rhythm, not weight. Both rows share one fixed
 * width so their toolbars begin at the same x; the rule is the row's leftmost rule, so `<Toolbar>`'s
 * own between-group hairlines (`i > 0`) never double up against it. */
const ROW_LABEL_GUTTER_CLASSNAME = 'border-border flex w-16 shrink-0 items-center border-r pr-2';

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
  // Searched from `document`, not `rootRef`: with `VITE_DESIGNED_CHROME` on the toolbar lives in
  // the chrome band and is no longer a DOM descendant of the workspace root.
  const closeFloatPathsAndFocus = useCallback(() => {
    closeFloatPaths();
    document.querySelector<HTMLElement>('[data-toolbar-item="float-paths"]')?.focus();
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
  const ctx = useTsldToolbarContext({
    model,
    plan,
    canvasUi,
    openDialog: setDialog,
    legend: { open: legend.open, toggle: legend.toggle },
    revealComments,
    toggleFloatPaths,
    planView,
    setPlanView,
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
  const rootRef = useRef<HTMLDivElement>(null);
  // "A modal is open" — the plan dialogs + the edit-plan form + the activity edit/delete dialogs.
  // Gates both the `?` shortcut (don't stack the sheet on an open modal) and the undo/redo keybindings
  // (don't mutate plan state from beneath an open `ConfirmDialog`/`ActivityFormDialog`, ADR-0048).
  // `editorIntent` is listed because with `VITE_ACTIVITY_EDITOR_TABS` on (default) it is the state
  // that opens the editor — `editActivityId` is never set on that path, so without this line the
  // undo/redo chords were live underneath the open editor, which is the exact thing this guard
  // exists to prevent.
  const anotherDialogOpen =
    dialog !== null ||
    model.editing ||
    model.editActivityId !== null ||
    model.editorIntent !== null ||
    model.deleteActivityId !== null ||
    model.dissolveActivityId !== null;

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
  // Searched from `document`, NOT from `rootRef`: with `VITE_DESIGNED_CHROME` on, the toolbar's
  // DOM node lives in the chrome band (ADR-0055 §3) and is no longer a DOM descendant of the
  // workspace root, so a root-scoped query silently found nothing and stranded focus. Only one
  // plan workspace is mounted at a time, so the attribute is unambiguous document-wide.
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
  const lateOverlayActive = SCHEDULING_MODES_ENABLED && canvasUi.viewToggles.lateOverlay;

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
      // What a recalculation SETTLED (M5): the shared ADR-0032 coalescer's in-flight flag marks the
      // settle edge, and the summary's finish is the second fact. Both read-only — supplying them
      // does not make the panel trigger a recalculation, only describe one.
      recalcPending={model.autoRecalc.isPending}
      projectFinish={scheduleSummary.data?.projectFinish ?? null}
      // LOE endpoint-pick span (Stage D, `VITE_CANVAS_ACTIVITY_TYPES`). Gated on the flag so flag-off is
      // byte-for-byte today's canvas — the LOE tool-mode is then unreachable (the Add-menu item is also
      // flag-gated), so the prop is simply absent.
      {...(CANVAS_ACTIVITY_TYPES_ENABLED ? { onLoeSpan: model.createLoeSpan } : {})}
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
      // Entry-route selection-bar actions (Resources / Report progress / Steps). Always passed; each
      // toolbar item is flag-gated, so flag-off is byte-for-byte. Progress is role-gated via
      // `canReportProgress`; Steps hides for a duration-derived selection via `isStepsEligible`.
      onResources={model.onResourcesActivity}
      onProgress={model.onProgressActivity}
      onSteps={model.onStepsActivity}
      canReportProgress={model.canProgress}
      isStepsEligible={(a) => !isDurationDerivedType(a.type)}
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
      // Over-allocation highlight (Stage E M2): flag the engine-flagged over-allocated bars. Its own
      // mode, independent of the demand strip being open. Flag-off ⇒ false ⇒ byte-for-byte today's.
      overAllocationHighlight={CANVAS_RESOURCE_VIEW_ENABLED && model.overAllocationHighlight}
      // Float-path emphasis (audit F4): the ONE derived set, handed to the canvas here and to the
      // Gantt below. Empty unless a path is selected ⇒ no scene field ⇒ byte-for-byte today's paint.
      floatPathIds={floatPaths.emphasisIds}
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

  const surface =
    ctx.planView === 'gantt' ? (
      <GanttPanel
        key={`${model.planId}-gantt`}
        activities={model.activities.data ?? []}
        // One zoom control for both projections (ADR-0056 presets, ADR-0059 §2): the toolbar's
        // preset drives the diagram and the chart alike, so switching view keeps the scale.
        zoomLevel={ctx.zoomPreset}
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
    // The workspace root is an event DELEGATION root, not a control masquerading as one: no role,
    // no tabIndex, no click handler, never focusable itself. It only observes keydowns bubbling
    // from the real focusable controls inside it — the case jsx-a11y cannot distinguish from a
    // fake button. Making it focusable to satisfy the rule would ADD a meaningless tab stop, so
    // the accessible answer here is the disable, not the "fix".
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={rootRef} onKeyDown={onWorkspaceKeyDown} className="flex min-h-0 flex-1 flex-col">
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
      {/* Flag-on (`VITE_DESIGNED_CHROME`) these two rows portal into the chrome band, so the top of
          the app reads as one surface. Only the DOM node moves — in the React tree they stay right
          here, which is why `ctx`, the registry predicates and the workspace key scope are all
          untouched by the move. Flag-off `ChromePortal` is an identity wrapper. */}
      <ChromePortal>
        <div className="border-border flex flex-col border-b">
          {/* Visible row-purpose cues (ux review): the "Row 1 · Look" / "Row 2 · Do" split otherwise
              lived only in each row's `aria-label`, invisible to sighted users. Plain words rather than
              those internal ADR-0031 codenames — "Look"/"Do" read as jargon to a first-time user — and
              each is a literal word from its row's own `aria-label` below, so it isn't a wholly separate
              caption. `aria-hidden` avoids a redundant/out-of-context announcement — the toolbar's own
              `aria-label` already names the row for AT. */}
          <div className="border-border flex items-center gap-2 border-b px-2 py-1">
            <div className={ROW_LABEL_GUTTER_CLASSNAME}>
              <span aria-hidden="true" className={ROW_LABEL_CLASSNAME}>
                Navigate
              </span>
            </div>
            <Toolbar
              items={rows.look}
              context={ctx}
              label="View and navigate"
              authoringEnabled={model.canEditSchedule && !lateOverlayActive}
              alignEndGroup="object"
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className={ROW_LABEL_GUTTER_CLASSNAME}>
              <span aria-hidden="true" className={ROW_LABEL_CLASSNAME}>
                Build
              </span>
            </div>
            <Toolbar
              items={rows.do}
              context={ctx}
              label="Build and manage"
              authoringEnabled={model.canEditSchedule && !lateOverlayActive}
              className="flex-1"
            />
          </div>
        </div>
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
                'relative min-h-0 flex-1 flex-col gap-2 px-4 pt-2 pb-2',
                pane === 'diagram' ? 'flex' : 'hidden',
              )}
            >
              {surface}
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
