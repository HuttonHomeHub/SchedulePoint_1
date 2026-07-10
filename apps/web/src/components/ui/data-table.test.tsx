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
});
