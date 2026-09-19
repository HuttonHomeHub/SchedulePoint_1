import { fireEvent, render, screen } from '@testing-library/react';
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
});
