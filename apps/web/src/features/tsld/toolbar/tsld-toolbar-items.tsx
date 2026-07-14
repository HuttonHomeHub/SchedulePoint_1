import type { DependencyType } from '@repo/types';
import {
  AlignVerticalSpaceAround,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarSearch,
  Check,
  ChevronDown,
  Eraser,
  Filter,
  Grid3x3,
  Info,
  Keyboard,
  Layers,
  ListChecks,
  LocateFixed,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Redo2,
  SlidersHorizontal,
  Spline,
  TriangleAlert,
  Undo2,
} from 'lucide-react';

import type { TsldViewToggles } from '../render/paint';
import { ZOOM_LEVELS } from '../render/time-scale';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Input } from '@/components/ui/input';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import type { ToolbarItemRenderApi } from '@/components/ui/toolbar/toolbar-registry';
import { defineToolbar, type ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';
import { toolbarControlVariants } from '@/components/ui/toolbar/toolbar-styles';
import { ToolbarPopover } from '@/components/ui/toolbar/ToolbarPopover';
import { CANVAS_AUTHORING_ENABLED, SCHEDULING_MODES_ENABLED } from '@/config/env';
import { ACTIVITY_TYPE_LABELS } from '@/features/activities';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

const ZOOM_LABELS: Record<string, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

/** The six view-layer toggles, in the order the `View▾` popover lists them (mirrors TsldViewControls). */
const VIEW_TOGGLES: ReadonlyArray<{ key: keyof TsldViewToggles; label: string }> = [
  { key: 'dayGrid', label: 'Day grid' },
  { key: 'monthGrid', label: 'Month grid' },
  { key: 'yearGrid', label: 'Year grid' },
  { key: 'today', label: 'Today line' },
  { key: 'nonWorking', label: 'Non-working' },
  { key: 'labels', label: 'Labels' },
];

/**
 * The inline **plan start-date** control — the plan's `plannedStart`, the canvas day-zero origin. A
 * writer edits it via a native date input; a read-only viewer (`setPlannedStart` null) sees the date
 * as a static read-out. Changing it re-anchors the timeline. The two are registered as separate
 * toolbar items so the read-out is `presentational` — a non-interactive date is not a roving-tabindex
 * stop (a11y review), mirroring the finish-chip. The writer input spreads `itemProps` on its single
 * focusable control; the read-out spreads them on the (inert) span.
 *
 * `label` sets the accessible + visible name: "Timeline start" under ADR-0032 (the single conflated
 * control), or the de-overloaded "Project start" under ADR-0033 M2, where it is purely the *data*
 * anchor and canvas navigation moves to the separate {@link GoToDateControl}.
 */
function TimelineStartControl({
  ctx,
  itemProps,
  label,
}: {
  ctx: TsldToolbarContext;
  itemProps: ToolbarItemRenderApi['itemProps'];
  label: string;
}): React.ReactElement {
  const display = ctx.plannedStart ? formatCalendarDate(ctx.plannedStart) : 'Not set';
  if (!ctx.setPlannedStart) {
    return (
      <span
        {...itemProps}
        aria-label={`${label}: ${display}`}
        className={toolbarControlVariants({ tone: 'info' })}
      >
        <CalendarClock aria-hidden="true" className="mr-1.5 size-4" />
        {display}
      </span>
    );
  }
  const setPlannedStart = ctx.setPlannedStart;
  return (
    // The focusable child is the `<input>`, not the `<label>`, so the base `focus-visible:` ring never
    // matches; mirror it onto the label with `has-[input:focus-visible]` so tabbing to the field shows
    // a visible focus indicator (WCAG 2.4.7, a11y review).
    <label
      className={cn(
        toolbarControlVariants({ tone: 'control' }),
        'has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-inset',
      )}
    >
      <CalendarClock aria-hidden="true" className="size-4" />
      <span className="sr-only">{label}</span>
      <input
        {...itemProps}
        type="date"
        value={ctx.plannedStart ?? ''}
        onChange={(event) => setPlannedStart(event.target.value)}
        className="bg-transparent text-sm outline-none"
      />
    </label>
  );
}

/**
 * The **Go to date** navigation control (ADR-0033 M2) — a labelled disclosure that opens a small date
 * picker and pans the canvas so the chosen date sits at the left edge. It never writes and persists no
 * state (CQ-1), so it is offered to *every* role, read-only viewers included: navigating the timeline
 * is not a mutation. A popover (not an inline field) so it reads unmistakably as *navigation*, kept
 * visually distinct from the persisted {@link TimelineStartControl} "Project start" data anchor beside
 * it — the whole point of de-overloading `plannedStart` (ADR-0033). Uncontrolled: picking a date jumps
 * once; there is no "current go-to date" to reflect, so nothing is echoed back.
 */
const GOTO_FIELD_ID = 'tsld-goto-date-field';
const GOTO_HINT_ID = 'tsld-goto-date-hint';

function GoToDateControl({
  ctx,
  itemProps,
}: {
  ctx: TsldToolbarContext;
  itemProps: ToolbarItemRenderApi['itemProps'];
}): React.ReactElement {
  return (
    <ToolbarPopover
      label="Go to date"
      icon={<CalendarSearch className="size-4" />}
      itemProps={itemProps}
    >
      <div className="flex flex-col gap-1.5 text-sm">
        {/* Inner field is "Date" (not another "Go to date") so AT doesn't echo the dialog name; the
            hint is wired via `aria-describedby` so keyboard/SR users landing on the field hear it. */}
        <label htmlFor={GOTO_FIELD_ID} className="text-muted-foreground font-medium">
          Date
        </label>
        <Input
          id={GOTO_FIELD_ID}
          type="date"
          aria-describedby={GOTO_HINT_ID}
          onChange={(event) => {
            if (event.target.value) ctx.goToDate(event.target.value);
          }}
          className="h-9"
        />
        <span id={GOTO_HINT_ID} className="text-muted-foreground text-xs">
          Pans the timeline only — nothing is saved.
        </span>
      </div>
    </ToolbarPopover>
  );
}

/** The activity kinds the canvas-first Add split-button offers, in menu order (ADR-0032 M4). Only the
 * three planners draw directly — hammock / level-of-effort are derived, not point-and-draw. Labels
 * reuse the canonical {@link ACTIVITY_TYPE_LABELS} so the toolbar copy can't drift from the rest of
 * the app (e.g. under localisation). */
const ADD_ACTIVITY_TYPES = ['TASK', 'START_MILESTONE', 'FINISH_MILESTONE'] as const;
const ADD_DISABLED_REASON = 'Start editing to add activities';

/**
 * The **Add split-button** (ADR-0032 M4) — the canvas-first replacement for the plain "Add activity"
 * toggle. An APG menu-button: the trigger arms/labels the current draw kind and opens a `Menu` to
 * pick Task / Start-milestone / Finish-milestone; picking one arms add-mode with that kind (the
 * canvas then collapses milestone draws to a zero-duration point). While adding, the menu also offers
 * "Stop adding" so the mode is leaveable from the toolbar, not only via Escape on the canvas. Pen-gated
 * as one focusable control (spreads `itemProps`), so it stays a single roving-tabindex stop and the
 * whole authoring group disables together when the pen isn't held.
 */
function AddActivityControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const disabled = api.disabled;
  const activeLabel = ACTIVITY_TYPE_LABELS[ctx.createType];
  return (
    <>
      <button
        {...api.itemProps}
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        title={disabled ? ADD_DISABLED_REASON : undefined}
        onClick={() => {
          if (!disabled) toggle();
        }}
        className={cn(toolbarControlVariants({ active: ctx.isAddingActivity || open, disabled }))}
      >
        <Plus aria-hidden="true" className="size-4" />
        <span className="truncate">{ctx.isAddingActivity ? `Adding ${activeLabel}` : 'Add'}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Add activity type"
        restoreFocusRef={triggerRef}
      >
        {ADD_ACTIVITY_TYPES.map((type) => (
          <MenuItem
            key={type}
            selected={ctx.createType === type}
            onSelect={() => ctx.setCreateType(type)}
          >
            <Check
              aria-hidden="true"
              className={cn('size-4', ctx.createType === type ? 'opacity-100' : 'opacity-0')}
            />
            {ACTIVITY_TYPE_LABELS[type]}
          </MenuItem>
        ))}
        {ctx.isAddingActivity ? (
          <MenuItem onSelect={() => ctx.toggleAddActivity()}>
            <span aria-hidden="true" className="size-4" />
            Stop adding
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

/** The dependency kinds the two-click Link tool offers (ADR-0032 M5). SF is dialog-only (the rare
 * inverse, ADR-0026 D5). The short code labels the compact toolbar button; the long name reads in
 * the menu. */
const LINK_TYPES: ReadonlyArray<{ type: DependencyType; label: string }> = [
  { type: 'FS', label: 'Finish → Start' },
  { type: 'SS', label: 'Start → Start' },
  { type: 'FF', label: 'Finish → Finish' },
];
/** Long names for accessible labels (the compact button shows the FS/SS/FF code only). */
const LINK_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LINK_TYPES.map(({ type, label }) => [type, label]),
);

/**
 * The Link tool's **dependency-type selector** (ADR-0032 M5) — a compact menu-button showing the
 * armed FS/SS/FF code, opening a `Menu` to switch it. Only shown while the Link tool is active. One
 * focusable control (spreads `itemProps`) per the toolbar contract.
 */
const LINK_DISABLED_REASON = 'Start editing to change the link type';

function LinkTypeControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const disabled = api.disabled;
  return (
    <>
      <button
        {...api.itemProps}
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-label={`Link type: ${ctx.linkType}`}
        title={disabled ? LINK_DISABLED_REASON : `Link type: ${LINK_TYPE_LABELS[ctx.linkType]}`}
        onClick={() => {
          if (!disabled) toggle();
        }}
        className={cn(toolbarControlVariants({ active: open, disabled }))}
      >
        <span className="truncate">{ctx.linkType}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Link type"
        restoreFocusRef={triggerRef}
      >
        {LINK_TYPES.map(({ type, label }) => (
          <MenuItem
            key={type}
            selected={ctx.linkType === type}
            onSelect={() => ctx.setLinkType(type)}
          >
            <Check
              aria-hidden="true"
              className={cn('size-4', ctx.linkType === type ? 'opacity-100' : 'opacity-0')}
            />
            {type} — {label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

const ZOOM_DISABLED_REASON = 'Add an activity to enable zoom';

/**
 * The **zoom-preset dropdown** — a single compact menu-button replacing the five segmented
 * scale buttons (Day/Week/Month/Quarter/Year). The trigger shows the current level and opens a
 * `Menu` to pick another; every level is still one click away, but the Frame group stops overflowing
 * the bar (which used to silently demote Year/Quarter into `⋯` at narrow widths). One focusable
 * control (spreads `itemProps`) per the toolbar contract; mirrors `api.disabled` so it shades — not
 * hides — when the plan has no computed diagram yet (a stable toolbar shape, ADR-0031).
 */
function ZoomPresetControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const disabled = api.disabled;
  const activeLabel = ZOOM_LABELS[ctx.zoomPreset] ?? ctx.zoomPreset;
  return (
    <>
      <button
        {...api.itemProps}
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-label={`Zoom level: ${activeLabel}`}
        title={disabled ? ZOOM_DISABLED_REASON : `Zoom level: ${activeLabel}`}
        onClick={() => {
          if (!disabled) toggle();
        }}
        className={cn(toolbarControlVariants({ active: open, disabled }))}
      >
        <CalendarRange aria-hidden="true" className="size-4" />
        <span className="truncate">{activeLabel}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Zoom level"
        restoreFocusRef={triggerRef}
      >
        {ZOOM_LEVELS.map((level) => (
          <MenuItem
            key={level}
            selected={ctx.zoomPreset === level}
            onSelect={() => ctx.setZoomPreset(level)}
          >
            <Check
              aria-hidden="true"
              className={cn('size-4', ctx.zoomPreset === level ? 'opacity-100' : 'opacity-0')}
            />
            {ZOOM_LABELS[level] ?? level}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * A **future-feature placeholder** (ADR-0031) — a control that is part of the intended toolbar design
 * but whose behaviour isn't built yet. It renders in its group as a permanently-disabled button with a
 * "Coming soon" tooltip, so the toolbar reads as fully designed and the code is switched on later by
 * replacing this stub with a real command. Distinct from a *capability-unavailable* disable (e.g. zoom
 * before a diagram exists): the tooltip copy differentiates them. Documented in
 * `docs/adr/0031-*` and `docs/TOOLBAR_ROADMAP.md`.
 */
function placeholderItem(o: {
  id: string;
  group: ToolbarItem<TsldToolbarContext>['group'];
  tier: ToolbarItem<TsldToolbarContext>['tier'];
  order: number;
  label: string;
  icon: React.ReactNode;
}): ToolbarItem<TsldToolbarContext> {
  return {
    ...o,
    isEnabled: () => false,
    disabledReason: () => 'Coming soon',
    onActivate: () => {},
  };
}

/** The checkbox body of the `View▾` popover — the display toggles, driven off the context. */
function ViewTogglesPanel({ ctx }: { ctx: TsldToolbarContext }): React.ReactElement {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Display</legend>
      {VIEW_TOGGLES.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ctx.viewToggles[key]}
            onChange={() => ctx.toggleView(key)}
            className="accent-primary size-4"
          />
          {label}
        </label>
      ))}
      {/* Late-Start analysis overlay (ADR-0033 M4, flag-on only): a read-only view that renders bars
          from the late dates for float analysis; while on, editing is suppressed by the host. */}
      {SCHEDULING_MODES_ENABLED ? (
        <label className="border-border mt-1 flex items-center gap-2 border-t pt-2 text-sm">
          <input
            type="checkbox"
            checked={ctx.viewToggles.lateOverlay}
            onChange={() => ctx.toggleView('lateOverlay')}
            className="accent-primary size-4"
          />
          Late-start overlay
        </label>
      ) : null}
    </fieldset>
  );
}

/**
 * The TSLD command registry (ADR-0031) — every canvas control expressed as a {@link ToolbarItem}
 * over the {@link TsldToolbarContext}, grouped by the fixed 7-group taxonomy. Real controls (the
 * zoom-level dropdown + zoom/fit, view toggles, add-activity, link, auto-arrange, recalculate,
 * baselines/calendar/plan-details, legend, summary + finish chip) sit alongside **future-feature
 * placeholders** — disabled "Coming soon" stubs (undo/redo, filter, recenter-on-today, snap-to-grid,
 * clear-visual-placement, next-conflict) that make the toolbar read as fully designed and are switched
 * on later by swapping the stub for a real command (see `docs/TOOLBAR_ROADMAP.md`).
 *
 * Two design rules the registry enforces (ADR-0031):
 * 1. **Stable shape, shade-don't-hide** — a capability that is temporarily unavailable (e.g. zoom
 *    before a diagram is computed) is *disabled with a reason*, not removed, so the bar's silhouette
 *    doesn't shift as plan state changes. Only a genuinely-absent feature (flag-off) uses `isVisible`.
 * 2. **One consolidated zoom control** — the five scale levels live in a single dropdown so the Frame
 *    group stops overflowing narrow bars (which used to silently demote Year/Quarter into `⋯`).
 *
 * NB `recenter-on-today` is a viewport **recenter** placeholder, distinct from the "Today line"
 * display toggle in `View▾` (which only shows/hides the marker).
 */
export function buildTsldToolbarItems(): ToolbarItem<TsldToolbarContext>[] {
  return defineToolbar<TsldToolbarContext>([
    // --- 1 · Frame / navigate -----------------------------------------------------------------
    // Inline timeline start-date (ADR-0032 M2) — leftmost in the Frame group; canvas-first only.
    // Split by editability so the read-only variant is a *presentational* read-out (a11y review):
    // a static date shouldn't be a roving-tabindex stop (the same rule the finish-chip follows).
    // Under ADR-0033 M2 this conflated control is de-overloaded into a labelled "Project start" *data*
    // anchor + a separate "Go to date" *navigation* jump (the trio below), so it yields flag-on.
    {
      id: 'timeline-start',
      group: 'frame',
      tier: 1,
      order: -1,
      label: 'Timeline start',
      isVisible: (ctx) =>
        CANVAS_AUTHORING_ENABLED && !SCHEDULING_MODES_ENABLED && ctx.setPlannedStart !== null,
      render: (ctx, api) => (
        <TimelineStartControl ctx={ctx} itemProps={api.itemProps} label="Timeline start" />
      ),
    },
    {
      id: 'timeline-start-readonly',
      group: 'frame',
      tier: 1,
      order: -1,
      label: 'Timeline start',
      presentational: true,
      isVisible: (ctx) =>
        CANVAS_AUTHORING_ENABLED && !SCHEDULING_MODES_ENABLED && ctx.setPlannedStart === null,
      render: (ctx, api) => (
        <TimelineStartControl ctx={ctx} itemProps={api.itemProps} label="Timeline start" />
      ),
    },
    // ADR-0033 M2 — the de-overloaded split (flag-on only): "Project start" persists the schedule
    // anchor (pen-gated write / presentational read-out), "Go to date" is a pure view jump offered to
    // every role. Ordered start-then-navigate; both stay leftmost in the Frame group.
    {
      id: 'project-start',
      group: 'frame',
      tier: 1,
      order: -3,
      label: 'Project start',
      isVisible: (ctx) => SCHEDULING_MODES_ENABLED && ctx.setPlannedStart !== null,
      render: (ctx, api) => (
        <TimelineStartControl ctx={ctx} itemProps={api.itemProps} label="Project start" />
      ),
    },
    {
      id: 'project-start-readonly',
      group: 'frame',
      tier: 1,
      order: -3,
      label: 'Project start',
      presentational: true,
      isVisible: (ctx) => SCHEDULING_MODES_ENABLED && ctx.setPlannedStart === null,
      render: (ctx, api) => (
        <TimelineStartControl ctx={ctx} itemProps={api.itemProps} label="Project start" />
      ),
    },
    {
      id: 'go-to-date',
      group: 'frame',
      tier: 1,
      order: -2,
      label: 'Go to date',
      isVisible: (ctx) => SCHEDULING_MODES_ENABLED && ctx.plannedStart !== null,
      render: (ctx, api) => <GoToDateControl ctx={ctx} itemProps={api.itemProps} />,
    },
    // Scheduling-mode selector (ADR-0033 M3, flag-on only): a two-item segmented Early | Visual
    // control in the Lens group. Tier 1 so the labels actually render (tier-2 label-less items paint
    // blank — ux review). Pen-gated: writers get the toggle; a read-only viewer gets the presentational
    // read-out below (the mode changes how the diagram reads, so it must be visible to everyone).
    {
      id: 'mode-early',
      group: 'lens',
      tier: 1,
      order: -3,
      label: 'Early mode',
      isVisible: (ctx) => SCHEDULING_MODES_ENABLED && ctx.setSchedulingMode !== null,
      isActive: (ctx) => ctx.schedulingMode === 'EARLY',
      onActivate: (ctx) => ctx.setSchedulingMode?.('EARLY'),
    },
    {
      id: 'mode-visual',
      group: 'lens',
      tier: 1,
      order: -2,
      label: 'Visual mode',
      isVisible: (ctx) => SCHEDULING_MODES_ENABLED && ctx.setSchedulingMode !== null,
      isActive: (ctx) => ctx.schedulingMode === 'VISUAL',
      onActivate: (ctx) => ctx.setSchedulingMode?.('VISUAL'),
    },
    {
      id: 'mode-readonly',
      group: 'lens',
      tier: 1,
      order: -3,
      label: 'Scheduling mode',
      presentational: true,
      isVisible: (ctx) => SCHEDULING_MODES_ENABLED && ctx.setSchedulingMode === null,
      render: (ctx, api) => (
        <span
          {...api.itemProps}
          aria-label={`Scheduling mode: ${ctx.schedulingMode === 'VISUAL' ? 'Visual' : 'Early'}`}
          className={toolbarControlVariants({ tone: 'info' })}
        >
          {ctx.schedulingMode === 'VISUAL' ? 'Visual mode' : 'Early mode'}
        </span>
      ),
    },
    // Zoom scale — one dropdown holding all five levels (Day…Year), replacing the five segmented
    // buttons that overflowed the bar (ADR-0031). Shaded (not hidden) until a diagram exists, so the
    // toolbar keeps a stable shape from the empty canvas onward.
    {
      id: 'zoom-preset',
      group: 'frame',
      tier: 1,
      order: 0,
      label: 'Zoom level',
      isEnabled: (ctx) => ctx.hasDiagram,
      disabledReason: (ctx) => (ctx.hasDiagram ? undefined : ZOOM_DISABLED_REASON),
      render: (ctx, api) => <ZoomPresetControl ctx={ctx} api={api} />,
    },
    {
      id: 'zoom-out',
      group: 'frame',
      tier: 1,
      order: 10,
      label: 'Zoom out',
      icon: <Minus className="size-4" />,
      isEnabled: (ctx) => ctx.hasDiagram,
      disabledReason: (ctx) => (ctx.hasDiagram ? undefined : ZOOM_DISABLED_REASON),
      onActivate: (ctx) => ctx.stepZoom(0.5),
    },
    {
      id: 'zoom-in',
      group: 'frame',
      tier: 1,
      order: 11,
      label: 'Zoom in',
      icon: <Plus className="size-4" />,
      isEnabled: (ctx) => ctx.hasDiagram,
      disabledReason: (ctx) => (ctx.hasDiagram ? undefined : ZOOM_DISABLED_REASON),
      onActivate: (ctx) => ctx.stepZoom(2),
    },
    {
      id: 'fit',
      group: 'frame',
      tier: 1,
      order: 12,
      label: 'Fit to plan',
      icon: <Maximize2 className="size-4" />,
      isEnabled: (ctx) => ctx.hasDiagram,
      disabledReason: (ctx) => (ctx.hasDiagram ? undefined : 'Add an activity to fit the view'),
      onActivate: (ctx) => ctx.fit(),
    },
    // Recenter-on-today — a viewport recenter command (distinct from the "Today line" *display*
    // toggle in `View▾`). A disabled "Coming soon" placeholder in the `⋯` overflow (tier 3) so it's
    // discoverable without widening the always-inline core.
    placeholderItem({
      id: 'today',
      group: 'frame',
      tier: 3,
      order: 13,
      label: 'Recenter on today',
      icon: <LocateFixed className="size-4" />,
    }),

    // --- 2 · Lens / display -------------------------------------------------------------------
    {
      id: 'view',
      group: 'lens',
      tier: 2,
      order: 0,
      // Always shown (display toggles apply to the empty canvas grid too) — part of the stable
      // toolbar shape (ADR-0031); no longer gated on a computed diagram.
      label: 'View',
      icon: <SlidersHorizontal className="size-4" />,
      render: (ctx, api) => (
        <ToolbarPopover
          label="View"
          icon={<SlidersHorizontal className="size-4" />}
          itemProps={api.itemProps}
        >
          <ViewTogglesPanel ctx={ctx} />
        </ToolbarPopover>
      ),
    },
    // view-mode switch slot — reserved (TSLD is lens #1). Registered hidden; promotable later.
    {
      id: 'view-mode',
      group: 'lens',
      tier: 1,
      order: 10,
      label: 'View mode',
      isVisible: () => false,
      onActivate: () => {},
    },
    // Snap-to-grid — a Visual-planning aid (snaps hand-placed bars to working-day gridlines). In the
    // `⋯` overflow as a "Coming soon" placeholder.
    placeholderItem({
      id: 'snap-to-grid',
      group: 'lens',
      tier: 3,
      order: 11,
      label: 'Snap to grid',
      icon: <Grid3x3 className="size-4" />,
    }),

    // --- 3 · Find / focus (placeholders) ------------------------------------------------------
    // Filter / critical-only view — a "Coming soon" placeholder in the `⋯` overflow; the real command
    // lands later. Kept out of the always-inline core to keep the bar lean.
    placeholderItem({
      id: 'filter',
      group: 'find',
      tier: 3,
      order: 0,
      label: 'Filter',
      icon: <Filter className="size-4" />,
    }),
    // Jump-to-next-conflict — a Visual-planning helper (steps the viewport through flagged placements).
    // In the `⋯` overflow (tier 3) so it's discoverable without crowding the bar.
    placeholderItem({
      id: 'next-conflict',
      group: 'find',
      tier: 3,
      order: 1,
      label: 'Next conflict',
      icon: <TriangleAlert className="size-4" />,
    }),

    // --- 4 · Tools / author (pen-gated) -------------------------------------------------------
    // Add activity — a plain toggle button flag-off (byte-for-byte unchanged); flag-on the canvas-first
    // Add split-button (ADR-0032 M4), a menu-button that also picks the draw kind (task / milestone).
    {
      id: 'add-activity',
      group: 'tools',
      tier: 1,
      order: 0,
      label: 'Add activity',
      icon: <Plus className="size-4" />,
      penGated: true,
      disabledReason: () => ADD_DISABLED_REASON,
      ...(CANVAS_AUTHORING_ENABLED
        ? { render: (ctx, api) => <AddActivityControl ctx={ctx} api={api} /> }
        : {
            isActive: (ctx) => ctx.isAddingActivity,
            onActivate: (ctx) => ctx.toggleAddActivity(),
          }),
    },
    // Link tool (ADR-0032 M5) — the canvas-first two-click dependency tool; only present when
    // canvas-first authoring is on and the plan is linkable. Pen-gated with the other tools.
    {
      id: 'link-tool',
      group: 'tools',
      tier: 1,
      order: 1,
      label: 'Link activities',
      icon: <Spline className="size-4" />,
      penGated: true,
      disabledReason: () => 'Start editing to link activities',
      isVisible: (ctx) => CANVAS_AUTHORING_ENABLED && ctx.canLink,
      isActive: (ctx) => ctx.isLinking,
      onActivate: (ctx) => ctx.toggleLinkMode(),
    },
    // The FS/SS/FF selector, shown only while the Link tool is active.
    {
      id: 'link-type',
      group: 'tools',
      tier: 1,
      order: 2,
      label: 'Link type',
      penGated: true,
      disabledReason: () => LINK_DISABLED_REASON,
      isVisible: (ctx) => CANVAS_AUTHORING_ENABLED && ctx.canLink && ctx.isLinking,
      render: (ctx, api) => <LinkTypeControl ctx={ctx} api={api} />,
    },
    {
      id: 'auto-arrange',
      group: 'tools',
      tier: 3,
      order: 3,
      label: 'Auto-arrange lanes',
      icon: <AlignVerticalSpaceAround className="size-4" />,
      penGated: true,
      disabledReason: () => 'Start editing to auto-arrange',
      isVisible: (ctx) => ctx.canAutoArrange,
      onActivate: (ctx) => ctx.requestAutoArrange(),
    },
    // Clear visual placement — a Visual-planning action (drops a bar's hand-placed `visualStart` so it
    // falls back to the computed date). "Coming soon" placeholder in the `⋯` overflow.
    placeholderItem({
      id: 'clear-visual-placement',
      group: 'tools',
      tier: 3,
      order: 4,
      label: 'Clear visual placement',
      icon: <Eraser className="size-4" />,
    }),

    // --- 5 · Object / plan actions ------------------------------------------------------------
    {
      id: 'finish-chip',
      group: 'object',
      tier: 1,
      order: 0,
      label: 'Project finish',
      // A read-out, not a control: rendered inline but never a roving-tabindex stop (a11y review —
      // a focusable-but-inert stop breaks the APG toolbar contract and can be nameless mid-load).
      presentational: true,
      isVisible: (ctx) => ctx.hasDiagram,
      render: (ctx, api) => (
        <span {...api.itemProps} className={toolbarControlVariants({ tone: 'info' })}>
          {ctx.projectFinishContent}
        </span>
      ),
    },
    {
      id: 'summary',
      group: 'object',
      tier: 2,
      order: 1,
      label: 'Summary',
      icon: <Info className="size-4" />,
      render: (ctx, api) => (
        <ToolbarPopover
          label="Summary"
          icon={<Info className="size-4" />}
          itemProps={api.itemProps}
        >
          {ctx.summaryContent}
        </ToolbarPopover>
      ),
    },
    {
      id: 'recalculate',
      group: 'object',
      tier: 1,
      order: 2,
      label: 'Recalculate',
      icon: <RefreshCw className="size-4" />,
      isEnabled: (ctx) => ctx.canRecalc && !ctx.recalcPending,
      // Explain the disabled state like the sibling authoring commands do, rather than a silent grey:
      // in-flight (busy) vs. no pen (identical underlying cause to Add activity).
      disabledReason: (ctx) =>
        ctx.recalcPending
          ? 'Recalculating…'
          : ctx.canRecalc
            ? undefined
            : 'Start editing to recalculate',
      onActivate: (ctx) => ctx.recalculate(),
    },
    {
      id: 'baselines',
      group: 'object',
      tier: 3,
      order: 3,
      label: 'Baselines…',
      icon: <Layers className="size-4" />,
      onActivate: (ctx) => ctx.openBaselines(),
    },
    {
      id: 'calendar',
      group: 'object',
      tier: 3,
      order: 4,
      label: 'Calendar…',
      icon: <CalendarDays className="size-4" />,
      onActivate: (ctx) => ctx.openCalendar(),
    },
    {
      id: 'plan-details',
      group: 'object',
      tier: 3,
      order: 5,
      label: 'Plan details…',
      icon: <Info className="size-4" />,
      onActivate: (ctx) => ctx.openPlanDetails(),
    },
    {
      id: 'edit-plan',
      group: 'object',
      tier: 3,
      order: 6,
      label: 'Edit plan…',
      isVisible: (ctx) => ctx.editPlan !== null,
      onActivate: (ctx) => ctx.editPlan?.(),
    },

    // --- 6 · History / status ------------------------------------------------------------------
    // Undo / Redo — high-expectation editing controls, shown inline as "Coming soon" placeholders
    // until the edit-history stack is built (ADR-0031). Icon-only; the label is the accessible name.
    placeholderItem({
      id: 'undo',
      group: 'history',
      tier: 1,
      order: 0,
      label: 'Undo',
      icon: <Undo2 className="size-4" />,
    }),
    placeholderItem({
      id: 'redo',
      group: 'history',
      tier: 1,
      order: 1,
      label: 'Redo',
      icon: <Redo2 className="size-4" />,
    }),

    // --- 7 · Help -----------------------------------------------------------------------------
    {
      id: 'legend',
      group: 'help',
      tier: 2,
      order: 0,
      label: 'Legend',
      icon: <ListChecks className="size-4" />,
      render: (ctx, api) => (
        <ToolbarPopover
          label="Legend"
          icon={<ListChecks className="size-4" />}
          itemProps={api.itemProps}
          align="end"
        >
          {ctx.legendContent}
        </ToolbarPopover>
      ),
    },
    {
      id: 'shortcuts',
      group: 'help',
      tier: 3,
      order: 1,
      label: 'Keyboard shortcuts',
      icon: <Keyboard className="size-4" />,
      onActivate: (ctx) => ctx.openShortcuts(),
    },
  ]);
}
