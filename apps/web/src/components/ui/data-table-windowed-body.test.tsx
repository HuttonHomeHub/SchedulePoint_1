import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable, type Column } from './data-table';
import { setWindowedRowBudgetForTests, spacerHeights } from './data-table-windowed-body';

/**
 * The windowed `DataTable` (ADR-0165): window math, the table's announced size, and the frozen
 * column widths. jsdom has no layout, so the widths a browser would measure are supplied through a
 * stubbed `getBoundingClientRect`, and the scroller's resize through a captured `ResizeObserver`.
 * What none of this can show — Tab through the window, real wrapping — is the journey's job.
 */

interface Row {
  id: string;
  name: string;
}

const rowsOf = (n: number, label = 'Row'): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${String(i)}`, name: `${label} ${String(i)}` }));

const columns: Column<Row>[] = [
  { header: 'Code', cell: (row) => row.id },
  { header: 'Name', cell: (row) => row.name },
];

function query(data: Row[]) {
  return {
    isPending: false,
    isError: false,
    data,
    refetch: vi.fn(),
  } as Parameters<typeof DataTable<Row>>[0]['query'];
}

function table(data: Row[], cols: Column<Row>[] = columns) {
  return (
    <DataTable
      caption="Rows"
      columns={cols}
      query={query(data)}
      getRowKey={(row) => row.id}
      loadingLabel="Loading…"
      empty={<div>None</div>}
      scroll="contained"
      windowed
    />
  );
}

const dataRows = () => screen.getAllByRole('row').filter((tr) => tr.hasAttribute('data-index'));

describe('spacerHeights', () => {
  it('sizes the spacers from the first and last rendered item', () => {
    const items = [
      { start: 370, end: 407 },
      { start: 407, end: 444 },
    ];
    expect(spacerHeights(items, 3700)).toEqual({ top: 370, bottom: 3256 });
  });

  it('puts the whole height below when nothing is rendered', () => {
    expect(spacerHeights([], 900)).toEqual({ top: 0, bottom: 900 });
  });

  it('never returns a negative spacer', () => {
    expect(spacerHeights([{ start: 0, end: 100 }], 90)).toEqual({ top: 0, bottom: 0 });
  });
});

describe('windowed DataTable — window and announced size', () => {
  it('renders a window, not every row, and announces the true size', () => {
    render(table(rowsOf(500)));
    const rendered = dataRows();
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
    // 500 data rows plus the header row.
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '501');
  });

  it('numbers each rendered row from 2, the header being row 1', () => {
    render(table(rowsOf(500)));
    const indexes = dataRows().map((tr) => Number(tr.getAttribute('aria-rowindex')));
    expect(indexes[0]).toBe(2);
    indexes.forEach((value, i) => {
      expect(value).toBe(i + 2);
    });
  });

  it('stands in for the rows outside the window with aria-hidden spacer rows', () => {
    render(table(rowsOf(500)));
    const tbody = screen.getByRole('table').querySelector('tbody')!;
    const rows = [...tbody.querySelectorAll(':scope > tr')];
    const top = rows[0]!;
    const bottom = rows[rows.length - 1]!;
    expect(top).toHaveAttribute('aria-hidden', 'true');
    expect(bottom).toHaveAttribute('aria-hidden', 'true');
    const height = (tr: Element) => Number.parseFloat(tr.querySelector('td')!.style.height);
    // jsdom measures rows as 0px, which the body treats as "keep the estimate" (37px).
    expect(height(top)).toBe(0);
    expect(height(bottom)).toBe((500 - dataRows().length) * 37);
    expect(height(top) + dataRows().length * 37 + height(bottom)).toBe(500 * 37);
  });

  it('keeps a native table with column headers', () => {
    render(table(rowsOf(500)));
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Rows' }).tagName).toBe('TABLE');
  });

  it('renders every row of a short table', () => {
    render(table(rowsOf(5)));
    expect(dataRows()).toHaveLength(5);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '6');
  });

  it('holds more rows in the first window when a test sets the row budget', () => {
    setWindowedRowBudgetForTests(300);
    try {
      render(table(rowsOf(300)));
      expect(dataRows()).toHaveLength(300);
    } finally {
      setWindowedRowBudgetForTests(null);
    }
  });
});

describe('windowed DataTable — the header and the focused row', () => {
  it('numbers the header row 1, and only in windowed mode', () => {
    render(table(rowsOf(5)));
    expect(screen.getAllByRole('row')[0]).toHaveAttribute('aria-rowindex', '1');
  });

  const focusable: Column<Row>[] = [
    { header: 'Name', cell: (row) => <button type="button">{`Open ${row.name}`}</button> },
  ];
  const scrollTo = (top: number) => {
    const scroller = screen.getByRole('region');
    scroller.scrollTop = top;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
  };

  it('keeps the row that holds focus mounted after the window scrolls far away', () => {
    render(table(rowsOf(500), focusable));
    const button = screen.getByRole('button', { name: 'Open Row 0' });
    act(() => {
      button.focus();
    });
    scrollTo(37 * 300);
    expect(screen.queryByRole('button', { name: 'Open Row 300' })).not.toBeNull();
    expect(button.isConnected).toBe(true);
    expect(button).toHaveFocus();
    // The gap between the pinned row and the window is a spacer, so the total height is intact.
    const heights = [...screen.getByRole('table').querySelectorAll('tbody > tr[aria-hidden]')].map(
      (tr) => Number.parseFloat(tr.querySelector('td')!.style.height),
    );
    expect(heights.length).toBeGreaterThanOrEqual(3);
    expect(heights.reduce((a, b) => a + b, 0) + dataRows().length * 37).toBe(500 * 37);
    const indexes = dataRows().map((tr) => Number(tr.getAttribute('aria-rowindex')));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('lets the row unmount once focus is released', () => {
    render(table(rowsOf(500), focusable));
    const button = screen.getByRole('button', { name: 'Open Row 0' });
    act(() => {
      button.focus();
    });
    scrollTo(37 * 300);
    expect(button.isConnected).toBe(true);
    act(() => {
      button.blur();
    });
    expect(screen.queryByRole('button', { name: 'Open Row 0' })).toBeNull();
    fireEvent.scroll(screen.getByRole('region'));
  });
});

describe('windowed DataTable — column widths are frozen (ADR-0165 D1)', () => {
  let widths: Record<string, number>;
  let scrollerWidth: number;
  let measureCalls: number;
  let observers: { callback: ResizeObserverCallback }[];
  const original = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    widths = { Code: 90, Name: 310 };
    scrollerWidth = 400;
    measureCalls = 0;
    observers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          observers.push({ callback });
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const width =
        this.tagName === 'TH'
          ? (widths[this.textContent ?? ''] ?? 0)
          : this.getAttribute('role') === 'region'
            ? scrollerWidth
            : 0;
      if (this.tagName === 'TH') measureCalls += 1;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 } as DOMRect;
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
    vi.unstubAllGlobals();
  });

  const colWidths = () =>
    [...screen.getByRole('table').querySelectorAll('colgroup > col')].map(
      (col) => (col as HTMLElement).style.width,
    );

  const resizeScroller = (width: number) => {
    scrollerWidth = width;
    act(() => {
      for (const { callback } of observers) callback([], {} as ResizeObserver);
    });
  };

  it('renders a colgroup of the first window’s measured widths under a fixed layout', () => {
    render(table(rowsOf(50)));
    expect(colWidths()).toEqual(['90px', '310px']);
    expect(screen.getByRole('table').className).toContain('table-fixed');
  });

  it('does not re-measure or change when the data changes', () => {
    const { rerender } = render(table(rowsOf(50)));
    const before = measureCalls;
    widths = { Code: 500, Name: 500 };
    rerender(table(rowsOf(50, 'A much longer value')));
    rerender(table(rowsOf(80)));
    expect(colWidths()).toEqual(['90px', '310px']);
    expect(measureCalls).toBe(before);
  });

  it('re-measures when the scroller’s width changes', () => {
    render(table(rowsOf(50)));
    widths = { Code: 120, Name: 500 };
    resizeScroller(700);
    expect(colWidths()).toEqual(['120px', '500px']);
  });

  it('ignores a resize that leaves the scroller’s width as it was', () => {
    render(table(rowsOf(50)));
    const before = measureCalls;
    widths = { Code: 1, Name: 1 };
    resizeScroller(400);
    expect(colWidths()).toEqual(['90px', '310px']);
    expect(measureCalls).toBe(before);
  });

  it('re-measures when the column set changes', () => {
    const { rerender } = render(table(rowsOf(50)));
    widths = { Code: 90, Name: 200, Extra: 110 };
    rerender(table(rowsOf(50), [...columns, { header: 'Extra', cell: () => 'x' }]));
    expect(colWidths()).toEqual(['90px', '200px', '110px']);
  });

  it('re-measures once when the web fonts finish loading', async () => {
    let resolveFonts: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { status: 'loading', ready },
    });
    try {
      render(table(rowsOf(50)));
      expect(colWidths()).toEqual(['90px', '310px']);
      // The fallback face measured 90/310; the real face is wider.
      widths = { Code: 110, Name: 360 };
      await act(async () => {
        resolveFonts();
        await ready;
      });
      expect(colWidths()).toEqual(['110px', '360px']);
    } finally {
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('does not read layout on a scroll', () => {
    render(table(rowsOf(500)));
    const before = measureCalls;
    const scroller = screen.getByRole('region');
    scroller.scrollTop = 4000;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(measureCalls).toBe(before);
    expect(colWidths()).toEqual(['90px', '310px']);
  });

  it('leaves the body cells wrappable so a longer value stays inside its width', () => {
    render(table(rowsOf(5)));
    expect(screen.getByRole('table').className).toContain('[&_td]:whitespace-normal');
    expect(within(screen.getByRole('table')).getAllByRole('cell').length).toBeGreaterThan(0);
  });
});
