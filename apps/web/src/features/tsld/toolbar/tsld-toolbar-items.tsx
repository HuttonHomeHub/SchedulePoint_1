import type { ActivityType, DependencyType } from '@repo/types';
import {
  AlignVerticalSpaceAround,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  Info,
  Keyboard,
  Layers,
  ListChecks,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Spline,
} from 'lucide-react';
import { useRef, useState } from 'react';

import type { TsldViewToggles } from '../render/paint';
import { ZOOM_LEVELS } from '../render/time-scale';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Menu, MenuItem } from '@/components/ui/menu';
import type { ToolbarItemRenderApi } from '@/components/ui/toolbar/toolbar-registry';
import { defineToolbar, type ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';
import { toolbarControlVariants } from '@/components/ui/toolbar/toolbar-styles';
import { ToolbarPopover } from '@/components/ui/toolbar/ToolbarPopover';
import { CANVAS_AUTHORING_ENABLED } from '@/config/env';
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
 * The inline **timeline start-date** control (ADR-0032 M2) — the plan's `plannedStart`, the canvas
 * day-zero origin. A writer edits it via a native date input (pen-gated: `setPlannedStart` is null
 * for read-only viewers, who instead see the date as a focusable static read-out so it still holds a
 * roving-tabindex stop). Changing it re-anchors the timeline. Both variants spread `itemProps` on
 * their single focusable control per the toolbar contract.
 */
function TimelineStartControl({
  ctx,
  itemProps,
}: {
  ctx: TsldToolbarContext;
  itemProps: ToolbarItemRenderApi['itemProps'];
}): React.ReactElement {
  const display = ctx.plannedStart ? formatCalendarDate(ctx.plannedStart) : 'Not set';
  if (!ctx.setPlannedStart) {
    return (
      <span
        {...itemProps}
        aria-label={`Timeline start: ${display}`}
        className={toolbarControlVariants({ tone: 'info' })}
      >
        <CalendarClock aria-hidden="true" className="mr-1.5 size-4" />
        {display}
      </span>
    );
  }
  const setPlannedStart = ctx.setPlannedStart;
  return (
    <label className={toolbarControlVariants({ tone: 'control' })}>
      <CalendarClock aria-hidden="true" className="size-4" />
      <span className="sr-only">Timeline start</span>
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

/** The activity kinds the canvas-first Add split-button offers, in menu order (ADR-0032 M4). Only the
 * three planners draw directly — hammock / level-of-effort are derived, not point-and-draw. */
const ADD_ACTIVITY_TYPES: ReadonlyArray<{ type: ActivityType; label: string }> = [
  { type: 'TASK', label: 'Task' },
  { type: 'START_MILESTONE', label: 'Start milestone' },
  { type: 'FINISH_MILESTONE', label: 'Finish milestone' },
];
const ADD_ACTIVITY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ADD_ACTIVITY_TYPES.map(({ type, label }) => [type, label]),
);
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const disabled = api.disabled;

  const openMenu = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
    setOpen(true);
  };

  const activeLabel = ADD_ACTIVITY_TYPE_LABELS[ctx.createType] ?? 'Task';
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
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu();
        }}
        className={cn(toolbarControlVariants({ active: ctx.isAddingActivity || open, disabled }))}
      >
        <Plus aria-hidden="true" className="size-4" />
        <span className="truncate">{ctx.isAddingActivity ? `Adding ${activeLabel}` : 'Add'}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label="Add activity type"
        restoreFocusRef={triggerRef}
      >
        {ADD_ACTIVITY_TYPES.map(({ type, label }) => (
          <MenuItem key={type} onSelect={() => ctx.setCreateType(type)}>
            <Check
              aria-hidden="true"
              className={cn('size-4', ctx.createType === type ? 'opacity-100' : 'opacity-0')}
            />
            {label}
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

/**
 * The Link tool's **dependency-type selector** (ADR-0032 M5) — a compact menu-button showing the
 * armed FS/SS/FF code, opening a `Menu` to switch it. Only shown while the Link tool is active. One
 * focusable control (spreads `itemProps`) per the toolbar contract.
 */
function LinkTypeControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const disabled = api.disabled;

  const openMenu = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
    setOpen(true);
  };

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
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu();
        }}
        className={cn(toolbarControlVariants({ active: open, disabled }))}
      >
        <span className="truncate">{ctx.linkType}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label="Link type"
        restoreFocusRef={triggerRef}
      >
        {LINK_TYPES.map(({ type, label }) => (
          <MenuItem key={type} onSelect={() => ctx.setLinkType(type)}>
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
    </fieldset>
  );
}

/**
 * The TSLD command registry (ADR-0031) — every current canvas control expressed as a
 * {@link ToolbarItem} over the {@link TsldToolbarContext}, grouped by the fixed 7-group taxonomy.
 * The abstraction is validated by porting the *real* controls (scale/zoom/fit, view toggles,
 * add-activity, auto-arrange, recalculate, baselines/calendar/plan-details, legend, summary + finish
 * chip) onto it — reserved slots (today-recenter, view-mode switch, filter, undo/redo) are registered
 * as hidden stubs so they're promotable later without a taxonomy change.
 *
 * NB the `today` reserved stub is a viewport **recenter** command, distinct from the "Today line"
 * display toggle in `View▾` (which only shows/hides the marker) — that toggle is the only "today"
 * capability the source layout shipped; a recenter command is future work (ADR-0031 §3).
 */
export function buildTsldToolbarItems(): ToolbarItem<TsldToolbarContext>[] {
  return defineToolbar<TsldToolbarContext>([
    // --- 1 · Frame / navigate -----------------------------------------------------------------
    // Inline timeline start-date (ADR-0032 M2) — leftmost in the Frame group; canvas-first only.
    {
      id: 'timeline-start',
      group: 'frame',
      tier: 1,
      order: -1,
      label: 'Timeline start',
      isVisible: () => CANVAS_AUTHORING_ENABLED,
      render: (ctx, api) => <TimelineStartControl ctx={ctx} itemProps={api.itemProps} />,
    },
    ...ZOOM_LEVELS.map((level, i): ToolbarItem<TsldToolbarContext> => ({
      id: `scale-${level}`,
      group: 'frame',
      tier: 1,
      order: i,
      label: ZOOM_LABELS[level] ?? level,
      isVisible: (ctx) => ctx.hasDiagram,
      isActive: (ctx) => ctx.zoomPreset === level,
      onActivate: (ctx) => ctx.setZoomPreset(level),
    })),
    {
      id: 'zoom-out',
      group: 'frame',
      tier: 1,
      order: 10,
      label: 'Zoom out',
      icon: <Minus className="size-4" />,
      isVisible: (ctx) => ctx.hasDiagram,
      onActivate: (ctx) => ctx.stepZoom(0.5),
    },
    {
      id: 'zoom-in',
      group: 'frame',
      tier: 1,
      order: 11,
      label: 'Zoom in',
      icon: <Plus className="size-4" />,
      isVisible: (ctx) => ctx.hasDiagram,
      onActivate: (ctx) => ctx.stepZoom(2),
    },
    {
      id: 'fit',
      group: 'frame',
      tier: 1,
      order: 12,
      label: 'Fit to plan',
      icon: <Maximize2 className="size-4" />,
      isVisible: (ctx) => ctx.hasDiagram,
      onActivate: (ctx) => ctx.fit(),
    },
    // today-recenter slot — reserved (only the "Today line" *toggle* ships, in `View▾`). Registered
    // hidden so a viewport-recenter command is promotable later without a taxonomy change.
    {
      id: 'today',
      group: 'frame',
      tier: 1,
      order: 13,
      label: 'Recenter on today',
      isVisible: () => false,
      onActivate: () => {},
    },

    // --- 2 · Lens / display -------------------------------------------------------------------
    {
      id: 'view',
      group: 'lens',
      tier: 2,
      order: 0,
      label: 'View',
      icon: <SlidersHorizontal className="size-4" />,
      isVisible: (ctx) => ctx.hasDiagram,
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

    // --- 3 · Find / focus (reserved) ----------------------------------------------------------
    {
      id: 'filter',
      group: 'find',
      tier: 2,
      order: 0,
      label: 'Filter',
      isVisible: () => false,
      onActivate: () => {},
    },

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

    // --- 6 · History / status (reserved undo/redo; pen status lands in M3) ---------------------
    {
      id: 'undo',
      group: 'history',
      tier: 1,
      order: 0,
      label: 'Undo',
      isVisible: () => false,
      onActivate: () => {},
    },

    // --- 7 · Help -----------------------------------------------------------------------------
    {
      id: 'legend',
      group: 'help',
      tier: 2,
      order: 0,
      label: 'Legend',
      icon: <ListChecks className="size-4" />,
      isVisible: (ctx) => ctx.hasDiagram,
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
      isVisible: (ctx) => ctx.hasDiagram,
      onActivate: (ctx) => ctx.openShortcuts(),
    },
  ]);
}
