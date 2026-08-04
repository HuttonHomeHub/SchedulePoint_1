import type { AuditEvent } from '@repo/types';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';

import { auditActorName, auditEventCopy, auditSubject } from '../model/audit-copy';

import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';

interface AuditPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

/**
 * A page of audit events as a table, with a keyboard-reachable "Load more".
 *
 * ONE component for both screens. The organisation log and a person's own history differ in what
 * they are scoped to and in nothing else, and two tables would drift about how a role change or a
 * failed sign-in reads — a divergence only a reader who opened both would ever notice.
 *
 * The actor column is shown only where it varies: on `/me` every row is the same person, and a
 * column repeating the reader's own email 50 times is noise wearing the costume of information.
 */
export function AuditEventList({
  query,
  caption,
  showActor,
  emptyMessage,
  emptyFilteredMessage,
}: {
  query: UseInfiniteQueryResult<{ pages: AuditPage[] }>;
  caption: string;
  showActor: boolean;
  emptyMessage: string;
  /**
   * Shown instead of {@link emptyMessage} when a filter is narrowing the view.
   *
   * The two must never collapse into one sentence. "Nothing here yet" and "nothing matches what
   * you asked for" are different facts, and telling a reader the first when the second is true is
   * the defect ADR-0072 met on its first day — absence a reader cannot distinguish from silence.
   * Absent (or undefined) means the screen has no filter, which is the flag-off path.
   */
  emptyFilteredMessage?: string | undefined;
}): React.ReactElement {
  const events = query.data?.pages.flatMap((page) => page.events) ?? [];

  const columns: Column<AuditEvent>[] = [
    {
      header: 'When',
      cell: (event) => (
        <time dateTime={event.occurredAt} className="text-muted-foreground tabular-nums">
          {formatWhen(event.occurredAt)}
        </time>
      ),
    },
    {
      header: 'Event',
      cell: (event) => {
        const { title, detail } = auditEventCopy(event);
        return (
          <div className="flex flex-col">
            <span className="font-medium">{title}</span>
            {detail === null ? null : (
              <span className="text-muted-foreground text-xs">{detail}</span>
            )}
          </div>
        );
      },
    },
    ...(showActor
      ? [
          {
            header: 'By',
            cell: (event: AuditEvent) => (
              <span className="text-muted-foreground">{auditActorName(event)}</span>
            ),
          },
        ]
      : []),
    { header: 'Subject', cell: (event) => auditSubject(event) },
    {
      header: 'Outcome',
      cell: (event) =>
        // SUCCESS is the overwhelming majority and saying so on every row would drown the two
        // outcomes worth noticing. Text, not colour alone (WCAG 1.4.1).
        event.outcome === 'SUCCESS' ? (
          <span className="sr-only">Succeeded</span>
        ) : (
          <span className="text-destructive-text text-xs font-medium">
            {event.outcome === 'DENIED' ? 'Denied' : 'Failed'}
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        caption={caption}
        columns={columns}
        query={{
          isPending: query.isPending,
          isError: query.isError,
          data: events,
          refetch: query.refetch,
        }}
        getRowKey={(event) => event.id}
        loadingLabel="Loading events…"
        errorLabel="Couldn’t load the audit log. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            {emptyFilteredMessage ?? emptyMessage}
          </div>
        }
      />

      {/*
        Rendered whenever a page has loaded, and SHADED rather than removed once there is nothing
        more. Unmounting it on the final press would destroy the element the reader is standing on
        and drop focus to `<body>` — the ADR-0064 finding, caused here by the user's own click.
        `aria-disabled` rather than `disabled`, so it stays focusable and keeps its accessible name
        (the ScopeSaveBar lesson).
      */}
      {events.length > 0 ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            aria-disabled={!query.hasNextPage || query.isFetchingNextPage}
            aria-busy={query.isFetchingNextPage}
            onClick={() => {
              if (!query.hasNextPage || query.isFetchingNextPage) return;
              void query.fetchNextPage();
            }}
          >
            {loadMoreLabel(query)}
          </Button>
        </div>
      ) : null}

      {/* Announced, not merely rendered: a reader who pressed "Load more" has no other signal that
          rows arrived, because the new ones are below the fold by definition (WCAG 4.1.3). */}
      <p aria-live="polite" className="sr-only">
        {query.isPending ? '' : `Showing ${String(events.length)} events`}
      </p>
    </div>
  );
}

/**
 * The reader's own locale, resolved once. Constructing an `Intl.DateTimeFormat` is the expensive
 * part and this list renders 50 rows per page and grows without bound as pages load.
 */
const WHEN_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * An instant in the reader's own locale. Deliberately absolute rather than "3 hours ago": an audit
 * log is consulted to establish when something happened, and a relative label makes two rows
 * impossible to order once they are more than a day apart.
 */
function formatWhen(iso: string): string {
  return WHEN_FORMAT.format(new Date(iso));
}

/** The button's label across its three states. "All events shown" is the shaded reason. */
function loadMoreLabel(query: { hasNextPage: boolean; isFetchingNextPage: boolean }): string {
  if (query.isFetchingNextPage) return 'Loading…';
  return query.hasNextPage ? 'Load more' : 'All events shown';
}
