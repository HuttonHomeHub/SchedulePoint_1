import {
  defaultRangeExtractor,
  measureElement as defaultMeasureElement,
  observeElementRect as defaultObserveElementRect,
  useVirtualizer,
  type VirtualItem,
} from '@tanstack/react-virtual';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Column } from './data-table';

import { cn } from '@/lib/utils';

/**
 * The windowed half of {@link import('./data-table').DataTable} (ADR-0165,
 * `docs/TECH_DEBT.md` #334 M3): the `<table>` element and its body, rendering only the rows in view.
 *
 * **Why this is its own component (ADR-0165 D5).** `useVirtualizer` returns functions the React
 * Compiler's lint analysis cannot prove safe, so the analysis skips the WHOLE component that calls
 * it (`GanttPanel.tsx`, `docs/TECH_DEBT.md` #353 D3). `DataTable` has 24 call sites in 18 files;
 * the hook must not sit in it. `DataTable` renders this child only in windowed mode, and
 * `data-table-windowed-body.structural.test.ts` pins that this file, and no shared primitive, is
 * where the hook is imported.
 *
 * **What it renders (D2, D3).** A native `<table>` — `<th scope="col">` association and the table's
 * own semantics survive — with a top and a bottom spacer `<tr aria-hidden="true">` whose heights
 * come from the virtualizer. `aria-rowcount` on the table is the row total plus the header, and each
 * rendered row carries `aria-rowindex` (the header is 1). **Reasoned from ARIA 1.2, not observed
 * with a screen reader** (ADR-0083/ADR-0122's label).
 *
 * **Column widths are measured once and frozen (D1).** Under `table-layout: auto` a longer value
 * scrolling into view would widen its column and shift every column while the planner reads. So the
 * first rendered window (header included) is laid out by the browser as usual, its column widths are
 * read, and from then on a `<colgroup>` under `table-layout: fixed` holds them. They are read again
 * only when the column set changes, the scroller's width changes, or the page's web fonts finish
 * loading (faces use `font-display: swap`, so the first read can be taken in the fallback font;
 * `document.fonts.ready` bumps the same epoch once, and an environment without `document.fonts`,
 * such as jsdom, simply skips it) — never on scroll, never on a data change. **The column-set key is
 * the scroller epoch plus the header texts only**: a column whose width or visibility changes while
 * its header text does not (a future column toggle, say) will NOT re-measure, so such a change must
 * change the key. A longer off-window value wraps inside its frozen width instead of widening it, which
 * is why the frozen table lets cells wrap (`whitespace-normal`): `fit` here means "the width the
 * first window needed", not "what every row needs" (this amends ADR-0146 for this table alone).
 *
 * **Focus is kept mounted (WCAG 2.4.3).** A scroll of more than the overscan would unmount the row
 * holding focus and drop focus to `<body>`. The row that contains focus is pinned into the rendered
 * indexes (`rangeExtractor`), so it stays until focus leaves; the rows between it and the window are
 * then a gap, which gets a spacer row of its own so the arithmetic stays exact. Focus moving out of
 * the table entirely (a portalled menu) keeps the pin until focus next lands in a row or goes to
 * nowhere, which costs one extra mounted row, never a lost focus.
 *
 * **Deliberate departures from the Gantt's use of the same hook.** Rows here have content-dependent
 * height, so each is measured (`measureElement`) rather than fixed; and a row measured as 0px —
 * jsdom, or a `display: none` ancestor — keeps its estimate instead of collapsing the window.
 */

/** Rows either side of the visible window that stay mounted, so the next Tab has somewhere to land. */
const OVERSCAN = 12;

/**
 * A data row's estimated height in px: `py-2` (16) + a line of `text-sm` (20) + the cell's 1px rule.
 * Only an estimate — every rendered row is measured — so a wrong value costs a slightly off
 * scrollbar thumb until the rows have been seen, never a misplaced row.
 */
const ESTIMATED_ROW_HEIGHT = 37;

/** The window a first render has before the scroller has been measured (as `GanttPanel`'s). */
const INITIAL_RECT = { width: 960, height: 600 } as const;

