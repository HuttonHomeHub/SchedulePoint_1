import type { UseQueryResult } from '@tanstack/react-query';

import { StatusSection } from './status-section';

import { QueryErrorState } from '@/components/ui/query-error-state';

export interface QueryPanelProps<T> {
  title: string;
  /** The section's anchor id, as on `StatusSection`. */
  id?: string;
  /** The panel's one query: its three flags, its data, and a way to read it again. */
  query: Pick<UseQueryResult<T>, 'isPending' | 'isError' | 'data'> & { refetch: () => unknown };
  /**
   * What stands in for the body while the query is pending.
   *
   * **Required, and not defaulted.** A panel whose loading shape is whatever the primitive happened
   * to render is a panel nobody designed a loading state for; the staff console's panels do not
   * share one shape (a spinner for the stat grid, a table-shaped skeleton for a `DataTable`), so the
   * caller says which.
   */
  skeleton: React.ReactNode;
  /** The failure shape's sentence: "Could not read accounts." */
  errorLabel: string;
  /** What the polite region says when the query fails: "Accounts could not be read." */
  errorStatus: string;
  /** What the polite region says once there is an answer. */
  settledStatus: (data: NonNullable<T>) => string;
  /** The body, given data that is known to be present and current. */
  children: (data: NonNullable<T>) => React.ReactNode;
}

/**
 * A `StatusSection` whose body is one query's three states: pending, failed, answered.
 *
 * **It exists so the `!isError` guard is written once.** A failed refetch does not clear
 * `query.data`, so a panel that renders `data !== undefined && …` beside an error state puts the
 * failure message on top of figures from before it — a reader sees "could not read" over a number
 * that looks current (ADR-0140 M4). Every staff panel carried the guard by hand and a comment
 * explaining it; here the failure branch and the data branch are exclusive by construction, so
 * error plus prior data shows **only** the error.
 *
 * **The polite sentence follows the same three branches**, empty while pending (the region is
 * mounted before the answer exists, which is what makes filling it a change a screen reader
 * speaks) — see `StatusSection`.
 */
export function QueryPanel<T>({
  title,
  id,
  query,
  skeleton,
  errorLabel,
  errorStatus,
  settledStatus,
  children,
}: QueryPanelProps<T>): React.ReactElement {
  const { data } = query;
  const answered = !query.isPending && !query.isError && data !== undefined && data !== null;

  return (
    <StatusSection
      title={title}
      {...(id === undefined ? {} : { id })}
      status={query.isError ? errorStatus : answered ? settledStatus(data) : ''}
    >
      {query.isPending && skeleton}
      {query.isError && <QueryErrorState label={errorLabel} onRetry={() => void query.refetch()} />}
      {answered && children(data)}
    </StatusSection>
  );
}
