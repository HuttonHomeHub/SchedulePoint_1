import type { PlanEditLockReason, PlanEditLockStatus } from '@repo/types';

import { lockCopy } from './lock-copy';

/** A control the banner offers, in render order. Each maps to one `PlanPen` intent. */
export type LockAction =
  | 'start' // Start editing (acquire)
  | 'stop' // Stop editing (release)
  | 'request' // Request control (peer)
  | 'waiting' // "Take over now" shown disabled while my request waits out grace
  | 'takeover' // Take over now (peer, post-grace / holder inactive)
  | 'override' // Take over (admin, immediate — via confirm)
  | 'handover' // Hand the pen to the pending requester
  | 'keep' // Keep editing (locally dismiss the incoming-request prompt)
  | 'dismiss'; // Dismiss the lost-control banner

export type LockTone = 'neutral' | 'editing' | 'locked' | 'lost';

/** The banner's render descriptor — a pure function of status + local flags. */
export interface LockView {
  tone: LockTone;
  badge: string;
  message: string;
  /** Supplementary text rendered **aria-hidden** (the "active …" relative time, or
   *  the row-6 grace countdown) so its frequent updates never re-announce the banner. */
  aside?: string;
  actions: readonly LockAction[];
}

/**
 * Resolve the banner view from the lock status and the two local flags. Pure and
 * exhaustively unit-testable — every control's presence is keyed on a **server**
 * capability flag (`canAcquire`/`canRequest`/`canTakeOver`/`canOverride`), never a
 * re-derived rule (ADR-0028: the client never re-derives lock policy). Returns
 * `null` while status is loading (render nothing — no flicker).
 *
 * @param lostControl a just-received 423 reason (overrides all — row 10)
 * @param currentUserId to tell "my pending request" (row 6) from someone else's (row 5)
 * @param dismissedRequestId a requester id the holder chose to "Keep editing" past
 * @param now injectable clock for the relative "active …" phrase (tests)
 */
export function resolveLockView(
  status: PlanEditLockStatus | undefined,
  lostControl: PlanEditLockReason | null,
  currentUserId: string | undefined,
  dismissedRequestId: string | null,
  now?: number,
): LockView | null {
  if (lostControl) {
    return {
      tone: 'lost',
      badge: lockCopy.badgeReadOnly,
      message: lockCopy.lost(lostControl),
      actions: ['dismiss'],
    };
  }
  if (!status) return null;

  switch (status.state) {
    case 'FREE':
      return {
        // "Available" (not "Read-only") when the caller can take the pen, so the
        // badge invites the adjacent "Start editing" CTA instead of contradicting it.
        tone: 'neutral',
        badge: status.canAcquire ? lockCopy.badgeAvailable : lockCopy.badgeReadOnly,
        message: lockCopy.free,
        actions: status.canAcquire ? ['start'] : [],
      };
    case 'EXPIRED':
      return {
        tone: 'neutral',
        badge: status.canAcquire ? lockCopy.badgeAvailable : lockCopy.badgeReadOnly,
        message: lockCopy.expired(status.holder),
        actions: status.canAcquire ? ['start'] : [],
      };
    case 'HELD_BY_ME': {
      const pendingOther =
        status.requestedBy && status.requestedBy.id !== dismissedRequestId
          ? status.requestedBy
          : null;
      if (pendingOther) {
        return {
          tone: 'editing',
          badge: lockCopy.badgeEditing,
          message: lockCopy.incomingRequest(pendingOther),
          actions: ['handover', 'keep'],
        };
      }
      return {
        tone: 'editing',
        badge: lockCopy.badgeEditing,
        message: lockCopy.holding,
        actions: ['stop'],
      };
    }
    case 'HELD_BY_OTHER': {
      const holder = status.holder;
      // Defensive: HELD_BY_OTHER always carries a holder, but never crash if not.
      if (!holder) {
        return { tone: 'locked', badge: lockCopy.badgeLocked, message: lockCopy.free, actions: [] };
      }
      const activeAside = lockCopy.activeAside(status.heartbeatAt, now) ?? undefined;
      if (status.canOverride) {
        return {
          tone: 'locked',
          badge: lockCopy.badgeLocked,
          message: `${lockCopy.heldByOther(holder)} ${lockCopy.adminNote}`,
          ...(activeAside ? { aside: activeAside } : {}),
          actions: ['override'],
        };
      }
      if (status.canTakeOver) {
        return {
          tone: 'locked',
          badge: lockCopy.badgeLocked,
          message: lockCopy.canTakeOver(holder),
          actions: ['takeover'],
        };
      }
      if (status.canRequest) {
        const mine = status.requestedBy?.id === currentUserId && currentUserId !== undefined;
        if (mine) {
          const countdown = lockCopy.graceCountdown(status.graceEndsAt, now) ?? undefined;
          return {
            tone: 'locked',
            badge: lockCopy.badgeLocked,
            message: lockCopy.waitingForHandover(holder),
            ...(countdown ? { aside: countdown } : {}),
            actions: ['waiting'],
          };
        }
        return {
          tone: 'locked',
          badge: lockCopy.badgeLocked,
          message: lockCopy.heldByOther(holder),
          ...(activeAside ? { aside: activeAside } : {}),
          actions: ['request'],
        };
      }
      // Viewer / Contributor — read-only, just informed who holds the pen.
      return {
        tone: 'locked',
        badge: lockCopy.badgeLocked,
        message: lockCopy.heldByOther(holder),
        ...(activeAside ? { aside: activeAside } : {}),
        actions: [],
      };
    }
    default:
      return null;
  }
}
