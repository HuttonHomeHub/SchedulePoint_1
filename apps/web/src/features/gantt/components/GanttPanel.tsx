import type { ActivitySummary, BaselineVarianceRow, DependencySummary } from '@repo/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { barLabelMode, constraintBadge } from '../layout/bar-annotations';
import {
  barGeometry,
  baselineGeometry,
  chartAnchor,
  chartWidth,
  spanGeometry,
} from '../layout/bar-geometry';
import { dateAtChartX, durationDaysForFinishAtX, startDayAtChartX } from '../layout/drag-day';
import { GANTT_COLUMNS, varianceText, type GanttColumn } from '../layout/grid-columns';
import {
  ganttLinkPaths,
  predecessorNamesBySuccessor,
  predecessorSummary,
} from '../layout/link-paths';
import {
  DEFAULT_GANTT_SORT,
  buildRows,
  rowDisclosure,
  rowId,
  rowsDateSpan,
  type GanttActivityRow,
  type GanttBucketRow,
  type GanttRow,
  type GanttSort,
  type GanttSortKey,
} from '../layout/row-model';
import {
  NUDGE_DAYS,
  barMoveGate,
  moveAnnouncement,
  resizeAnnouncement,
  type GanttBarDrag,
} from '../model/bar-drag';
import { GANTT_EDITABLE_COLUMNS, isCellOpen, type GanttGridEditing } from '../model/cell-edit';
import { DEFAULT_HIDDEN_COLUMNS, type GanttColumnKey } from '../model/gantt-view-state';
import { useBarPointerDrag } from '../model/use-bar-pointer-drag';
import type { GanttViewStateBundle } from '../model/use-gantt-view-state';

import { GanttCell } from './GanttCell';
import { GanttLinkOverlay } from './GanttLinkOverlay';
import { GanttRowMenu } from './GanttRowMenu';
import { GanttRuler, RULER_HEIGHT } from './GanttRuler';

import { WBS_IMPROVEMENTS_ENABLED } from '@/config/env';
import { OFF_FLOAT_PATH_LABEL } from '@/features/float-paths';
import type { SelectionBarContext } from '@/features/plan-actions/selection-actions';
import type { ZoomLevel } from '@/features/tsld/render/render-model';
import { pxPerDayForPreset } from '@/features/tsld/render/time-scale';
import { addCalendarDays, daysBetween } from '@/features/tsld/render/working-time';
import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';
import { cn } from '@/lib/utils';

/** Row height in pixels. Fixed, so the virtualizer needs no measurement pass. */
export const GANTT_ROW_HEIGHT = 32;

/**
 * The scale used before the bar region has been measured, and whenever measurement is
 * unavailable. Not a design constant — the real scale is derived from the container width via
 * ADR-0056's {@link pxPerDayForPreset}, per ADR-0059 §2 ("the time axis is shared, not
 * reimplemented"). A second date-to-pixel scale is how two views drift about where a Monday is.
 */
const FALLBACK_PX_PER_DAY = 6;

/** Frames roughly a year — the range a stakeholder reading a programme usually wants first. */
const DEFAULT_ZOOM: ZoomLevel = 'month';

/**
 * The anchor used when nothing is scheduled yet.
 *
 * Never visible: with no dates every `barGeometry` call returns null, so no bar is positioned
 * against it. It exists so the grid can render on an uncalculated plan without the chart having to
 * invent a date and present it as fact — a fixed constant rather than `today`, so two renders a day
 * apart produce identical output and nothing in a test depends on the clock.
 */
const UNSCHEDULED_ANCHOR = '1970-01-01';

/** On-screen column widths, keyed to the shared {@link GANTT_COLUMNS} semantics. */
const SCREEN_COLUMN_WIDTHS: Record<string, number> = {
  code: 80,
  name: 180,
  // Wide enough for the longest realistic sub-day read-out (`12d 7h 45m`) without wrapping; the
  // whole-day case (`5 d`) is far shorter, and a column sized for the common case would truncate
  // exactly the values ADR-0070 exists to make visible.
  duration: 84,
  earlyStart: 90,
  earlyFinish: 90,
  totalFloat: 60,
};

const columnWidth = (column: GanttColumn): number => SCREEN_COLUMN_WIDTHS[column.key] ?? 90;

/**
 * The hidden set a panel with no `viewState` uses — `predecessors` only, i.e. exactly the six
 * columns that shipped in ADR-0059. A module constant so it is one allocation rather than a new
 * Set per render, which would re-identify the `COLUMNS` memo on every pass.
 */
const DEFAULT_HIDDEN_SET: ReadonlySet<GanttColumnKey> = new Set(DEFAULT_HIDDEN_COLUMNS);

/**
 * The pinned identity/date grid's width is **derived from the columns it draws, never declared** —
 * now per render, because M5-T1 lets a planner switch columns off.
 *
 * It was once the literal `420` while the columns summed to 500, and the two were never reconciled
 * because the computed constant was exported and consumed by **nothing** — two answers to "how wide
 * is the grid", one of them dead. Measured in Chromium at 1646 on 2026-08-17: the pinned block
 * ended at x=709 while the **Float** column rendered at 729–789, so it sat 80 px **on top of the
 * chart**, the pinned block's `z-10` painting it over the bars. Every child is `shrink-0`, so the
 * flex row simply overflowed its own box.
 *
 * Nobody had reported it, and it is easy to see why: Float is the last column, the overlap lands on
 * whitespace unless a bar starts near the left edge, and the numbers involved look deliberate. It
 * was found by measuring before adding a column rather than after. Hiding a column now makes the
 * width move on every choice, which is precisely why it must stay a derivation.
 */

/** Width of the variance column, shown only when a baseline is active. */
const VARIANCE_COLUMN_WIDTH = 72;

/**
 * How a row not on the selected float path recedes (audit F4).
 *
 * A **token**, not an opacity number. The canvas dims a painted bar to `DIMMED_ALPHA = 0.3`, and
 * copying that figure onto DOM text would drop a row's contrast below 4.5:1 — the row's dates and
 * name are still content, not decoration. `text-muted-foreground` is a value already validated
 * against every surface (ADR-0055), so the row reads as receded and stays readable. The meaning
 * itself is carried by {@link OFF_FLOAT_PATH_LABEL} in words, never by this.
 */
const OFF_FLOAT_PATH_ROW_CLASS = 'text-muted-foreground';

