import type { UseQueryResult } from '@tanstack/react-query';

import { StatusSection } from './status-section';

import { QueryErrorState } from '@/components/ui/query-error-state';

export interface QueryPanelProps<T> {
  title: string;
  /** The section's anchor id, as on `StatusSection`. */
  id?: string;
  /**
   * The panel's one query: its three flags, its data, and a way to read it again.
   *
   * **`isFetching` is optional, and it is the panel's busy signal** — pass `query.isFetching` and the
   * section carries `aria-busy` while a read is in flight. It matters in the one case the three
   * flags cannot express: a refetch (or a key change under `placeholderData`) that leaves earlier
   * data on screen, where nothing else says the figures may be about to change. It never swaps the
   * body for the skeleton; that is `isPending`'s job, and a placeholder is not pending.
   */
  query: Pick<UseQueryResult<T>, 'isPending' | 'isError' | 'data'> & {
    isFetching?: boolean | undefined;
    refetch: () => unknown;
  };
  /**
   * What stands in for the body while the query is pending.
   *
   * **Required, and not defaulted.** A panel whose loading shape is whatever the primitive happened
   * to render is a panel nobody designed a loading state for; the staff console's panels do not
   * share one shape (a spinner for the stat grid, a table-shaped skeleton for a `DataTable`), so the
   * caller says which.
   */
  skeleton: React.ReactNode;
  /** One sentence saying what the box holds, under its heading. */
  description?: React.ReactNode;
  /** The failure shape's sentence: "Could not read accounts." */
  errorLabel: string;
  /** What the polite region says when the query fails: "Accounts could not be read." */
  errorStatus: string;
  /**
   * What the polite region says once there is an answer.
   *
   * **It must be pure and cheap.** It runs during render, on every render of an answered panel, so a
   * call that announces, logs, reads the clock or touches state would fire as often as React
   * decides to render. It is a function of the data and nothing else; the region speaks only when
   * the returned string changes (`StatusSection`).
   */
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
 * **Stale data is shown in one case and refused in another, and the rule is the order of the
 * branches.** Under `placeholderData` (or any refetch) `data` is present while a read is in flight:
 * that is shown, with `aria-busy`, because earlier figures that are about to be replaced are better
 * than a flash of skeleton and the busy flag says they may change. The moment the read **fails**, the
 * error branch wins and the data is withheld — "could not read" is never printed over a number that
 * looks current. A placeholder is therefore never an answer to a failed read, only to a slow one.
 *
 * **The polite sentence follows the same three branches**, empty while pending (the region is
 * mounted before the answer exists, which is what makes filling it a change a screen reader
 * speaks) — see `StatusSection`.
 */
export function QueryPanel<T>({
  title,
  id,
  description,
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
      busy={query.isFetching === true}
      // A page read: its first sentence is a resting state, and the page announces it once.
      announce="change"
      {...(description === undefined ? {} : { description })}
    >
      {query.isPending && skeleton}
      {query.isError && <QueryErrorState label={errorLabel} onRetry={() => void query.refetch()} />}
      {answered && children(data)}
    </StatusSection>
  );
}
