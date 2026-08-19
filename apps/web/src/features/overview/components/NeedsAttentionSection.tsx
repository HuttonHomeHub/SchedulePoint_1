import type { OverviewAttention } from '@repo/types';
import { Link } from '@tanstack/react-router';

import { ActorName } from './ActorName';

import { ListRow, ListRowSkeleton, SectionCard, rowLinkClass } from '@/components/ui/page';

/**
 * "Needs your attention" — the things with somebody or something waiting behind them.
 *
 * **It returns `null` for a reader who can hold none of these items** — no heading, no empty box,
 * no shaded placeholder. That is ADR-0082's "when every item would be shaded, show no trigger at
 * all", applied one level up at section granularity: a Viewer cannot take the pen, cannot invite,
 * and cannot restore, so a section addressed to them personally would be a permanently empty frame
 * on the first screen after every sign-in.
 *
 * **The empty case for a reader who CAN hold them is a settled sentence, not an `EmptyState`.**
 * "Nothing needs you right now." is a good outcome — a fact about today — and dressing it in an
 * icon, a frame and a call to action would present it as a problem to be resolved. That distinction
 * is written into `EmptyState`'s own docblock as the thing it must not be used for.
 *
 * The two counts are **absent rather than zero** when the reader may not see them, which is the
 * shape the endpoint sends deliberately: a zero is a fact about the organisation, an absence is a
 * fact about the reader. This component must therefore test for `undefined`, never for falsiness —
 * `0` and "not for you" are different, and `!count` collapses them.
 */
export function NeedsAttentionSection({
  attention,
  orgSlug,
  pending,
}: {
  attention: OverviewAttention | undefined;
  orgSlug: string;
  pending: boolean;
}): React.ReactElement {
  const locks = attention?.heldLocks ?? [];
  const invitations = attention?.pendingInvitationCount;
  const expiring = attention?.expiringDeletedCount;

  const items: React.ReactNode[] = [];

  for (const lock of locks) {
    items.push(
      <ListRow
        key={`lock-${lock.planId}`}
        primary={
          <>
            <Link
              to="/orgs/$orgSlug/plans/$planId"
              params={{ orgSlug, planId: lock.planId }}
              className={rowLinkClass}
            >
              {lock.planName}
            </Link>
            <p className="text-muted-foreground text-sm">
              {lock.requestedBy === null ? (
                'You are holding the editing lock.'
              ) : (
                <>
                  <ActorName actor={lock.requestedBy} /> has asked for control.
                </>
              )}
            </p>
          </>
        }
      />,
    );
  }

  if (invitations !== undefined && invitations > 0) {
    items.push(
      <ListRow
        key="invitations"
        primary={
          <>
            <Link to="/orgs/$orgSlug/members" params={{ orgSlug }} className={rowLinkClass}>
              {invitations === 1
                ? '1 invitation is still pending'
                : `${invitations} invitations are still pending`}
            </Link>
            <p className="text-muted-foreground text-sm">Review them on Members.</p>
          </>
        }
      />,
    );
  }

  if (expiring !== undefined && expiring > 0) {
    items.push(
      <ListRow
        key="expiring"
        primary={
          <>
            <Link
              to="/orgs/$orgSlug/recently-deleted"
              params={{ orgSlug }}
              className={rowLinkClass}
            >
              {expiring === 1
                ? '1 deleted item is about to be removed for good'
                : `${expiring} deleted items are about to be removed for good`}
            </Link>
            <p className="text-muted-foreground text-sm">Restore anything you still need.</p>
          </>
        }
      />,
    );
  }

  return (
    <SectionCard title="Needs your attention">
      {pending ? (
        <ListRowSkeleton rows={2} />
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing needs you right now.</p>
      ) : (
        <div>{items}</div>
      )}
    </SectionCard>
  );
}