export interface GanttPanelProps {
  activities: readonly ActivitySummary[];
  /**
   * Active-baseline variance rows, keyed by activity id (ADR-0025). When present the chart draws a
   * ghost bar beneath each live bar and the grid gains a variance column — the comparison ADR-0025
   * deferred "until a Gantt exists".
   *
   * Absent (no baseline captured, or the flag/lens is off) ⇒ no ghost, no column, and the chart is
   * byte-for-byte what it was. Reuses the variance rows the activities table already fetches — this
   * adds no query.
   */
  varianceByActivityId?: ReadonlyMap<string, BaselineVarianceRow> | undefined;
  /**
   * The shared zoom preset (ADR-0056). Passed from the workspace so ONE control drives both
   * projections — a Gantt with its own private zoom would disagree with the diagram about how
   * much schedule a screen holds.
   */
  zoomLevel?: ZoomLevel;
  /**
   * Which persisted dates draw each bar (ADR-0033) — the same value, from the same resolver, that
   * the canvas receives. Absent ⇒ `early`, which is what this panel did unconditionally until
   * 2026-08-17 and is still correct for every EARLY-mode plan (`docs/TECH_DEBT.md` #135).
   */
  barDateSource?: BarDateSource;
  /**
   * The activity's own working-hours factor (ADR-0068), for the Duration column.
   *
   * A **resolver from the host**, not a calendar list: this panel has never known what a calendar
   * is, and giving it one to run `.find()` per row would make a display component a consumer of the
   * calendar query. ADR-0089 D2b makes host-resolution the rule for a cross-scope fact, and
   * `host-parity.structural.test.ts` is what stops one host supplying it and the other not — which
   * is how the Gantt came to read `earlyStart` unconditionally in the first place.
   *
   * Absent, or returning undefined, ⇒ the read-out degrades to whole working days, which is the
   * same path as `VITE_SUB_DAY_DURATIONS` off (ADR-0070).
   */
  hoursPerDayFor?: (activity: ActivitySummary) => number | undefined;
  /**
   * In-grid editing (M2). **Absent ⇒ the read-only grid renders byte-for-byte**, which is what
   * keeps every pre-existing test of this panel meaningful through the change rather than merely
   * passing, and what lets the print surface share `GANTT_COLUMNS` without ever growing an editing
   * path.
   */
  editing?: GanttGridEditing | undefined;
  /**
   * Bar movement (M3). Absent ⇒ no gesture and no keyboard binding, which is the read-only chart
   * exactly as it was — the same parity contract `editing` carries.
   */
  drag?: GanttBarDrag | undefined;
  /**
   * The plan's dependencies, for the logic overlay (M4). Absent ⇒ no arrows and no textual
   * equivalent — the read-only chart exactly as it was, the same parity contract the other two
   * bundles carry.
   */
  dependencies?: readonly DependencySummary[] | undefined;
  /**
   * Build the row menu's context for one activity, or null when there is nothing to offer.
   *
   * A **function from the host**, not a prebuilt context: the menu is per row and the context
   * carries that row's callbacks, so a single object would either be wrong for every row but one or
   * force the panel to assemble one — which is the assembly `buildSelectionBarContext` exists to
   * keep in a single place (it is the same builder the dock uses, by construction).
   */
  rowMenuContextFor?: (activity: ActivitySummary) => SelectionBarContext | null;
  /**
   * Draw EVERY link in the window, not only the selected row's. Default off (the product owner's
   * Q1 answer): logic on a dense programme is a thicket, and the selection path answers "why is
   * this bar here?" without it.
   */
  showAllLinks?: boolean;
  /**
   * Sort, hidden columns and the collapse set, made to stick in the URL (M5-T6).
   *
   * Absent, the panel keeps its own state and is byte-for-byte the chart that shipped in M5 — which
   * is what the print surface and every suite mounting this component outside a router rely on.
   */
  viewState?: GanttViewStateBundle | undefined;
  /** True while the first page is loading. */
  loading?: boolean;
  /** Set when the activities query failed; renders the error state with a retry. */
  error?: { message: string; retry: () => void } | undefined;
  /** Called when a row is chosen, so selection stays shared with the TSLD. */
  onSelectActivity?: (activity: ActivitySummary) => void;
  selectedActivityId?: string | undefined;
  /**
   * The activities on the selected **float path** (audit F4). Rows not in the set are visually
   * de-emphasised and carry a text marker; rows in it are unchanged.
   *
   * The set is the SAME one the canvas receives, derived once by the plan workspace — so the two
   * views cannot disagree about which activities are on the path (the ADR-0063 `wbs-band-source`
   * rule), and that identity is a test rather than a convention.
   *
   * De-emphasis is **visual only**. Never `visibility: hidden`, never the native `disabled`
   * attribute: a de-emphasised row keeps its tab stop, its `aria-rowindex` and its activation (the
   * ADR-0063 M6 / ADR-0060 M6 findings). Absent or empty ⇒ every row is unchanged.
   */
  emphasisIds?: ReadonlySet<string> | undefined;
  /**
   * Scroll this activity's row into view **without moving focus** (audit F4 — the panel's chain
   * rows). Focus stays where the planner put it; yanking it out of the panel mid-chain is the
   * defect this deliberately avoids.
   *
   * Resolved to an index HERE rather than by the caller, because `sort` and `collapsed` are this
   * component's own state and the caller cannot know the row order. A target inside a collapsed
   * summary is expanded to first — silently doing nothing is the lit-but-inert shape.
   */
  bringIntoViewActivityId?: string | undefined;
}

/**
 * The Gantt view (ADR-0059): a pinned identity/date grid beside a time-scaled bar chart, rows and
 * bars in lockstep.
 *
 * **The lockstep is structural, not synchronised.** Grid and bars live in ONE scroll container;
 * the grid column is `position: sticky; left: 0` and the ruler `top: 0`. There is no scroll
 * listener, no second scroller and no rAF loop keeping two panes aligned — which is exactly the
 * class of defect (visible desync on momentum scroll) that a two-scroller design invites and that
 * no test catches reliably.
 *
 * Rows are virtualized (`@tanstack/react-virtual`, the ADR-0059 rationale and the pattern the
 * Project Explorer already uses), so the live node count is bounded by the viewport whether the
 * plan holds 200 activities or 20,000.
 *
 * Read-only by design for this milestone (spec Q1) — there is no mutation, no pen interaction and
 * no path into the CPM engine anywhere in this subtree.
 */
