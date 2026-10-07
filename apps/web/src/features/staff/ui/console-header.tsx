import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page';
import { textLinkVariants } from '@/components/ui/text-link';
import type { Freshness } from '@/features/staff/model/freshness';
import { HEADER } from '@/features/staff/model/panel-copy';
import { useNow } from '@/hooks/use-now';
import { exactInstant, formatRelative } from '@/lib/relative-time';

/** Same locale as `formatTimestamp`, so the header and the tables below it read alike (D-9). */
const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export interface ConsoleHeaderProps {
  email: string;
  freshness: Freshness;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * The title, the way back, and the answer to "how old is this?" with the means to make it newer.
 *
 * **The time is the oldest of the page's reads** (`freshnessOf`), and the sentence beside the button
 * states the audit cost: every Refresh is six audited reads in a table that refuses `DELETE`, which
 * is the same cost as reloading the page and which the reader is entitled to know before pressing.
 * The button never leaves and keeps focus; while a refresh runs it is shaded and its handler
 * refuses, so a second press cannot make twelve reads (ADR-0082).
 *
 * `id="staff-top"` is the target of each group's *Back to top*, and takes focus so that link moves a
 * keyboard reader as well as the viewport.
 */
export function ConsoleHeader({
  email,
  freshness,
  refreshing,
  onRefresh,
}: ConsoleHeaderProps): React.ReactElement {
  const now = useNow();
  const { readAt, unreadable } = freshness;

  return (
    <div
      id="staff-top"
      tabIndex={-1}
      className="focus-visible:ring-ring space-y-3 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
    >
      <PageHeader
        title="Staff console"
        description={HEADER.description(email)}
        actions={
          // A plain `<a>`, not a router link: `/staff` is outside the `_authed` shell and a staff
          // account need not belong to anything, so the destination is the app's front door.
          <a className={textLinkVariants({ size: 'sm' })} href="/">
            Back to SchedulePoint
          </a>
        }
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {readAt === null ? null : (
          <p className="text-sm">
            Read at{' '}
            <time dateTime={readAt.toISOString()} title={exactInstant(readAt)}>
              {CLOCK.format(readAt)}
            </time>{' '}
            ({formatRelative(readAt, now)})
            {unreadable === 0 ? null : ` · ${HEADER.unreadable(unreadable)}`}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          aria-disabled={refreshing}
          aria-busy={refreshing}
          onClick={() => {
            // The guard the shading promises: `aria-disabled` stops no click.
            if (refreshing) return;
            onRefresh();
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
        <p className="text-muted-foreground text-sm">{HEADER.refreshNote}</p>
      </div>
    </div>
  );
}
