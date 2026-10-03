import { useEffect, useRef } from 'react';

import { useActivityHistory } from '../api/use-activity-history';
import type { HistoryFormatContext } from '../lib/format-history-item';

import { ActivityHistoryEntry } from './ActivityHistoryEntry';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { Spinner } from '@/components/ui/spinner';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * The editor's **History** tab (ADR-0174): who changed this activity, its links and its resources,
 * and when, newest first. Read-only for every role — there is nothing here to write — so it takes no
 * gate, and it never says "audit": entries merge, and a change undone inside the window leaves none.
 *
 * States: loading, error (with Retry; the rest of the editor is unaffected), empty (says since when
 * recording began), and a list that pages 50 at a time through **Load older**, which keeps focus on
 * the control and announces what arrived through a polite live region.
 */
export function ActivityHistoryPanel({
  orgSlug,
  activityId,
  activityCreatedAt,
  context,
}: {
  orgSlug: string;
  activityId: string;
  /** When the activity was created, for the empty state when the server cannot name a later start. */
  activityCreatedAt: string;
  context: HistoryFormatContext;
}): React.ReactElement {
  const history = useActivityHistory(orgSlug, activityId);
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  const since = history.data?.pages[0]?.recordingSince || activityCreatedAt;

  // What the last "Load older" added, announced once. Held in a ref so an unrelated re-render does
  // not repeat it, and rendered into a region that is mounted from the start (an inserted region is
  // commonly not announced).
  const announced = useRef(0);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!history.data || history.data.pages.length < 2) return;
    const total = entries.length;
    if (total !== announced.current && status.current) {
      status.current.textContent = `${String(total)} entries loaded.`;
    }
    announced.current = total;
  }, [history.data, entries.length]);

  return (
    <section className="flex flex-col gap-3 px-6 py-4" aria-labelledby="activity-history-heading">
      <h3 id="activity-history-heading" className="text-sm">
        History
      </h3>
      <p ref={status} role="status" aria-live="polite" className="sr-only" />
      {history.isPending ? (
        <div className="py-6">
          <Spinner label="Loading history…" />
        </div>
      ) : history.isError ? (
        <div
          role="alert"
          className="border-destructive-text/40 text-destructive-text flex flex-col items-start gap-2 rounded-lg border p-4 text-sm"
        >
          Couldn’t load history.
          <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
            Retry
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <NoticeStrip
          emphasis="dashed"
          message={`No changes recorded since history began on ${formatCalendarDate(since.slice(0, 10))}.`}
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => (
            <ActivityHistoryEntry key={entry.id} entry={entry} context={context} />
          ))}
        </ol>
      )}
      {history.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void history.fetchNextPage()}
            aria-disabled={history.isFetchingNextPage}
            aria-busy={history.isFetchingNextPage}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            {history.isFetchingNextPage ? 'Loading…' : 'Load older'}
          </Button>
        </div>
      ) : entries.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          Start of recorded history, from {formatCalendarDate(since.slice(0, 10))}.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Calculated dates and floats are not listed — only what people changed. Consecutive saves by
        one person are shown as one entry.
      </p>
    </section>
  );
}