export function GanttPanel({
  activities,
  varianceByActivityId,
  zoomLevel = DEFAULT_ZOOM,
  barDateSource,
  hoursPerDayFor,
  editing,
  drag,
  dependencies,
  rowMenuContextFor,
  showAllLinks = false,
  loading = false,
  error,
  onSelectActivity,
  selectedActivityId,
  emphasisIds,
  bringIntoViewActivityId,
  viewState,
}: GanttPanelProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef(false);

  // Sort and the collapse set are the panel's own state UNLESS a host supplies `viewState` — the
  // bundle idiom this epic already uses for `editing`, `drag` and `dependencies`. Absent, the panel
  // behaves byte-for-byte as it did before M5-T6, which is what keeps the print surface and every
  // suite that mounts this component outside a router untouched (`useUrlFilterState`'s own docblock
  // names props as the answer for exactly that case).
  const [ownSort, setOwnSort] = useState<GanttSort>(DEFAULT_GANTT_SORT);
  const [ownCollapsed, setOwnCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const sort = viewState?.sort ?? ownSort;
  const collapsed = viewState?.collapsed ?? ownCollapsed;
  const setSort = viewState?.onSortChange ?? setOwnSort;
  const setCollapsed = viewState?.onCollapsedChange ?? setOwnCollapsed;

  /**
   * The columns this render draws, and their total width.
   *
   * Without a bundle the hidden set is the DEFAULT one, which hides `predecessors` and nothing
   * else — i.e. exactly the six columns that shipped in ADR-0059. That is the parity contract, and
   * it is a derivation rather than a branch: there is no "columns feature off" path to keep in step.
   */
  const hiddenColumns = viewState?.hiddenColumns ?? DEFAULT_HIDDEN_SET;
  const COLUMNS = useMemo(
    () => GANTT_COLUMNS.filter((c) => !hiddenColumns.has(c.key)),
    [hiddenColumns],
  );
  const GRID_WIDTH = useMemo(() => COLUMNS.reduce((sum, c) => sum + columnWidth(c), 0), [COLUMNS]);
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);

  // The bar region's own width, measured so the zoom preset can frame its target range in the
  // space actually available (`pxPerDayForPreset` is width-dependent by design — ADR-0056).
  const [barRegionWidth, setBarRegionWidth] = useState(0);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => setBarRegionWidth(Math.max(0, element.clientWidth - GRID_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // `GRID_WIDTH` is now a per-render value (M5-T1 made the columns hideable), so it belongs in
    // the deps: hiding a column changes how much room the bars have, and an effect that only ever
    // measured on mount would leave `barRegionWidth` — and therefore the zoom preset's px-per-day —
    // describing a grid that is no longer there, until the next window resize happened to fix it.
  }, [GRID_WIDTH]);

  const showVariance = varianceByActivityId !== undefined && varianceByActivityId.size > 0;
  const gridWidth = GRID_WIDTH + (showVariance ? VARIANCE_COLUMN_WIDTH : 0);
  // The row menu occupies a COLUMN, and every index after it shifts. `role="row"` may contain only
  // cells (`gridcell`/`columnheader`/`rowheader`), so M5-T3's trigger sitting as a direct child of
  // the row was an `aria-required-children` violation — axe rates it critical, and it fired once
  // per rendered row. Derived at panel level rather than per row so the header, the activity rows
  // and the WBS bucket rows cannot disagree about where the Timeline column starts.
  const actionColumns = rowMenuContextFor === undefined ? 0 : 1;

  const pxPerDay =
    barRegionWidth > 0 ? pxPerDayForPreset(zoomLevel, barRegionWidth) : FALLBACK_PX_PER_DAY;

  const rows = useMemo(
    // The derived Unassigned bucket (WBS improvements M3). `buildRows` additionally requires at
    // least one real summary before it emits the bucket — heading a flat plan "Unassigned" would
    // invent a hierarchy it does not have.
    () =>
      buildRows(activities, sort, collapsed, {
        unassignedBucket: WBS_IMPROVEMENTS_ENABLED,
        // The bucket's span follows the drawn dates. `buildRows` had accepted this option since the
        // WBS band shipped and this caller never passed it, so the one row summarising the plan's
        // unfiled work was framed on the early dates in a VISUAL plan while its members' bars sat
        // elsewhere — plumbing that existed and was not connected.
        barDateSource,
      }),
    [activities, sort, collapsed, barDateSource],
  );
  const span = useMemo(() => rowsDateSpan(rows, barDateSource), [rows, barDateSource]);

  /**
   * The arrows for the rows currently mounted.
   *
   * Keyed by the RENDERED rows rather than by a scroll range, so "is this endpoint on screen?" and
   * "where is it?" come from one lookup — a range comparison could disagree with what the
   * virtualizer actually mounted, and the disagreement would show as an arrow pointing at nothing.
   */
  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, index) => {
      if (r.kind === 'activity') map.set(r.activity.id, index);
    });
    return map;
  }, [rows]);
  // Built once per dependency set, not per row. See `predecessorNamesBySuccessor`.
  const predecessorsById = useMemo(
    () => predecessorNamesBySuccessor(dependencies ?? []),
    [dependencies],
  );
  const linkSet = useMemo(
    () =>
      ganttLinkPaths({
        dependencies: dependencies ?? [],
        rowIndexById,
        showAll: showAllLinks,
        selectedId: selectedActivityId,
      }),
    [dependencies, rowIndexById, showAllLinks, selectedActivityId],
  );
  const anchor = span === null ? null : chartAnchor(span);
  const chartPx = span === null ? 0 : chartWidth(span, pxPerDay);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GANTT_ROW_HEIGHT,
    overscan: 12,
    initialRect: { width: 960, height: 600 },
  });

  // Focus the row a keyboard move just landed on — never on a background refetch, which would
  // yank focus back into the grid while the user is elsewhere.
  useEffect(() => {
    if (pendingFocus.current && focusedId !== undefined) {
      rowRefs.current.get(focusedId)?.focus();
      pendingFocus.current = false;
    }
  }, [focusedId]);

  const focusRowAt = useCallback(
    (index: number): void => {
      const row = rows[index];
      if (!row) return;
      pendingFocus.current = true;
      setFocusedId(rowId(row));
      virtualizer.scrollToIndex(index, { align: 'auto' });
    },
    [rows, virtualizer],
  );

  // Bring a panel-chosen activity into view. Scroll ONLY — `focusRowAt` above also sets
  // `pendingFocus`, which would pull focus out of the Float paths panel the planner is reading.
  // `virtualizer.scrollToIndex` is the only correct call: `rowRefs` holds RENDERED rows, so
  // `element.scrollIntoView()` on a row outside the window is a silent no-op.
  const emphasisRowIndex = useMemo(
    () =>
      bringIntoViewActivityId === undefined
        ? -1
        : rows.findIndex((row) => rowId(row) === bringIntoViewActivityId),
    [rows, bringIntoViewActivityId],
  );
  // `activities` is read through a LIVE REF, not a dependency.
  //
  // react-query hands a fresh array reference after every recalculation (the same trap
  // `use-plan-workspace-model.ts` records costing a re-render of ~46 toolbar buttons). Listed as a
  // dep, this effect would re-run on every unrelated recalc and re-centre the grid — yanking the
  // planner's scroll position back to the emphasised row after they had deliberately scrolled
  // away, and rebuilding an O(n) map of the whole plan each time. `bringIntoViewActivityId` is not
  // a one-shot token: it is passed for as long as a path is selected, so "re-runs" means "every
  // time anything in the plan changes". Found by the performance gate.
  const activitiesRef = useRef(activities);
  // Synced in an EFFECT, never during render.
  //
  // It was `activitiesRef.current = activities` in the render body, which React forbids, and
  // `pnpm lint` did not catch it. `eslint-plugin-react-hooks` v7 carries the React Compiler's
  // analysis as lint rules — that is where `react-hooks/refs` comes from — but this component also
  // calls `useVirtualizer`, which the same analysis reports as an **incompatible library** and then
  // bails out of the WHOLE component for (the `Compilation Skipped` warning `pnpm lint` prints for
  // this file, every run). The M6 component gate reproduced that blind spot in an isolated
  // component rather than asserting it. So the rule that caught the identical pattern in
  // `use-gantt-grid-editing.ts` gave no protection here: the same defect, in the same diff, in the
  // one file the tool cannot see.
  //
  // Worth being precise, because the M6 performance gate over-read this in the other direction and
  // reported the compiler as "not running at all": `babel-plugin-react-compiler` is indeed **not**
  // wired into `vite.config.ts`, so nothing is auto-memoized in the shipped bundle — but the
  // analysis does run, in the linter, and it is what refused this write.
  // The idiom is `TsldPanel.tsx:813-816`'s — a deps-free effect.
  useEffect(() => {
    activitiesRef.current = activities;
  });
  useEffect(() => {
    if (bringIntoViewActivityId === undefined) return;
    if (emphasisRowIndex >= 0) {
      virtualizer.scrollToIndex(emphasisRowIndex, { align: 'center' });
      return;
    }
    // Not in `rows` — its WBS parent is collapsed. Expand every collapsed ancestor rather than
    // doing nothing; the next render resolves the index and this effect scrolls to it.
    const ancestors = new Set<string>();
    const byId = new Map(activitiesRef.current.map((a) => [a.id, a]));
    let cursor = byId.get(bringIntoViewActivityId)?.parentId ?? null;
    while (cursor !== null) {
      ancestors.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    if (ancestors.size === 0) return;
    // Value, not an updater: a host-supplied `onCollapsedChange` writes the URL and takes the next
    // set, so both paths have to agree on a plain call. The no-op guard is kept and matters more
    // here than it did — writing an unchanged set would push a navigation on every render.
    if ([...ancestors].every((id) => !collapsed.has(id))) return;
    const expanded = new Set(collapsed);
    for (const id of ancestors) expanded.delete(id);
    setCollapsed(expanded);
  }, [bringIntoViewActivityId, emphasisRowIndex, virtualizer, collapsed, setCollapsed]);

  const toggleCollapsed = useCallback(
    (id: string, collapse: boolean): void => {
      const next = new Set(collapsed);
      if (collapse) next.add(id);
      else next.delete(id);
      setCollapsed(next);
    },
    [collapsed, setCollapsed],
  );

  const onSort = useCallback(
    (key: GanttSortKey): void => {
      // Computed from the CURRENT sort rather than passed as an updater function: a host-supplied
      // `onSortChange` writes the URL and takes a value, not a reducer, so the two paths have to
      // agree on a plain call. The toggle rule is identical either way.
      const next: GanttSort =
        sort.key === key
          ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
          : { key, direction: 'asc' };
      setSort(next);
    },
    [sort, setSort],
  );

  const focusedIndex = rows.findIndex((r) => rowId(r) === focusedId);
  // The roving tab stop: the focused row, or the first row when nothing has been focused yet, so
  // one Tab always reaches the grid and arrow keys take over from there.
  const tabStopIndex = focusedIndex >= 0 ? focusedIndex : 0;

  /**
   * Move the focused activity's bar by `deltaDays`, or report why it cannot move.
   *
   * Returns whether the key was ours, so the caller only calls `preventDefault` when something
   * actually happened — a swallowed Alt+Arrow that did nothing would take the browser's own
   * behaviour away for no benefit.
   *
   * A refusal is **announced**, never silent. A nudge that does nothing and says nothing is
   * indistinguishable from a dead key, which is the lit-but-inert shape this register keeps
   * recording; and on a chart the bar that did not move may be off-screen anyway.
   */
  const nudgeBar = (row: GanttRow, deltaDays: number): boolean => {
    if (drag === undefined || row.kind !== 'activity') return false;
    const activity = row.activity;
    const gate = barMoveGate(activity, drag);
    if (!gate.movable) {
      if (gate.reason !== null) drag.announce(gate.reason);
      return true;
    }
    const { plannedStartIso } = drag;
    const start = barDatesFor(activity, barDateSource).start;
    if (plannedStartIso === null || start === null) {
      drag.announce('This activity has no scheduled start to move yet.');
      return true;
    }
    const startDay = daysBetween(plannedStartIso, start) + deltaDays;
    drag.moveTo(activity.id, startDay);
    drag.announce(moveAnnouncement(activity.name, addCalendarDays(start, deltaDays)));
    return true;
  };

  /**
   * Lengthen or shorten the focused activity by `deltaDays`, or say why it cannot change.
   *
   * The keyboard half of the finish-edge drag. Refuses below one day for the reason the pointer
   * path does: a zero-duration activity IS a milestone, and a keystroke must not be able to change
   * an activity's type.
   */
  const resizeBar = (row: GanttRow, deltaDays: number): boolean => {
    if (drag === undefined || row.kind !== 'activity') return false;
    const activity = row.activity;
    const gate = barMoveGate(activity, drag);
    if (!gate.movable) {
      if (gate.reason !== null) drag.announce(gate.reason);
      return true;
    }
    if (activity.type === 'START_MILESTONE' || activity.type === 'FINISH_MILESTONE') {
      drag.announce('A milestone marks a moment, so it has no duration.');
      return true;
    }
    const next = Math.max(1, activity.durationDays + deltaDays);
    if (next === activity.durationDays) {
      drag.announce(`${activity.name} is already one day long.`);
      return true;
    }
    drag.resizeTo(activity.id, next);
    drag.announce(resizeAnnouncement(activity.name, next));
    return true;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const index = tabStopIndex;
    const row = rows[index];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRowAt(Math.min(index + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRowAt(Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        focusRowAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusRowAt(rows.length - 1);
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        if (!row) break;
        // **Alt+←/→ nudges the bar; the bare keys stay disclosure.**
        //
        // The plan said bare arrows until the accessibility re-review, and they are already bound
        // to treegrid disclosure right here — so the original would have collided with a shipped
        // binding while citing a canvas precedent (`TsldPanel.tsx:1848`) that uses Alt for exactly
        // this. The keyboard equivalent exists at all because a pointer-only capability is a WCAG
        // 2.1.1 failure; matching the canvas verbatim means a planner learns one chord, not two.
        if (event.altKey) {
          if (nudgeBar(row, event.key === 'ArrowRight' ? NUDGE_DAYS : -NUDGE_DAYS)) {
            event.preventDefault();
          }
          break;
        }
        // **Shift+←/→ changes the duration** — ADR-0052's chord, matching the canvas.
        //
        // This was MISSING until the M6 ux gate, while a comment beside the pointer handle claimed
        // it existed and called that handle "an additional affordance rather than the only one".
        // It was the only one: resizing was pointer-only, a WCAG 2.1.1 gap, with the docblock
        // actively telling the next reader it was not. ADR-0076 Class 3 — a decision-bearing claim
        // asserted and never checked — inside an epic that had already fixed two of its own.
        if (event.shiftKey) {
          if (resizeBar(row, event.key === 'ArrowRight' ? NUDGE_DAYS : -NUDGE_DAYS)) {
            event.preventDefault();
          }
          break;
        }
        const disclosure = rowDisclosure(row);
        const wantExpanded = event.key === 'ArrowRight';
        if (disclosure !== null && disclosure.expanded !== wantExpanded) {
          event.preventDefault();
          toggleCollapsed(rowId(row), !wantExpanded);
        }
        break;
      }
      case 'F2': {
        // The APG grid convention for "start editing the focused thing", and the reason cells are
        // `tabIndex={-1}` rather than tab stops: a treegrid navigates by row and enters a cell on
        // demand, so a keyboard planner is not made to tab through six cells per row to reach the
        // seventh row.
        //
        // It opens the FIRST writable editable cell rather than a remembered column. A per-row
        // memory would be the better spreadsheet behaviour and needs a cell cursor to hang it on;
        // this milestone deliberately ships the entry point rather than the cursor, and says so
        // rather than leaving a reader to infer that F2 is arbitrary.
        if (!row || row.kind !== 'activity' || editing === undefined) break;
        const activity = row.activity;
        for (const column of COLUMNS) {
          const cellKey = GANTT_EDITABLE_COLUMNS[column.key];
          if (cellKey === undefined) continue;
          if (!editing.gateFor(cellKey, activity.id).writable) continue;
          event.preventDefault();
          editing.begin(
            { activityId: activity.id, key: cellKey },
            column.value(activity, barDateSource, hoursPerDayFor?.(activity)),
          );
          break;
        }
        break;
      }
      case 'Escape': {
        // Returns from cell mode to row mode. The cell's own handler already stops Escape reaching
        // here while a field is open (ADR-0079's rule — an Escape typed into a field belongs to that
        // field), so this only runs when the planner is on a row; it is the rung below.
        if (editing === undefined || editing.state.status === 'idle') break;
        event.preventDefault();
        editing.cancel();
        focusRowAt(index);
        break;
      }
      default:
        break;
    }
  };

  if (error) {
    return (
      <GanttMessage title="That schedule could not be loaded">
        <p className="text-muted-foreground text-sm">{error.message}</p>
        <button
          type="button"
          onClick={error.retry}
          className="border-input hover:bg-accent focus-visible:ring-ring mt-3 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          Try again
        </button>
      </GanttMessage>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4" aria-busy="true">
        <span className="sr-only">Loading the schedule…</span>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-muted h-6 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <GanttMessage title="No activities yet">
        <p className="text-muted-foreground text-sm">
          Add activities in the diagram and they will appear here as bars.
        </p>
      </GanttMessage>
    );
  }

  // Rows exist but nothing is scheduled: the plan has never been calculated. No CHART is drawn —
  // that would mean choosing an arbitrary anchor date and presenting it as fact — but the grid
  // renders, and that is a decision rather than an oversight (M2-T4).
  //
  // It used to return the message alone, which made every cell unreachable on precisely the plan a
  // planner is most likely to be typing into: a freshly created one, before the first
  // recalculation. The first draft of the fix made duration read-only there too; the ux re-review
  // corrected it and the correction is the better reasoning — a duration is an INPUT, not a rollup,
  // so it does not depend on a computed schedule the way a date does. `ganttCellGate` reads
  // `hasComputedSchedule` and shuts the two date cells with a reason that names the action
  // ("Recalculate the plan to set dates"); name and duration stay writable.
  //
  // The anchor falls back to the first row's absence rather than being invented: with no dates,
  // `barGeometry` returns null for every activity (`bar-geometry.ts:61`), so nothing is drawn at
  // any anchor and the value can never reach the screen. `chartPx` is already 0 here.
  const notCalculated = span === null || anchor === null;
  const safeAnchor = anchor ?? UNSCHEDULED_ANCHOR;

  const contentWidth = gridWidth + chartPx;

  return (
    <div
      ref={scrollRef}
      className="bg-background relative min-h-0 flex-1 overflow-auto"
      data-testid="gantt-scroll"
    >
      {/* The explanation stays even though the grid now renders (M2-T4). Dropping it was the first
          version of this change and it was wrong twice over: a reader met a chart column with no
          bars and nothing saying why, and a screen-reader user met it with no cue at all. The grid
          appearing is the fix for "the cells were unreachable"; it is not a reason to stop saying
          the plan has not been calculated. */}
      {/* **The cap says what it withheld.** A silent truncation reads as "that is all the links there
          are", and a reader draws a conclusion from an absence that is an artefact — the defect
          class ADR-0081 (a dark capability), ADR-0059 M6 (an inert control) and ADR-0090 ("no
          silent caps") each record separately. Either the count is visible or there is no cap.
          `role="status"` so it is not sight-only, since the arrows themselves are aria-hidden. */}
      {linkSet.withheld > 0 ? (
        <div
          role="status"
          className="border-border bg-muted text-muted-foreground border-b px-3 py-1 text-xs"
        >
          {linkSet.withheld} more {linkSet.withheld === 1 ? 'link is' : 'links are'} not shown.
        </div>
      ) : null}
      {notCalculated ? (
        <div role="status" className="border-border bg-muted border-b px-3 py-2">
          <p className="text-foreground text-sm font-medium">This plan has not been calculated</p>
          <p className="text-muted-foreground text-sm">
            {rows.length === 1 ? 'The activity has' : `All ${rows.length} activities have`} no
            scheduled dates yet. Recalculate the schedule to see the bar chart. You can still name
            activities and set their durations.
          </p>
        </div>
      ) : null}
      <div
        role="treegrid"
        aria-label="Schedule as a bar chart"
        aria-rowcount={rows.length + 1}
        aria-colcount={COLUMNS.length + actionColumns + (showVariance ? 2 : 1)}
        // Rows carry the roving tab stop, so the grid itself is never tabbed to — but an
        // interactive role must still be focusable, so it stays a programmatic focus target.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ width: contentWidth }}
      >
        <div
          role="row"
          aria-rowindex={1}
          className="bg-background sticky top-0 z-20 flex"
          style={{ height: RULER_HEIGHT }}
        >
          <div
            className="bg-background border-border sticky left-0 z-10 flex shrink-0 items-end border-r border-b"
            style={{ width: gridWidth }}
          >
            {COLUMNS.map((column, i) => {
              const active = sort.key === column.key;
              const sortable = column.sortable !== false;
              return (
                <div
                  key={column.key}
                  role="columnheader"
                  aria-colindex={i + 1}
                  // `aria-sort` only where sorting is offered. On a column that cannot be sorted,
                  // `none` is not "no sort applied" — it announces a sortable column nobody has
                  // sorted yet, which is a promise the header does not keep.
                  {...(sortable
                    ? {
                        'aria-sort': active
                          ? sort.direction === 'asc'
                            ? ('ascending' as const)
                            : ('descending' as const)
                          : ('none' as const),
                      }
                    : {})}
                  className="shrink-0 px-2 pb-1"
                  style={{ width: columnWidth(column) }}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.key as GanttSortKey)}
                      className={cn(
                        'focus-visible:ring-ring w-full rounded-sm text-xs font-medium focus-visible:ring-2 focus-visible:outline-none',
                        column.align === 'right' ? 'text-right' : 'text-left',
                        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {column.label}
                      {active ? (
                        <span aria-hidden="true">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                      ) : null}
                    </button>
                  ) : (
                    // Plain text, NOT a shaded button: there is nothing here a planner could do if
                    // only they had permission, so a disabled control would be ADR-0082's "omit"
                    // case dressed as its "shade with a reason" case.
                    <span
                      className={cn(
                        'text-muted-foreground block w-full text-xs font-medium',
                        column.align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      {column.label}
                    </span>
                  )}
                </div>
              );
            })}
            {actionColumns === 0 ? null : (
              // `sr-only`, so it names the column for assistive technology without taking layout —
              // the trigger sits in the slack at the end of the pinned block and has no visible
              // heading of its own.
              <div role="columnheader" aria-colindex={COLUMNS.length + 1} className="sr-only">
                Actions
              </div>
            )}
            {showVariance ? (
              <div
                role="columnheader"
                aria-colindex={COLUMNS.length + actionColumns + 1}
                aria-sort="none"
                className="text-muted-foreground shrink-0 px-2 pb-1 text-right text-xs font-medium"
                style={{ width: VARIANCE_COLUMN_WIDTH }}
              >
                vs baseline
              </div>
            ) : null}
          </div>
          <div
            role="columnheader"
            aria-colindex={COLUMNS.length + actionColumns + (showVariance ? 2 : 1)}
            aria-sort="none"
            className="border-border shrink-0 border-b"
            style={{ width: chartPx }}
          >
            <span className="sr-only">Timeline</span>
            {/* No ruler on an uncalculated plan: a date scale over an empty chart would be the
                invented fact the fallback anchor exists to avoid showing. */}
            {notCalculated ? null : (
              <GanttRuler anchorIso={safeAnchor} widthPx={chartPx} pxPerDay={pxPerDay} />
            )}
          </div>
        </div>

        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {/* The logic overlay sits ABOVE the rows and takes no pointer events, so an arrow is
              never a hole in the drag surface — without that the resize handle under a passing
              link would silently stop responding on exactly the dense plans where both matter. */}
          <GanttLinkOverlay
            paths={linkSet.paths}
            withheld={linkSet.withheld}
            rowHeight={GANTT_ROW_HEIGHT}
            height={virtualizer.getTotalSize()}
            width={contentWidth}
            chartLeft={gridWidth}
            barBoundsForRow={(index) => {
              const target = rows[index];
              if (target === undefined || target.kind !== 'activity') return null;
              const g = barGeometry(target.activity, safeAnchor, pxPerDay, barDateSource);
              return g === null ? null : { x: g.x, width: g.width };
            }}
          />
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const id = rowId(row);
            const shared = {
              rowIndex: item.index,
              top: item.start,
              anchorIso: safeAnchor,
              chartPx,
              pxPerDay,
              barDateSource,
              hoursPerDayFor,
              editing,
              drag,
              dependencies,
              predecessorsById,
              rowMenuContextFor,
              actionColumns,
              columns: COLUMNS,
              gridWidth,
              showVariance,
              isTabStop: item.index === tabStopIndex,
              registerRef: (element: HTMLDivElement | null) => {
                if (element) rowRefs.current.set(id, element);
                else rowRefs.current.delete(id);
              },
              onFocusRow: () => setFocusedId(id),
              onToggle: toggleCollapsed,
              // Only when a path is actually selected: an absent/empty set leaves every row's
              // classes and cells exactly as they are, which is the parity contract.
              offFloatPath:
                emphasisIds !== undefined && emphasisIds.size > 0 && !emphasisIds.has(id),
            };
            return row.kind === 'bucket' ? (
              <GanttBucketRowView key={id} row={row} {...shared} />
            ) : (
              <GanttRowView
                key={id}
                row={row}
                variance={varianceByActivityId?.get(id)}
                isSelected={id === selectedActivityId}
                onSelect={onSelectActivity}
                {...shared}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The derived **Unassigned** row (WBS improvements M3). Deliberately a different component from
 * {@link GanttRowView} rather than a branch inside it: the bucket has no activity, so it has no
 * selection, no variance, no progress fill and nothing to open — and a component that took an
 * optional activity would let each of those quietly do nothing while looking wired up.
 *
 * It IS a row of the grid (focusable, counted in `aria-rowindex`, expandable), because a grouping
 * the keyboard cannot reach is a grouping half the users cannot collapse.
 */
function GanttBucketRowView({
  actionColumns,
  columns: COLUMNS,
  row,
  rowIndex,
  top,
  anchorIso,
  chartPx,
  pxPerDay,
  gridWidth,
  showVariance,
  isTabStop,
  registerRef,
  onFocusRow,
  onToggle,
  offFloatPath = false,
}: {
  row: GanttBucketRow;
  rowIndex: number;
  top: number;
  anchorIso: string;
  chartPx: number;
  pxPerDay: number;
  gridWidth: number;
  showVariance: boolean;
  actionColumns: number;
  /** The columns THIS render draws — hideable since M5-T1, so never a module constant. */
  columns: readonly GanttColumn[];
  isTabStop: boolean;
  registerRef: (element: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  /**
   * True when a float path is selected and this row is not on it (audit F4). A derived bucket never
   * is — it is a grouping, not an activity — so this fades with the rest rather than staying bright
   * and reading as though the bucket were part of the chain.
   */
  offFloatPath?: boolean;
  onToggle: (id: string, collapse: boolean) => void;
}): React.ReactElement {
  const bracket = spanGeometry(row, anchorIso, pxPerDay);
  // The count is part of the accessible name, not a decoration beside it: "Unassigned" alone does
  // not say whether the row is worth expanding.
  const label = `${row.label}, ${String(row.count)} ${row.count === 1 ? 'activity' : 'activities'}`;

  return (
    <div
      ref={registerRef}
      role="row"
      aria-rowindex={rowIndex + 2}
      aria-level={1}
      aria-expanded={row.expanded}
      tabIndex={isTabStop ? 0 : -1}
      onFocus={onFocusRow}
      onClick={() => onToggle(row.id, row.expanded)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle(row.id, row.expanded);
        }
      }}
      className={cn(
        'absolute left-0 flex items-center outline-none',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset',
        'hover:bg-muted/50',
        offFloatPath && OFF_FLOAT_PATH_ROW_CLASS,
      )}
      style={{ top, height: GANTT_ROW_HEIGHT, width: gridWidth + chartPx }}
    >
      <div
        className="border-border bg-background sticky left-0 z-10 flex h-full shrink-0 items-center border-r"
        style={{ width: gridWidth }}
      >
        <div
          role="gridcell"
          aria-colindex={1}
          className="text-muted-foreground shrink-0 truncate px-2 text-xs"
          style={{ width: columnWidth(COLUMNS[0]!), paddingLeft: 8 }}
        >
          <span aria-hidden="true" className="text-muted-foreground mr-1 inline-flex align-middle">
            {row.expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </span>
        </div>
        <div
          role="gridcell"
          aria-colindex={2}
          className="text-muted-foreground shrink-0 truncate px-2 text-xs italic"
          style={{ width: gridWidth - columnWidth(COLUMNS[0]!) }}
        >
          {label}
          {/* The bucket fades with everything else off the path, so it needs the same marker the
              activity rows carry. Without it a screen-reader user gets no sign that this row
              receded while every sighted user watches it dim (WCAG 1.4.1) — the a11y gate's
              finding, and exactly the half of a pattern that gets applied to one control and not
              its neighbour. */}
          {offFloatPath ? <span className="sr-only"> ({OFF_FLOAT_PATH_LABEL})</span> : null}
        </div>
      </div>

      <div
        role="gridcell"
        aria-colindex={COLUMNS.length + actionColumns + (showVariance ? 2 : 1)}
        className="relative h-full shrink-0"
        style={{ width: chartPx }}
      >
        {bracket === null ? null : (
          // A bracket, not a filled bar: the bucket is not a scheduled thing, it is the extent of
          // things that are. Drawing it as a bar would put a fourth kind of bar on the chart and
          // read as work nobody planned.
          <span
            aria-hidden="true"
            className="border-muted-foreground/60 absolute top-1/2 h-2 -translate-y-1/2 rounded-sm border border-b-0"
            style={{ left: bracket.x, width: bracket.width }}
          />
        )}
      </div>
    </div>
  );
}

function GanttMessage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

interface GanttRowViewProps {
  row: GanttActivityRow;
  rowIndex: number;
  top: number;
  anchorIso: string;
  chartPx: number;
  pxPerDay: number;
  barDateSource: BarDateSource | undefined;
  hoursPerDayFor: ((activity: ActivitySummary) => number | undefined) | undefined;
  editing: GanttGridEditing | undefined;
  drag: GanttBarDrag | undefined;
  dependencies: readonly DependencySummary[] | undefined;
  predecessorsById: ReadonlyMap<string, readonly string[]>;
  rowMenuContextFor: ((activity: ActivitySummary) => SelectionBarContext | null) | undefined;
  actionColumns: number;
  /** The columns THIS render draws — hideable since M5-T1, so never a module constant. */
  columns: readonly GanttColumn[];
  gridWidth: number;
  variance: BaselineVarianceRow | undefined;
  showVariance: boolean;
  isTabStop: boolean;
  isSelected: boolean;
  registerRef: (element: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  onSelect?: ((activity: ActivitySummary) => void) | undefined;
  onToggle: (id: string, collapse: boolean) => void;
  /** True when a float path is selected and this row is not on it (audit F4). */
  offFloatPath?: boolean;
}

function GanttRowView({
  actionColumns,
  columns: COLUMNS,
  row,
  rowIndex,
  top,
  anchorIso,
  chartPx,
  pxPerDay,
  barDateSource,
  hoursPerDayFor,
  editing,
  drag,
  dependencies,
  predecessorsById,
  rowMenuContextFor,
  gridWidth,
  variance,
  showVariance,
  isTabStop,
  isSelected,
  registerRef,
  onFocusRow,
  onSelect,
  onToggle,
  offFloatPath = false,
}: GanttRowViewProps): React.ReactElement {
  const { activity, depth, hasChildren, expanded } = row;
  const geometry = barGeometry(activity, anchorIso, pxPerDay, barDateSource);
  const linkSummary =
    dependencies === undefined ? null : predecessorSummary(activity.id, predecessorsById);
  // The SAME index the sentence above reads, handed to the Predecessors column (M5-T1) rather than
  // looked up a second way — one answer to "what does this follow?", which is the rule
  // `bar-dates.ts` and `routeOrthogonal` both exist to enforce.
  const predecessorNames = predecessorsById.get(activity.id);
  // A THUNK, not a built object. `buildSelectionBarContext` scans the whole plan, and this runs per
  // mounted row — measured at 40 calls per keystroke on a 2,000-activity plan (M6 performance gate).
  // The menu builds it when it opens, which removes the cost from the render path rather than
  // reducing it.
  const rowMenuContext = rowMenuContextFor ?? null;
  const badge = constraintBadge(activity);
  const labelMode =
    geometry === null || geometry.milestone
      ? 'none'
      : barLabelMode({
          chartPx,
          barRight: geometry.x + geometry.width,
          labelChars: activity.name.length + (badge === null ? 0 : 2),
        });

  // The pointer gesture. `movable` is the object's answer AND the reader's, resolved by the same
  // function the keyboard nudge uses, so a bar a planner cannot nudge is a bar they cannot drag —
  // two affordances for one capability must not disagree about whether it exists.
  const moveGate = drag === undefined ? null : barMoveGate(activity, drag);
  const barStartIso = barDatesFor(activity, barDateSource).start;
  const commitDrag = useCallback(
    (deltaX: number) => {
      if (drag === null || drag === undefined) return;
      const { plannedStartIso } = drag;
      if (plannedStartIso === null || barStartIso === null || geometry === null) return;
      const startDay = startDayAtChartX({
        anchorIso,
        plannedStartIso,
        pxPerDay,
        x: geometry.x + deltaX,
      });
      drag.moveTo(activity.id, startDay);
      drag.announce(
        moveAnnouncement(activity.name, dateAtChartX(anchorIso, pxPerDay, geometry.x + deltaX)),
      );
    },
    [drag, barStartIso, geometry, anchorIso, pxPerDay, activity.id, activity.name],
  );
  const barDrag = useBarPointerDrag({
    enabled: moveGate?.movable === true && geometry !== null,
    onCommit: commitDrag,
  });

  /**
   * The finish-edge resize (M3-T3).
   *
   * `onTsldResize` with `durationDays` alone — no `startDay` — which is ADR-0052 M3's finish-edge
   * semantic verbatim rather than a new one invented here. The start edge is deliberately NOT
   * offered on this surface yet: it carries a MODE-dependent meaning (EARLY writes SNET +
   * durationDays, VISUAL writes visualStart + durationDays), and shipping it without the mode
   * statement the canvas has beside it would leave a planner unable to tell which of two writes
   * their drag just made.
   */
  const commitResize = useCallback(
    (deltaX: number) => {
      if (drag === null || drag === undefined) return;
      if (geometry === null || barStartIso === null) return;
      const durationDays = durationDaysForFinishAtX({
        startIso: barStartIso,
        anchorIso,
        pxPerDay,
        // The bar's right edge is exclusive in pixels and inclusive in dates, so a day is taken off
        // before converting — without it every resize would read one day long.
        x: geometry.x + geometry.width + deltaX - pxPerDay,
      });
      if (durationDays === activity.durationDays) return;
      drag.resizeTo(activity.id, durationDays);
      drag.announce(resizeAnnouncement(activity.name, durationDays));
    },
    [
      drag,
      geometry,
      barStartIso,
      anchorIso,
      pxPerDay,
      activity.id,
      activity.name,
      activity.durationDays,
    ],
  );
  const barResize = useBarPointerDrag({
    enabled: moveGate?.movable === true && geometry !== null && !geometry.milestone,
    onCommit: commitResize,
  });
  const ghost =
    showVariance && variance !== undefined ? baselineGeometry(variance, anchorIso, pxPerDay) : null;

  return (
    <div
      ref={registerRef}
      role="row"
      // The row's subject, in the DOM. Added for the M0-T1 density harness, which needs the ORDER
      // the grid is currently presenting — that changes with the sort, which is shipped
      // (`:278-284`), and cannot be recovered from the API without duplicating the row model's own
      // ordering. Not harness-only scaffolding: M1's journey locators need a stable handle on a row
      // too, and `[data-toolbar-item]` is the precedent — ADR-0091 records three journeys breaking
      // because they located controls by their copy instead.
      data-activity-id={activity.id}
      // Header occupies row 1, so data rows are 1-based from 2 — and the index is the row's
      // position in the FULL set, not the rendered window, which is what makes virtualization
      // invisible to assistive technology.
      aria-rowindex={rowIndex + 2}
      aria-level={depth + 1}
      {...(hasChildren ? { 'aria-expanded': expanded === true } : {})}
      {...(isSelected ? { 'aria-selected': true } : {})}
      tabIndex={isTabStop ? 0 : -1}
      onFocus={onFocusRow}
      onClick={() => onSelect?.(activity)}
      // Activation lives on the row rather than the grid's key handler: the row knows which
      // activity it is, and a click-only row would be unreachable by keyboard.
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(activity);
        }
      }}
      className={cn(
        'absolute left-0 flex items-center outline-none',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset',
        isSelected ? 'bg-accent' : 'hover:bg-muted/50',
        // De-emphasis only — the row keeps its tab stop, its `aria-rowindex` and its activation.
        // `visibility: hidden` or a native `disabled` would take it out of the tab order, which is
        // the ADR-0063 M6 defect exactly. The word in the first cell is what carries the meaning
        // for anyone who cannot see the fade (WCAG 1.4.1); opacity alone would not.
        offFloatPath && OFF_FLOAT_PATH_ROW_CLASS,
      )}
      style={{ top, height: GANTT_ROW_HEIGHT, width: gridWidth + chartPx }}
    >
      <div
        className={cn(
          'border-border sticky left-0 z-10 flex h-full shrink-0 items-center border-r',
          isSelected ? 'bg-accent' : 'bg-background',
        )}
        style={{ width: gridWidth }}
      >
        {COLUMNS.map((column, i) => {
          const text = column.value(
            activity,
            barDateSource,
            hoursPerDayFor?.(activity),
            predecessorNames,
          );
          const cellKey = GANTT_EDITABLE_COLUMNS[column.key];
          // An editable cell only where BOTH are true: the host supplied an editing bundle, and this
          // column maps to one. Neither implies the other — the print surface has no bundle, and
          // `code`/`totalFloat` are engine output nobody types.
          const editable = editing !== undefined && cellKey !== undefined;

          if (editable) {
            const target = { activityId: activity.id, key: cellKey };
            const cellOpen = isCellOpen(editing.state, target);
            return (
              <GanttCell
                key={column.key}
                value={text}
                // The column AND the row, so edit mode announces what is being edited rather than
                // "edit text". `activity.name` for every column including the name one, where it is
                // the value being replaced and still the best identifier the row has.
                label={`${column.label}, ${activity.name}`}
                colIndex={i + 1}
                width={columnWidth(column)}
                align={column.align}
                gate={editing.gateFor(cellKey, activity.id)}
                editing={cellOpen}
                text={cellOpen && editing.state.status !== 'idle' ? editing.state.text : text}
                busy={cellOpen && editing.state.status === 'committing'}
                errorMessage={cellOpen ? editing.errorMessage : null}
                onBegin={() => editing.begin(target, text)}
                onChange={editing.change}
                onCommit={editing.commit}
                onCancel={editing.cancel}
                className={cn(column.align === 'right' ? 'text-right' : 'text-left')}
              >
                <span className={cn(activity.type === 'WBS_SUMMARY' && i === 1 && 'font-semibold')}>
                  {text}
                </span>
                {offFloatPath && i === 1 ? (
                  <span className="sr-only"> ({OFF_FLOAT_PATH_LABEL})</span>
                ) : null}
              </GanttCell>
            );
          }

          return (
            <div
              key={column.key}
              role="gridcell"
              aria-colindex={i + 1}
              className={cn(
                'shrink-0 truncate px-2 text-xs',
                column.align === 'right' ? 'text-right' : 'text-left',
              )}
              style={{
                width: columnWidth(column),
                // Indentation belongs to the first column only, so the date columns stay aligned
                // down the page however deep the hierarchy goes.
                ...(i === 0 ? { paddingLeft: 8 + depth * 14 } : {}),
              }}
            >
              {i === 0 && hasChildren ? (
                <button
                  type="button"
                  // The row already carries aria-expanded; this control is its visual affordance,
                  // so it is hidden from the accessibility tree rather than announcing a second,
                  // competing expanded state.
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(activity.id, expanded === true);
                  }}
                  className="text-muted-foreground hover:text-foreground mr-1 inline-flex align-middle"
                >
                  {expanded === true ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                </button>
              ) : null}
              <span className={cn(activity.type === 'WBS_SUMMARY' && i === 1 && 'font-semibold')}>
                {column.value(
                  activity,
                  barDateSource,
                  hoursPerDayFor?.(activity),
                  predecessorNames,
                )}
              </span>
              {/* The de-emphasis in WORDS, in the name cell — the fade above is emphasis alone, and
                emphasis alone is precisely the WCAG 1.4.1 defect ADR-0055 exists about. Rendered
                `sr-only` because the sighted cue is the fade and a visible tag on every off-path
                row would drown the on-path ones it exists to pick out. */}
              {offFloatPath && i === 1 ? (
                <span className="sr-only"> ({OFF_FLOAT_PATH_LABEL})</span>
              ) : null}
            </div>
          );
        })}
        {/* The arrows' textual equivalent (spec GV-3), rendered ONCE PER ROW rather than inside a
            cell. It went into the editable-cell branch first and the test caught it: with no
            editing bundle the row takes the PLAIN branch, so the sentence existed for some readers
            and not others — one branch and not its neighbour, the defect this register keeps
            recording, found here by a test rather than by a reader.
            Row level is also the honest place: "this follows that" is a fact about the ACTIVITY,
            not about any one column, and it holds whether or not anybody has turned the arrows on.
            The SVG is `aria-hidden` (an elbow is not readable), so without this the overlay would
            be the first graphical-only carrier on a surface whose own docblock forbids that. */}
        {linkSummary === null ? null : <span className="sr-only">{linkSummary}</span>}
        {/* The row menu (M5-T3) — the dock's own roster rendered as a menu, never a third copy of
            it. `selection-duplication.structural.test.ts` asserts this file's component names no
            action literally, closing the hole ADR-0094 recorded when it noted the gate compares two
            registries and cannot see a third. */}
        {rowMenuContext === null ? null : (
          // Wrapped in a CELL, never a bare child of the row: `role="row"` may contain only
          // `gridcell`/`columnheader`/`rowheader`, and a loose `button[aria-haspopup]` is an
          // `aria-required-children` violation axe rates CRITICAL — one per rendered row, which the
          // `e2e-gantt` journey's scan caught after this shipped. The sr-only link summary above is
          // untouched: it carries no role, so it is text content rather than an unallowed child.
          <div role="gridcell" aria-colindex={COLUMNS.length + 1} className="flex shrink-0">
            <GanttRowMenu context={() => rowMenuContext(activity)} activityName={activity.name} />
          </div>
        )}
        {showVariance ? (
          <div
            role="gridcell"
            aria-colindex={COLUMNS.length + actionColumns + 1}
            className={cn(
              'shrink-0 truncate px-2 text-right text-xs',
              // Direction is carried by the WORD, not the colour — "late"/"early" reads the same
              // to a colour-blind user and in a black-and-white print (WCAG 1.4.1).
              (variance?.startVarianceDays ?? 0) > 0 && 'text-destructive',
            )}
            style={{ width: VARIANCE_COLUMN_WIDTH }}
          >
            {varianceText(variance)}
          </div>
        ) : null}
      </div>

      <div
        role="gridcell"
        aria-colindex={COLUMNS.length + actionColumns + (showVariance ? 2 : 1)}
        className="relative h-full shrink-0"
        style={{ width: chartPx }}
      >
        {ghost === null ? null : (
          <span
            aria-hidden="true"
            className="border-muted-foreground/50 absolute bottom-0.5 h-1.5 rounded-sm border border-dashed"
            style={{ left: ghost.x, width: ghost.width }}
          />
        )}
        {geometry === null ? null : geometry.milestone ? (
          <span
            aria-hidden="true"
            className="bg-foreground absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45"
            style={{ left: geometry.x }}
          />
        ) : (
          <>
            {geometry.floatWidth > 0 ? (
              <span
                aria-hidden="true"
                className="border-muted-foreground/40 absolute top-1/2 h-2 -translate-y-1/2 rounded-r-sm border border-l-0 border-dashed"
                style={{ left: geometry.x + geometry.width, width: geometry.floatWidth }}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-1/2 h-3.5 -translate-y-1/2 overflow-hidden rounded-sm',
                // Criticality is carried by BOTH a fill and an outline: colour alone would fail
                // WCAG 1.4.1, and this is the exact defect class ADR-0055 was written about.
                activity.isCritical
                  ? 'bg-destructive/70 ring-destructive ring-2 ring-inset'
                  : activity.type === 'WBS_SUMMARY'
                    ? 'bg-foreground/70'
                    : 'bg-primary/60 ring-primary/70 ring-1 ring-inset',
              )}
              // The ghost is a TRANSFORM on the live bar, not a second element: one bar means the
              // planner is dragging the thing they grabbed, and it costs no extra node per row.
              style={{
                left: geometry.x,
                width: geometry.width,
                ...(barDrag.deltaX === null
                  ? {}
                  : { transform: `translateX(${String(barDrag.deltaX)}px)`, opacity: 0.75 }),
                ...(moveGate?.movable === true ? { cursor: 'grab', pointerEvents: 'auto' } : {}),
              }}
              onPointerDown={barDrag.onPointerDown}
            >
              {geometry.progress > 0 ? (
                <span
                  className="bg-foreground/45 absolute inset-y-0 left-0"
                  style={{ width: `${geometry.progress * 100}%` }}
                />
              ) : null}
            </span>
            {/* **The bar's own name, and its pinned mark** (M5 legibility, B10f). Both `aria-hidden`:
                the grid cells already carry the name and the editor carries the constraint, so
                these are reinforcement rather than a second carrier — and duplicating the name into
                the accessibility tree would make every row announce it twice. Withheld when there
                is no room rather than allowed to overlap (ADR-0054's Dates rule applied to text). */}
            {labelMode === 'name' ? (
              <span
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap"
                style={{ left: geometry.x + geometry.width + 6 }}
              >
                {badge === null ? null : (
                  <span className="text-warning-text mr-1" title={badge.label}>
                    {badge.glyph}
                  </span>
                )}
                {activity.name}
              </span>
            ) : badge === null ? null : (
              // No room for the name, but the badge still fits — a pinned bar must not lose its mark
              // just because the chart is dense, which is precisely when a planner is hunting for it.
              <span
                aria-hidden="true"
                className="text-warning-text pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px]"
                style={{ left: geometry.x + geometry.width + 4 }}
                title={badge.label}
              >
                {badge.glyph}
              </span>
            )}
            {/* The finish-edge handle. Rendered only when the bar can be resized, so it is never a
                lit-but-inert grab zone — and never on a milestone, which has no length to change.
                Eight pixels wide, straddling the edge, which is the smallest zone a pointer finds
                reliably without eating the neighbouring bar's grab area. Pointer-only by design:
                the keyboard equivalent is Shift+←/→ on the row (ADR-0052's chord), so this is an
                additional affordance rather than the only one. */}
            {moveGate?.movable === true ? (
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-3.5 w-2 -translate-y-1/2 cursor-ew-resize"
                style={{ left: geometry.x + geometry.width - 4 }}
                onPointerDown={barResize.onPointerDown}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export { FALLBACK_PX_PER_DAY };