/**
 * A test-only floor on how many rows the first window holds (ADR-0165 D7).
 *
 * jsdom has no layout, so the virtualizer sees the scroller as `INITIAL_RECT` tall and renders the
 * rows that fit — about 60. A test whose fixture is longer than that and needs every row to exist
 * sets this (and puts it back in `afterEach`); nothing in production reads or writes it, which is
 * what keeps it from being the flag D7 forbids. Exported from this file rather than a prop so a
 * caller cannot reach it through `DataTable`'s public contract.
 */
let testRowBudget: number | null = null;

export function setWindowedRowBudgetForTests(rows: number | null): void {
  testRowBudget = rows;
}

/** Heights of the two spacer rows that stand in for the rows outside the window. */
export function spacerHeights(
  items: readonly Pick<VirtualItem, 'start' | 'end'>[],
  totalSize: number,
): { top: number; bottom: number } {
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return { top: 0, bottom: totalSize };
  return { top: first.start, bottom: Math.max(0, totalSize - last.end) };
}

/**
 * The rendered width of each VISIBLE header cell, in order, or `null` when the table has no layout
 * to read (jsdom, a `display: none` ancestor).
 *
 * A column hidden below a breakpoint (`hidden lg:table-cell`) generates no table column, so a
 * `<col>` for it would shift every later `<col>` onto the wrong column. Skipping `display: none`
 * cells keeps `<col>` N on column N.
 */
function measureColumnWidths(table: HTMLTableElement): number[] | null {
  const widths: number[] = [];
  for (const th of table.querySelectorAll('thead th')) {
    if (getComputedStyle(th).display === 'none') continue;
    widths.push(th.getBoundingClientRect().width);
  }
  return widths.some((w) => w > 0) ? widths : null;
}

interface FrozenWidths {
  /** The column set and scroller-width epoch these were measured for. */
  key: string;
  widths: number[];
}

export interface DataTableWindowedBodyProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  caption: string;
  /** The `<table>`'s classes, as the non-windowed table has them. */
  tableClassName: string;
  /** The `<thead>`, built by `DataTable` so both modes render the same header. */
  head: React.ReactNode;
  /**
   * Renders one body row. `virtualIndex` is the row's position in `rows`, and `measureRef` must be
   * attached to its `<tr>` so its real height is measured.
   */
  renderRow: (
    row: T,
    virtualIndex: number,
    measureRef: (node: HTMLTableRowElement | null) => void,
  ) => React.ReactElement;
}

