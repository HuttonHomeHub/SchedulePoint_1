// `DEPENDENCY_TYPES` is the canonical set the Prisma enum mirrors; `DEPENDENCY_TYPE_LABELS` is the
// wording the Logic panel already uses. Taking the set from the domain and the words from the shared
// labels is what stops this surface and that one describing the product differently.
import { DEPENDENCY_TYPES, type DependencyType } from '@repo/types';
import {
  AlignVerticalSpaceAround,
  ArrowLeftToLine,
  BookOpen,
  CalendarDays,
  ChartArea,
  ChartGantt,
  Check,
  ChevronDown,
  Crop,
  DollarSign,
  FileCode,
  FileDown,
  FileSpreadsheet,
  FileText,
  FileType,
  Filter,
  Hand,
  ImageDown,
  Info,
  Layers,
  Loader2,
  LocateFixed,
  Maximize2,
  MessageSquare,
  Minus,
  Plus,
  Printer,
  Redo2,
  RefreshCw,
  Rows3,
  Search,
  Share2,
  SlidersHorizontal,
  Spline,
  Split,
  SquareDashedMousePointer,
  StickyNote,
  TriangleAlert,
  Undo2,
  Users,
  Waypoints,
  X,
} from 'lucide-react';
import { useId, useRef } from 'react';

import { FILTER_ATTRS, type ColourMode } from '../render/lenses';
import type { TsldViewToggles } from '../render/paint';
import { ZOOM_RANGE_LABELS } from '../render/render-model';
import { ZOOM_LEVELS } from '../render/time-scale';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { useFirstUseHint } from './use-first-use-hint';

import { Input } from '@/components/ui/input';
import { Menu, MenuItem, MenuSection, useMenuTrigger } from '@/components/ui/menu';
import type {
  ToolbarItemRenderApi,
  ToolbarLayoutMode,
  ToolbarRow,
} from '@/components/ui/toolbar/toolbar-registry';
import {
  bandIsAtLeast,
  defineToolbar,
  type ToolbarItem,
} from '@/components/ui/toolbar/toolbar-registry';
import { toolbarControlVariants } from '@/components/ui/toolbar/toolbar-styles';
import { ToolbarPopover } from '@/components/ui/toolbar/ToolbarPopover';
import { ToolbarSplitButton } from '@/components/ui/toolbar/ToolbarSplitButton';
import { usePopoverPanel } from '@/components/ui/toolbar/use-popover-panel';
import {
  CANVAS_ACTIVITY_TYPES_ENABLED,
  CANVAS_AUTHORING_ENABLED,
  CANVAS_DATA_DATE_ENABLED,
  CANVAS_LENSES_ENABLED,
  CANVAS_MULTI_SELECT_ENABLED,
  CANVAS_SEARCH_NAV_ENABLED,
  CANVAS_LIVE_FEEDBACK_ENABLED,
  CANVAS_NAV_ENABLED,
  CANVAS_RESOURCE_VIEW_ENABLED,
  CANVAS_TIME_AXIS_ENABLED,
  CANVAS_VISUAL_LANGUAGE_ENABLED,
  EARNED_VALUE_ENABLED,
  ENTRY_ROUTES_ENABLED,
  EXPORT_PRINT_ENABLED,
  FLOAT_PATHS_ENABLED,
  GANTT_VIEW_ENABLED,
  GUEST_SHARE_LINKS_ENABLED,
  NOTES_ENABLED,
  RESOURCE_CURVES_ENABLED,
  SCHEDULE_INTERCHANGE_ENABLED,
  SCHEDULING_MODES_ENABLED,
  TOOLBAR_QUICK_WINS_ENABLED,
  UNDO_REDO_ENABLED,
  WBS_IMPROVEMENTS_ENABLED,
} from '@/config/env';
import { ACTIVITY_TYPE_LABELS } from '@/features/activities';
import { DEPENDENCY_TYPE_LABELS } from '@/features/dependencies';
import { GANTT_COLUMN_LABELS } from '@/features/gantt/layout/grid-columns';
import { HIDEABLE_COLUMNS } from '@/features/gantt/model/gantt-view-state';
import { cn } from '@/lib/utils';

/**
 * The `View ▾` panel's checkbox/radio row.
 *
 * `min-h-6 py-1` is the WCAG 2.2 SC 2.5.8 ≥24px pointer target, which all six of these rows were
 * missing — they were `flex items-center gap-2 text-sm`, hand-rolled six times, each a copy of the
 * previous one. `CheckboxField` exists precisely to centralise this and states the floor as its own
 * job, but it forwards a ref for RHF `register()` and these are controlled toggles inside a menu
 * panel, so the migration is a larger change than the defect warrants; the remainder is
 * `docs/TECH_DEBT.md` #138(b). One constant is what stops the seventh copy being written without it.
 */
const TOGGLE_ROW = 'flex min-h-6 items-center gap-2 py-1 text-sm';

const ZOOM_LABELS: Record<string, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

/** The three `View▾` groups (feature-spec.md §4.8): structure (grid tiers), markers (on-canvas
 * indicators), and insight overlays (the flag-gated ADR-0054 lenses + the Late-start overlay,
 * which stops being a special case set apart by an incidental border and becomes an ordinary
 * member here). */
type ViewToggleGroupId = 'zoom' | 'structure' | 'markers' | 'insight' | 'panels' | 'columns';

/**
 * **Why a handful of commands sit at tier 3 — last into the `⋯`, first out of it (ADR-0090 M2,
 * amended by ADR-0091 M7's admission rung, which puts them back on the row when there is room).**
 *
 * `float-paths` on Row 1. (`shortcuts` was one of these until ADR-0091 M7-S5 moved it into the
 * account menu; `next-conflict` was until ADR-0094 M2 promoted it to tier 1 so its count could sit on
 * the bar; `clear-visual-placement` was until ADR-0094 M4-T1 moved it to the selection bar — an
 * inventory in prose goes stale every time the set changes, which is why the count is not restated
 * here.)
 * Row 1 was ~360 px short of labelling itself at 1920 and Row 2 ~128 px; these four are what buys
 * both. The trade was put to the product owner with the measured numbers rather than taken here,
 * and the answer was labels — nothing is deleted, the four are one click away in the `⋯`.
 *
 * **Tier 3 rather than a low `priority`, and the distinction is load-bearing.** `autoLabelsFit`
 * sums the WHOLE bar (`Toolbar.tsx`), so a merely width-demoted item still pays for its label and
 * demoting it would buy nothing at all. `partitionByTier` takes tier 3 out of `bar` entirely.
 *
 * The other route — making the label sum read only the inline set — is exactly the feedback loop
 * {@link measureLabelWidth}'s docblock exists to prevent: labelling widens the row, the widened row
 * overflows, overflowing narrows it, and the narrower row can afford labels again.
 *
 * `showLabel: 'never'` was measured and rejected: it drops an item's label cost while keeping its
 * 32 px and its gap, so the three Row-1 candidates save 308 px against a 360 px gap — not enough,
 * and it would have pinned three of the seven promotable buttons permanently icon-only to let the
 * other four gain text.
 */
const VIEW_TOGGLE_GROUP_ORDER: ReadonlyArray<{ id: ViewToggleGroupId; label: string }> = [
  // Zoom leads the panel (ADR-0091 D3). It is the only control here that changes what the diagram
  // FRAMES rather than what it draws on top, so it reads before anything that annotates that frame
  // — the same argument that puts colour-by first inside Insight overlays.
  { id: 'zoom', label: 'Zoom' },
  { id: 'structure', label: 'Structure' },
  { id: 'markers', label: 'Markers' },
  { id: 'insight', label: 'Insight overlays' },
  // Added by ADR-0090 M2-T2 for the Legend, answering the product owner's Q2 directly. A section of
  // its own rather than a fourth "overlay", because a panel is a surface you read *beside* the
  // diagram, not a mark drawn *on* it — the distinction the other group names already make.
  { id: 'panels', label: 'Panels' },
  // The Gantt's grid columns (ADR-0095 M5-T1). Here rather than as a `Columns ▾` button above the
  // grid, which is what the plan's entry-point line named: that button is a new horizontal band,
  // and ADR-0092 spent a whole milestone reclaiming 249 px of chrome from above the diagram on the
  // 1646 px screen this product is judged on. The registry's own note on `logicLinks` — M4's
  // toggle, one milestone earlier — already made the equivalent call for the two ROWS; this is the
  // same argument in the vertical axis, and putting the two Gantt view controls in the same place
  // is worth more than either position on its own.
  //
  // Last in the order because it applies to one view: a group that is absent for most of a
  // planner's session should not sit above the ones that are always there.
  { id: 'columns', label: 'Columns' },
];

/**
 * The `View ▾` members that are **not** `TsldViewToggles` keys (ADR-0090 M2-T2).
 *
 * A second list rather than an extension of {@link VIEW_TOGGLE_META}, for two reasons that are both
 * about keeping something rather than avoiding work. That record is
 * `Record<keyof TsldViewToggles, …>`, and the compile error it produces when a toggle is added
 * without a home is load-bearing — its own docblock records two ADR-0054 toggles being silently
 * dropped by a bad search-and-replace while the release notes claimed they shipped. Widening its
 * key type to admit these four would delete exactly that guarantee.
 *
 * And these four carry something the view toggles never do: a **reason they are shut**. Baseline
 * overlay alone has four. A structure with no field for a reason cannot hold one, and the reasons
 * are the part of these controls most worth preserving through a relocation — they are what
 * ADR-0082 is about.
 */
interface LensToggle {
  id: string;
  group: ViewToggleGroupId;
  label: string;
  /** Offered at all — the feature's build-time flag. */
  enabled: boolean;
  checked: (ctx: TsldToolbarContext) => boolean;
  toggle: (ctx: TsldToolbarContext) => void;
  /** Why it cannot be changed right now, or `undefined` when it can. */
  reason: (ctx: TsldToolbarContext) => string | undefined;
  /**
   * A standing note about what this row **does**, as distinct from {@link reason}, which says why it
   * cannot. Rendered always, and `aria-describedby`-linked like the reason.
   *
   * Exists for exactly one row, and that is the point (`docs/TECH_DEBT.md` #125). Every other member
   * of `View ▾` toggles a mark on the canvas and leaves the popover open, so a planner can set
   * several in one visit. `Resource view` reveals a **panel**, which takes focus (ADR-0049 —
   * a revealed panel should receive it), and the popover closes behind the departing focus. From
   * inside a list that invites toggling several things, that reads as being thrown out.
   *
   * **The fix is legibility, not different focus.** ADR-0049's rule is right and an `e2e-resource-view`
   * assertion depends on it; a revealed panel a keyboard user cannot reach is the worse defect, and
   * this section is `tabIndex={-1}` precisely so the reveal can hand focus over. So the row says what
   * it is about to do, and the surprise goes rather than the behaviour.
   */
  note?: string;
  /**
   * **Promoted to Row 1** (workspace-chrome M4), instead of living inside `View ▾`.
   *
   * The product owner asked for the Legend and the Resource view back on the row now that ADR-0090
   * M2 and ADR-0091 M7 have bought it the width. They are still defined HERE, once — the promotion
   * derives a registry item from this record rather than restating it — because two definitions of
   * `checked`/`toggle`/`reason` would drift, and the drift would be invisible: each surface looks
   * right alone, and only a planner who reaches the same control two ways would ever see one is a
   * version behind (the ADR-0065 `routeOrthogonal` argument). `lensTogglesIn` excludes anything
   * promoted, so a control is on the row **or** in the popover and never in both.
   */
  promotion?: { icon: React.ReactNode; order: number };
}

const LENS_TOGGLES: readonly LensToggle[] = [
  {
    id: 'baseline-overlay',
    group: 'insight',
    label: 'Baseline overlay',
    enabled: CANVAS_LENSES_ENABLED,
    checked: (ctx) => ctx.baselineOverlay,
    toggle: (ctx) => ctx.toggleBaselineOverlay(),
    reason: (ctx) =>
      !ctx.hasDiagram
        ? LENS_NO_DIAGRAM_REASON
        : ctx.varianceLoading
          ? 'Loading baseline…'
          : ctx.varianceError
            ? 'Baseline unavailable'
            : !ctx.hasActiveBaseline
              ? 'No active baseline'
              : undefined,
  },
  {
    id: 'resource-view',
    group: 'insight',
    label: 'Resource view',
    enabled: CANVAS_RESOURCE_VIEW_ENABLED,
    checked: (ctx) => ctx.resourceViewOpen,
    toggle: (ctx) => ctx.toggleResourceView(),
    reason: (ctx) => (ctx.hasDiagram ? undefined : LENS_NO_DIAGRAM_REASON),
    // **The `note` went with the promotion, and that closes `docs/TECH_DEBT.md` #125 rather than
    // porting it.** It existed because this row lives(d) inside a popover that invites toggling
    // several things in one visit, and revealing the resource panel takes focus (ADR-0049), which
    // closes the popover behind the departing focus — from inside a list, that reads as being
    // thrown out. On a toolbar button, pressing a control and landing in the panel it opened is
    // ordinary. The surprise the sentence existed to remove is not there to remove.
    promotion: { icon: <Users className="size-4" />, order: 21 },
  },
  {
    id: 'over-allocation',
    group: 'insight',
    label: 'Flag over-allocated',
    enabled: CANVAS_RESOURCE_VIEW_ENABLED,
    checked: (ctx) => ctx.overAllocationHighlight,
    toggle: (ctx) => ctx.toggleOverAllocation(),
    // Enabled whenever there is something to flag OR the highlight is already ON — an active
    // toggle must always be clickable-to-off, so a recalculation that clears all over-allocation
    // while the mode is on can never leave it checked AND shut (a stuck-on dead end, UX review B5).
    // Carried across the move verbatim; it is exactly the kind of rule a relocation loses.
    reason: (ctx) =>
      !ctx.hasDiagram
        ? LENS_NO_DIAGRAM_REASON
        : ctx.hasOverAllocation || ctx.overAllocationHighlight
          ? undefined
          : OVER_ALLOCATION_EMPTY_REASON,
  },
  {
    // The direct answer to the product owner's Q2. Filed under **Panels**, not Insight overlays: a
    // panel is a surface you read *beside* the diagram, not a mark drawn *on* it — which is the
    // distinction the other group names already make.
    id: 'legend',
    group: 'panels',
    label: 'Legend',
    enabled: true,
    checked: (ctx) => ctx.legendOpen,
    toggle: (ctx) => ctx.toggleLegend(),
    reason: () => undefined,
    promotion: { icon: <BookOpen className="size-4" />, order: 22 },
  },
];

