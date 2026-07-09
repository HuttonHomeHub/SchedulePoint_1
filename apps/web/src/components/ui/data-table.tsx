import type { UseQueryResult } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** A column definition for {@link DataTable}. */
export interface Column<T> {
  /** Header text; also the accessible header even when visually hidden. */
  header: string;
  /** Cell renderer for a row. */
  cell: (row: T) => React.ReactNode;
  /** Visually hide the header (e.g. an actions column). */
  srHeader?: boolean;
  headClassName?: string;
  cellClassName?: string;
}

/**
 * The single table primitive (DESIGN_SYSTEM.md → Tables). Renders the shared
 * loading / error-with-retry / empty / populated states so every resource list
 * behaves identically. Pass a `react-query` result and column definitions; the
 * caller supplies its own empty state (icon + copy + optional action).
 */
export function DataTable<T>({
  caption,
  columns,
  query,
  getRowKey,
  empty,
  loadingLabel,
  errorLabel = 'Couldn’t load this list. Please try again.',
}: {
  caption: string;
  columns: Column<T>[];
  query: Pick<UseQueryResult<T[]>, 'isPending' | 'isError' | 'data' | 'refetch'>;
  getRowKey: (row: T) => string;
  empty: React.ReactNode;
  loadingLabel: string;
  errorLabel?: string;
}): React.ReactElement {
  if (query.isPending) {
    return (
      <div className="p-6">
        <Spinner label={loadingLabel} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-destructive-text text-sm">
          {errorLabel}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={column.headClassName ?? 'py-2 pr-4 font-medium'}
              >
                {column.srHeader ? <span className="sr-only">{column.header}</span> : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="border-border border-b">
              {columns.map((column) => (
                <td key={column.header} className={column.cellClassName ?? 'py-2 pr-4'}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
