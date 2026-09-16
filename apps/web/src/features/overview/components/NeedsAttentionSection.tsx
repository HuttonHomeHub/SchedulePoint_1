import type { OverviewAttention } from '@repo/types';
import { Link } from '@tanstack/react-router';

import { ActorName } from './ActorName';
import { SectionCount } from './SectionCount';

import { ListRow, ListRowSkeleton, SectionCard, rowLinkClass } from '@/components/ui/page';

/**
 * "Needs your attention" — the things with somebody or something waiting behind them.
 *
 * **It is not rendered at all for a reader who can hold none of these items** — no heading, no
 * empty box, no shaded placeholder. The gate is at the call site (`OverviewScreen.tsx:127`, on
 * `isWriter`) rather than here, because the decision needs the reader's role and this component is
 * given only the payload. That is ADR-0082's "when every item would be shaded, show no trigger at
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
  fill,
}: {
  attention: OverviewAttention | undefined;
  orgSlug: string;
  pending: boolean;
  /**
   * Fill the height the grid gives and scroll the body — see `SectionCard`.
   *
   * It is a prop rather than always-on because this section renders in TWO places: inside the
   * capped grid, and beneath `OrganisationEmptyState` for an organisation with nothing in it but
   * outstanding invitations. In the second there is no grid row to fill, so `h-full` would resolve
   * against an auto parent and the prop would be a no-op that reads like a decision.
   */
  fill?: boolean;
}): React.ReactElement {
  const locks = attention?.heldLocks ?? [];
  const liveInvitations = attention?.liveInvitationCount;
  const expiredInvitations = attention?.expiredInvitationCount;
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

  // **Two rows, because they are two different actions.** A live invitation is waiting on the
  // person you sent it to; an expired one is waiting on YOU, and chasing it achieves nothing
  // because `accept()` refuses it. Summed into "N invitations are still pending" — which is what
  // this said — the reader is told to chase somebody who could not accept if they wanted to.
  //
  // `undefined` is tested explicitly, never falsiness: `0` is a fact about the organisation and
  // `undefined` is a fact about the reader, and `!count` collapses them (this component's own
  // docblock, above).
  if (liveInvitations !== undefined && liveInvitations > 0) {
    items.push(
      <ListRow
        key="invitations-live"
        primary={
          <>
            <Link to="/orgs/$orgSlug/members" params={{ orgSlug }} className={rowLinkClass}>
              {liveInvitations === 1
                ? '1 invitation is waiting to be accepted'
                : `${liveInvitations} invitations are waiting to be accepted`}
            </Link>
            <p className="text-muted-foreground text-sm">Review them on Members.</p>
          </>
        }
      />,
    );
  }

  if (expiredInvitations !== undefined && expiredInvitations > 0) {
    items.push(
      <ListRow
        key="invitations-expired"
        primary={
          <>
            <Link to="/orgs/$orgSlug/members" params={{ orgSlug }} className={rowLinkClass}>
              {expiredInvitations === 1
                ? '1 invitation has expired'
                : `${expiredInvitations} invitations have expired`}
            </Link>
            <p className="text-muted-foreground text-sm">
              {expiredInvitations === 1
                ? 'It can no longer be accepted. Send it again from Members.'
                : 'They can no longer be accepted. Send them again from Members.'}
            </p>
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
    <SectionCard
      title="Needs your attention"
      fill={fill}
      // "items" rather than a kind, because this box is the one that genuinely mixes them: held
      // locks, invitations and expiring deletions are three different things and no noun covers
      // all three. Withheld while pending and when there is nothing — "0 items" beside "Nothing
      // needs you right now." says the same thing twice, in a worse register.
      action={
        pending || items.length === 0 ? null : <SectionCount count={items.length} noun="item" />
      }
    >
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