function lensTogglesIn(group: ViewToggleGroupId): readonly LensToggle[] {
  // `!t.promotion` is the on-the-row-or-in-the-popover invariant, held in one place: a promoted
  // control leaves `View ▾` by construction rather than by someone remembering to delete its row.
  return LENS_TOGGLES.filter((t) => t.group === group && t.enabled && !t.promotion);
}

/**
 * The Row-1 registry items for the promoted lens toggles (workspace-chrome M4) — **derived** from
 * the same `LensToggle` records `View ▾` reads, never restated.
 *
 * `showLabel: { atLeast: 'comfortable' }` rather than `'auto'`: `autoLabelsFit` is all-or-nothing
 * for a whole row, so an `'auto'` item follows its neighbours' collective fate and can label itself
 * at a narrow band that happens to have slack — the trap ADR-0091 D3a records for the zoom cluster.
 * These two carry a name a planner searches for, so a band rule is what they need.
 */
function promotedLensItems(): readonly ToolbarItem<TsldToolbarContext>[] {
  return LENS_TOGGLES.filter((t) => t.enabled && t.promotion !== undefined).map((t) => {
    const promotion = t.promotion as NonNullable<LensToggle['promotion']>;
    return {
      id: t.id,
      group: 'lens',
      row: 'look',
      tier: 2,
      showLabel: { atLeast: 'comfortable' },
      order: promotion.order,
      priority: 60,
      label: t.label,
      icon: promotion.icon,
      isActive: (ctx: TsldToolbarContext) => t.checked(ctx),
      isEnabled: (ctx: TsldToolbarContext) => t.reason(ctx) === undefined,
      disabledReason: (ctx: TsldToolbarContext) => t.reason(ctx),
      onActivate: (ctx: TsldToolbarContext) => t.toggle(ctx),
    } satisfies ToolbarItem<TsldToolbarContext>;
  });
}

/**
 * **Single source of truth** for every `View▾` toggle: its group, its label, and (for a flag-gated
 * item) whether it is currently offered. `Record<keyof TsldViewToggles, …>` makes this a **compile
 * error**, not a silent gap, if `TsldViewToggles` ever gains a key nobody assigned here — the
 * direct strengthening of the guard whose absence let two ADR-0054 toggles get silently dropped by
 * a bad search-and-replace while the release notes claimed they shipped. Object key order is
 * insertion order (guaranteed for non-integer string keys), which is also the order `View▾` lists
 * within each group — one ordering, not two structures that can drift apart.
 */
const VIEW_TOGGLE_META: Record<
  keyof TsldViewToggles,
  { group: ViewToggleGroupId; label: string; enabled?: boolean }
> = {
  dayGrid: { group: 'structure', label: 'Day grid' },
  monthGrid: { group: 'structure', label: 'Month grid' },
  yearGrid: { group: 'structure', label: 'Year grid' },
  monthBands: {
    group: 'structure',
    label: 'Month bands',
    enabled: CANVAS_VISUAL_LANGUAGE_ENABLED,
  },
  wbsBand: { group: 'structure', label: 'WBS band', enabled: WBS_IMPROVEMENTS_ENABLED },
  // The Gantt's dependency arrows (M4). Listed under `structure` because that is what it is —
  // the shape of the programme rather than a marker on it — and it lives in `View ▾` rather than
  // on Row 1 or Row 2 deliberately (spec SC-6): those rows are already the subject of two epics
  // spent fitting them, and a toggle nobody presses twice a session does not earn a slot there.
  //
  // No `enabled` gate: this epic has no feature flag (the product owner's Q4 choice), so the item
  // is offered wherever the menu is. On the canvas it is inert — the diagram has always drawn its
  // logic — which is honest rather than confusing: the toggle says what the VIEW shows, and the
  // view that ignores it is the one already showing everything.
  logicLinks: { group: 'structure', label: 'Logic links' },
  // The data-date status line (canvas status & feedback M1) — listed before Today because on a
  // statused programme the data date sits left of (before) today, and the menu order should read
  // in diagram order. Flag-off it is filtered out, so `View▾` offers no such toggle (the parity
  // claim in the spec's US-1).
  dataDate: { group: 'markers', label: 'Data date line', enabled: CANVAS_DATA_DATE_ENABLED },
  today: { group: 'markers', label: 'Today line' },
  nonWorking: { group: 'markers', label: 'Non-working' },
  labels: { group: 'markers', label: 'Labels' },
  dates: { group: 'insight', label: 'Dates', enabled: CANVAS_LIVE_FEEDBACK_ENABLED },
  floatTails: { group: 'insight', label: 'Float & drift', enabled: CANVAS_LIVE_FEEDBACK_ENABLED },
  linkSlack: { group: 'insight', label: 'Link slack', enabled: CANVAS_LIVE_FEEDBACK_ENABLED },
  lateOverlay: { group: 'insight', label: 'Late-start overlay', enabled: SCHEDULING_MODES_ENABLED },
};

function visibleViewToggleKeysIn(group: ViewToggleGroupId): ReadonlyArray<keyof TsldViewToggles> {
  return (Object.keys(VIEW_TOGGLE_META) as Array<keyof TsldViewToggles>).filter(
    (key) => VIEW_TOGGLE_META[key].group === group && VIEW_TOGGLE_META[key].enabled !== false,
  );
}

/**
 * Toggles that belong to **one view only**, and which view.
 *
 * `logicLinks` switches the GANTT's dependency arrows; the diagram has always drawn its logic
 * unconditionally, so on the canvas the control is a live checkbox that changes nothing — which
 * reads as a broken control rather than an honest one. Found by the M6 ux gate, which also pointed
 * at the fix sitting in the same diff: `add-note` gates on `ctx.planView !== 'gantt'`, exactly the
 * per-view scoping this needed and did not get.
 *
 * A map rather than a per-key `if`, so the next view-specific toggle is an entry rather than a
 * branch — and so `TSLD_VIEW_TOGGLE_KEYS` (which the registry test pins) keeps listing the whole
 * vocabulary while the PANEL shows what applies here.
 */
const VIEW_SCOPED_TOGGLES: Partial<Record<keyof TsldViewToggles, 'gantt' | 'tsld'>> = {
  logicLinks: 'gantt',
};

/** The keys `View▾` offers for the view currently on screen. */
function viewToggleKeysFor(
  group: ViewToggleGroupId,
  planView: string,
): ReadonlyArray<keyof TsldViewToggles> {
  return visibleViewToggleKeysIn(group).filter((key) => {
    const only = VIEW_SCOPED_TOGGLES[key];
    return only === undefined || only === planView;
  });
}

/** The keys `View▾` actually offers (every group, flag-off-gated members excluded), exported so a
 * test can pin the registry against drift. */
export const TSLD_VIEW_TOGGLE_KEYS: ReadonlyArray<keyof TsldViewToggles> =
  VIEW_TOGGLE_GROUP_ORDER.flatMap(({ id }) => visibleViewToggleKeysIn(id));

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

/**
 * **Go to today, with Go to date on its caret** (ADR-0091 M7-S6) — one control where there were two.
 *
 * They were adjacent members of the Frame group doing the same job on the same axis: `Go to today`
 * pans the viewport to a date it already knows, `Go to date` pans it to one you type. Merging them
 * is worth ~94 px on Row 1 and, more usefully, stops a planner having to notice that the two
 * date-shaped buttons beside each other are not alternatives.
 *
 * **The two halves keep separate gates, and that is the load-bearing part.** Going to *today* needs
 * a computed diagram in the canvas view; going to *a date* needs only an anchored plan. Under one
 * `disabled` the caret would inherit the primary's gate and **Go to date would become unreachable
 * on an empty or Gantt-viewed plan** — a capability a planner has today, removed by a layout change.
 * That is the ADR-0081 dead-end shape, and `ToolbarSplitButton`'s per-half props exist for it; its
 * own docblock names this merge.
 *
 * The panel is `usePopoverPanel`, the same one `View ▾` and `Summary ▾` open, and focus restores to
 * the **primary** — the caret is `tabIndex={-1}`, so restoring there strands a keyboard user.
 *
 * The panel's own `Today` button is gone with the merge: the primary half now does exactly that,
 * one click shallower.
 */
function GoToTodayControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  // First-use-only disclosure (feature-spec.md §4.2): marked seen on the first successful PICK
  // (not the first open) — opening and closing without reading proves nothing. The sentence never
  // leaves the accessibility tree: seen ⇒ `sr-only`, `aria-describedby` stays wired throughout.
  const hint = useFirstUseHint('go-to-date');
  const primaryRef = useRef<HTMLButtonElement>(null);
  const caretRef = useRef<HTMLButtonElement>(null);
  const { open, openPanel, close, panel } = usePopoverPanel({ triggerRef: primaryRef });

  const primaryDisabled = !(ctx.hasDiagram && ctx.canvasActive);
  // **Only a state the reader can change.** `SCHEDULING_MODES_ENABLED` is deliberately NOT folded in
  // here: a flag being off is not something a planner can act on, and shading the caret for it would
  // print "Set the plan's start date first" to somebody whose plan already has a start date — a
  // sentence that is simply false. The flag decides whether this control has a caret at all, one
  // level up (see the registry entry); ADR-0082's discriminator, applied where it belongs.
  const caretDisabled = ctx.plannedStart === null;
  const primaryReason = canvasViewportReason(ctx, 'Add an activity to go to today');

  return (
    <>
      <ToolbarSplitButton
        itemProps={api.itemProps}
        primaryRef={primaryRef}
        caretRef={caretRef}
        pressed={false}
        open={open}
        primaryDisabled={primaryDisabled}
        caretDisabled={caretDisabled}
        {...(primaryReason ? { primaryDisabledReason: primaryReason } : {})}
        caretDisabledReason="Set the plan's start date first"

        haspopup="dialog"
        compact={triggersAreCompact(api.layout)}
        title="Go to today"
        icon={<LocateFixed aria-hidden="true" className="size-4" />}
        label="Go to today"
        caretLabel="Go to date"
        onPrimary={() => ctx.goToDate(ctx.todayIso)}
        onOpenMenu={() => (open ? close(false) : openPanel())}
      />
      {panel(
        'Go to date',
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
              if (event.target.value) {
                ctx.goToDate(event.target.value);
                hint.markSeen();
              }
            }}
            className="h-9"
          />
          <span
            id={GOTO_HINT_ID}
            className={cn('text-muted-foreground text-xs', hint.unseen ? '' : 'sr-only')}
          >
            Pans the timeline only — nothing is saved.
          </span>
        </div>,
      )}
    </>
  );
}

/** The activity kinds the canvas-first Add split-button offers, in menu order (ADR-0032 M4). Only the
 * three planners draw directly — hammock / level-of-effort are derived, not point-and-draw. Labels
 * reuse the canonical {@link ACTIVITY_TYPE_LABELS} so the toolbar copy can't drift from the rest of
 * the app (e.g. under localisation). */
const ADD_ACTIVITY_TYPES = ['TASK', 'START_MILESTONE', 'FINISH_MILESTONE'] as const;
/**
 * The phrase this command completes: "…to add activities". Passed to `ctx.scheduleRefusal`, which
 * decides the FRAME around it — "Start editing to …" when the pen is free, "<Name> is editing this
 * plan. Request control to …" when a peer holds it, "Your role cannot …" for a Viewer. The literal
 * sentence lived here until `docs/TECH_DEBT.md` #115: it named **Start editing** to readers whose
 * screen shows **Request control** and no Start-editing button at all.
 */
const ADD_ACTION = 'add activities';
/** The LOE span hangs off two existing driver activities; with fewer than two present the Add-menu's
 * Level-of-Effort item shades with this reason (Stage D spec §Edge cases). */
const LOE_TOO_FEW_REASON = 'Add activities to span between them';

/** A small "coming soon" tag for menu rows that preview a not-yet-built activity kind. */
function SoonTag(): React.ReactElement {
  return (
    <span className="border-border text-muted-foreground ml-auto rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
      Soon
    </span>
  );
}

/**
 * The **Add split-button** (ADR-0032 M4) — the canvas-first replacement for the plain "Add activity"
 * toggle. A **true** split button (ADR-0064 T3, matching {@link LinkControl}): the primary region
 * arms and disarms the tool with the current draw kind; the caret opens the `Menu` to pick Task /
 * Start-milestone / Finish-milestone, and picking one still arms with that kind (the canvas then
 * collapses milestone draws to a zero-duration point).
 *
 * The primary region became a toggle because the two adjacent authoring controls otherwise did
 * different things on the same click: Link armed its tool, Add opened a menu. That is the shape the
 * epic's founding defect took — a planner who believes a tool is armed and is wrong is one click
 * from an edit they did not intend — so the arm/disarm contract is uniform across every tool rather
 * than per control. "Stop adding" stays in the menu as the second route out.
 *
 * Pen-gated as one focusable control (the primary carries `itemProps`), so it stays a single
 * roving-tabindex stop and the whole authoring group disables together when the pen isn't held.
 */
function AddActivityControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  /**
   * The **primary** half's ref, separate from `triggerRef` (which belongs to the caret).
   *
   * `Menu` restores focus here on Escape and on every item pick. Pointing that at `triggerRef` sent
   * focus to the caret — which is `tabIndex={-1}` and therefore not in the sequential tab order — so
   * after the most ordinary interaction with this control (pick a type, or Escape out) a keyboard
   * user's next Tab jumped to whatever came next in raw DOM order rather than the next toolbar item
   * (WCAG 2.4.3). `IsolateControl` below has always done this correctly; these two did not.
   */
  const mainButtonRef = useRef<HTMLButtonElement>(null);

  const disabled = api.disabled;
  const activeLabel = ACTIVITY_TYPE_LABELS[ctx.createType];
  // Reflect an armed LOE tool on the trigger (B4): fold it into the pressed state AND swap the label to
  // a mid-pick prompt ("Pick start driver" → "Pick finish driver" once a start is picked), mirroring
  // LinkControl's `Linking · FS` reflection. Add/LOE are mutually exclusive (a single EditMode).
  const triggerLabel = ctx.isAddingActivity
    ? `Adding ${activeLabel}`
    : ctx.isLoeSpanning
      ? ctx.loeStartPicked
        ? 'Pick finish driver'
        : 'Pick start driver'
      : 'Add';
  // Flag-off (`CANVAS_ACTIVITY_TYPES` dark) the LOE tool is unreachable, so `isLoeSpanning` is never true
  // and the label/active reflection collapses to today's plain "Add", byte-for-byte.
  const loeTooFew = ctx.loeSpanActivityCount < 2;
  const armed = ctx.isAddingActivity || ctx.isLoeSpanning;
  // The primary region's action, which follows whichever tool this control currently reflects: it
  // arms Add when nothing is armed, and disarms whatever IS armed. Routing an armed LOE through
  // `toggleAddActivity` would swap one armed tool for another — a trigger that reads "Pick start
  // driver" and, when pressed, starts drawing bars instead.
  const toggleArmed = ctx.isLoeSpanning ? ctx.toggleLoeSpanMode : ctx.toggleAddActivity;
  return (
    <>
      <ToolbarSplitButton
        itemProps={api.itemProps}
        primaryRef={mainButtonRef}
        caretRef={triggerRef}
        pressed={armed}
        open={open}
        disabled={disabled}
        title={
          disabled
            ? (ctx.scheduleRefusal(ADD_ACTION) ?? '')
            : ctx.isLoeSpanning
              ? 'Stop the level-of-effort pick'
              : ctx.isAddingActivity
                ? 'Stop adding'
                : `Add ${activeLabel.toLowerCase()}`
        }
        icon={<Plus aria-hidden="true" className="size-4" />}
        label={triggerLabel}
        caretLabel={`Activity type: ${activeLabel}`}
        onPrimary={toggleArmed}
        onOpenMenu={toggle}
      />
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Add activity type"
        restoreFocusRef={mainButtonRef}
      >
        <MenuSection label="Draw on the canvas" />
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
            live here as a distinct section. Flag-on (`VITE_CANVAS_ACTIVITY_TYPES`, Stage D) this is ONE
            live **Level of Effort (hammock)** item that arms the endpoint-pick tool — the LOE is the
            span-derived hammock, so there is no separate Hammock item and no raw `HAMMOCK` create (Q1).
            Flag-off it stays today's two disabled "Soon" placeholders, byte-for-byte. */}
        <MenuSection divider label="Span between activities" />
        {CANVAS_ACTIVITY_TYPES_ENABLED ? (
          // Disabled-with-reason (shade-don't-hide) below two activities — the span needs two drivers to
          // hang off (B5) — mirroring the Export menu's "No matching activities" pattern. Stays a
          // `menuitemradio` (the `selected` prop) so the armed state still announces via `aria-checked`.
          <MenuItem
            selected={ctx.isLoeSpanning}
            disabled={loeTooFew}
            onSelect={() => ctx.toggleLoeSpanMode()}
          >
            <Check
              aria-hidden="true"
              className={cn('size-4', ctx.isLoeSpanning ? 'opacity-100' : 'opacity-0')}
            />
            Level of Effort (hammock)
            {loeTooFew ? (
              <span className="text-muted-foreground ml-auto text-xs">{LOE_TOO_FEW_REASON}</span>
            ) : null}
          </MenuItem>
        ) : (
          <>
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
          </>
        )}
      </Menu>
    </>
  );
}

/**
 * The dependency kinds the two-click Link tool offers (ADR-0032 M5) — **all four**, derived from
 * `DEPENDENCY_TYPE_LABELS` rather than restated, so the canvas and the Logic panel cannot disagree
 * about what the product supports.
 *
 * **It used to list three, and the reason is worth keeping.** The docblock here cited ADR-0026 D5 for
 * *"SF is dialog-only (the rare inverse)"* — and that decision says something narrower: linking was
 * then an **edge-drag**, whose type came from a **modifier key**, and there are only three of those
 * (none / Shift / Alt). SF lost the ballot for a keyboard slot. It was never a statement that SF
 * should be absent from a *menu*.
 *
 * ADR-0052 replaced the edge-drag with the two-click Link tool and its explicit type menu, which has
 * no three-way limit — so the constraint evaporated and the exclusion outlived it, carried by a
 * citation that reads as authority and does not support what it was cited for (ADR-0076 Class 2).
 * The effect was that `Start → Finish` — a type the Prisma enum, the CPM engine (ADR-0035's SF
 * arithmetic), the API, the Logic panel and the canvas painter (`render/geometry.ts:93`) all support,
 * and which `docs/PROJECT_BRIEF.md` names as one of the four the product exists to offer — could not
 * be drawn on the surface this product is built around.
 *
 * The short code labels the compact toolbar button; the long name reads in the menu.
 */
const LINK_TYPES: ReadonlyArray<{ type: DependencyType; label: string }> = DEPENDENCY_TYPES.map(
  (type) => ({ type, label: DEPENDENCY_TYPE_LABELS[type] }),
);
/** Long names for accessible labels (the compact button shows the FS/SS/FF/SF code only). */
const LINK_TYPE_LABELS: Record<string, string> = DEPENDENCY_TYPE_LABELS;

/** As {@link ADD_ACTION} — the verb is what differs between these nine, which is why a shared
 * constant could not have fixed #115 and a shared *builder* could. */
const LINK_ACTION = 'link activities';

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
  /**
   * The **primary** half's ref, separate from `triggerRef` (which belongs to the caret).
   *
   * `Menu` restores focus here on Escape and on every item pick. Pointing that at `triggerRef` sent
   * focus to the caret — which is `tabIndex={-1}` and therefore not in the sequential tab order — so
   * after the most ordinary interaction with this control (pick a type, or Escape out) a keyboard
   * user's next Tab jumped to whatever came next in raw DOM order rather than the next toolbar item
   * (WCAG 2.4.3). `IsolateControl` below has always done this correctly; these two did not.
   */
  const mainButtonRef = useRef<HTMLButtonElement>(null);

  const disabled = api.disabled;
  return (
    <>
      {/*
       * A **true** split button, unlike Add's split *look*. The primary region arms and disarms the
       * tool with the current type; the caret opens the type menu. They are separated because the
       * old single trigger only opened the menu — clicking "Link" armed nothing, so the still-armed
       * Add tool took the next canvas click and silently created an activity where the planner meant
       * to pick a link endpoint. Measured: 0 dependencies from 6 link attempts (ADR-0064).
       *
       * One tab stop is preserved: the primary carries `api.itemProps` (the roving stop) and the
       * caret is `tabIndex={-1}`, reached with ArrowDown — the APG split-button arrangement. The
       * pair sits in a `div` that carries the control chrome so the two regions read as one control.
       */}
      <ToolbarSplitButton
        itemProps={api.itemProps}
        primaryRef={mainButtonRef}
        caretRef={triggerRef}
        pressed={ctx.isLinking}
        open={open}
        disabled={disabled}
        title={
          disabled
            ? (ctx.scheduleRefusal(LINK_ACTION) ?? '')
            : ctx.isLinking
              ? 'Stop linking'
              : `Link with ${LINK_TYPE_LABELS[ctx.linkType]}`
        }
        icon={<Spline aria-hidden="true" className="size-4" />}
        label={ctx.isLinking ? `Linking · ${ctx.linkType}` : 'Link'}
        caretLabel={`Link type: ${LINK_TYPE_LABELS[ctx.linkType]}`}
        onPrimary={ctx.toggleLinkMode}
        onOpenMenu={toggle}
      />
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Link type"
        restoreFocusRef={mainButtonRef}
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

/**
 * Why a canvas viewport command is shaded in the Gantt. The zoom *preset* still works in both views
 * (ADR-0059 §2) — panning, stepping and fitting are the canvas's own, and the Gantt's chart already
 * spans the plan, so there is nothing to fit it to.
 */
/** Both remaining Find-group commands need a selection to act on. */
const ISOLATE_NO_SELECTION_REASON = 'Select an activity first';

const CANVAS_ONLY_REASON = 'Only in the diagram view';
const ZOOM_DISABLED_REASON = 'Add an activity to enable zoom';

/** Shared disabled reason for the insight lenses on an empty/uncomputed canvas (spec `docs/specs/canvas-lenses/`). */
const LENS_NO_DIAGRAM_REASON = 'Add an activity first';

/** Disabled reason for the over-allocation highlight when nothing is over-allocated (Stage E M2) — a
 * plan that never levelled, or a levelled plan with no over-allocation, has none. Mirrors
 * Next-conflict's "No conflicts to review" empty state (ADR-0031 shade-don't-hide). */
const OVER_ALLOCATION_EMPTY_REASON = 'No over-allocation to show';

/**
 * **The collapsed band's trigger treatment** (ADR-0090 M3-T3): Row 1's popover triggers give up
 * their visible labels, and the search field gives up its preferred width for its floor.
 *
 * **Measured, and the measurement moved the task.** M3-T3's own risk note is flagged *"derived from
 * the measured anchors, not observed"* and predicts a 305 px collision at 960. After M2's cuts and
 * M3-T2's fold, the real figures (`docs/specs/workspace-layout/m3-narrow-widths.md`) are Row 1
 * laying out **883 px against an 872 px container at 960 — 11 px over — and against 680 px at 768**.
 * Row 2 already fits at every width. So the collapse is a Row-1 problem of two very different sizes,
 * and the honest remedy is sized to it rather than to the drafted number.
 *
 * `search` alone is **240 px of Row 1's 784**, exactly as the note predicted, and its `min-w-36`
 * floor gives 96 px back — enough for 960 and not for 768. The four popover triggers give ~60 px
 * each, which closes 768 with room to spare.
 */
function triggersAreCompact(layout: ToolbarLayoutMode): boolean {
  return layout === 'collapsed';
}

/**
 * The search field's width, by band. `w-[min(15rem,32vw)]` resolves to a flat **240 px** at any
 * viewport at or above 750 px, so on the narrow widths the field never actually responds to `32vw` —
 * it is simply the widest thing on Row 1. In the collapsed band it drops to the `min-w-36` floor it
 * already declares, which is 144 px and still a field rather than an icon.
 *
 * An icon-triggered field (the other option M3-T3's note names) was not taken: it costs a click on
 * the one control a planner most often arrives wanting to use, and the measurement says the floor is
 * enough. Kept as one constant because two call sites render this field — the live one and the
 * flag-off stub — and a width that differed between them would show up only with the flag off.
 */
function searchFieldWidth(layout: ToolbarLayoutMode): string {
  return triggersAreCompact(layout) ? 'w-36' : 'w-[min(15rem,32vw)] min-w-36';
}

/**
 * The shared shape of every canvas-viewport command's reason: no diagram, then not the diagram view,
 * then actionable. Extracted because four registry entries had written it out four times and M3-T2
 * was about to write it four more inside the fold — eight copies of one two-branch rule is how one
 * of them ends up phrased differently from its neighbours.
 */
function canvasViewportReason(ctx: TsldToolbarContext, noDiagram: string): string | undefined {
  if (!ctx.hasDiagram) return noDiagram;
  return ctx.canvasActive ? undefined : CANVAS_ONLY_REASON;
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
  layout,
}: {
  itemProps: ToolbarItemRenderApi['itemProps'];
  layout: ToolbarLayoutMode;
}): React.ReactElement {
  return (
    <div className="relative ml-3 flex items-center">
      {/* `absolute` inside a `relative` wrapper — the house pattern from
          `components/ui/search-field.tsx`. This was a `-mr-6` negative margin on a NON-positioned
          flex item, which leaves the icon in flow and lets the input (later in DOM order, carrying
          an opaque `bg-field`) paint straight over it. Measured before fixing (M0-T2): the icon was
          present, 16x16, opacity 1, visibility visible — and `elementFromPoint` at its own centre
          returned the input. Its geometry was already correct (icon left 1167.5 against input left
          1159.5, inside a 32 px `padding-left`), so `pl-8` stays and only the paint order changes. */}
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2"
      />
      <Input
        {...itemProps}
        type="search"
        disabled
        placeholder="Search or filter activities…"
        aria-label="Search or filter activities (coming soon)"
        title="Search / filter activities (coming soon)"
        className={cn('h-8 pl-8 text-sm', searchFieldWidth(layout))}
      />
    </div>
  );
}

/**
 * The **live search field** (insight lenses, `docs/specs/canvas-lenses/`, flag-on) — the operable
 * successor to {@link SearchFieldControl}. Search-as-you-type drives `ctx.setFilterQuery`, dimming
 * non-matching bars on the canvas (the panel derives the dimmed-id set + announces the count). A single
 * focusable control that spreads `itemProps` so it joins the toolbar's roving-tabindex model; shaded
 * (disabled-with-reason) on an empty/uncomputed canvas, mirroring the zoom cluster's stable shape.
 */
function LiveSearchControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  const disabled = api.disabled;
  // A real, keyboard-reachable clear (`VITE_CANVAS_SEARCH_NAV`). `type="search"` renders a native ✕ in
  // Chromium only, and it is not in the tab order in any browser — so on a control whose whole point is
  // that you can drive it from the keyboard, the only way to empty it was to select-all and delete.
  //
  // Deliberately NOT `components/ui/search-field.tsx`, which solves the same problem: that primitive
  // renders a visible `<Label>` above the input, and the toolbar has one line of vertical space. Its
  // structural decisions (the leading icon offset, the trailing button, suppressing the native glyph)
  // are reused; the component is not.
  const showClear = CANVAS_SEARCH_NAV_ENABLED && !disabled && ctx.filterQuery.length > 0;
  const inputRef = useRef<HTMLInputElement>(null);
  // The count, in the ONE channel a screen-reader user has while typing. The visible chip beside the
  // field is `aria-hidden` (it would otherwise duplicate the announcer), which left a sighted planner
  // knowing how many matched and a screen-reader user knowing nothing until they pressed Enter — the
  // read-out on screen and no read-out in the accessibility tree.
  //
  // A plain `sr-only` node linked by `aria-describedby`, NOT a live region: the search field already
  // has a debounced count announcement, and a second polite region would say the number twice on
  // every keystroke. A description is read when the field is focused and re-read on demand, which is
  // what "how many did that match?" actually wants.
  const describedById = CANVAS_SEARCH_NAV_ENABLED && ctx.searchStatus ? 'tsld-search-count' : null;
  // The compact VISIBLE chip text, deliberately NOT `countText` below — that is the screen-reader
  // sentence ("12 activities match. Press Enter to go to the first."), which is the right thing to
  // say once, on focus, and the wrong thing to paint inside a 240 px field. Two audiences, two
  // strings; the first draft of this fold reused `countText` for both and printed the sentence.
  // Gated on `CANVAS_SEARCH_NAV_ENABLED`, exactly as the `search-status` item it replaces was — the
  // flag-off parity suite caught the first version rendering where nothing rendered before, which is
  // the whole job of that suite and the reason it is kept rather than weakened.
  const countChip =
    CANVAS_SEARCH_NAV_ENABLED && ctx.searchStatus
      ? ctx.searchStatus.index === null
        ? `${ctx.searchStatus.total} ${ctx.searchStatus.total === 1 ? 'match' : 'matches'}`
        : `${ctx.searchStatus.index} of ${ctx.searchStatus.total}`
      : null;
  const countText = ctx.searchStatus
    ? ctx.searchStatus.index === null
      ? `${ctx.searchStatus.total} ${ctx.searchStatus.total === 1 ? 'activity matches' : 'activities match'}. Press Enter to go to the first.`
      : `Match ${ctx.searchStatus.index} of ${ctx.searchStatus.total}. Enter for the next, Shift and Enter for the previous.`
    : null;
  return (
    <div className="relative ml-3 flex items-center">
      {/* `absolute` inside a `relative` wrapper — the house pattern from
          `components/ui/search-field.tsx`. This was a `-mr-6` negative margin on a NON-positioned
          flex item, which leaves the icon in flow and lets the input (later in DOM order, carrying
          an opaque `bg-field`) paint straight over it. Measured before fixing (M0-T2): the icon was
          present, 16x16, opacity 1, visibility visible — and `elementFromPoint` at its own centre
          returned the input. Its geometry was already correct (icon left 1167.5 against input left
          1159.5, inside a 32 px `padding-left`), so `pl-8` stays and only the paint order changes. */}
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2"
      />
      <Input
        ref={inputRef}
        {...api.itemProps}
        type="search"
        value={ctx.filterQuery}
        // Use `aria-disabled`, NOT the native `disabled` attribute (A3): the toolbar's roving tabindex /
        // `activeId` can still target this control, and a natively-`disabled` field drops out of the
        // focus order — stranding focus and hiding the reason (WCAG 2.1.1 / 2.4.3 / 2.4.7). Staying
        // focusable, it ignores typing (no-op onChange) and shows the reason via `title` while shaded.
        aria-disabled={disabled || undefined}
        onChange={(event) => {
          if (!disabled) ctx.setFilterQuery(event.target.value);
        }}
        {...(disabled ? { readOnly: true } : {})}
        // Enter / Shift+Enter walk the match set (`VITE_CANVAS_SEARCH_NAV`). `preventDefault` because
        // an unhandled Enter inside a field can submit an enclosing form — the toolbar has none today,
        // but a future host might, and a search that navigates away is worse than one that does
        // nothing. Focus deliberately stays here: `goToMatch` selects with `focusListbox: false`, so
        // the planner can press Enter again without reaching for the field.
        //
        // Flag-off the prop is not passed at ALL (not passed-and-inert), which is what makes the
        // parity suite able to assert its absence rather than its behaviour.
        {...(CANVAS_SEARCH_NAV_ENABLED && !disabled
          ? {
              onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Escape') {
                  // `preventDefault` because `type="search"` clears itself on Escape in Blink and
                  // WebKit. Without it the native clear and the handled clear both happen, so the
                  // announced step and the unannounced one race — exactly one thing must happen and
                  // it must be the one that says so (spec §4.5).
                  event.preventDefault();
                  ctx.escapeSearchField();
                  return;
                }
                if (event.key !== 'Enter') return;
                event.preventDefault();
                ctx.goToMatch(event.shiftKey ? 'previous' : 'next');
              },
            }
          : {})}
        placeholder="Search or filter activities…"
        aria-label="Search or filter activities"
        {...(describedById ? { 'aria-describedby': describedById } : {})}
        {...(disabled && api.disabledReason ? { title: api.disabledReason } : {})}
        className={cn(
          'h-8 pl-8 text-sm',
          searchFieldWidth(api.layout),
          disabled && 'cursor-not-allowed opacity-50',
          // Suppress Chromium's native ✕ so the two clears can never both show. Flag-off the class is
          // absent, so the native glyph is exactly where it is today.
          showClear && '[&::-webkit-search-cancel-button]:appearance-none',
          showClear && 'pr-7',
        )}
      />
      {showClear ? (
        <button
          type="button"
          // Focus returns to the input, never to `<body>`: the planner clears in order to type
          // something else. This is also why the button unmounts rather than disabling — a control
          // that vanishes while focused would strand focus, so it can only vanish on the click that
          // moves focus off it first.
          onClick={() => {
            ctx.setFilterQuery('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-6 flex size-5 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
      {/* The VISIBLE match count, folded into the field's own box (ADR-0090 M2-T3). It was a separate
          `search-status` toolbar item — `presentational: true`, i.e. a non-operable member of a
          `role="toolbar"`, legal only via the escape hatch that exists to describe it. Folding it
          here loses nothing: the field is a pinned `render` item, so it is painted at every width,
          which is precisely why the same fold was REFUSED for `next-conflict` (see that item). */}
      {countChip ? (
        <span
          aria-hidden="true"
          className="text-muted-foreground ml-1 shrink-0 text-xs whitespace-nowrap"
        >
          {countChip}
        </span>
      ) : null}
      {describedById && countText ? (
        <span id={describedById} className="sr-only">
          {countText}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The **Analysis** trigger (ADR-0090 M2-T5) — Baselines, Earned value and Resource histogram behind
 * one Row-2 stop, where they were three.
 *
 * **Named "Analysis", not "Plan ▾" as the plan proposed.** Two collisions made that name unusable
 * and the pre-approval review caught both: it would sit inside a group whose `aria-label` is
 * already **"Plan actions"**, so a screen-reader user would hear "Plan actions, Plan, menu button";
 * and Row 1 already carries **`Summary ▾`**, which is also about the plan as a whole — heard back to
 * back, "Plan" and "Summary" do not say which holds what. "Analysis" names what is actually inside:
 * three surfaces for **measuring** a plan against something (a baseline, a budget, a resource
 * capacity).
 *
 * **`Schedule settings…` deliberately stays inline** rather than joining them, and that is a
 * decision rather than an oversight. It is the only one of the four that *changes* how dates are
 * computed rather than reporting on them — and `docs/TECH_DEBT.md` #60 renamed it from "Calendar…"
 * precisely so a planner hunting the float measure could find it. Folding it into a menu one
 * milestone later would undo that, quietly, for two stops' worth of width.
 *
 * The trigger opens whenever **any** row inside is actionable — never inheriting one row's gate,
 * which is the defect M2-T4 shipped and caught (a `hasDiagram` gate on the deliverables trigger
 * took Share down with it on every uncomputed plan).
 */
function PlanAnalysisControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  // **This trigger honours the collapsed band like every other one on the row** — it did not until
  // 2026-08-13, and that is what made Row 2 nine pixels too wide at 960 once `snap-to-grid` was
  // deleted (`e2e-toolbar-fit` S4). Both this control and its `Share & export` neighbour painted
  // their text at every width while `Go to today`, `View ▾`, `Summary ▾` and the rest went icon-only
  // below 1024 — 145 px of text between them, which the deleted button's 36 px had been masking.
  // The ADR-0064 §7 shape again: one correct pattern applied to a control and not its neighbour,
  // invisible to every gate until an unrelated change moved the arithmetic past a boundary.
  //
  // Icon-only means the text is gone, so the name has to come from somewhere: `aria-label` is set
  // unconditionally in that state rather than only when shaded, or the button would be announced as
  // nothing at all — which is the defect this repair exists to avoid, one layer down.
  const reasonId = useId();
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const disabled = api.disabled;
  const compact = triggersAreCompact(api.layout);
  return (
    <>
      <button
        {...api.itemProps}
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        title={disabled ? (api.disabledReason ?? ANALYSIS_LABEL) : ANALYSIS_LABEL}
        {...(compact || (disabled && api.disabledReason) ? { 'aria-label': ANALYSIS_LABEL } : {})}
        {...(disabled && api.disabledReason ? { 'aria-describedby': reasonId } : {})}
        onClick={() => {
          if (!disabled) toggle();
        }}
        className={cn(toolbarControlVariants({ active: open, disabled }))}
      >
        <ChartArea aria-hidden="true" className="size-4" />
        {compact ? null : <span className="truncate">{ANALYSIS_LABEL}</span>}
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
        {disabled && api.disabledReason ? (
          <span id={reasonId} className="sr-only">
            {api.disabledReason}
          </span>
        ) : null}
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label={ANALYSIS_LABEL}
        restoreFocusRef={triggerRef}
      >
        <MenuItem onSelect={() => ctx.openBaselines()}>
          <Layers aria-hidden="true" className="size-4" />
          Baselines…
        </MenuItem>
        {EARNED_VALUE_ENABLED ? (
          <MenuItem onSelect={() => ctx.openEarnedValue()}>
            <DollarSign aria-hidden="true" className="size-4" />
            Earned value…
          </MenuItem>
        ) : null}
        {RESOURCE_CURVES_ENABLED ? (
          <MenuItem onSelect={() => ctx.openResourceHistogram()}>
            <ChartArea aria-hidden="true" className="size-4" />
            Resource histogram…
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

/**
 * The **Filter menu** (insight lenses, flag-on) — a `View▾`-style checkbox popover offering the three
 * canvas attributes (Critical / Has constraint / Has conflict). Multi-select (the popover stays open
 * while toggling), each toggle driving `ctx.toggleFilterAttr`; the match set is the intersection of
 * these with the text query. Mirrors {@link ViewTogglesPanel}'s idiom so filtering reads like the
 * display toggles. Pressed state (any attribute on) is reflected by the item's `isActive`.
 */
function FilterMenuControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  return (
    <ToolbarPopover
      label="Filter"
      icon={<Filter className="size-4" />}
      itemProps={api.itemProps}
      compact={triggersAreCompact(api.layout)}
      // Reflect an engaged attribute filter on the trigger even once the popover closes (U1 — mirrors
      // ColourByControl's `api.active || open`), and surface the disabled reason when shaded (A2).
      active={api.active}
      {...(api.disabled ? { disabled: true } : {})}
      // `disabledReason`, not `title` (ADR-0090 M5 accessibility gate). `Filter` is
      // `isEnabled: ctx.hasDiagram`, so every empty or uncomputed plan reaches this state, and a
      // native tooltip is not shown on keyboard focus by any mainstream browser — the finding
      // `ToolbarButton`'s docblock records fixing for the plain button and not for its neighbour.
      {...(api.disabled && api.disabledReason ? { disabledReason: api.disabledReason } : {})}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Show only</legend>
        {FILTER_ATTRS.map(({ attr, label }) => (
          <label key={attr} className={TOGGLE_ROW}>
            <input
              type="checkbox"
              checked={ctx.filterAttrs.has(attr)}
              onChange={() => ctx.toggleFilterAttr(attr)}
              className="accent-primary size-4"
            />
            {label}
          </label>
        ))}
      </fieldset>
    </ToolbarPopover>
  );
}

/**
 * Presentation order for the colour modes — default first, then the two analytical lenses.
 * (Driving-resource is a deferred fast-follow, CQ-1.)
 *
 * This replaced a `COLOUR_MODES` array that carried **both** the order and the labels, duplicating
 * `COLOUR_MODE_LABELS` right below it — two answers to "what is this mode called", which had been
 * sitting in the file since the picker shipped. Order and labels are now one each.
 */
const COLOUR_MODE_ORDER: readonly ColourMode[] = ['criticality', 'totalFloat', 'wbs'];

const COLOUR_MODE_LABELS: Record<ColourMode, string> = {
  criticality: 'Criticality',
  totalFloat: 'Total float',
  wbs: 'WBS group',
};

/** The one name for the deliverables trigger, its menu and its tooltip (ADR-0090 M2-T4). */
const SHARE_EXPORT_LABEL = 'Share & export';
/** The one name for the analysis trigger, its menu and its tooltip (ADR-0090 M2-T5). */
const ANALYSIS_LABEL = 'Analysis';
const SHARE_NO_PERMISSION_REASON = 'You don’t have permission to share this plan';

const EXPORT_NO_DIAGRAM_REASON = 'Add an activity first';

/**
 * The **Export ▾ menu-button** (export & print, `docs/specs/export-print/`, flag-on) — an APG
 * menu-button (mirroring {@link ColourByControl}) listing the plan's client-side deliverables. M1 ships
 * **Schedule (CSV)** plus a conditional **Matching activities only (N)** item shown only while a filter /
 * isolate lens narrows the set (CQ-3); M2 adds the two **Diagram (PNG)** extents (whole plan / current
 * view, CQ-1); M3 adds the two matching **Diagram (PDF)** extents (lazy jsPDF, first-use loading state).
 * Shaded
 * (disabled-with-reason "Add an activity first") on an empty/uncomputed canvas, matching the zoom
 * cluster's stable shape (ADR-0031 shade-don't-hide). One focusable roving stop (spreads `itemProps`);
 * each pick downloads + announces via the context command.
 */
function ExportMenuControl({
  ctx,
  api,
}: {
  ctx: TsldToolbarContext;
  api: ToolbarItemRenderApi;
}): React.ReactElement {
  // **This trigger honours the collapsed band like every other one on the row** — it did not until
  // 2026-08-13, and that is what made Row 2 nine pixels too wide at 960 once `snap-to-grid` was
  // deleted (`e2e-toolbar-fit` S4). Both this control and its `Share & export` neighbour painted
  // their text at every width while `Go to today`, `View ▾`, `Summary ▾` and the rest went icon-only
  // below 1024 — 145 px of text between them, which the deleted button's 36 px had been masking.
  // The ADR-0064 §7 shape again: one correct pattern applied to a control and not its neighbour,
  // invisible to every gate until an unrelated change moved the arithmetic past a boundary.
  //
  // Icon-only means the text is gone, so the name has to come from somewhere: `aria-label` is set
  // unconditionally in that state rather than only when shaded, or the button would be announced as
  // nothing at all — which is the defect this repair exists to avoid, one layer down.
  const reasonId = useId();
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const disabled = api.disabled;
  const compact = triggersAreCompact(api.layout);
  return (
    <>
      <button
        {...api.itemProps}
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        title={disabled ? (api.disabledReason ?? SHARE_EXPORT_LABEL) : SHARE_EXPORT_LABEL}
        {...(compact || (disabled && api.disabledReason)
          ? { 'aria-label': SHARE_EXPORT_LABEL }
          : {})}
        {...(disabled && api.disabledReason ? { 'aria-describedby': reasonId } : {})}
        onClick={() => {
          if (!disabled) toggle();
        }}
        className={cn(toolbarControlVariants({ active: open, disabled }))}
      >
        <FileDown aria-hidden="true" className="size-4" />
        {compact ? null : <span className="truncate">{SHARE_EXPORT_LABEL}</span>}
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
        {disabled && api.disabledReason ? (
          <span id={reasonId} className="sr-only">
            {api.disabledReason}
          </span>
        ) : null}
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label={SHARE_EXPORT_LABEL}
        restoreFocusRef={triggerRef}
      >
        {/* Grouped into Schedule / Diagram sections (ux S2), mirroring the Add split-button's sections. */}
        <MenuSection label="Schedule" />
        <MenuItem onSelect={() => ctx.exportScheduleCsv('all')}>
          <FileSpreadsheet aria-hidden="true" className="size-4" />
          {/* When the conditional filtered item is present, name the default one "All activities" so the
              all-vs-matching distinction reads from the label, not the position (ux S4). */}
          {ctx.filterActive ? 'All activities (CSV)' : 'Schedule (CSV)'}
        </MenuItem>
        {/* Conditional filtered export (CQ-3): only when a filter / isolate lens is narrowing the set,
            so the item never confuses when nothing is filtered. Disabled-with-reason (shade-don't-hide)
            when nothing matches, so it can't download a header-only CSV (ux S3). */}
        {ctx.filterActive ? (
          <MenuItem
            disabled={ctx.matchingCount === 0}
            onSelect={() => ctx.exportScheduleCsv('matching')}
          >
            <Filter aria-hidden="true" className="size-4" />
            <span>Matching activities only ({ctx.matchingCount})</span>
            {ctx.matchingCount === 0 ? (
              <span className="text-muted-foreground ml-auto text-xs">No matching activities</span>
            ) : null}
          </MenuItem>
        ) : null}
        <MenuSection divider label="Diagram" />
        {/* Diagram PNG (M2, CQ-1: offer BOTH extents). The whole-plan render re-frames an off-screen
            canvas to the full activity extent (raster-capped, scale-to-fit); the current-view render
            crops to the live viewport. Both paint off-screen with the light print palette + legend. */}
        <MenuItem onSelect={() => ctx.exportDiagramPng('whole')}>
          <ImageDown aria-hidden="true" className="size-4" />
          Diagram — whole plan (PNG)
        </MenuItem>
        <MenuItem onSelect={() => ctx.exportDiagramPng('view')}>
          <Crop aria-hidden="true" className="size-4" />
          Diagram — current view (PNG)
        </MenuItem>
        {/* Diagram PDF (M3, CQ-1: mirror the two PNG extents). Reuses the M2 off-screen PNG, then embeds
            it on a landscape page via the LAZILY-imported jsPDF (first-use fetch, code-split). Both items
            show a loading state and are disabled while a PDF is in flight (`pdfExporting`), which also
            guards against a double-click; a load failure surfaces a user-safe error, PNG/CSV unaffected. */}
        <MenuItem disabled={ctx.pdfExporting} onSelect={() => ctx.exportDiagramPdf('whole')}>
          {ctx.pdfExporting ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FileText aria-hidden="true" className="size-4" />
          )}
          Diagram — whole plan (PDF)
        </MenuItem>
        <MenuItem disabled={ctx.pdfExporting} onSelect={() => ctx.exportDiagramPdf('view')}>
          {ctx.pdfExporting ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FileText aria-hidden="true" className="size-4" />
          )}
          Diagram — current view (PDF)
        </MenuItem>
        {/* Interchange export (ADR-0050 M4d) — send the plan to another scheduling tool as a foreign file.
            The whole group renders only when the `VITE_SCHEDULE_INTERCHANGE` flag AND the caller's
            `interchange:export` permission (`ctx.canInterchangeExport`, every member) are BOTH true; else
            the menu is byte-for-byte the Stage-C1 CSV/PNG/PDF set. These are server round-trips (a GET that
            streams the file), not the client-side off-screen renders above, so they sit in their own
            section after the Diagram group. */}
        {SCHEDULE_INTERCHANGE_ENABLED && ctx.canInterchangeExport ? (
          <>
            <MenuSection divider label="Interchange" />
            {/* Both items show a loading spinner and are disabled while an export is in flight
                (`interchangeExporting`), which also guards a double-click / concurrent export — mirroring
                the Diagram-PDF items above. Uppercase-acronym labels match the sibling CSV/PNG/PDF verbs. */}
            <MenuItem
              disabled={ctx.interchangeExporting}
              onSelect={() => ctx.exportInterchange('xer')}
            >
              {ctx.interchangeExporting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <FileCode aria-hidden="true" className="size-4" />
              )}
              Primavera P6 (XER)
            </MenuItem>
            <MenuItem
              disabled={ctx.interchangeExporting}
              onSelect={() => ctx.exportInterchange('mspdi')}
            >
              {ctx.interchangeExporting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <FileType aria-hidden="true" className="size-4" />
              )}
              Microsoft Project (MSPDI)
            </MenuItem>
          </>
        ) : null}
        {/* Print and Share join the export formats here (ADR-0090 M2-T4). They are the same act from
          the planner's side — the plan LEAVING the product as something someone else reads — and
          they were three separate Row-2 stops saying so three times.

          Each keeps its own gate rather than inheriting the trigger's: Print rides the diagram gate
          the exports ride, Share rides `canShare`, which is a permission and not a state. Shaded
          with the reason rather than hidden, so a Viewer learns that sharing exists and why they
          cannot (ADR-0082). */}
        <MenuSection divider label="Deliver" />
        <MenuItem
          disabled={!ctx.hasDiagram}
          {...(ctx.hasDiagram ? {} : { disabledReason: EXPORT_NO_DIAGRAM_REASON })}
          onSelect={() => ctx.printDiagram()}
        >
          <Printer aria-hidden="true" className="size-4" />
          Print…
        </MenuItem>
        {/* Behind `VITE_GUEST_SHARE_LINKS`, exactly as its Row-2 registration was — flag-off the row
          is absent rather than a "Coming soon" stub, following the M2-T2 precedent. The unused-flag
          error from the compiler is what caught this being dropped in the first version. */}
        {GUEST_SHARE_LINKS_ENABLED ? (
          <MenuItem
            disabled={!ctx.canShare}
            {...(ctx.canShare ? {} : { disabledReason: SHARE_NO_PERMISSION_REASON })}
            onSelect={() => ctx.openShare()}
          >
            <Share2 aria-hidden="true" className="size-4" />
            Share…
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

function CurrentConflictStatus({
  ctx,
  itemProps,
}: {
  ctx: TsldToolbarContext;
  itemProps: ToolbarItemRenderApi['itemProps'];
}): React.ReactElement | null {
  const current = ctx.currentConflict;
  // **Two states, and the idle one is the whole point of ADR-0094 M3-T2.** This used to render only
  // while a planner was already cycling (`currentConflict != null`), which is a count that cannot
  // tell you whether cycling is worth starting — the product owner's actual complaint. Idle it now
  // states the magnitude; stepping it states the position and the reason.
  //
  // **Two further states the plan required a decision on, both settled as "no special case", and
  // recorded because a silent default reads like an oversight** (M3-T2; the accessibility and ux
  // gates both asked):
  //
  // - **Isolating.** `useConflictNavigation` forces `currentConflict` to `null` while the logic-path
  //   isolation lens is on, so this reverts from "2 of 3" to "3 conflicts" mid-cycle. That is the
  //   honest reading: isolation replaces the scene with a subgraph, so a position within a walk of
  //   the whole plan is no longer a position within what the planner is looking at. It degrades to
  //   the magnitude rather than inventing a "paused" state, which would be a fourth string to keep
  //   true and says nothing the reader cannot see.
  // - **Filtered.** The count is of the WHOLE plan, deliberately, and does not follow the active
  //   filter or search. "How many conflicts does this plan have" is the question the control answers,
  //   and a count that shrinks when a planner filters to Critical would answer a different one every
  //   time the lens changed — while the Next-conflict cycle it labels still walks all of them
  //   (`orderedConflictHits` reads the plan, not the filtered set), so a filtered count would
  //   disagree with the very cycle it sits beside. The accepted cost is that a planner filtered to
  //   something other than "Has conflict" reads "3 conflicts" beside a canvas showing fewer
  //   un-dimmed bars; the plan rated that the state most likely to be reported as a bug, and it is
  //   the lesser of the two wrongs.
  if (!current && !ctx.hasConflicts) return null;
  const label = current
    ? `Conflict ${current.index} of ${current.total}`
    : `${ctx.conflictCount} ${ctx.conflictCount === 1 ? 'conflict' : 'conflicts'}`;
  const reason = current ? (current.reasons[0] ?? 'conflict') : null;
  return (
    <span
      {...itemProps}
      // Purely the VISIBLE readout for sighted users (U2). The spoken channel is the shared polite
      // announcer that `goToNextConflict` already writes to — so this chip is `aria-hidden` to avoid a
      // second, duplicate live-region announcing the same "Conflict i of n" text.
      //
      // Being hidden is why the BUTTON carries `srDescription`: an AT user has to reach the same fact
      // some other way, and a description read on focus is that way without a second announcement.
      aria-hidden="true"
      title={
        current
          ? `Conflict ${current.index} of ${current.total}: ${current.reasons.join(', ')}`
          : label
      }
      className={cn(toolbarControlVariants({ tone: 'info' }), 'max-w-[14rem] gap-1')}
    >
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="shrink-0 whitespace-nowrap">{label}</span>
      {reason ? (
        <>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="truncate">{reason}</span>
        </>
      ) : null}
    </span>
  );
}

/** The checkbox body of the `View▾` popover — grouped into Structure / Markers / Insight overlays
 * (feature-spec.md §4.8), one `<fieldset>` + `<legend>` per non-empty group. `max-h-[60vh]
 * overflow-y-auto` is fixed locally here (not in `ToolbarPopover`, whose `ESTIMATED_HEIGHT` anchor
 * assumed a shorter, ungrouped panel) since the primitive is shared with `Summary` and `Legend`
 * and has no reason to change for this panel's height alone. */
/**
 * The default colour mode (`use-tsld-canvas-ui-state.ts:149`). Named here rather than compared
 * against a literal so the two cannot drift apart silently — a drift that would show up only as the
 * `View ▾` trigger annotating (or failing to annotate) the wrong state.
 */
const DEFAULT_COLOUR_MODE: ColourMode = 'criticality';

/**
 * `View ▾`'s trigger label, which carries the active colour mode **only when it is not the
 * default** (ADR-0090 M2-T2 — the decision is written up in
 * `docs/specs/workspace-layout/m2-suite-impact.md`).
 *
 * The `colour-by` menu-button used to say this on Row 1 (`Colour · Criticality`) and cost 183 px of
 * pinned width to do it. Colour is the diagram's dominant encoding, so losing the read-out
 * altogether was not acceptable — a planner who has coloured by WBS group and forgotten reads every
 * criticality judgement wrong. Annotating *always* would spend ~90 px permanently to state the
 * thing that is already true, on the surface whose entire problem is width. So it annotates the
 * surprising state and stays silent in the ordinary one.
 */
function viewTriggerLabel(ctx: TsldToolbarContext): string {
  return ctx.colourMode === DEFAULT_COLOUR_MODE
    ? 'View'
    : `View · ${COLOUR_MODE_LABELS[ctx.colourMode]}`;
}

function ViewTogglesPanel({ ctx }: { ctx: TsldToolbarContext }): React.ReactElement {
  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
      {VIEW_TOGGLE_GROUP_ORDER.map(({ id, label }) => {
        const keys = viewToggleKeysFor(id, ctx.planView);
        const lenses = lensTogglesIn(id);
        // `zoom` and `insight` render content that is not a toggle or a lens (the two radio
        // groups), so an emptiness test that only counts those would drop them. Without this the
        // zoom group is registered, ordered, typed — and never rendered: a milestone with no entry
        // point, which is the ADR-0081 defect exactly, and one no typecheck can see.
        // `columns` renders content that is neither a toggle nor a lens, so it needs its entry
        // here or it would be registered, ordered, typed — and never drawn. That is the exact
        // failure the zoom group's own note records, and it is invisible to a typecheck.
        const hasOwnContent =
          id === 'zoom' ||
          (id === 'insight' && CANVAS_LENSES_ENABLED) ||
          (id === 'columns' && ctx.ganttColumns !== undefined);
        if (keys.length === 0 && lenses.length === 0 && !hasOwnContent) return null;
        return (
          <fieldset key={id} className="flex flex-col gap-2">
            <legend className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
              {label}
            </legend>
            {/* Colour-by leads the Insight group (ADR-0090 M2-T2): it is the one control here that
                changes what every bar MEANS rather than adding a mark on top, so it reads first.
                A radio group, not checkboxes — the three modes are exclusive, which the old
                menu-button expressed with `menuitemradio` and this expresses natively. */}
            {/* The relocated zoom presets (ADR-0091 D3). This RELOCATES ADR-0056 §1, it does not
                withdraw it: `pxPerDayForPreset`, `presetOf`/`isAtPreset` and the required-width
                parameter are untouched — only the surface that calls them moves. A radio group for
                the same reason colour-by is one: the levels are exclusive, which the menu expressed
                with `menuitemradio` and this expresses natively. Each row carries its target visible
                range, so the names stop being ambiguous about what they frame. */}
            {id === 'zoom' ? (
              <div role="radiogroup" aria-label="Zoom level" className="flex flex-col gap-2">
                {ZOOM_LEVELS.map((level) => (
                  <label key={level} className={TOGGLE_ROW}>
                    <input
                      type="radio"
                      name="tsld-zoom-preset"
                      checked={ctx.zoomPreset === level}
                      onChange={() => ctx.setZoomPreset(level)}
                      className="accent-primary size-4"
                    />
                    {CANVAS_TIME_AXIS_ENABLED
                      ? `${ZOOM_LABELS[level] ?? level} — ${ZOOM_RANGE_LABELS[level]}`
                      : (ZOOM_LABELS[level] ?? level)}
                  </label>
                ))}
              </div>
            ) : null}
            {id === 'columns' && ctx.ganttColumns !== undefined ? (
              <div className="flex flex-col gap-2">
                {HIDEABLE_COLUMNS.map((key) => {
                  const columns = ctx.ganttColumns;
                  if (columns === undefined) return null;
                  const shown = !columns.hidden.has(key);
                  return (
                    <label key={key} className={TOGGLE_ROW}>
                      <input
                        type="checkbox"
                        checked={shown}
                        onChange={() => {
                          const next = new Set(columns.hidden);
                          if (shown) next.add(key);
                          else next.delete(key);
                          columns.setHidden(next);
                        }}
                        className="accent-primary size-4"
                      />
                      {GANTT_COLUMN_LABELS[key]}
                    </label>
                  );
                })}
              </div>
            ) : null}
            {id === 'insight' && CANVAS_LENSES_ENABLED ? (
              <div
                role="radiogroup"
                aria-label="Colour bars by"
                className="border-border mb-1 flex flex-col gap-2 border-b pb-2"
              >
                {COLOUR_MODE_ORDER.map((mode) => (
                  <label key={mode} className={TOGGLE_ROW}>
                    <input
                      type="radio"
                      name="tsld-colour-mode"
                      checked={ctx.colourMode === mode}
                      onChange={() => ctx.setColourMode(mode)}
                      className="accent-primary size-4"
                    />
                    Colour · {COLOUR_MODE_LABELS[mode]}
                  </label>
                ))}
              </div>
            ) : null}
            {keys.map((key) => (
              <label key={key} className={TOGGLE_ROW}>
                <input
                  type="checkbox"
                  checked={ctx.viewToggles[key]}
                  onChange={() => ctx.toggleView(key)}
                  className="accent-primary size-4"
                />
                {VIEW_TOGGLE_META[key].label}
              </label>
            ))}
            {/* The relocated lens toggles (ADR-0090 M2-T2). `aria-disabled` + a guard rather than
                native `disabled`, per ADR-0083: a control whose only operation is changing its value
                takes the ARIA form, so the row stays focusable and its REASON stays readable —
                which is the whole point of moving these rather than dropping them. The reason is
                `aria-describedby`-linked to the input (never folded into its name) and shown
                visibly beside it, because this surface has no `title` tooltip to fall back on and a
                sighted planner needs it as much as a screen-reader one. */}
            {lenses.map((lens) => {
              const reason = lens.reason(ctx);
              const shut = reason !== undefined;
              const reasonId = shut ? `tsld-view-${lens.id}-reason` : undefined;
              const noteId = lens.note ? `tsld-view-${lens.id}-note` : undefined;
              // Both, space-separated, when both apply — an `aria-describedby` that names only one
              // silently drops the other, and "why it is shut" and "what it does" are both wanted.
              const describedBy = [reasonId, noteId].filter(Boolean).join(' ') || undefined;
              return (
                <div key={lens.id} className="flex flex-col gap-0.5">
                  <label className={cn(TOGGLE_ROW, shut && 'text-muted-foreground')}>
                    <input
                      type="checkbox"
                      data-view-lens={lens.id}
                      checked={lens.checked(ctx)}
                      aria-disabled={shut || undefined}
                      {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                      onChange={() => {
                        if (!shut) lens.toggle(ctx);
                      }}
                      className="accent-primary size-4"
                    />
                    {lens.label}
                  </label>
                  {shut ? (
                    <span id={reasonId} className="text-muted-foreground pl-6 text-xs">
                      {reason}
                    </span>
                  ) : null}
                  {lens.note ? (
                    <span id={noteId} className="text-muted-foreground pl-6 text-xs">
                      {lens.note}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
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
 * "Coming soon" stubs (resource-view, share) that make the toolbar read as fully designed and are
 * switched on later by swapping the stub for a real command (`docs/TOOLBAR_ROADMAP.md`).
 * (undo/redo swap in under `VITE_UNDO_REDO`; go-to-today, comments and add-note under
 * `VITE_TOOLBAR_QUICK_WINS`; search/filter, colour-by and baseline-overlay
 * under `VITE_CANVAS_LENSES`; isolate-logic, next-conflict and snap-to-grid under `VITE_CANVAS_NAV`;
 * export and print under `VITE_EXPORT_PRINT`; the Add menu's Level-of-effort/Hammock placeholders
 * collapse to one live Level-of-Effort item under `VITE_CANVAS_ACTIVITY_TYPES` — each a placeholder
 * only when its owning flag is off.)
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
  // label/icon each remaining id carries in BOTH its real (flag-on) item and its
  // `placeholderItem()` (flag-off) stub, declared once and spread into both so the two branches can't
  // drift (component review C1; mirrors the `add-activity` shared-shape pattern below).
  const todayShape = {
    id: 'today',
    group: 'frame' as const,
    row: 'look' as const,
    tier: 2 as const,
    order: 13,
    // Navigation survives longest on Row 1 — see ADR-0090 D3 / `priority`.
    priority: 100,
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
    // Toolbar-only users have no other route into the dependency/logic panel (entry-route gap #6): a
    // tooltip clause makes it discoverable without renaming the visible "Add note" affordance. Appended
    // to the hover `title` only (the accessible name stays "Add note").
    description: 'Opens the Logic panel (links & notes)',
    icon: <StickyNote className="size-4" />,
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
  // Insight-lens (VITE_CANVAS_LENSES) shared item shapes — the id/group/row/tier/order/label(/icon)
  // each lens id carries in BOTH its real (flag-on) item and its stub (flag-off `SearchFieldControl` /
  // `placeholderItem()`), declared once and spread into both branches so they can't drift (mirrors the
  // quick-wins / add-activity shared-shape pattern). All four sit on Row 1 · Look and gate on a
  // computed diagram (shade-don't-hide), matching the zoom cluster.
  const searchShape = {
    id: 'search',
    group: 'find' as const,
    row: 'look' as const,
    tier: 1 as const,
    order: -1,
    label: 'Search or filter activities',
  };
  const filterShape = {
    id: 'filter',
    group: 'find' as const,
    row: 'look' as const,
    tier: 2 as const,
    order: 0,
    label: 'Filter',
    icon: <Filter className="size-4" />,
  };
  // Canvas-nav (VITE_CANVAS_NAV) shared item shapes — the id/group/row/tier/order/label/icon each of the
  // three ids carries in BOTH its real (flag-on) item and its `placeholderItem()` (flag-off) stub,
  // declared once and spread into both branches so they can't drift (mirrors the quick-wins / lens
  // shared-shape pattern). isolate/next-conflict lead the Find cluster (Row 1 · Look, view-only);
  // snap-to-grid rides the pen-gated authoring cluster (Row 2 · Do).
  const nextConflictShape = {
    id: 'next-conflict',
    group: 'find' as const,
    row: 'look' as const,
    // **Tier 1 since ADR-0094, and the label stays STATIC.** Tier 3 is admitted last, so at 1646 this
    // sat in the `⋯` — where its "No conflicts to review" shading was a shading nobody saw, and its
    // count could not tell a planner whether opening the menu was worth it.
    //
    // The count is NOT folded into this label, and that was decided twice. `ToolbarItem.label` is a
    // plain string; making it context-bearing would widen a shared primitive for one caller, reduce
    // the accessible name to "2 of 3" (a status, not a command), and — because a label's width is
    // derived — re-run the whole ladder on every click, moving other controls under the planner's
    // cursor between two clicks of the same button. It also fails for the reason the ORIGINAL
    // refusal gave, which survives this promotion intact: a label is painted only when labels fit.
    // The count lives in `next-conflict-status` instead, which is a `render` item and therefore
    // measured rather than derived.
    tier: 1 as const,
    order: 2,
    /**
     * **A command outranks the read-out that describes it** (ADR-0094 M5).
     *
     * Without this the flag-on journey found the epic's purpose inverting the moment it applied:
     * `next-conflict-status` is a `render` item and therefore **cannot demote**, so at the ordinary
     * 1280 px journey viewport the ~130 px it takes the instant a plan HAS a conflict pushed
     * something off the row — and the lowest-ranked candidate was the button the chip labels
     * (default priority is `-order`, i.e. −2, below every neighbour). The result was a count sitting
     * on the row beside no way to act on it, in the only state this epic exists for.
     *
     * 90 rather than 100: navigation still survives longest (ADR-0090 D3), but this outranks the
     * lenses at 60 and everything on default. The read-out cannot be given the lower rank instead —
     * it has no rank, which is precisely the asymmetry that caused this.
     */
    priority: 90,
    label: 'Next conflict',
    icon: <TriangleAlert className="size-4" />,
  };
  // Export & print (VITE_EXPORT_PRINT) shared item shapes — the id/group/row/tier/order/label/icon each
  // of the two ids carries in BOTH its real (flag-on) item and its `placeholderItem()` (flag-off) stub,
  // declared once and spread into both branches so they can't drift (mirrors the quick-wins / lens /
  // canvas-nav shared-shape pattern). Both ride the Row 2 · Do deliverables cluster (no pen — they read,
  // never author).
  // The deliverables trigger (ADR-0090 M2-T4): one stop where there were three. It sits in the new
  // `output` group at Row 2's trailing edge — the group renamed from the never-used `history`, so
  // the taxonomy gained a home for "what the plan leaves as" without growing.
  const exportShape = {
    id: 'export',
    group: 'output' as const,
    row: 'do' as const,
    tier: 2 as const,
    order: 0,
    label: SHARE_EXPORT_LABEL,
    icon: <FileDown className="size-4" />,
  };
  return defineToolbar<TsldToolbarContext>([
    // --- 1 · Frame / navigate (Row 1 · Look) --------------------------------------------------
    // "Go to date" is a pure view pan (ADR-0033 M2) offered to every role — navigating never mutates.
    // The persisted **data date** no longer lives on the bar (ADR-0031 two-row amendment): it is set at
    // plan creation and changed via *Edit plan* (and will become the status date under *Update
    // progress*), so navigation and the data anchor can no longer be confused as adjacent date fields.

    // Zoom — −/+ and Fit, a compact cluster in the Frame group (ADR-0031). Shaded (not hidden) until
    // a diagram exists, so the bar keeps a stable shape from the empty canvas onward.
    //
    // The `zoom-preset` dropdown that used to lead this cluster is GONE (ADR-0091 D3): the presets
    // are a radio group inside `View ▾`, which is where a planner hunting for a framing looks. Its
    // trigger rendered the ACTIVE PRESET as its label, so someone looking for `Fit to plan` met a
    // button reading `Week` — the M3-b defect ADR-0090 M5 found and could only half-fix while the
    // control existed. This RELOCATES ADR-0056 §1 rather than withdrawing it: `pxPerDayForPreset`,
    // `presetOf` and `isAtPreset` are untouched; only the surface calling them moved.
    {
      id: 'zoom-out',
      group: 'frame',
      row: 'look',
      tier: 2,
      // D3a (ADR-0091): labelled at `comfortable`, icon-only below. Un-folding these four puts
      // 430 px back on Row 1, which overflows it at 1440 on its own; icon-only costs 128 px.
      // A band rule, not `'auto'` — `autoLabelsFit` is all-or-nothing for the whole row, so
      // these would follow their neighbours' collective fate and label at a narrow band that
      // happened to have slack, which is exactly what the 1440 measurement forbids.
      showLabel: { atLeast: 'comfortable' },
      order: 10,
      priority: 100,
      label: 'Zoom out',
      icon: <Minus className="size-4" />,
      // Below 1280 px this command lives inside `Zoom ▾` instead (M3-T2) — one predicate shared with
      // the fold itself, so it can never be in both places or neither.
      isEnabled: (ctx) => ctx.hasDiagram && ctx.canvasActive,
      disabledReason: (ctx) => canvasViewportReason(ctx, ZOOM_DISABLED_REASON),
      onActivate: (ctx) => ctx.stepZoom(0.5),
    },
    {
      id: 'zoom-in',
      group: 'frame',
      row: 'look',
      tier: 2,
      // D3a (ADR-0091): labelled at `comfortable`, icon-only below. Un-folding these four puts
      // 430 px back on Row 1, which overflows it at 1440 on its own; icon-only costs 128 px.
      // A band rule, not `'auto'` — `autoLabelsFit` is all-or-nothing for the whole row, so
      // these would follow their neighbours' collective fate and label at a narrow band that
      // happened to have slack, which is exactly what the 1440 measurement forbids.
      showLabel: { atLeast: 'comfortable' },
      order: 11,
      priority: 100,
      label: 'Zoom in',
      icon: <Plus className="size-4" />,
      isEnabled: (ctx) => ctx.hasDiagram && ctx.canvasActive,
      disabledReason: (ctx) => canvasViewportReason(ctx, ZOOM_DISABLED_REASON),
      onActivate: (ctx) => ctx.stepZoom(2),
    },
    {
      id: 'fit',
      group: 'frame',
      row: 'look',
      tier: 2,
      // D3a (ADR-0091): labelled at `comfortable`, icon-only below. Un-folding these four puts
      // 430 px back on Row 1, which overflows it at 1440 on its own; icon-only costs 128 px.
      // A band rule, not `'auto'` — `autoLabelsFit` is all-or-nothing for the whole row, so
      // these would follow their neighbours' collective fate and label at a narrow band that
      // happened to have slack, which is exactly what the 1440 measurement forbids.
      showLabel: { atLeast: 'comfortable' },
      order: 12,
      priority: 100,
      label: 'Fit to plan',
      icon: <Maximize2 className="size-4" />,
      isEnabled: (ctx) => ctx.hasDiagram && ctx.canvasActive,
      disabledReason: (ctx) => canvasViewportReason(ctx, 'Add an activity to fit the view'),
      onActivate: (ctx) => ctx.fit(),
    },
    // `zoom-to-selection` moved to the SELECTION BAR in ADR-0090 M2-T1 (`selection-actions.tsx`),
    // with `isolate-logic` and `float-paths`. All three required a selection, so all three spent
    // most of their life on Row 1 shaded — holding width to say "Select an activity first".
    // Go-to-today — a viewport jump that places today at the left edge (distinct from the "Today line"
    // *display* toggle in `View▾`). Named "Go to today" (not "Recenter") for honesty: `goToDate` pins the
    // day at the 12px left inset, it does not centre (label-honesty nit). Shown inline (tier 2 icon) with
    // the zoom/nav cluster. Flag-on it reuses the `goToDate` view jump (toolbar quick-wins F1) — view-only,
    // so a Viewer can use it; flag-off it is the "Coming soon" placeholder, byte-for-byte.
    TOOLBAR_QUICK_WINS_ENABLED
      ? {
          ...todayShape,
          // **The merged control takes `go-to-date`'s slot** (ADR-0091 M7-S6): tier 1, ordered ahead
          // of the zoom cluster, where the date control has always sat. It is a `render` item and
          // therefore pinned — a split button is not something you stuff into a menu — which is why
          // it takes the tier that never demotes rather than `today`'s old tier 2.
          //
          // `showLabel` is gone with the merge: a `render` item owns its own chrome, and this one
          // compacts from `api.layout` exactly as its `View ▾` and `Summary ▾` neighbours do.
          ...(SCHEDULING_MODES_ENABLED
            ? {
                tier: 1 as const,
                order: -2,
                render: (ctx: TsldToolbarContext, api: ToolbarItemRenderApi) => (
                  <GoToTodayControl ctx={ctx} api={api} />
                ),
              }
            : {
                // **No date capability in this build ⇒ no caret**, rather than a caret shaded with a
                // reason that would be untrue. This is byte-for-byte the plain command `today` was
                // before the merge, which is also what keeps the flag-off surface unchanged.
                showLabel: { atLeast: 'comfortable' } as const,
                isEnabled: (ctx: TsldToolbarContext) => ctx.hasDiagram && ctx.canvasActive,
                disabledReason: (ctx: TsldToolbarContext) =>
                  canvasViewportReason(ctx, 'Add an activity to go to today'),
                onActivate: (ctx: TsldToolbarContext) => ctx.goToDate(ctx.todayIso),
              }),
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
          label={viewTriggerLabel(ctx)}
          icon={<SlidersHorizontal className="size-4" />}
          itemProps={api.itemProps}
          compact={triggersAreCompact(api.layout)}
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
      row: 'mode',
      tier: 1,
      // Its name is the affordance, so it stays labelled at every width (TECH_DEBT #61).
      showLabel: 'always',
      order: 1,
      demotionGroup: 'scheduling-mode',
      label: 'Early mode',
      icon: <ArrowLeftToLine className="size-4" aria-hidden="true" />,
      isVisible: () => SCHEDULING_MODES_ENABLED,
      isEnabled: (ctx) => ctx.setSchedulingMode !== null,
      disabledReason: (ctx) =>
        ctx.setSchedulingMode === null
          ? (ctx.scheduleRefusal('change the scheduling mode') ?? undefined)
          : undefined,
      isActive: (ctx) => ctx.schedulingMode === 'EARLY',
      onActivate: (ctx) => ctx.setSchedulingMode?.('EARLY'),
    },
    {
      id: 'mode-visual',
      group: 'lens',
      row: 'mode',
      tier: 1,
      // Its name is the affordance, so it stays labelled at every width (TECH_DEBT #61).
      showLabel: 'always',
      order: 2,
      demotionGroup: 'scheduling-mode',
      label: 'Visual mode',
      icon: <Hand className="size-4" aria-hidden="true" />,
      isVisible: () => SCHEDULING_MODES_ENABLED,
      isEnabled: (ctx) => ctx.setSchedulingMode !== null,
      disabledReason: (ctx) =>
        ctx.setSchedulingMode === null
          ? (ctx.scheduleRefusal('change the scheduling mode') ?? undefined)
          : undefined,
      isActive: (ctx) => ctx.schedulingMode === 'VISUAL',
      onActivate: (ctx) => ctx.setSchedulingMode?.('VISUAL'),
    },
    // View-mode switch — the slot ADR-0031 §296 reserved, now filled (ADR-0059 §3). It follows the
    // `mode-early`/`mode-visual` idiom: a segment is TWO registry items whose `isActive` reads the
    // same state, not one item rendering a control, so overflow and the label policy treat each half
    // like every other button.
    //
    // ADR-0055 §8.4 declined to ship this control while only one view existed, on the grounds that
    // half of it would be inert. That condition no longer holds for Gantt (`Network` remains unbuilt
    // and stays out). Flag-off both halves are invisible and the toolbar is byte-for-byte today's.
    //
    // View-only and offered to EVERY role: reading the schedule as bars is not an edit, so unlike
    // the scheduling-mode selector these are never shaded for a viewer.
    {
      id: 'view-tsld',
      group: 'lens',
      row: 'mode',
      tier: 1,
      // Its name is the affordance — a nameless view switch is a coin toss (TECH_DEBT #61).
      showLabel: 'always',
      order: 10,
      demotionGroup: 'view-mode',
      label: 'Diagram',
      icon: <Waypoints className="size-4" aria-hidden="true" />,
      isVisible: () => GANTT_VIEW_ENABLED,
      isActive: (ctx) => ctx.planView === 'tsld',
      onActivate: (ctx) => ctx.setPlanView('tsld'),
    },
    {
      id: 'view-gantt',
      group: 'lens',
      row: 'mode',
      tier: 1,
      showLabel: 'always',
      order: 11,
      demotionGroup: 'view-mode',
      label: 'Gantt',
      icon: <ChartGantt className="size-4" aria-hidden="true" />,
      isVisible: () => GANTT_VIEW_ENABLED,
      isActive: (ctx) => ctx.planView === 'gantt',
      onActivate: (ctx) => ctx.setPlanView('gantt'),
    },
    // `over-allocation` moved INTO `View ▾` (Insight overlays) in ADR-0090 M2-T2, keeping the
    // clickable-to-off rule that stops it becoming a stuck-on dead end — see `LENS_TOGGLES`.

    // --- 3 · Find / focus (Row 1 · Look) ------------------------------------------------------
    // Search / filter field — leads the Find cluster as a real (disabled) input, so the affordance
    // reads the way the old app's did (ADR-0031 two-row amendment). Presentational until wired, so it
    // isn't a roving-tabindex stop while inert.
    // Flag-on (VITE_CANVAS_LENSES) the search field goes live — search-as-you-type dims non-matching
    // bars (spec `docs/specs/canvas-lenses/`); flag-off it is the disabled `SearchFieldControl`,
    // byte-for-byte. Shaded (disabled-with-reason) on an empty/uncomputed canvas, like the zoom cluster.
    CANVAS_LENSES_ENABLED
      ? {
          ...searchShape,
          // Enabled in BOTH views. M1 shaded it in the Gantt because Enter had nothing to centre
          // there; M4 gave the Gantt the same match set and a row scroll, so the interim shade is
          // reverted rather than left as a permanent half-truth — which is what it would have
          // become if nobody came back to it.
          isEnabled: (ctx) => ctx.hasDiagram,
          disabledReason: (ctx) => (ctx.hasDiagram ? undefined : LENS_NO_DIAGRAM_REASON),
          render: (ctx, api) => <LiveSearchControl ctx={ctx} api={api} />,
        }
      : {
          ...searchShape,
          presentational: true,
          render: (_ctx, api) => (
            <SearchFieldControl itemProps={api.itemProps} layout={api.layout} />
          ),
        },
    // Filter — flag-on a real attribute Filter menu (Critical / Has constraint / Has conflict), whose
    // match set intersects with the search query; flag-off the "Coming soon" placeholder, byte-for-byte.
    // isolate-logic and next-conflict stay inline "Coming soon" placeholders (tier 2).
    CANVAS_LENSES_ENABLED
      ? {
          ...filterShape,
          isEnabled: (ctx) => ctx.hasDiagram,
          disabledReason: (ctx) => (ctx.hasDiagram ? undefined : LENS_NO_DIAGRAM_REASON),
          isActive: (ctx) => ctx.filterAttrs.size > 0,
          render: (ctx, api) => <FilterMenuControl ctx={ctx} api={api} />,
        }
      : placeholderItem(filterShape),
    // Isolate logic path — flag-on a view-only menu-button that dims everything not on the selected
    // activity's logic chain (full or driving-only, CQ-1), reusing the Stage A dim seam (spec
    // `docs/specs/canvas-nav/`); flag-off the "Coming soon" placeholder, byte-for-byte. Enabled only with
    // a selection AND a computed diagram; never pen-gated (navigating never mutates). Pressed when active.
    // Next conflict — flag-on a view-only button that cycles the plan's flagged activities (CQ-2), each
    // centred + selected + announced (spec `docs/specs/canvas-nav/`); flag-off the "Coming soon"
    // placeholder, byte-for-byte. Enabled only when there is ≥ 1 conflict; never pen-gated.
    CANVAS_NAV_ENABLED
      ? {
          ...nextConflictShape,
          isEnabled: (ctx) => ctx.hasConflicts,
          disabledReason: (ctx) =>
            !ctx.hasDiagram
              ? LENS_NO_DIAGRAM_REASON
              : ctx.hasConflicts
                ? undefined
                : 'No conflicts to review',
          // The count reaches assistive tech HERE, because the read-out beside it is `aria-hidden`
          // (ADR-0094 M3-T2). Without this an AT user met an enabled button called "Next conflict"
          // with no magnitude until they activated it — while a sighted planner read "3 conflicts"
          // at rest. Same requirement, half the audience. Read on focus, never announced: the polite
          // announcer already speaks the position on activation.
          srDescription: (ctx) =>
            ctx.currentConflict
              ? `Conflict ${String(ctx.currentConflict.index)} of ${String(ctx.currentConflict.total)}`
              : ctx.hasConflicts
                ? `${String(ctx.conflictCount)} ${ctx.conflictCount === 1 ? 'conflict' : 'conflicts'} in this plan`
                : undefined,
          onActivate: (ctx) => ctx.goToNextConflict(),
        }
      : placeholderItem(nextConflictShape),
    // Float paths (audit F4, `VITE_FLOAT_PATHS`) — the ranked driving chains into the selected
    // activity, in a docked right panel. Row 1 · Look, `find` group at order 4, beside Isolate and
    // Next-conflict, which is where a planner already looks to trace logic.
    //
    // **Live in the Gantt as well as the Diagram.** It is an analysis, not a viewport command —
    // the ADR-0059 M6 lesson inverted: shade what only the canvas can do, never what both can.
    //
    // The ladder reads `activityCount`, deliberately NOT `hasDiagram`. That flag means *computed*
    // (it requires a non-null `earlyStart`), and this endpoint runs its own `computeSchedule` per
    // request — so gating on it would shade the item with "Add an activity first" on a plan full of
    // activities that simply has not been recalculated yet.
    //
    // Flag-off the item is **absent**, not a "Coming soon" placeholder: flag-off must be
    // byte-for-byte today's toolbar, and a stub would add a control to a shipped row.
    // View-only: never `penGated`.
    ...(FLOAT_PATHS_ENABLED
      ? [
          {
            id: 'float-paths',
            group: 'find',
            row: 'look',
            tier: 3,
            order: 4,
            label: 'Float paths',
            icon: <Split className="size-4" />,
            showLabel: 'auto',
            isActive: (ctx) => ctx.floatPathsOpen,
            isEnabled: (ctx) => ctx.activityCount > 0 && ctx.selectedActivity != null,
            disabledReason: (ctx) =>
              ctx.activityCount === 0
                ? 'Add an activity first'
                : ctx.selectedActivity == null
                  ? ISOLATE_NO_SELECTION_REASON
                  : undefined,
            onActivate: (ctx) => ctx.toggleFloatPaths(),
          } satisfies ToolbarItem<TsldToolbarContext>,
        ]
      : []),
    // Next-conflict VISIBLE status chip (U2) — a presentational `role="status"` read-out pinned next to
    // the Next-conflict button while a conflict is being cycled, so the reason is on screen and not only
    // announced. Always registered but self-hides (`isVisible`) unless `currentConflict != null`, which
    // is never the case when the flag is off (the ordered set is empty then) — so it is inert + adds no
    // DOM flag-off, keeping the byte-for-byte parity. Presentational ⇒ never a roving-tabindex stop.
    // **The plan said to fold this into `next-conflict`'s label. Measurement says do not.**
    //
    // `design.md` §4.1 item 20/21 folds the "Conflict 2 of 7 · reason" read-out into the button's
    // label, on the same reasoning that moved `search-status` into the search field a few lines up:
    // a read-out is not a command and does not belong in a `role="toolbar"`.
    //
    // The two destinations are not comparable, and the measurement is what shows it. The search
    // field is a `render` item — pinned, painted at every width. A **label** is painted only when
    // `autoLabelsFit` is true, and `docs/specs/workspace-layout/m2-item-widths.md` records that at
    // 1920 it is false: every `'auto'` item on this row measures 32 px, icon-only. So folding the
    // count into the label would make it invisible **at the width this whole epic exists to fix**,
    // on the product owner's own monitor — deleting information under cover of tidying.
    //
    // The chip costs nothing to keep: `isVisible` is false unless a conflict is being cycled, so it
    // occupies no width at rest and none of the M2 arithmetic depends on it. It stays, and
    // `presentational` keeps one honest consumer on this surface rather than none.
    {
      id: 'next-conflict-status',
      group: 'find',
      row: 'look',
      tier: 2,
      order: 3,
      label: 'Current conflict',
      presentational: true,
      /**
       * Visible whenever there is something to count — not only mid-cycle (ADR-0094 M3-T2) — **and
       * only once the row is at least `compact`.**
       *
       * The band floor is the Project-finish chip's answer to the same problem, for the same reason:
       * a `render` item can never demote, so every pixel it takes is paid at every width, and the
       * only answer available to such an item is to withhold itself.
       *
       * **It is not, however, what fixed the S4 overhang this epic hit, and that is worth saying.**
       * This paragraph first claimed it was: `e2e-toolbar-fit` S4 went red at 1024 when
       * `next-conflict` was promoted to tier 1, the read-out was the obvious new pinned cost, and
       * the floor was written with the overhang cited as its evidence. Adding it changed the
       * overhang by **exactly zero px** — the fixture plan carries no conflicts, so this chip was
       * never rendering at that width at all. The real cause was `computeLadder` testing for a
       * shortfall without charging the `⋯` it was already painting (`toolbar-ladder.ts`, Stage 2).
       * The floor stays because the reasoning for it is sound on its own; the claim that it fixed
       * something is withdrawn rather than deleted, because the wrong version is the more
       * instructive half (ADR-0076 Class 3, caught by measuring instead of shipping the story).
       *
       * The count is not lost to an AT user below `compact`: `next-conflict`'s `srDescription`
       * carries it, and that is read from the button rather than from this chip (which is
       * `aria-hidden`). A sighted planner there loses the resting magnitude and keeps the button,
       * which is a glance rather than a capability — the same trade the finish chip records.
       */
      isVisible: (ctx, env) =>
        (ctx.hasConflicts || ctx.currentConflict != null) && bandIsAtLeast(env.layout, 'compact'),
      render: (ctx, api) => <CurrentConflictStatus ctx={ctx} itemProps={api.itemProps} />,
    },

    // The find read-out (VITE_CANVAS_SEARCH_NAV) — "12 matches" / "3 of 12", pinned beside the search
    // field. Registered only flag-on: flag-off `searchStatus` is always null, so an always-registered
    // item would be inert — but registering it anyway would still put an entry in the item list the
    // overflow measures, and the parity contract is that flag-off the toolbar is byte-for-byte today's.
    // Presentational ⇒ never a roving-tabindex stop.
    ...(CANVAS_SEARCH_NAV_ENABLED
      ? [
          // `search-status` was folded INTO the search field's own box in ADR-0090 M2-T3 — it is
          // a read-out, and a read-out has no business being a member of a `role="toolbar"`.
        ]
      : []),

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
      // Its name is the affordance, so it stays labelled at every width (TECH_DEBT #61).
      showLabel: 'always',
      order: 0,
      label: 'Add activity',
      icon: <Plus className="size-4" />,
      penGated: true,
      disabledReason: (ctx) => ctx.scheduleRefusal(ADD_ACTION) ?? undefined,
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
      disabledReason: (ctx) => ctx.scheduleRefusal(LINK_ACTION) ?? undefined,
      isVisible: () => CANVAS_AUTHORING_ENABLED,
      render: (ctx, api) => <LinkControl ctx={ctx} api={api} />,
    },
    /*
     * Marquee select (`docs/specs/canvas-multi-select/` M2-T4) — a fifth tool mode.
     *
     * **A plain toggle, not a split-button on a `Select` item.** The plan specified the latter
     * ("the `Select` toolbar item becomes a split-button"), written from a premise nobody had
     * checked: **there is no `Select` item on this toolbar** and never has been — Select is the
     * mode you are in when no tool is armed, not a control. Building the specified shape would have
     * meant inventing a control whose primary region's only job is "stop doing the thing you are
     * not doing". What the plan's risk row actually asks for is the ADR-0064 arm/disarm contract,
     * which a toggle carries in full: Escape returns to `select`, the band states the mode, and the
     * transition is announced.
     *
     * **Not `penGated`.** Selecting is a read (the ADR-0063 M4b rule), so a Viewer may sweep; the
     * bulk actions the selection opens carry their own gates and say why they are shut.
     *
     * Flag-off the item is **absent**, not shaded — a "Coming soon" placeholder is for a control
     * whose slot the planner can see is coming, and nothing in today's toolbar reserves this one.
     */
    ...(CANVAS_MULTI_SELECT_ENABLED
      ? [
          {
            id: 'marquee-select',
            group: 'tools' as const,
            row: 'do' as const,
            tier: 2 as const,
            order: 2,
            label: 'Select',
            description: 'Marquee-select activities on the canvas',
            icon: <SquareDashedMousePointer className="size-4" />,
            isActive: (ctx: TsldToolbarContext) => ctx.isMarqueeSelecting,
            onActivate: (ctx: TsldToolbarContext) => ctx.toggleMarqueeMode(),
          },
        ]
      : []),
    {
      id: 'auto-arrange',
      group: 'tools',
      row: 'do',
      tier: 2,
      order: 3,
      label: 'Arrange',
      description: 'Auto-arrange lanes',
      icon: <AlignVerticalSpaceAround className="size-4" />,
      penGated: true,
      disabledReason: (ctx) => ctx.scheduleRefusal('auto-arrange') ?? undefined,
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
          // **Not in the Gantt (M1).** Spec F4 found this was the ONLY way a Contributor reached
          // progress from a Gantt selection — via a button labelled "Add note" plus a tab change,
          // which is the discoverability failure that milestone exists to fix. Now that the object
          // bar is docked in the Gantt with a correctly-labelled route, leaving this here would add
          // a third entry point beside two bad ones rather than replacing them: ADR-0093's defect
          // reproduced inside the milestone meant to discharge it, which is exactly how the ux
          // review put it.
          //
          // It stays on the canvas, where it is the toolbar's own route into the Logic panel for a
          // planner working from the command surface (entry-route gap #6, in `addNoteShape`'s own
          // description).
          isVisible: (ctx) => NOTES_ENABLED && ctx.planView !== 'gantt',
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
    // **`snap-to-grid` was deleted (workspace-chrome M2).** Its toggle never decided whether a
    // placement snapped — the engine rolls every `visualStart` forward to a working instant
    // unconditionally (`compute.ts:335-338` → `instants.ts:18-22`) — only which way a tie broke
    // on a drop onto a non-working column: Saturday landed Friday with it on, Monday with it
    // off. The product owner reported seeing no difference and was right. A control whose
    // entire capability is already delivered unconditionally elsewhere is the ADR-0081 shape.
    // `clear-visual-placement` MOVED to the selection bar (ADR-0094 M4-T1). Its `isEnabled` consulted
    // `ctx.selectedActivity`, which is ADR-0093's discriminator verbatim: an action whose subject is
    // the selected object belongs on the object's surface. It stayed here through ADR-0093 only
    // because it had no twin then; the `visualConflict` remedy IS this action, so it moved rather
    // than being duplicated. `selection-duplication.structural.test.ts` was verified RED against the
    // two-copy state first. Its four-condition gate is now `clearVisualPlacementGate` in
    // `conflict-remedy.ts`, shared by the bar's item and the remedy so they cannot drift.
    // Recalculate + Undo/Redo close the authoring cluster (moved here from the Object/History groups so
    // the pen-gated set is contiguous). Recalculate is enabled only with the pen and when not in flight.
    {
      id: 'recalculate',
      group: 'tools',
      row: 'do',
      tier: 1,
      // Its name is the affordance, so it stays labelled at every width (TECH_DEBT #61).
      showLabel: 'always',
      order: 7,
      label: 'Recalculate',
      // In flight the icon spins — the same `Loader2 … animate-spin` idiom the export items above
      // use, so this is an established pattern rather than a new one. The spin is the *only* cue a
      // `prefers-reduced-motion` user loses (the global rule reduces it to 0.01 ms), which is why
      // `isBusy` (→ `aria-busy`) and the "Recalculating…" disabled reason below carry the same fact
      // in two motion-independent channels. Covers BOTH triggers: `recalcPending` is the shared
      // coalescer's `isPending` (ADR-0032 M3), so a debounced auto-recalc spins it too.
      icon: (ctx) =>
        ctx.recalcPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        ),
      penGated: true,
      isBusy: (ctx) => ctx.recalcPending,
      isEnabled: (ctx) => ctx.canRecalc && !ctx.recalcPending,
      // Explain the disabled state like the sibling authoring commands do, rather than a silent grey:
      // in-flight (busy) vs. no pen (identical underlying cause to Add activity).
      disabledReason: (ctx) =>
        ctx.recalcPending
          ? 'Recalculating…'
          : ctx.canRecalc
            ? undefined
            : (ctx.scheduleRefusal('recalculate') ?? undefined),
      onActivate: (ctx) => ctx.recalculate(),
    },
    // Undo / Redo close the pen-gated authoring cluster (ADR-0048 M3.2). Flag-off these are the
    // ADR-0031 "Coming soon" placeholders (byte-for-byte the current bar); flag-on they are the real
    // pen-gated commands, disabled from `canUndo`/`canRedo` with a dynamic accessible name.
    ...undoRedoToolbarItems(),

    // Legend + Resource view, back on Row 1 (workspace-chrome M4) — see `promotedLensItems`.
    ...promotedLensItems(),

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
          compact={triggersAreCompact(api.layout)}
        >
          {ctx.summaryContent}
        </ToolbarPopover>
      ),
    },
    /**
     * The **Project-finish read-out**, back inside the registry — a knowing reversal of ADR-0090
     * M2-T3, recorded here rather than done quietly (ADR-0091 M7-S4).
     *
     * That task moved it out for two reasons. The first — **150 px of pinned Row-1 width**, paid at
     * every viewport because a `render` item can never demote — no longer holds: Row 1 carries
     * 382 px of slack at the product owner's 1646 px (`m7-ladder-measurement.md`), and the chip was
     * put back beside `Summary ▾` at their request in M4 anyway, as the toolbar's **sibling**. The
     * second — a read-out has no business in a `role="toolbar"` — is answered by `presentational`,
     * which pins `tabIndex: -1` and withholds the focusable marker, so the chip is painted by the
     * row and is not a stop in it. That field exists for exactly this and its own docblock says not
     * to delete the capability.
     *
     * **What being a sibling could not do is let the `⋯` be last.** The overflow button lives inside
     * the toolbar and must stay there — it is a roving stop, the arrow keys are a handler on the
     * toolbar container, and the fit gate scopes its sweep to that element, so moving it out would
     * take it out of the gate's reach silently. With the chip outside and to the right, the `⋯` was
     * necessarily *not* the rightmost thing on the row, which is what the product owner saw and
     * described as stranded. One of the two had to move inward, and it is the one that is not a
     * command.
     */
    {
      id: 'finish-chip',
      group: 'object',
      row: 'look',
      tier: 2,
      order: 2,
      label: 'Project finish',
      presentational: true,
      /**
       * **Withheld once the row stops being roomy** — the read-out's answer to being pinned.
       *
       * A `render` item can never demote, so every pixel it takes is paid at every width. Measured:
       * with the chip unconditional, Row 1 laid out **11 px past its container at 1024** and broke
       * the fit gate's S4, which is a *measured* claim that both rows fit at every supported width
       * down to 768. Nothing was left to demote by then, so the row had no answer.
       *
       * Keyed to the density band rather than to a `sm:`/`xl:` breakpoint, because the band already
       * means "how much room does this surface have" and the media query means "how wide is the
       * window" — and those diverge exactly when the rail is open, which is most of the time. The
       * number is one press away in `Summary ▾` at any width, so this costs a glance rather than a
       * capability.
       */
      isVisible: (_ctx, env) => bandIsAtLeast(env.layout, 'compact'),
      // `api.itemProps` is not optional even for a `presentational` item: it carries the
      // `data-toolbar-item` marker and the `tabIndex: -1` that keeps the chip out of the roving
      // sequence. Omitting it made the chip invisible to `e2e-toolbar-fit`, which found it — S10
      // reported the trailing group 136 px adrift, which is exactly the chip's own width sitting
      // between `Summary ▾` and the `⋯` while carrying no marker for the sweep to see.
      render: (ctx, api) => (
        <span {...api.itemProps} className="flex shrink-0 items-center text-sm">
          {ctx.projectFinishContent}
        </span>
      ),
    },
    // Baselines, Earned value and Resource histogram are behind the **Analysis** trigger since
    // ADR-0090 M2-T5 — three Row-2 stops for three ways of measuring a plan against something.
    // `Schedule settings…` deliberately did NOT join them; see `PlanAnalysisControl`.
    {
      id: 'analysis',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 2,
      label: ANALYSIS_LABEL,
      icon: <ChartArea className="size-4" />,
      render: (ctx, api) => <PlanAnalysisControl ctx={ctx} api={api} />,
    },
    // The dialog behind this holds the plan's working-day calendar AND six other settings groups
    // that all change how its dates are calculated (critical path & float, progress/recalc mode,
    // expected finish, levelling, external relationships, earned value). It was labelled
    // "Calendar…" when the calendar was all it held; the label now names the whole scope, so a
    // planner looking for the float measure has somewhere to look (TECH_DEBT #60). The id stays
    // `calendar` — a stable test/telemetry handle, and the `PlanChromeDialog` key.
    {
      id: 'calendar',
      group: 'object',
      row: 'do',
      tier: 2,
      order: 3,
      label: 'Settings…',
      description: 'Schedule settings',
      icon: <CalendarDays className="size-4" />,
      onActivate: (ctx) => ctx.openCalendar(),
    },
    // Plan details + Edit plan are no longer toolbar buttons (ADR-0031 amendment): the key facts
    // (status, data date, mode) now live in the Summary popover, which also carries an "Edit plan…"
    // shortcut; the header shows an edit-pencil next to the status pill for quick access.
    // Deliverables + collaboration — inline "Coming soon" icon placeholders (Row 2; see
    // docs/TOOLBAR_ROADMAP.md). Update progress (apply actuals + advance the data date); Export the
    // diagram (PDF/PNG) or schedule (XER/MSP/CSV); Print; Share (the ADR-0012 per-plan guest link);
    // Comments (activity threads).
    // **Report progress is deliberately NOT here** (ADR-0093). It was the only action in the plan
    // workspace that existed twice: this item and the canvas dock's `progress`, with the same
    // permission, the same precondition and the same dialog. An action whose subject is the
    // SELECTED OBJECT belongs on the object's own surface; the command surface carries actions
    // whose subject is the plan or the view. The remaining routes are the dock, the activities
    // table's row menu and the activity editor's Progress tab.
    //
    // `selection-duplication.structural.test.ts` fails if a selection-gated item reappears here
    // with a dock twin, so this comment is a signpost rather than the enforcement.
    // Export ▾ (export & print, `docs/specs/export-print/`) — a menu-button of client-side deliverables
    // (Schedule CSV now; Diagram PNG/PDF at M2/M3). Flag-on it's the real `ExportMenuControl`, gated on a
    // computed diagram (disabled-with-reason otherwise, shade-don't-hide); flag-off it's the byte-for-byte
    // `placeholderItem()` "Coming soon" stub. `exportShape` is spread into both so they can't drift.
    EXPORT_PRINT_ENABLED
      ? {
          ...exportShape,
          // **Enabled when ANY row inside is actionable, not when the exports are** (ADR-0082, and
          // the rule M2-T7 exists to pin). Gating the trigger on `hasDiagram` alone — which is what
          // the first version did, inheriting the old Export button's gate — shut the whole menu on
          // a plan with no computed diagram and took **Share** with it. Sharing needs a permission,
          // not a schedule, so a Planner on a freshly created plan could share before this change
          // and could not after: a capability lost to a relocation, which is the exact failure this
          // milestone's suite-impact pass exists to catch.
          //
          // Each row keeps its own gate and its own reason; the trigger only asks whether there is
          // anything at all behind it.
          isEnabled: (ctx) => ctx.hasDiagram || (GUEST_SHARE_LINKS_ENABLED && ctx.canShare),
          disabledReason: (ctx) =>
            ctx.hasDiagram || (GUEST_SHARE_LINKS_ENABLED && ctx.canShare)
              ? undefined
              : EXPORT_NO_DIAGRAM_REASON,
          render: (ctx, api) => <ExportMenuControl ctx={ctx} api={api} />,
        }
      : placeholderItem(exportShape),
    // `share` folded INTO the Share & export menu in ADR-0090 M2-T4 — see `ExportMenuControl`.
    // Comments — reveals + focuses the plan-level notes thread (toolbar quick-wins F2). Read action for
    // every role; absent when `VITE_NOTES` is off (there is nothing to reveal). Flag-off it is the
    // "Coming soon" placeholder, byte-for-byte.
    TOOLBAR_QUICK_WINS_ENABLED
      ? {
          ...commentsShape,
          isVisible: () => NOTES_ENABLED,
          // With `VITE_ENTRY_ROUTES` on, Comments is a genuine TOGGLE for the docked notes panel, so it
          // carries pressed state (`aria-pressed`) reflecting `notesOpen` — like the View/Legend toggles.
          // Flag-off it's a one-shot scroll action (not a toggle), so no pressed state.
          ...(ENTRY_ROUTES_ENABLED ? { isActive: (ctx) => ctx.notesOpen } : {}),
          onActivate: (ctx) => ctx.revealComments(),
        }
      : placeholderItem(commentsShape),

    // `legend` moved INTO `View ▾` in ADR-0090 M2-T2, under a new **Panels** section — the direct
    // answer to the product owner's Q2. A panel is a surface you read beside the diagram, not a
    // mark drawn on it, which is why it is not filed with the Insight overlays.
    // **Keyboard shortcuts left this registry in ADR-0091 M7-S5** for the account menu
    // (`components/layout/account-chip.tsx`), reached through `chrome/help-action.tsx`. It was a
    // tier-3 command in a row rationing width between twenty-eight of them, so in practice it was
    // reachable only through the `⋯` — and it is not a command about the plan at all but a reference
    // about the application, which is what that menu already holds. `ctx.openShortcuts` stays: the
    // sheet, its state and the `?` binding did not move, only the entry point. Deleted rather than
    // hidden behind `isVisible: () => false`, which would still be resolved, still be partitioned,
    // and still have to be reasoned about by the next reader.
  ]);
}
