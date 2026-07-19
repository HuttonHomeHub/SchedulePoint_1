import type { DependencyType } from '@repo/types';
import {
  AlignVerticalSpaceAround,
  BarChart3,
  CalendarDays,
  CalendarRange,
  CalendarSearch,
  Check,
  ChevronDown,
  DollarSign,
  Eraser,
  FileDown,
  Filter,
  Gauge,
  Grid3x3,
  Info,
  Keyboard,
  Layers,
  Layers2,
  ListChecks,
  LocateFixed,
  Maximize2,
  MessageSquare,
  Minus,
  Palette,
  Plus,
  Printer,
  RefreshCw,
  Redo2,
  Route,
  Rows3,
  Search,
  Share2,
  SlidersHorizontal,
  Spline,
  StickyNote,
  TriangleAlert,
  Undo2,
  Waypoints,
} from 'lucide-react';

import type { TsldViewToggles } from '../render/paint';
import { ZOOM_LEVELS } from '../render/time-scale';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { Input } from '@/components/ui/input';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import type { ToolbarItemRenderApi, ToolbarRow } from '@/components/ui/toolbar/toolbar-registry';
import { defineToolbar, type ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';
import { toolbarControlVariants } from '@/components/ui/toolbar/toolbar-styles';
import { ToolbarPopover } from '@/components/ui/toolbar/ToolbarPopover';
import {
  CANVAS_AUTHORING_ENABLED,
  EARNED_VALUE_ENABLED,
  NOTES_ENABLED,
  RESOURCE_CURVES_ENABLED,
  SCHEDULING_MODES_ENABLED,
  TOOLBAR_QUICK_WINS_ENABLED,
  UNDO_REDO_ENABLED,
} from '@/config/env';
import { ACTIVITY_TYPE_LABELS } from '@/features/activities';
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
 * The **Go to date** navigation control (ADR-0033 M2) — a labelled disclosure that opens a small date
 * picker and pans the canvas so the chosen date sits at the left edge. It never writes and persists no
 * state (CQ-1), so it is offered to *every* role, read-only viewers included: navigating the timeline
 * is not a mutation. A popover (not an inline field) so it reads unmistakably as *navigation*. Under
 * the two-row toolbar (ADR-0031 amendment) the persisted **data date** leaves the bar entirely — it is
 * set at plan creation and changed via *Edit plan* — so navigation ("Go to date") and the data anchor
 * are no longer adjacent controls a planner could confuse. Uncontrolled: picking a date jumps once;
 * there is no "current go-to date" to reflect, so nothing is echoed back.
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

/** A small "coming soon" tag for menu rows that preview a not-yet-built activity kind. */
function SoonTag(): React.ReactElement {
  return (
    <span className="border-border text-muted-foreground ml-auto rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
      Soon
    </span>
  );
}

/** A non-interactive section heading inside the Add menu (grouping draw-vs-span kinds). */
function MenuSection({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="text-muted-foreground px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase">
      {children}
    </p>
  );
}

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
        <MenuSection>Draw on the canvas</MenuSection>
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
        {/* Span-between kinds (ADR-0032) are derived from two endpoints, not point-and-draw — so they
            live here as a distinct section, previewed disabled ("Soon") until the endpoint-pick flow
            is built (docs/TOOLBAR_ROADMAP.md). */}
        <div role="separator" className="bg-border my-1 h-px" />
        <MenuSection>Span between activities</MenuSection>
        <MenuItem disabled onSelect={() => {}}>
          <Waypoints aria-hidden="true" className="size-4" />
          Hammock
          <SoonTag />
        </MenuItem>
        <MenuItem disabled onSelect={() => {}}>
          <Rows3 aria-hidden="true" className="size-4" />
          Level of effort
          <SoonTag />
        </MenuItem>
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

const LINK_DISABLED_REASON = 'Start editing to link activities';

/**
 * The **Link split-button** (ADR-0032 M5, ADR-0031 amendment) — the canvas-first two-click dependency
 * tool, now a single APG menu-button that mirrors the {@link AddActivityControl} Add split-button
 * (product decision): the trigger arms/labels the current FS/SS/FF kind and opens a `Menu` to pick it;
 * picking one arms link-mode with that kind (so a pick always means "start linking now"). While
 * linking, the menu also offers "Stop linking". This replaces the old pair (a plain Link toggle + a
 * separate, only-while-linking FS/SS/FF selector) with one consistent control. Pen-gated as one
 * focusable roving stop (spreads `itemProps`).
 */
function LinkControl({
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
        title={disabled ? LINK_DISABLED_REASON : `Link type: ${LINK_TYPE_LABELS[ctx.linkType]}`}
        onClick={() => {
          if (!disabled) toggle();
        }}
        className={cn(toolbarControlVariants({ active: ctx.isLinking || open, disabled }))}
      >
        <Spline aria-hidden="true" className="size-4" />
        <span className="truncate">{ctx.isLinking ? `Linking · ${ctx.linkType}` : 'Link'}</span>
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
            onSelect={() => {
              // Pick the kind and arm link-mode in one gesture (a pick always means "link now"),
              // mirroring the Add split-button. Changing the kind while already linking just re-arms.
              ctx.setLinkType(type);
              if (!ctx.isLinking) ctx.toggleLinkMode();
            }}
          >
            <Check
              aria-hidden="true"
              className={cn('size-4', ctx.linkType === type ? 'opacity-100' : 'opacity-0')}
            />
            {type} — {label}
          </MenuItem>
        ))}
        {ctx.isLinking ? (
          <MenuItem onSelect={() => ctx.toggleLinkMode()}>
            <span aria-hidden="true" className="size-4" />
            Stop linking
          </MenuItem>
        ) : null}
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
  row?: ToolbarRow;
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

