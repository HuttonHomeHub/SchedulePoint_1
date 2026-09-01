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
          <DataTable
            {...common}
            columns={two}
            query={query({ isPending: true, data: undefined })}
          />,
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
          <DataTable
            {...common}
            columns={two}
            query={query({ isPending: true, data: undefined })}
          />,
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
