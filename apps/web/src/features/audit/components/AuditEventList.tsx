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
}: {
  query: UseInfiniteQueryResult<{ pages: AuditPage[] }>;
  caption: string;
  showActor: boolean;
  emptyMessage: string;
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
            {emptyMessage}
          </div>
        }
      />

      {query.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            aria-busy={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
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
 * An instant in the reader's own locale. Deliberately absolute rather than "3 hours ago": an audit
 * log is consulted to establish when something happened, and a relative label makes two rows
 * impossible to order once they are more than a day apart.
 */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