/**
 * The **search / filter field** that leads the Find cluster (ADR-0031 two-row amendment) — a
 * presentational placeholder for the not-yet-built activity search. Rendered as a disabled search
 * input (not an icon button) so the affordance reads at a glance the way the old app's did, sized to
 * a comfortable field but shaded until wired. `presentational` keeps a non-operable field out of the
 * roving-tabindex order (a11y); the "Coming soon" title differentiates it from a live-but-empty box.
 */
function SearchFieldControl({
  itemProps,
}: {
  itemProps: ToolbarItemRenderApi['itemProps'];
}): React.ReactElement {
  return (
    <div className="ml-3 flex items-center">
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none -mr-6 size-4"
      />
      <Input
        {...itemProps}
        type="search"
        disabled
        placeholder="Search or filter activities…"
        aria-label="Search or filter activities (coming soon)"
        title="Search / filter activities (coming soon)"
        className="h-8 w-[min(15rem,32vw)] min-w-36 pl-8 text-sm"
      />
    </div>
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
 * The **Undo / Redo controls** (ADR-0048 M3.2) — icon-only authoring-cluster buttons whose accessible
 * name reflects the pending step ("Undo move activity") when the history knows it, falling back to the
 * bare verb, and — when disabled — folds in the item's `disabledReason` ("Nothing to undo") so the
 * reason is reachable to AT (a disabled button's bare `title` isn't reliably announced, so it goes in
 * the accessible name). Rendered as native buttons (mirroring {@link AddActivityControl}) spreading
 * `itemProps` onto the single focusable control, so they join the toolbar's roving-tabindex model;
 * `api.disabled` carries both pen-gating (the whole authoring cluster) and the empty-stack state
 * (`canUndo`/`canRedo`). `aria-keyshortcuts` advertises the accelerator so AT can discover it.
 *
 * These are `render` items, so they are **pinned inline** and never demoted into the `⋯` overflow
 * (unlike the flag-off placeholder buttons) — an intentional choice: undo/redo must always be one
 * reachable click, not buried behind a narrow-bar overflow menu.
 */
function UndoRedoControl({
  direction,
  ctx,
  api,
}: {
  direction: 'undo' | 'redo';
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const disabled = api.disabled;
  const stepLabel = direction === 'undo' ? ctx.undoLabel : ctx.redoLabel;
  const verb = direction === 'undo' ? 'Undo' : 'Redo';
  // Name the pending action where a label exists ("Undo move activity"), else the bare verb; when
  // disabled, surface the reason ("Undo — Nothing to undo"), matching the icon-only ToolbarButton.
  const liveLabel = stepLabel ? `${verb} ${stepLabel.toLowerCase()}` : verb;
  const label = disabled && api.disabledReason ? `${verb} — ${api.disabledReason}` : liveLabel;
  const keyShortcuts = direction === 'undo' ? 'Control+Z' : 'Control+Shift+Z';
  return (
    <button
      {...api.itemProps}
      type="button"
      aria-label={label}
      aria-keyshortcuts={keyShortcuts}
      aria-disabled={disabled || undefined}
      title={label}
      onClick={() => {
        if (!disabled) (direction === 'undo' ? ctx.undo : ctx.redo)();
      }}
      className={cn(toolbarControlVariants({ disabled }))}
    >
      {direction === 'undo' ? (
        <Undo2 aria-hidden="true" className="size-4" />
      ) : (
        <Redo2 aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}

/**
 * The Undo/Redo authoring-cluster items (ADR-0048 M3.2). Flag-**off** keeps the ADR-0031 "Coming soon"
 * placeholder stubs so the toolbar is byte-for-byte the current bar; flag-**on** swaps in the real
 * pen-gated commands (disabled from `canUndo`/`canRedo`, dynamic accessible name, driving `ctx.undo` /
 * `ctx.redo`). They sit at the end of the pen-gated cluster (after Recalculate), tier-2 icon buttons.
 */
function undoRedoToolbarItems(): ToolbarItem<TsldToolbarContext>[] {
  if (!UNDO_REDO_ENABLED) {
    return [
      placeholderItem({
        id: 'undo',
        group: 'tools',
        row: 'do',
        tier: 2,
        order: 8,
        label: 'Undo',
        icon: <Undo2 className="size-4" />,
      }),
      placeholderItem({
        id: 'redo',
        group: 'tools',
        row: 'do',
        tier: 2,
        order: 9,
        label: 'Redo',
        icon: <Redo2 className="size-4" />,
      }),
    ];
  }
  return [
    {
      id: 'undo',
      group: 'tools',
      row: 'do',
      tier: 2,
      order: 8,
      label: 'Undo',
      penGated: true,
      isEnabled: (ctx) => ctx.canUndo,
      disabledReason: (ctx) => (ctx.canUndo ? undefined : 'Nothing to undo'),
      render: (ctx, api) => <UndoRedoControl direction="undo" ctx={ctx} api={api} />,
    },
    {
      id: 'redo',
      group: 'tools',
      row: 'do',
      tier: 2,
      order: 9,
      label: 'Redo',
      penGated: true,
      isEnabled: (ctx) => ctx.canRedo,
      disabledReason: (ctx) => (ctx.canRedo ? undefined : 'Nothing to redo'),
      render: (ctx, api) => <UndoRedoControl direction="redo" ctx={ctx} api={api} />,
    },
  ];
}

/**
 * The TSLD command registry (ADR-0031, two-row amendment) — every canvas control expressed as a
 * {@link ToolbarItem} over the {@link TsldToolbarContext}, grouped by the fixed 7-group taxonomy and
 * split across **two toolbar rows** via each item's `row`:
 *
 * - **Row 1 · Look** (`row: 'look'`) — view & navigate: Go-to-date, the zoom cluster, View toggles,
 *   the Early | Visual scheduling-mode segment, the search field + find/analyse lenses, and the
 *   right-aligned Finish read-out + Summary + Legend. Always live; nothing here needs the pen.
 * - **Row 2 · Do** (`row: 'do'`) — build & manage: a pen-gated **authoring cluster** (Add, Link,
 *   Auto-arrange, note/snap/clear, Recalculate, Undo/Redo) that shades as one set when the pen isn't
 *   held, then plan & deliverable actions (Baselines, Calendar, Update progress,
 *   Export/Print/Share/Comments) that stay live because they don't author. (Plan details + Edit plan
 *   are folded into the Row 1 Summary popover; Keyboard shortcuts rides Row 1 beside Legend.)
 *
 * The workspace renders one {@link Toolbar} per row (via `splitByRow`); grouping/tiering/overflow are
 * unchanged within each row. Real controls sit alongside **future-feature placeholders** — disabled
 * "Coming soon" stubs (filter, snap-to-grid, next-conflict, colour-by, baseline-overlay, resource-view,
 * export/print/share, plus Hammock / Level-of-effort in the Add menu) that make the toolbar read as fully
 * designed and are switched on later by swapping the stub for a real command (`docs/TOOLBAR_ROADMAP.md`).
 * (undo/redo swap in under `VITE_UNDO_REDO`; go-to-today, comments, add-note, update-progress and
 * clear-visual-placement swap in under `VITE_TOOLBAR_QUICK_WINS` — placeholders only when that flag is off.)
 *
 * Two design rules the registry enforces (ADR-0031):
 * 1. **Stable shape, shade-don't-hide** — a capability that is temporarily unavailable (e.g. zoom
 *    before a diagram is computed, or an authoring tool while viewing) is *disabled with a reason*,
 *    not removed, so the bar's silhouette doesn't shift between viewing and editing. Only a
 *    genuinely-absent feature (flag-off) uses `isVisible`.
 * 2. **One consolidated zoom control** — the five scale levels live in a single dropdown so the Frame
 *    group stops overflowing narrow bars (which used to silently demote Year/Quarter into `⋯`).
 *
 * NB the persisted **data date** has no toolbar control (it is set at plan creation and changed via
 * *Edit plan*); `today` is a viewport **Go-to-today** jump (today at the left inset, not centred),
 * distinct from the "Today line" display toggle in `View▾` (which only shows/hides the marker).
 */
export function buildTsldToolbarItems(): ToolbarItem<TsldToolbarContext>[] {
  // Toolbar quick-wins (VITE_TOOLBAR_QUICK_WINS) shared item shapes — the id/group/row/tier/order/
  // label/icon each of the five ids carries in BOTH its real (flag-on) item and its
  // `placeholderItem()` (flag-off) stub, declared once and spread into both so the two branches can't
  // drift (component review C1; mirrors the `add-activity` shared-shape pattern below).
  const todayShape = {
    id: 'today',
    group: 'frame' as const,
    row: 'look' as const,
    tier: 2 as const,
    order: 13,
    label: 'Go to today',
    icon: <LocateFixed className="size-4" />,
  };
  const addNoteShape = {
    id: 'add-note',
    group: 'tools' as const,
    row: 'do' as const,
    tier: 2 as const,
    order: 4,
    label: 'Add note',
    icon: <StickyNote className="size-4" />,
  };
  const clearVisualPlacementShape = {
    id: 'clear-visual-placement',
    group: 'tools' as const,
    row: 'do' as const,
    tier: 2 as const,
    order: 6,
    label: 'Clear visual placement',
    icon: <Eraser className="size-4" />,
  };
  const updateProgressShape = {
    id: 'update-progress',
    group: 'object' as const,
    row: 'do' as const,
    tier: 2 as const,
    order: 6,
    label: 'Update progress…',
    icon: <Gauge className="size-4" />,
  };
  const commentsShape = {
    id: 'comments',
    group: 'object' as const,
    row: 'do' as const,
    tier: 2 as const,
    order: 10,
    label: 'Comments',
    icon: <MessageSquare className="size-4" />,
  };
  return defineToolbar<TsldToolbarContext>([
    // --- 1 · Frame / navigate (Row 1 · Look) --------------------------------------------------
    // "Go to date" is a pure view pan (ADR-0033 M2) offered to every role — navigating never mutates.
    // The persisted **data date** no longer lives on the bar (ADR-0031 two-row amendment): it is set at
    // plan creation and changed via *Edit plan* (and will become the status date under *Update
    // progress*), so navigation and the data anchor can no longer be confused as adjacent date fields.
    {
      id: 'go-to-date',
      group: 'frame',
      row: 'look',
      tier: 1,
      order: -2,
      label: 'Go to date',
      isVisible: (ctx) => SCHEDULING_MODES_ENABLED && ctx.plannedStart !== null,
      render: (ctx, api) => <GoToDateControl ctx={ctx} itemProps={api.itemProps} />,
    },
    // Zoom — one dropdown (Day…Year) plus −/+ and Fit, a compact cluster in the Frame group (ADR-0031).
    // Always on Row 1 (Look) and shaded (not hidden) until a diagram exists, so the bar keeps a stable
    // shape from the empty canvas onward.
    {
      id: 'zoom-preset',
      group: 'frame',
      row: 'look',
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
      row: 'look',
      tier: 2,
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
      row: 'look',
      tier: 2,
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
      row: 'look',
      tier: 2,
      order: 12,
      label: 'Fit to plan',
      icon: <Maximize2 className="size-4" />,
      isEnabled: (ctx) => ctx.hasDiagram,
      disabledReason: (ctx) => (ctx.hasDiagram ? undefined : 'Add an activity to fit the view'),
      onActivate: (ctx) => ctx.fit(),
    },
    // Go-to-today — a viewport jump that places today at the left edge (distinct from the "Today line"
    // *display* toggle in `View▾`). Named "Go to today" (not "Recenter") for honesty: `goToDate` pins the
    // day at the 12px left inset, it does not centre (label-honesty nit). Shown inline (tier 2 icon) with
    // the zoom/nav cluster. Flag-on it reuses the `goToDate` view jump (toolbar quick-wins F1) — view-only,
    // so a Viewer can use it; flag-off it is the "Coming soon" placeholder, byte-for-byte.
    TOOLBAR_QUICK_WINS_ENABLED
      ? {
          ...todayShape,
          isEnabled: (ctx) => ctx.hasDiagram,
          disabledReason: (ctx) => (ctx.hasDiagram ? undefined : 'Add an activity to go to today'),
          onActivate: (ctx) => ctx.goToDate(ctx.todayIso),
        }
      : placeholderItem(todayShape),

    // --- 2 · Lens / display (Row 1 · Look) ----------------------------------------------------
    {
      id: 'view',
      group: 'lens',
      row: 'look',
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
    // Scheduling-mode selector (ADR-0033 M3, flag-on only): the Early | Visual segment, immediately
    // after View in the Lens group. Two-row rule (ADR-0031 amendment): shown **always** (flag-on) and
    // shaded — not hidden — for a read-only viewer (null setter), since the mode changes how the
    // diagram reads and must be legible to everyone; only writers can operate it. Tier 1 so the labels
    // render (a tier-2 label-less segment paints blank — ux review).
    {
      id: 'mode-early',
      group: 'lens',
      row: 'look',
      tier: 1,
      order: 1,
      label: 'Early mode',
      isVisible: () => SCHEDULING_MODES_ENABLED,
      isEnabled: (ctx) => ctx.setSchedulingMode !== null,
      disabledReason: (ctx) =>
        ctx.setSchedulingMode === null ? 'Start editing to change the scheduling mode' : undefined,
      isActive: (ctx) => ctx.schedulingMode === 'EARLY',
      onActivate: (ctx) => ctx.setSchedulingMode?.('EARLY'),
    },
    {
      id: 'mode-visual',
      group: 'lens',
      row: 'look',
      tier: 1,
      order: 2,
      label: 'Visual mode',
      isVisible: () => SCHEDULING_MODES_ENABLED,
      isEnabled: (ctx) => ctx.setSchedulingMode !== null,
      disabledReason: (ctx) =>
        ctx.setSchedulingMode === null ? 'Start editing to change the scheduling mode' : undefined,
      isActive: (ctx) => ctx.schedulingMode === 'VISUAL',
      onActivate: (ctx) => ctx.setSchedulingMode?.('VISUAL'),
    },
    // view-mode switch slot — reserved (TSLD is lens #1). Registered hidden; promotable later. The
    // Gantt/Resource lens switch isn't surfaced until a second view exists (product call), so the seam
    // stays in the code but paints nothing.
    {
      id: 'view-mode',
      group: 'lens',
      row: 'look',
      tier: 1,
      order: 10,
      label: 'View mode',
      isVisible: () => false,
      onActivate: () => {},
    },
    // Analyse placeholders (Row 1) — shown **inline** (tier 2 icon buttons) rather than parked in `⋯`,
    // so the intended lenses read at a glance beside the search field (ADR-0031 two-row amendment).
    // Colour-by recolours bars by status/WBS/critical/resource; baseline-overlay ghosts the active
    // baseline; resource-view is the second (histogram) lens that folds into `view-mode` when built.
    placeholderItem({
      id: 'colour-by',
      group: 'lens',
      row: 'look',
      tier: 2,
      order: 3,
      label: 'Colour by…',
      icon: <Palette className="size-4" />,
    }),
    placeholderItem({
      id: 'baseline-overlay',
      group: 'lens',
      row: 'look',
      tier: 2,
      order: 4,
      label: 'Baseline overlay',
      icon: <Layers2 className="size-4" />,
    }),
    placeholderItem({
      id: 'resource-view',
      group: 'lens',
      row: 'look',
      tier: 2,
      order: 5,
      label: 'Resource view',
      icon: <BarChart3 className="size-4" />,
    }),

    // --- 3 · Find / focus (Row 1 · Look) ------------------------------------------------------
    // Search / filter field — leads the Find cluster as a real (disabled) input, so the affordance
    // reads the way the old app's did (ADR-0031 two-row amendment). Presentational until wired, so it
    // isn't a roving-tabindex stop while inert.
    {
      id: 'search',
      group: 'find',
      row: 'look',
      tier: 1,
      order: -1,
      label: 'Search or filter activities',
      presentational: true,
      render: (_ctx, api) => <SearchFieldControl itemProps={api.itemProps} />,
    },
    // Filter / critical-only, isolate-logic and next-conflict — inline "Coming soon" icon placeholders
    // trailing the search field (tier 2; no longer parked in `⋯`).
    placeholderItem({
      id: 'filter',
      group: 'find',
      row: 'look',
      tier: 2,
      order: 0,
      label: 'Filter',
      icon: <Filter className="size-4" />,
    }),
    placeholderItem({
      id: 'isolate-logic',
      group: 'find',
      row: 'look',
      tier: 2,
      order: 1,
      label: 'Isolate logic path',
      icon: <Route className="size-4" />,
    }),
    placeholderItem({
      id: 'next-conflict',
      group: 'find',
      row: 'look',
      tier: 2,
      order: 2,
      label: 'Next conflict',
      icon: <TriangleAlert className="size-4" />,
    }),

    // --- 4 · Tools / author (Row 2 · Do — pen-gated authoring cluster) ------------------------
    // The whole authoring cluster shades as one set when the pen isn't held (ADR-0028 + the ADR-0031
    // two-row amendment): Add, Link, Auto-arrange, note/snap/clear, then Recalculate and Undo/Redo —
    // moved here from the Object/History groups so the pen-gated set is contiguous. Plan & deliverable
    // actions (baselines, calendar, export…) stay live on the same row because they don't need the pen.
    // Add activity — a plain toggle button flag-off (byte-for-byte unchanged); flag-on the canvas-first
    // Add split-button (ADR-0032 M4), a menu-button that also picks the draw kind (task / milestone).
    {
      id: 'add-activity',
      group: 'tools',
      row: 'do',
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
    // Link split-button (ADR-0032 M5, ADR-0031 amendment) — one menu-button that arms link-mode and
    // picks FS/SS/FF, mirroring Add. Shown **always** when canvas-first authoring is on
    // (shade-don't-hide) and pen-gated, so a viewer sees it disabled rather than missing.
    {
      id: 'link-tool',
      group: 'tools',
      row: 'do',
      tier: 1,
      order: 1,
      label: 'Link activities',
      penGated: true,
      disabledReason: () => LINK_DISABLED_REASON,
      isVisible: () => CANVAS_AUTHORING_ENABLED,
      render: (ctx, api) => <LinkControl ctx={ctx} api={api} />,
    },
    {
      id: 'auto-arrange',
      group: 'tools',
      row: 'do',
      tier: 2,
      order: 3,
      label: 'Auto-arrange lanes',
      icon: <AlignVerticalSpaceAround className="size-4" />,
      penGated: true,
      disabledReason: () => 'Start editing to auto-arrange',
      // Shade-don't-hide (ADR-0031): the tool stays on the bar and greys with the rest of the
      // authoring cluster when the pen isn't held, rather than appearing/disappearing across
      // view↔edit. `canAutoArrange` gates it as enabled (via isEnabled), penGating greys it.
      isEnabled: (ctx) => ctx.canAutoArrange,
      onActivate: (ctx) => ctx.requestAutoArrange(),
    },
    // Add note — opens the selected activity's Logic panel at its Notes section (toolbar quick-wins F4,
    // the same path as the canvas "Open logic"). Role-gated (`canWriteNotes`, Contributor+) + a
    // selection; NOT pen-gated (the notes precedent, ADR-0046). Absent when `VITE_NOTES` is off (there
    // is no notes section to open). Flag-off it is the "Coming soon" placeholder, byte-for-byte.
    TOOLBAR_QUICK_WINS_ENABLED
      ? {
          ...addNoteShape,
          isVisible: () => NOTES_ENABLED,
          // Gate on the RESOLVED row (U3): an id whose row was deleted elsewhere resolves to undefined,
          // so an enabled button always has a real target for `openActivityNotes`.
          isEnabled: (ctx) => ctx.canWriteNotes && ctx.selectedActivity != null,
          // Permanent role gate BEFORE the transient selection (U2/A5): a Contributor-lacking user is
          // told they can't add notes, not (misleadingly) to select something first.
          disabledReason: (ctx) =>
            !ctx.canWriteNotes
              ? 'You don’t have permission to add notes'
              : ctx.selectedActivity == null
                ? 'Select an activity first'
                : undefined,
          onActivate: (ctx) => ctx.openActivityNotes(),
        }
      : placeholderItem(addNoteShape),
    // Snap-to-grid — a Visual-planning authoring aid (snaps hand-placed bars to working-day gridlines).
    // Moved into the authoring cluster (was in the Lens group). Inline "Coming soon" icon.
    placeholderItem({
      id: 'snap-to-grid',
      group: 'tools',
      row: 'do',
      tier: 2,
      order: 5,
      label: 'Snap to grid',
      icon: <Grid3x3 className="size-4" />,
    }),
    // Clear visual placement — a Visual-planning action (drops a bar's hand-placed `visualStart` so it
    // falls back to the computed date, toolbar quick-wins F5). Only *meaningful* in Visual mode, but per
    // the registry's shade-don't-hide rule (ADR-0031 + docs/TOOLBAR_ROADMAP.md) it stays VISIBLE in both
    // modes and is disabled-with-a-reason outside Visual (U1) — like the mode-early/mode-visual siblings —
    // so toggling Early↔Visual doesn't shift the bar's silhouette. Pen-gated; it calls only the existing
    // PATCH + auto-recalc, so the CPM engine + parity gate are untouched. Flag-off it is the "Coming soon"
    // placeholder, byte-for-byte.
    TOOLBAR_QUICK_WINS_ENABLED
      ? {
          ...clearVisualPlacementShape,
          penGated: true,
          isVisible: () => SCHEDULING_MODES_ENABLED,
          // Enabled only when it's actionable end-to-end: Visual mode AND the pen/role AND not the
          // read-only Late overlay AND a RESOLVED selection (U3 — a deleted row resolves to undefined).
          isEnabled: (ctx) =>
            ctx.schedulingMode === 'VISUAL' &&
            ctx.canEditSchedule &&
            !ctx.lateOverlayActive &&
            ctx.selectedActivity != null,
          // Precedence ladder (U1/A1/U2/A5): the PERMANENT gates before the transient selection, so a
          // Viewer with nothing selected isn't first told to "Select an activity". Mode → role/pen →
          // Late overlay (A1: the generic Toolbar disables penGated items under the overlay while
          // `canEditSchedule` stays true, so the reason must come from `lateOverlayActive`) → selection.
          disabledReason: (ctx) =>
            ctx.schedulingMode !== 'VISUAL'
              ? 'Only available in Visual mode'
              : !ctx.canEditSchedule
                ? 'Start editing to clear the placement'
                : ctx.lateOverlayActive
                  ? 'Turn off the Late-start overlay to clear the placement'
                  : ctx.selectedActivity == null
                    ? 'Select an activity first'
                    : undefined,
          onActivate: (ctx) => {
            const activity = ctx.selectedActivity;
            if (activity) ctx.clearVisualPlacement(activity.id, activity.version);
          },
        }
      : placeholderItem(clearVisualPlacementShape),
    // Recalculate + Undo/Redo close the authoring cluster (moved here from the Object/History groups so
    // the pen-gated set is contiguous). Recalculate is enabled only with the pen and when not in flight.
    {
      id: 'recalculate',
      group: 'tools',
      row: 'do',
      tier: 1,
      order: 7,
      label: 'Recalculate',
      icon: <RefreshCw className="size-4" />,
      penGated: true,
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
    // Undo / Redo close the pen-gated authoring cluster (ADR-0048 M3.2). Flag-off these are the
    // ADR-0031 "Coming soon" placeholders (byte-for-byte the current bar); flag-on they are the real
    // pen-gated commands, disabled from `canUndo`/`canRedo` with a dynamic accessible name.
    ...undoRedoToolbarItems(),

    // --- 5 · Object / plan actions ------------------------------------------------------------
    // Finish read-out + Summary popover stay on Row 1 (Look): they report the computed schedule and
    // don't need the pen. They right-align via the toolbar's `alignEndGroup="object"` on Row 1.
    {
      id: 'finish-chip',
      group: 'object',
      row: 'look',
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
      row: 'look',
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
    // Plan & deliverables (Row 2 · Do) — available whether or not you hold the pen (they open dialogs /
    // export; they don't author on the canvas). Shown inline as icon buttons (tier 2). The persisted
    // **data date** is changed here, via *Edit plan* — it no longer has its own control on the bar.
    {
      id: 'baselines',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 2,
      label: 'Baselines…',
      icon: <Layers className="size-4" />,
      onActivate: (ctx) => ctx.openBaselines(),
    },
    {
      id: 'calendar',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 3,
      label: 'Calendar…',
      icon: <CalendarDays className="size-4" />,
      onActivate: (ctx) => ctx.openCalendar(),
    },
    // Earned value (EV4b, ADR-0042) — opens the analysis dialog; a read action (no pen). Gated behind
    // `VITE_EARNED_VALUE`, so it's absent from the bar until the surface ships.
    {
      id: 'earned-value',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 4,
      label: 'Earned value…',
      icon: <DollarSign className="size-4" />,
      isVisible: () => EARNED_VALUE_ENABLED,
      onActivate: (ctx) => ctx.openEarnedValue(),
    },
    // Resource histogram (M7 rung 5, ADR-0044 §3) — opens the resource-loading read dialog; a read
    // action (no pen). Gated behind `VITE_RESOURCE_CURVES`, so it's absent until the surface ships.
    {
      id: 'resource-histogram',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 5,
      label: 'Resource histogram…',
      icon: <BarChart3 className="size-4" />,
      isVisible: () => RESOURCE_CURVES_ENABLED,
      onActivate: (ctx) => ctx.openResourceHistogram(),
    },
    // Plan details + Edit plan are no longer toolbar buttons (ADR-0031 amendment): the key facts
    // (status, data date, mode) now live in the Summary popover, which also carries an "Edit plan…"
    // shortcut; the header shows an edit-pencil next to the status pill for quick access.
    // Deliverables + collaboration — inline "Coming soon" icon placeholders (Row 2; see
    // docs/TOOLBAR_ROADMAP.md). Update progress (apply actuals + advance the data date); Export the
    // diagram (PDF/PNG) or schedule (XER/MSP/CSV); Print; Share (the ADR-0012 per-plan guest link);
    // Comments (activity threads).
    // Update progress — opens the shared `ActivityProgressDialog` for the selected activity (toolbar
    // quick-wins F3). Role-gated (`canProgress`, Contributor+) + a selection; NOT pen-gated (progress
    // is the notes/progress precedent). Flag-off it is the "Coming soon" placeholder, byte-for-byte.
    TOOLBAR_QUICK_WINS_ENABLED
      ? {
          ...updateProgressShape,
          // Gate on the RESOLVED row (U3): a deleted-elsewhere id resolves to undefined, so an enabled
          // button always has a real target for `openProgress`.
          isEnabled: (ctx) => ctx.canProgress && ctx.selectedActivity != null,
          // Permanent role gate BEFORE the transient selection (U2/A5): a Viewer is told they can't
          // report progress, not (misleadingly) to select an activity first.
          disabledReason: (ctx) =>
            !ctx.canProgress
              ? 'You don’t have permission to report progress'
              : ctx.selectedActivity == null
                ? 'Select an activity first'
                : undefined,
          onActivate: (ctx) => ctx.openProgress(),
        }
      : placeholderItem(updateProgressShape),
    placeholderItem({
      id: 'export',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 7,
      label: 'Export…',
      icon: <FileDown className="size-4" />,
    }),
    placeholderItem({
      id: 'print',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 8,
      label: 'Print…',
      icon: <Printer className="size-4" />,
    }),
    placeholderItem({
      id: 'share',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 9,
      label: 'Share…',
      icon: <Share2 className="size-4" />,
    }),
    // Comments — reveals + focuses the plan-level notes thread (toolbar quick-wins F2). Read action for
    // every role; absent when `VITE_NOTES` is off (there is nothing to reveal). Flag-off it is the
    // "Coming soon" placeholder, byte-for-byte.
    TOOLBAR_QUICK_WINS_ENABLED
      ? {
          ...commentsShape,
          isVisible: () => NOTES_ENABLED,
          onActivate: (ctx) => ctx.revealComments(),
        }
      : placeholderItem(commentsShape),

    // --- 6 · Help -----------------------------------------------------------------------------
    // Legend rides Row 1 (Look) at the far right; Shortcuts sits beside it. (Undo/Redo moved to the
    // Row-2 authoring cluster above, so the History group holds no toolbar items now.)
    // The legend lives **on the canvas** now (ADR-0031 amendment): this is a show/hide toggle for the
    // floating Legend panel (draggable + pinnable over the diagram), not a popover that renders the key.
    {
      id: 'legend',
      group: 'help',
      row: 'look',
      tier: 2,
      order: 0,
      label: 'Legend',
      icon: <ListChecks className="size-4" />,
      isActive: (ctx) => ctx.legendOpen,
      onActivate: (ctx) => ctx.toggleLegend(),
    },
    {
      // Keyboard shortcuts belong with the reference controls, not the authoring row: shown at the
      // far right of Row 1 (help group, beside Legend) and also bound to the `?` key by the workspace
      // (ADR-0031 amendment) — the standard "press ? for shortcuts" affordance.
      id: 'shortcuts',
      group: 'help',
      row: 'look',
      tier: 2,
      order: 1,
      label: 'Keyboard shortcuts',
      icon: <Keyboard className="size-4" />,
      onActivate: (ctx) => ctx.openShortcuts(),
    },
  ]);
}