export function DataTableWindowedBody<T>({
  rows,
  columns,
  getRowKey,
  caption,
  tableClassName,
  head,
  renderRow,
}: DataTableWindowedBodyProps<T>): React.ReactElement {
  const tableRef = useRef<HTMLTableElement>(null);
  // The key of the row that holds focus, so it is kept mounted however far the window scrolls.
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const pinnedIndex =
    pinnedKey === null ? -1 : rows.findIndex((row) => getRowKey(row) === pinnedKey);

  // `useVirtualizer` returns functions the compiler's analysis cannot prove are safe to memoize, so
  // it skips this WHOLE component's analysis — the reason the hook lives in this child and not in
  // `DataTable` (D5). Turning the rule off elsewhere would let a NEW incompatible call site pass
  // silently, so it is suppressed here at the one call, exactly as `GanttPanel` does, and
  // `reportUnusedDisableDirectives` flags the directive the day the hook stops needing it.
  // eslint-disable-next-line react-hooks/incompatible-library -- see above
  const virtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
    count: rows.length,
    // The scroller is the region `DataTable` puts this table in: its direct parent.
    getScrollElement: () => tableRef.current?.parentElement ?? null,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    // Keyed by row identity so a measured height follows its row when data is inserted or reordered.
    getItemKey: (index) => {
      const row = rows[index];
      return row === undefined ? index : getRowKey(row);
    },
    overscan: OVERSCAN,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (pinnedIndex < 0 || pinnedIndex >= range.count || indexes.includes(pinnedIndex)) {
        return indexes;
      }
      return [...indexes, pinnedIndex].sort((a, b) => a - b);
    },
    initialRect: {
      width: INITIAL_RECT.width,
      height: Math.max(INITIAL_RECT.height, (testRowBudget ?? 0) * ESTIMATED_ROW_HEIGHT),
    },
    // The hook's own observer replaces `initialRect` with the scroller's measured size the moment
    // the scroller exists, and a scroller with no layout (jsdom, a `display: none` ancestor) measures
    // 0 by 0, which the virtualizer renders as NO rows. A zero-height report is ignored so such a
    // scroller keeps the initial window, which is what ADR-0165 D7 relies on for jsdom.
    observeElementRect: (instance, cb) =>
      defaultObserveElementRect(instance, (rect) => {
        if (rect.height > 0) cb(rect);
      }),
    measureElement: (element, entry, instance) => {
      const measured = defaultMeasureElement(element, entry, instance);
      return measured > 0 ? measured : ESTIMATED_ROW_HEIGHT;
    },
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const { top, bottom } = spacerHeights(items, totalSize);

  // ── Column widths (D1) ────────────────────────────────────────────────────────────────────────
  const [scrollerEpoch, setScrollerEpoch] = useState(0);
  const [frozen, setFrozen] = useState<FrozenWidths | null>(null);
  const measureKey = `${String(scrollerEpoch)}|${columns.map((c) => c.header).join('\u0000')}`;
  // A measurement belongs to the column set and scroller width it was taken at; once either moves
  // it no longer matches and the table is laid out freely again until it has been re-read.
  const widths = frozen?.key === measureKey ? frozen.widths : null;

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (widths !== null || !table) return;
    const measured = measureColumnWidths(table);
    if (measured) setFrozen({ key: measureKey, widths: measured });
  }, [widths, measureKey]);

  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts || fonts.status === 'loaded') return;
    let live = true;
    void fonts.ready.then(() => {
      if (live) setScrollerEpoch((epoch) => epoch + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  useLayoutEffect(() => {
    const scroller = tableRef.current?.parentElement;
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    let lastWidth = scroller.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const width = scroller.getBoundingClientRect().width;
      if (width === lastWidth) return;
      lastWidth = width;
      setScrollerEpoch((epoch) => epoch + 1);
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
    };
  }, []);

  // A spacer spans the columns that exist. Columns hidden below a breakpoint are not in the
  // `<colgroup>`, and a span wider than the columns would add phantom columns under a fixed layout.
  const spanOf = widths?.length ?? columns.length;

  return (
    <table
      ref={tableRef}
      className={cn(
        tableClassName,
        widths !== null && 'table-fixed [&_td]:whitespace-normal [&_th]:whitespace-normal',
      )}
      aria-rowcount={rows.length + 1}
    >
      <caption className="sr-only">{caption}</caption>
      {widths === null ? null : (
        <colgroup>
          {widths.map((width, index) => (
            <col key={index} style={{ width: `${String(width)}px` }} />
          ))}
        </colgroup>
      )}
      {head}
      <tbody
        onFocus={(event) => {
          const index = (event.target as HTMLElement).closest('tr')?.getAttribute('data-index');
          const row = index === null || index === undefined ? undefined : rows[Number(index)];
          if (row !== undefined) setPinnedKey(getRowKey(row));
        }}
        onBlur={(event) => {
          // Focus going to nowhere releases the pin; going to another row re-pins on its focus.
          if (event.relatedTarget === null) setPinnedKey(null);
        }}
      >
        <tr aria-hidden="true">
          <td colSpan={spanOf} style={{ height: top, padding: 0, border: 0 }} />
        </tr>
        {items.map((item, position) => {
          const row = rows[item.index];
          const previous = items[position - 1];
          const gap = previous ? item.start - previous.end : 0;
          return row === undefined ? null : (
            <Fragment key={getRowKey(row)}>
              {gap > 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={spanOf} style={{ height: gap, padding: 0, border: 0 }} />
                </tr>
              ) : null}
              {renderRow(row, item.index, virtualizer.measureElement)}
            </Fragment>
          );
        })}
        <tr aria-hidden="true">
          <td colSpan={spanOf} style={{ height: bottom, padding: 0, border: 0 }} />
        </tr>
      </tbody>
    </table>
  );
}
