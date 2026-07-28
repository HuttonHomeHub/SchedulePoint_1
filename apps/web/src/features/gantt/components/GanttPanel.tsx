import type { ActivitySummary } from '@repo/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { barGeometry, chartAnchor, chartWidth } from '../layout/bar-geometry';
import {
  DEFAULT_GANTT_SORT,
  buildRows,
  rowsDateSpan,
  type GanttRow,
  type GanttSort,
  type GanttSortKey,
} from '../layout/row-model';

import { GanttRuler, RULER_HEIGHT } from './GanttRuler';

import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

/** Row height in pixels. Fixed, so the virtualizer needs no measurement pass. */
export const GANTT_ROW_HEIGHT = 32;

/** Width of the pinned identity/date grid. */
const GRID_WIDTH = 420;

/** Pixels per calendar day. A later milestone wires this to the ADR-0056 zoom presets. */
const DEFAULT_PX_PER_DAY = 6;

interface Column {
  key: GanttSortKey;
  label: string;
  width: number;
  align?: 'right';
  /** The cell's text for an activity — also the accessible content, never derived from the bar. */
  value: (activity: ActivitySummary) => string;
}

/**
 * Every visual encoding on the chart has a text equivalent here. A screen-reader user reads dates
 * and float from these cells; the bar is decorative reinforcement, not the only carrier (spec
 * GV-3). That is what makes a bar chart usable without sight of it.
 */
const COLUMNS: readonly Column[] = [
  { key: 'code', label: 'Code', width: 80, value: (a) => a.code ?? '—' },
  { key: 'name', label: 'Activity', width: 180, value: (a) => a.name },
  {
    key: 'earlyStart',
    label: 'Start',
    width: 90,
    value: (a) => (a.earlyStart === null ? '—' : formatCalendarDate(a.earlyStart)),
  },
  {
    key: 'earlyFinish',
    label: 'Finish',
    width: 90,
    value: (a) => (a.earlyFinish === null ? '—' : formatCalendarDate(a.earlyFinish)),
  },
  {
    key: 'totalFloat',
    label: 'Float',
    width: 60,
    align: 'right',
    value: (a) => (a.totalFloat === null ? '—' : `${a.totalFloat}d`),
  },
];

const TOTAL_COLUMN_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

