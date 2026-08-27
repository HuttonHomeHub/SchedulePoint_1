import type { PlanEditLockReason, PlanEditLockStatus } from '@repo/types';

import { firstName, lockCopy } from './lock-copy';

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
  /**
   * The holder's first name, for the compact badge — `Locked · Alexandra`.
   *
   * **Only ever set on the `locked` tone**, and that is a rule rather than an accident of which
   * branches happen to have a holder. The badge vocabulary is four words for ten states, so the
   * name is the one thing the compact form can add; but on `editing` the actor in scope is a
   * REQUESTER, not the editor, so `Editing · Alexandra` would tell the reader that Alexandra is
   * editing when in fact the reader is, and Alexandra is asking. `lost` has no actor at all.
   *
   * It is a summary BESIDE the live-region sentence, never a replacement for it: `Locked` alone
   * covers four states that differ in what the reader can do next (override / take over / waiting /
   * expired), and only the sentence separates them.
   */
  badgeName?: string;
  message: string;
  /**
   * Keep {@link message} **painted**, not merely announced.
   *
   * The foot-row epic made the sentence `sr-only` and moved its fact onto the badge as
   * `Locked · Alexandra` — which works for the five `locked` branches and for the two steady
   * states, and does **not** work for two states where the badge is structurally incapable of
   * carrying the fact:
   *
   * - **`lost`** — the pen was taken from the reader mid-edit, with no gesture of theirs. The badge
   *   flips to `Read-only` and there is no actor to name, so a sighted planner would be left with a
   *   changed badge and a bare `Dismiss` button and nothing saying what happened. This is the
   *   single transition ADR-0028 exists for.
   * - **`editing` with an incoming request** — the badge says `Editing`, correctly, because the
   *   reader IS editing; the actor in scope is the person ASKING. `Hand over` and `Keep editing`
   *   would appear with nothing naming who is asking, and {@link badgeName} deliberately never
   *   fires on this tone for exactly the reason that would make it wrong here.
   *
   * Found by the architecture gate, which noticed that D4's accounting covered the `locked` tone
   * and neither of these. The width cost is real and is paid only in two rare, consequential
   * states — which is the opposite trade from paying it in the common one.
   */
  messageVisible?: boolean;
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
      messageVisible: true,
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
          messageVisible: true,
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
          badgeName: firstName(holder),
          message: `${lockCopy.heldByOther(holder)} ${lockCopy.adminNote}`,
          ...(activeAside ? { aside: activeAside } : {}),
          actions: ['override'],
        };
      }
      if (status.canTakeOver) {
        return {
          tone: 'locked',
          badge: lockCopy.badgeLocked,
          badgeName: firstName(holder),
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
            badgeName: firstName(holder),
            message: lockCopy.waitingForHandover(holder),
            ...(countdown ? { aside: countdown } : {}),
            actions: ['waiting'],
          };
        }
        return {
          tone: 'locked',
          badge: lockCopy.badgeLocked,
          badgeName: firstName(holder),
          message: lockCopy.heldByOther(holder),
          ...(activeAside ? { aside: activeAside } : {}),
          actions: ['request'],
        };
      }
      // Viewer / Contributor — read-only, just informed who holds the pen.
      return {
        tone: 'locked',
        badge: lockCopy.badgeLocked,
        badgeName: firstName(holder),
        message: lockCopy.heldByOther(holder),
        ...(activeAside ? { aside: activeAside } : {}),
        actions: [],
      };
    }
    default:
      return null;
  }
}
