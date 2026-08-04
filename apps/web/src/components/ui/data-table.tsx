import type { UseQueryResult } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** A column definition for {@link DataTable}. */
export interface Column<T> {
  /** Header text; also the accessible header even when visually hidden. */
  header: string;
  /** Cell renderer for a row. */
  cell: (row: T) => React.ReactNode;
  /**
   * Render a control in the header cell instead of the {@link header} text — a select-all checkbox,
   * a sort trigger. The control must carry its own accessible name, because it replaces the text
   * that would otherwise have named the column. {@link header} is still required: it stays the
   * column's key and its identity in code.
   */
  headerCell?: () => React.ReactNode;
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
  describedById,
}: {
  caption: string;
  columns: Column<T>[];
  /**
   * A `react-query` result, narrowed to what the states need. `refetch` is typed as returning
   * `unknown` rather than borrowed from `UseQueryResult` so an INFINITE query's result can be
   * adapted here too — its refetch resolves to a paged shape, and the retry button only ever
   * fires it. Widening the primitive beat giving the audit log a second table (ADR-0072).
   */
  query: Pick<UseQueryResult<T[]>, 'isPending' | 'isError' | 'data'> & { refetch: () => unknown };
  getRowKey: (row: T) => string;
  empty: React.ReactNode;
  loadingLabel: string;
  errorLabel?: string;
  /**
   * Id of prose that qualifies what the rows mean, associated with the scroll region.
   *
   * Reading order alone is not enough: this region is focusable and carries `role="region"`, so a
   * screen-reader user navigating by landmark lands *inside* the table having skipped whatever sits
   * above it. Where that prose is a safety caveat — "this does not mean they got in" — being
   * reachable only by reading serially is the wrong contract.
   */
  describedById?: string | undefined;
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
    // Focusable + labelled so a keyboard-only user can scroll a wide table
    // (WCAG 2.1.1); the caption names the region. A scroll container with a
    // `region` role is the recommended pattern here — the lint rule doesn't model it.
    <div
      className="overflow-x-auto"
      role="region"
      aria-label={caption}
      {...(describedById === undefined ? {} : { 'aria-describedby': describedById })}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
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
                {column.headerCell ? (
                  column.headerCell()
                ) : column.srHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
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
