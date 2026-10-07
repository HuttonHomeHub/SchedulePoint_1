import { useEffect, useRef } from 'react';

import { useActivityHistory } from '../api/use-activity-history';
import type { HistoryFormatContext } from '../lib/format-history-item';

import { ActivityHistoryItem } from './ActivityHistoryItem';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { Spinner } from '@/components/ui/spinner';
import { formatCalendarDate } from '@/lib/format-date';

export interface ActivityHistoryPanelProps {
  orgSlug: string;
  activityId: string;
  /** When the activity was created, used when the server cannot name a later start. */
  activityCreatedAt: string;
  context: HistoryFormatContext;
}

/**
 * The editor's **History** tab (ADR-0174): who changed this activity, its links and its resources,
 * and when, newest first. Read-only for every role — there is nothing here to write — so it takes no
 * gate, and it never says "audit": entries merge, and a change undone inside the window leaves none.
 *
 * States: loading, error (the shared retry shape; focus returns to the heading once a retry
 * succeeds, because the control that held it unmounts), empty, and a list that pages 50 at a time
 * through **Load older**. When the last page arrives that button unmounts too, so focus moves to the
 * end-of-history sentence (ADR-0135); a polite live region announces what arrived.
 */
export function ActivityHistoryPanel({
  orgSlug,
  activityId,
  activityCreatedAt,
  context,
}: ActivityHistoryPanelProps): React.ReactElement {
  const history = useActivityHistory(orgSlug, activityId);
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  const since = history.data?.pages[0]?.recordingSince || activityCreatedAt;
  const sinceSentence = `History recorded since ${formatCalendarDate(since.slice(0, 10))}.`;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  /** Set by a Load older press, so focus is moved only when the reader is the one who asked. */
  const loadedOlder = useRef(false);
  const inFlight = useRef(false);

  // What the last "Load older" added, announced once, into a region that was mounted from the start
  // (an inserted region is commonly not announced).
  const announced = useRef(0);
  useEffect(() => {
    if (!history.data || history.data.pages.length < 2) return;
    const total = entries.length;
    if (total !== announced.current && status.current) {
      status.current.textContent = `${String(total)} entries loaded.`;
    }
    announced.current = total;
  }, [history.data, entries.length]);

  // The button that held focus unmounts with the last page: hand focus to the sentence that replaces it.
  useEffect(() => {
    if (loadedOlder.current && !history.hasNextPage && !history.isFetchingNextPage) {
      loadedOlder.current = false;
      endRef.current?.focus();
    }
  }, [history.hasNextPage, history.isFetchingNextPage]);

  const retry = (): void => {
    void history.refetch().then((result) => {
      if (result.isSuccess) headingRef.current?.focus();
    });
  };

  const settled = !history.isPending && !history.isError;

  return (
    <section className="flex flex-col gap-3 px-6 py-4" aria-labelledby="activity-history-heading">
      <h3 id="activity-history-heading" ref={headingRef} tabIndex={-1} className="text-sm">
        History
      </h3>
      <p ref={status} role="status" aria-live="polite" className="sr-only" />
      {history.isPending ? (
        <div className="py-6">
          <Spinner label="Loading history…" />
        </div>
      ) : history.isError ? (
        <QueryErrorState label="Couldn’t load history. Please try again." onRetry={retry} />
      ) : entries.length === 0 ? (
        <NoticeStrip
          emphasis="dashed"
          messageFit="grow"
          message={`No changes have been recorded for this activity. ${sinceSentence}`}
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry) => (
            <ActivityHistoryItem key={entry.id} entry={entry} context={context} />
          ))}
        </ol>
      )}
      {history.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // A ref as well as the query flag: two presses in one tick both see the flag false.
              if (history.isFetchingNextPage || inFlight.current) return;
              inFlight.current = true;
              loadedOlder.current = true;
              void history.fetchNextPage().finally(() => {
                inFlight.current = false;
              });
            }}
            aria-disabled={history.isFetchingNextPage}
            aria-busy={history.isFetchingNextPage}
            className="aria-disabled:pointer-events-none"
          >
            {history.isFetchingNextPage ? 'Loading…' : 'Load older'}
          </Button>
        </div>
      ) : entries.length > 0 ? (
        <p ref={endRef} tabIndex={-1} className="text-muted-foreground text-sm outline-none">
          {sinceSentence}
        </p>
      ) : null}
      {settled ? (
        <p className="text-muted-foreground text-xs">
          Calculated dates and floats are not listed — only what people changed. Consecutive saves
          by one person are shown as one entry.
        </p>
      ) : null}
    </section>
  );
}