export interface GanttPanelProps {
  activities: readonly ActivitySummary[];
  /** True while the first page is loading. */
  loading?: boolean;
  /** Set when the activities query failed; renders the error state with a retry. */
  error?: { message: string; retry: () => void } | undefined;
  /** Called when a row is chosen, so selection stays shared with the TSLD. */
  onSelectActivity?: (activity: ActivitySummary) => void;
  selectedActivityId?: string | undefined;
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
  loading = false,
  error,
  onSelectActivity,
  selectedActivityId,
}: GanttPanelProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef(false);

  const [sort, setSort] = useState<GanttSort>(DEFAULT_GANTT_SORT);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);

  const rows = useMemo(() => buildRows(activities, sort, collapsed), [activities, sort, collapsed]);
  const span = useMemo(() => rowsDateSpan(rows), [rows]);
  const anchor = span === null ? null : chartAnchor(span);
  const chartPx = span === null ? 0 : chartWidth(span, DEFAULT_PX_PER_DAY);

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
      setFocusedId(row.activity.id);
      virtualizer.scrollToIndex(index, { align: 'auto' });
    },
    [rows, virtualizer],
  );

  const toggleCollapsed = useCallback((id: string, collapse: boolean): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (collapse) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const onSort = useCallback((key: GanttSortKey): void => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }, []);

  const focusedIndex = rows.findIndex((r) => r.activity.id === focusedId);
  // The roving tab stop: the focused row, or the first row when nothing has been focused yet, so
  // one Tab always reaches the grid and arrow keys take over from there.
  const tabStopIndex = focusedIndex >= 0 ? focusedIndex : 0;

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
        if (row?.hasChildren === true && row.expanded === false) {
          event.preventDefault();
          toggleCollapsed(row.activity.id, false);
        }
        break;
      case 'ArrowLeft':
        if (row?.hasChildren === true && row.expanded === true) {
          event.preventDefault();
          toggleCollapsed(row.activity.id, true);
        }
        break;
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

  // Rows exist but nothing is scheduled: the plan has never been calculated. Drawing a chart would
  // mean choosing an arbitrary anchor date and presenting it as fact.
  if (span === null || anchor === null) {
    return (
      <GanttMessage title="This plan has not been calculated">
        <p className="text-muted-foreground text-sm">
          {rows.length === 1 ? 'The activity has' : `All ${rows.length} activities have`} no
          scheduled dates yet. Recalculate the schedule to see the bar chart.
        </p>
      </GanttMessage>
    );
  }

  const contentWidth = GRID_WIDTH + chartPx;

  return (
    <div
      ref={scrollRef}
      className="bg-background relative min-h-0 flex-1 overflow-auto"
      data-testid="gantt-scroll"
    >
      <div
        role="treegrid"
        aria-label="Schedule as a bar chart"
        aria-rowcount={rows.length + 1}
        aria-colcount={COLUMNS.length + 1}
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
            style={{ width: GRID_WIDTH }}
          >
            {COLUMNS.map((column, i) => {
              const active = sort.key === column.key;
              return (
                <div
                  key={column.key}
                  role="columnheader"
                  aria-colindex={i + 1}
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className="shrink-0 px-2 pb-1"
                  style={{ width: column.width }}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
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
                </div>
              );
            })}
          </div>
          <div
            role="columnheader"
            aria-colindex={COLUMNS.length + 1}
            aria-sort="none"
            className="border-border shrink-0 border-b"
            style={{ width: chartPx }}
          >
            <span className="sr-only">Timeline</span>
            <GanttRuler anchorIso={anchor} widthPx={chartPx} pxPerDay={DEFAULT_PX_PER_DAY} />
          </div>
        </div>

        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <GanttRowView
                key={row.activity.id}
                row={row}
                rowIndex={item.index}
                top={item.start}
                anchorIso={anchor}
                chartPx={chartPx}
                isTabStop={item.index === tabStopIndex}
                isSelected={row.activity.id === selectedActivityId}
                registerRef={(element) => {
                  if (element) rowRefs.current.set(row.activity.id, element);
                  else rowRefs.current.delete(row.activity.id);
                }}
                onFocusRow={() => setFocusedId(row.activity.id)}
                onSelect={onSelectActivity}
                onToggle={toggleCollapsed}
              />
            );
          })}
        </div>
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
  row: GanttRow;
  rowIndex: number;
  top: number;
  anchorIso: string;
  chartPx: number;
  isTabStop: boolean;
  isSelected: boolean;
  registerRef: (element: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  onSelect?: ((activity: ActivitySummary) => void) | undefined;
  onToggle: (id: string, collapse: boolean) => void;
}

function GanttRowView({
  row,
  rowIndex,
  top,
  anchorIso,
  chartPx,
  isTabStop,
  isSelected,
  registerRef,
  onFocusRow,
  onSelect,
  onToggle,
}: GanttRowViewProps): React.ReactElement {
  const { activity, depth, hasChildren, expanded } = row;
  const geometry = barGeometry(activity, anchorIso, DEFAULT_PX_PER_DAY);

  return (
    <div
      ref={registerRef}
      role="row"
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
      )}
      style={{ top, height: GANTT_ROW_HEIGHT, width: GRID_WIDTH + chartPx }}
    >
      <div
        className={cn(
          'border-border sticky left-0 z-10 flex h-full shrink-0 items-center border-r',
          isSelected ? 'bg-accent' : 'bg-background',
        )}
        style={{ width: GRID_WIDTH }}
      >
        {COLUMNS.map((column, i) => (
          <div
            key={column.key}
            role="gridcell"
            aria-colindex={i + 1}
            className={cn(
              'shrink-0 truncate px-2 text-xs',
              column.align === 'right' ? 'text-right' : 'text-left',
            )}
            style={{
              width: column.width,
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
              {column.value(activity)}
            </span>
          </div>
        ))}
      </div>

      <div
        role="gridcell"
        aria-colindex={COLUMNS.length + 1}
        className="relative h-full shrink-0"
        style={{ width: chartPx }}
      >
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
              style={{ left: geometry.x, width: geometry.width }}
            >
              {geometry.progress > 0 ? (
                <span
                  className="bg-foreground/45 absolute inset-y-0 left-0"
                  style={{ width: `${geometry.progress * 100}%` }}
                />
              ) : null}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export { GRID_WIDTH, TOTAL_COLUMN_WIDTH, COLUMNS as GANTT_COLUMNS, DEFAULT_PX_PER_DAY };
