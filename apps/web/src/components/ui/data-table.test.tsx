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
  });
});
