import { fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type Column } from './data-table';

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [{ header: 'Name', cell: (row) => row.name }];

function query(partial: {
  isPending?: boolean;
  isError?: boolean;
  data?: Row[];
  refetch?: () => void;
}) {
  return {
    isPending: partial.isPending ?? false,
    isError: partial.isError ?? false,
    data: partial.data,
    refetch: partial.refetch ?? vi.fn(),
  } as Parameters<typeof DataTable<Row>>[0]['query'];
}

const common = {
  caption: 'Rows',
  columns,
  getRowKey: (row: Row) => row.id,
  loadingLabel: 'Loading rows…',
  empty: <div>No rows yet.</div>,
};

describe('DataTable', () => {
  it('renders a loading state', () => {
    render(<DataTable {...common} query={query({ isPending: true })} />);
    expect(screen.getByText('Loading rows…')).toBeInTheDocument();
  });

  it('renders an error state with a working retry', () => {
    const refetch = vi.fn();
    render(<DataTable {...common} query={query({ isError: true, refetch })} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders the empty state when there are no rows', () => {
    render(<DataTable {...common} query={query({ data: [] })} />);
    expect(screen.getByText('No rows yet.')).toBeInTheDocument();
  });

  it('renders rows with an accessible caption', () => {
    render(<DataTable {...common} query={query({ data: [{ id: '1', name: 'Alpha' }] })} />);
    expect(screen.getByRole('table', { name: 'Rows' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  /**
   * `renderDetail` (ADR-0096). The contract is pinned HERE rather than only at its one consumer,
   * because this primitive is consumed by sixteen features and its promise — byte-identical when
   * the prop is absent, one cell spanning every column when it is present — is a claim about all
   * of them.
   */
  describe('renderDetail', () => {
    const two: Column<Row>[] = [
      { header: 'Name', cell: (row) => row.name },
      { header: 'Id', cell: (row) => row.id },
    ];
    const rows = [{ id: '1', name: 'Alpha' }];

    it('adds no row at all when the prop is absent', () => {
      const { container } = render(
        <DataTable {...common} columns={two} query={query({ data: rows })} />,
      );
      expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    });

    it('renders a sibling row whose single cell spans every column', () => {
      const { container } = render(
        <DataTable
          {...common}
          columns={two}
          query={query({ data: rows })}
          renderDetail={(row) => <span>detail for {row.name}</span>}
        />,
      );
      const bodyRows = container.querySelectorAll('tbody tr');
      expect(bodyRows).toHaveLength(2);
      const cells = bodyRows[1]!.querySelectorAll('td');
      expect(cells).toHaveLength(1);
      // The number, not a hardcoded 2: a column added later must widen this cell with it, or the
      // detail panel stops spanning the table and the layout silently breaks.
      expect(cells[0]!.getAttribute('colspan')).toBe(String(two.length));
      expect(screen.getByText(/detail for Alpha/)).toBeInTheDocument();
    });

    it('renders no detail row when the callback declines, per row', () => {
      // Per row, not per table: the one consumer expands one deletion at a time, so a version that
      // rendered the detail row for every row as soon as any row opened would look correct on a
      // one-row fixture.
      const { container } = render(
        <DataTable
          {...common}
          columns={two}
          query={query({
            data: [
              { id: '1', name: 'Alpha' },
              { id: '2', name: 'Beta' },
            ],
          })}
          renderDetail={(row) => (row.id === '1' ? <span>only Alpha</span> : null)}
        />,
      );
      expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
      expect(screen.getByText('only Alpha')).toBeInTheDocument();
    });

    describe('the loading skeleton (docs/TECH_DEBT.md #161(b))', () => {
      /**
       * **The skeleton's column count must equal the settled table's**, because a skeleton whose
       * shape differs reflows the page under the reader's cursor when the rows arrive — which is the
       * defect a skeleton exists to prevent, not a cosmetic mismatch. `docs/UX_STANDARDS.md` states
       * it and `skeleton.tsx` explains why the shape has to live with the component that knows it.
       *
       * Asserted against `columns.length` rather than a literal, and **verified red with a hardcoded
       * count** — a literal here would pass forever while the two drifted apart, which is the whole
       * failure mode.
       */
      it('renders a skeleton row matching the table’s own column count', () => {
        const { container } = render(
          <DataTable {...common} columns={two} query={query({ isPending: true })} />,
        );
        const bodyRows = container.querySelectorAll('tbody tr');
        expect(bodyRows.length).toBeGreaterThan(0);
        for (const row of bodyRows) {
          expect(row.querySelectorAll('td')).toHaveLength(two.length);
        }
        // The header is the real one, so the columns line up before and after the rows land.
        expect(container.querySelectorAll('thead th')).toHaveLength(two.length);
      });

      /**
       * `loadingLabel` is required on every caller and `shoot.mjs` asserts on it to photograph this
       * state. Deleting it would break the instrument that found the defect this milestone fixes,
       * so it is announced rather than replaced by the visual material — which is `aria-hidden`, so
       * an assistive reader gets one sentence rather than a few dozen grey rectangles.
       */
      it('still announces the loading label, and hides the material from assistive readers', () => {
        const { container } = render(
          <DataTable {...common} columns={two} query={query({ isPending: true })} />,
        );
        expect(screen.getByRole('status')).toHaveTextContent('Loading rows…');
        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
        for (const cell of container.querySelectorAll('tbody td > *')) {
          expect(cell).toHaveAttribute('aria-hidden', 'true');
        }
      });
    });

    describe('the empty state’s frame (docs/specs/empty-state-consolidation/ M3)', () => {
      /**
       * **The frame must not displace `describedById`.** `docs/TECH_DEBT.md` #93(d) records this
       * branch once returning BEFORE the described region existed, so prose qualifying what the rows
       * mean reached a reader WITH rows and not a reader with none — the state where an unexplained
       * absence is most likely to be misread. M3 puts a frame in the same place, and a frame wrapped
       * on the outside would silently undo that fix while looking identical on screen.
       *
       * Verified red by moving the frame outside the `aria-describedby` div.
       */
      it('keeps aria-describedby on the outermost element, with the frame inside it', () => {
        const { container } = render(
          <DataTable
            {...common}
            query={query({ data: [] })}
            empty={<>Nothing yet.</>}
            describedById="caveat"
          />,
        );
        const described = container.querySelector('[aria-describedby="caveat"]');
        expect(described).not.toBeNull();
        expect(described?.querySelector('.border-dashed')).not.toBeNull();
      });

      it('frames the empty copy so a call site does not have to', () => {
        const { container } = render(
          <DataTable {...common} query={query({ data: [] })} empty={<>Nothing yet.</>} />,
        );
        const frame = container.querySelector('.border-dashed');
        expect(frame).not.toBeNull();
        expect(frame).toHaveTextContent('Nothing yet.');
      });

      /**
       * **An empty fragment gets no frame, and that is the M3-T1 finding rather than tidiness.**
       * `staff.tsx:598` passes `empty={<></>}`. Framed unconditionally that becomes a dashed
       * rectangle containing nothing — the primitive asserting an absence where the call site
       * deliberately said nothing at all. `Children.count` rather than a truthiness test, because
       * `<></>` is a truthy React element and `empty && …` would frame it.
       */
      it('renders no frame when there is nothing to frame', () => {
        const { container } = render(
          <DataTable {...common} query={query({ data: [] })} empty={<></>} />,
        );
        expect(container.querySelector('.border-dashed')).toBeNull();
      });
    });
  });
});

/**
 * **`Column.width`, which shipped with no coverage of its own.**
 *
 * Found by the component review at ADR-0146 M3: the discriminator's only exercise was incidental,
 * through consumer files that happen to use `fit` and `auto`, and `bounded` had none at all. A
 * three-value vocabulary whose third value is never asserted is a value nobody can rely on.
 *
 * These are class assertions rather than layout assertions, and that division is deliberate: jsdom
 * has no table layout algorithm, so whether `fit` actually shrinks to content is a question only a
 * browser can answer — `e2e-page-composition` asks it, by checking that no cell wraps while its
 * table has room. What CAN be settled here is the contract between the prop and the class list:
 * that each value contributes what it says, that `auto` contributes nothing, and that a caller's
 * own classes survive alongside it. That last one is the whole point of composing rather than
 * replacing (`docs/TECH_DEBT.md` #335).
 */
describe('DataTable — srHeader', () => {
  it('positions a screen-reader-only header so its hidden text stays inside the scroll region', () => {
    // Verified red without `relative`: the `sr-only` span is absolute with no positioned ancestor,
    // so in a wide table it sat past the right edge of the viewport and widened the page at 320 px.
    render(
      <DataTable
        {...common}
        columns={[{ header: 'Show', srHeader: true, cell: (row: Row) => row.name }]}
        query={query({ data: [{ id: '1', name: 'A' }] })}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Show' })).toHaveClass('relative');
  });
});

describe('DataTable — Column.width', () => {
  const rows = [{ id: '1', name: 'Northgate' }];

  const classesFor = (width?: Column<Row>['width'], cellClassName?: string) => {
    const view = render(
      <DataTable
        {...common}
        columns={[
          {
            header: 'Name',
            cell: (row: Row) => row.name,
            ...(width === undefined ? {} : { width }),
            ...(cellClassName === undefined ? {} : { cellClassName }),
          },
        ]}
        query={query({ data: rows })}
      />,
    );
    const cell = screen.getAllByRole('cell')[0]!;
    const head = screen.getAllByRole('columnheader')[0]!;
    const out = { cell: cell.className, head: head.className };
    view.unmount();
    return out;
  };

  it('gives a `fit` column the shrink-to-content classes, on the cell and its header alike', () => {
    const { cell, head } = classesFor('fit');
    expect(cell).toContain('md:w-px');
    expect(cell).toContain('md:whitespace-nowrap');
    // The header matters as much as the cell: under `table-layout: auto` the column resolves from
    // both, and a width on only one of them is a column that disagrees with its own heading.
    expect(head).toContain('md:w-px');
  });

  it('gives a `bounded` column a reading measure, and does NOT truncate', () => {
    const { cell } = classesFor('bounded');
    expect(cell).toContain('md:max-w-prose');
    // The spec said "truncation with the full value available" and this deliberately does not:
    // a cell that silently drops the end of a value is worse than one that is two lines tall.
    expect(cell).not.toContain('truncate');
    expect(cell).not.toContain('text-ellipsis');
  });

  it('is a true no-op for `auto`, and for a column that declares nothing', () => {
    const declared = classesFor('auto');
    const silent = classesFor(undefined);
    expect(declared).toEqual(silent);
    expect(declared.cell).not.toContain('md:w-px');
    expect(declared.cell).not.toContain('max-w-prose');
  });

  it("composes with a caller's own classes rather than replacing them", () => {
    // The reason the width is a separate prop at all: a caller can declare one WITHOUT restating
    // the padding default, which is what `docs/TECH_DEBT.md` #335 asks for.
    const { cell } = classesFor('fit', 'py-2 pr-4 text-right');
    expect(cell).toContain('text-right');
    expect(cell).toContain('py-2');
    expect(cell).toContain('md:w-px');
  });

  it('wins a same-modifier collision with the caller, rather than losing one silently', () => {
    // Pinned because the precedence is the OPPOSITE of `SearchField`'s `cn(defaults, className)`
    // one file over, and of this repository's usual "className extends, never clobbers" habit —
    // so the next author to hit it should find an assertion rather than a surprise (M8 component
    // review). No consumer collides today; the point is that the answer is decided, not accidental.
    const { cell } = classesFor('bounded', 'py-2 pr-4 md:max-w-40');
    expect(cell).toContain('md:max-w-prose');
    expect(cell).not.toContain('md:max-w-40');
  });

  /**
   * **`data-col-width`, the attribute that makes `width: 'auto'` observable.**
   *
   * `docs/specs/table-wrap-coverage/feature-spec.md:465` says "Pinned by a unit test in both
   * branches" and **there was no such test** — `docs/TECH_DEBT.md` #344's M1-T2 specified it
   * precisely and the milestone shipped without it, which the M5 component review found by
   * checking the claim rather than reading it. That matters more than a missing assertion usually
   * would: the wrap gate's entire discriminator is `auto` (declared) against `undeclared`
   * (omitted), so this attribute is the only channel by which a `width` declaration reaches an
   * instrument, and the deliberate skeleton omission below had nothing holding it against a
   * well-meaning tidy-up.
   */
  describe('the width declaration, as an attribute (docs/TECH_DEBT.md #344)', () => {
    const declared: Column<Row>[] = [
      { header: 'Fit', width: 'fit', cell: (row) => row.name },
      { header: 'Bounded', width: 'bounded', cell: (row) => row.name },
      { header: 'Auto', width: 'auto', cell: (row) => row.name },
      { header: 'Silent', cell: (row) => row.name },
    ];

    it('emits each column’s declaration on its header and its cells', () => {
      const { container } = render(
        <DataTable
          {...common}
          columns={declared}
          query={query({ data: [{ id: '1', name: 'a' }] })}
        />,
      );

      const read = (selector: string): (string | null)[] =>
        [...container.querySelectorAll(selector)].map((el) => el.getAttribute('data-col-width'));

      // `undeclared` rather than an absent attribute: "this column never mentioned width" has to be
      // a value a sweep can read, or omission and `auto` are indistinguishable in the DOM and the
      // gate's discriminator does not exist.
      expect(read('thead th')).toEqual(['fit', 'bounded', 'auto', 'undeclared']);
      expect(read('tbody td')).toEqual(['fit', 'bounded', 'auto', 'undeclared']);
    });

    it('emits NOTHING on the loading skeleton, which is the strict reading rather than a hole', () => {
      const { container } = render(
        <DataTable {...common} columns={declared} query={query({ isPending: true })} />,
      );

      expect(container.querySelectorAll('[data-col-width]')).toHaveLength(0);
    });
  });

  /**
   * `scroll` (`docs/specs/activities-panel-scale/`, TECH_DEBT #334). `'page'` (the default, omitted
   * or explicit) must be BYTE-IDENTICAL to what this component rendered before the prop existed —
   * SC-4, and the one thing that makes the other 23 call sites safe to leave untouched. `'contained'`
   * is a new DOM shape this repository has never rendered, so it is pinned by class set rather than
   * assumed: the header rule moves off the `<tr>` and onto each `<th>`/`<td>` (`border-separate`
   * cannot render a row's own border — see the component's docblock), and the header pins with
   * `sticky top-0`.
   *
   * **Verified red**: reverting the `contained` branch to `overflow-x-auto` (the pre-M1 region
   * class) turns the 'contained' cases below red, because the pinned classes stop appearing at all.
   */
  describe('scroll', () => {
    const rows = [{ id: '1', name: 'Alpha' }];

    const regionOf = (container: HTMLElement) =>
      container.querySelector('[role="region"]') as HTMLElement;
    const headerOf = () => screen.getAllByRole('columnheader')[0]!;
    const headRowOf = () => headerOf().closest('tr')!;
    const cellOf = () => screen.getAllByRole('cell')[0]!;
    const bodyRowOf = () => cellOf().closest('tr')!;

    it('is the exact pre-existing DOM when omitted', () => {
      const { container } = render(<DataTable {...common} query={query({ data: rows })} />);
      expect(regionOf(container).className).toBe('overflow-x-auto');
      expect(container.querySelector('table')!.className).toBe('w-full text-sm');
      expect(headRowOf().className).toBe('border-border text-muted-foreground border-b text-left');
      expect(bodyRowOf().className).toBe('border-border border-b');
    });

    it('`scroll="page"` given explicitly renders identically to it being omitted', () => {
      const omitted = render(<DataTable {...common} query={query({ data: rows })} />);
      const explicit = render(
        <DataTable {...common} query={query({ data: rows })} scroll="page" />,
      );
      expect(explicit.container.innerHTML).toBe(omitted.container.innerHTML);
      omitted.unmount();
      explicit.unmount();
    });

    it('`scroll="contained"` gives the region one scroller and pins the header', () => {
      const { container } = render(
        <DataTable {...common} query={query({ data: rows })} scroll="contained" />,
      );

      // The region owns both axes and reserves room for the pinned header (SC-2, SC-3, SC-5).
      const region = regionOf(container);
      expect(region.className).toContain('overflow-auto');
      expect(region.className).not.toContain('overflow-x-auto');
      expect(region.className).toContain('flex-1');
      // The floor holds at every width: no `md:` prefix (retire-single-pane AC-3.4).
      expect(region.className.split(' ')).toContain('min-h-32');
      expect(region.className).toContain('scroll-pt-12');

      // `border-separate` because a collapsed-model row border is not guaranteed to survive a
      // sticky cell across engines (the component's own docblock) — the safe default.
      expect(container.querySelector('table')!.className).toContain('border-separate');

      // The header rule moved off the row and onto the cell, which now also pins.
      expect(headRowOf().className).not.toContain('border-b');
      const th = headerOf();
      expect(th.className).toContain('sticky');
      expect(th.className).toContain('top-0');
      expect(th.className).toContain('bg-background');
      expect(th.className).toContain('border-b');

      // Every data row's border moved to its cells too, for the same reason.
      expect(bodyRowOf().className).toBe('');
      const td = cellOf();
      expect(td.className).toContain('border-b');
      expect(td.className).toContain('border-border');
    });

    it('`scroll="contained"` moves a detail row\'s rule onto its cell too', () => {
      const { container } = render(
        <DataTable
          {...common}
          query={query({ data: rows })}
          scroll="contained"
          renderDetail={(row) => <span>detail for {row.name}</span>}
        />,
      );
      const detailRow = container.querySelectorAll('tbody tr')[1]!;
      expect(detailRow.className).not.toContain('border-b');
      const detailCell = detailRow.querySelector('td')!;
      expect(detailCell.className).toContain('border-b');
      expect(detailCell.className).toContain('border-border');
    });
  });
});

/**
 * **Row memoisation** (`docs/TECH_DEBT.md` #334, M2-F2). Rows skip a parent render only when both the
 * row object and the `columns` array are unchanged; every other call site declares `columns` inline
 * and must keep rendering exactly as before.
 */
describe('DataTable — row memoisation', () => {
  const DATA: Row[] = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
    { id: 'c', name: 'Charlie' },
  ];
  const rows = query({ data: DATA });

  /** A host that re-renders on demand; `mode` picks how it builds `columns`. */
  function Host({
    mode,
    cells,
  }: {
    mode: 'inline' | 'memo';
    cells: { count: number };
  }): React.ReactElement {
    const [, setTick] = useState(0);
    const build = useCallback(
      (): Column<Row>[] => [
        {
          header: 'Name',
          cell: (row) => {
            cells.count += 1;
            return row.name;
          },
        },
      ],
      [cells],
    );
    const memoised = useMemo(() => build(), [build]);
    return (
      <>
        <button type="button" onClick={() => setTick((n) => n + 1)}>
          Render
        </button>
        <DataTable {...common} columns={mode === 'memo' ? memoised : build()} query={rows} />
      </>
    );
  }

  it('re-renders every row on a parent render when columns is declared inline', () => {
    const cells = { count: 0 };
    render(<Host mode="inline" cells={cells} />);
    expect(cells.count).toBe(DATA.length);
    cells.count = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Render' }));

    expect(cells.count).toBe(DATA.length);
  });

  it('skips every row on a parent render when columns is memoised', () => {
    const cells = { count: 0 };
    render(<Host mode="memo" cells={cells} />);
    cells.count = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Render' }));

    expect(cells.count).toBe(0);
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('updates a renderDetail row on a parent render even when columns is memoised', () => {
    // `renderDetail` returns a new node on every call, so its rows cannot skip and a detail that
    // depends on host state stays current.
    function DetailHost(): React.ReactElement {
      const [label, setLabel] = useState('first');
      const memoised = useMemo<Column<Row>[]>(() => [{ header: 'Name', cell: (r) => r.name }], []);
      return (
        <>
          <button type="button" onClick={() => setLabel('second')}>
            Change
          </button>
          <DataTable
            {...common}
            columns={memoised}
            query={rows}
            renderDetail={(row) => <p>{`${row.id}-${label}`}</p>}
          />
        </>
      );
    }
    render(<DetailHost />);
    expect(screen.getByText('b-first')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));

    expect(screen.getByText('b-second')).toBeInTheDocument();
    expect(screen.queryByText('b-first')).not.toBeInTheDocument();
  });
});

describe('DataTable — the windowed mode leaves every other table as it was (ADR-0165)', () => {
  const data = [
    { id: '1', name: 'Alpha' },
    { id: '2', name: 'Beta' },
  ];

  it.each(['page', 'contained'] as const)(
    'renders no windowing markup for a %s-scroll table',
    (scroll) => {
      const { container } = render(
        <DataTable {...common} query={query({ data })} scroll={scroll} />,
      );
      const html = container.innerHTML;
      expect(html).not.toContain('aria-rowcount');
      expect(html).not.toContain('aria-rowindex');
      expect(html).not.toContain('data-index');
      expect(html).not.toContain('aria-hidden');
      expect(container.querySelector('colgroup')).toBeNull();
      expect(container.querySelector('table')?.className).not.toContain('table-fixed');
    },
  );

  it('renders the exact DOM a page-scroll table always has', () => {
    const { container } = render(<DataTable {...common} query={query({ data })} />);
    const table = container.querySelector('table')!;
    expect(table.outerHTML).toBe(
      '<table class="w-full text-sm"><caption class="sr-only">Rows</caption>' +
        '<thead><tr class="border-border text-muted-foreground border-b text-left">' +
        '<th scope="col" class="py-2 pr-4 font-medium" data-col-width="undeclared">Name</th>' +
        '</tr></thead><tbody>' +
        '<tr class="border-border border-b"><td class="py-2 pr-4" data-col-width="undeclared">Alpha</td></tr>' +
        '<tr class="border-border border-b"><td class="py-2 pr-4" data-col-width="undeclared">Beta</td></tr>' +
        '</tbody></table>',
    );
  });

  it('refuses windowing without a contained scroller, or with a detail row, at the type level', () => {
    const q = query({ data });
    const props = { ...common, query: q };
    // Each line below must stay a compile error; `tsc` fails the suite if one starts to compile.
    // @ts-expect-error windowing needs scroll="contained"
    void (<DataTable {...props} windowed />);
    // @ts-expect-error windowing needs scroll="contained", not "page"
    void (<DataTable {...props} windowed scroll="page" />);
    // @ts-expect-error windowing is refused with renderDetail
    void (<DataTable {...props} windowed scroll="contained" renderDetail={() => null} />);
    expect(true).toBe(true);
  });
});

/**
 * `Column.wrap` is composed like `width` (staff console redesign M2): appended to the column's own
 * classes on the cell and its header, never replacing them, and absent unless declared.
 */
describe('DataTable — Column.wrap', () => {
  const classesFor = (wrap?: 'anywhere') => {
    const view = render(
      <DataTable
        {...common}
        columns={[
          {
            header: 'Id',
            cell: (row: Row) => row.name,
            cellClassName: 'py-2 pr-4 font-mono',
            ...(wrap === undefined ? {} : { wrap }),
          },
        ]}
        query={query({ data: [{ id: '1', name: 'x'.repeat(80) }] })}
      />,
    );
    const out = {
      cell: screen.getAllByRole('cell')[0]!.className,
      head: screen.getAllByRole('columnheader')[0]!.className,
    };
    view.unmount();
    return out;
  };

  it('adds wrap-anywhere to the cell and its header, keeping the caller’s own classes', () => {
    const { cell, head } = classesFor('anywhere');
    expect(cell).toContain('wrap-anywhere');
    expect(cell).toContain('font-mono');
    expect(head).toContain('wrap-anywhere');
  });

  it('adds nothing for a column that does not declare it', () => {
    const { cell, head } = classesFor();
    expect(cell).not.toContain('wrap-anywhere');
    expect(head).not.toContain('wrap-anywhere');
  });
});
