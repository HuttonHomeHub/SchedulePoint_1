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

/** What every tone carries. Split out so the union below states only what differs. */
interface LockViewCommon {
  badge: string;
  message: string;
  /** Supplementary text rendered **aria-hidden** (the "active …" relative time, or
   *  the row-6 grace countdown) so its frequent updates never re-announce the banner. */
  aside?: string;
  actions: readonly LockAction[];
}

/**
 * The banner's render descriptor — a pure function of status + local flags.
 *
 * **A discriminated union on `tone`, so two rules the unit cases used to hold are held by the
 * compiler instead** (`docs/TECH_DEBT.md` #202(d)). `badgeName` may appear only on `locked`;
 * `messageVisible` only on `lost` (where it is mandatory) and on `editing` (where it marks the
 * incoming-request branch). Both rules were true, tested and entirely conventional: a flat
 * interface with two optional fields cannot say that `{ tone: 'editing', badgeName: 'Alexandra' }`
 * is meaningless, and that shape is not a hypothetical — the docblocks below record why it would
 * be actively WRONG, which is the strongest argument for making it unwritable.
 *
 * The other members declare each field as `?: undefined` rather than omitting it. That is
 * deliberate: it keeps `view.badgeName` readable at a consumer without narrowing first (there is
 * one, `CompactPenStatus`), while still rejecting a producer that sets it on the wrong tone. The
 * alternative — omitting the key — would make every read a type error and push the union's cost
 * onto the call sites, which is the opposite of what it is for.
 *
 * `messageVisible` itself exists because the foot-row epic made the sentence `sr-only` and moved
 * its fact onto the badge as `Locked · Alexandra` — which works for the five `locked` branches and
 * for the two steady states, and cannot work for the two branches that carry it. Found by the
 * ADR-0114 architecture gate, which noticed that D4's accounting covered the `locked` tone and
 * neither of these. The width cost is real and is paid only in two rare, consequential states,
 * which is the opposite trade from paying it in the common one.
 */
export type LockView =
  | (LockViewCommon & { tone: 'neutral'; badgeName?: undefined; messageVisible?: undefined })
  | (LockViewCommon & {
      tone: 'editing';
      badgeName?: undefined;
      /**
       * `true` on the incoming-request branch only.
       *
       * The badge says `Editing`, correctly, because the reader IS editing — the actor in scope is
       * the person ASKING. `Hand over` and `Keep editing` would otherwise appear with nothing
       * naming who is asking, and {@link LockView.badgeName} deliberately never fires on this tone
       * for exactly the reason that would make it wrong here.
       */
      messageVisible?: true;
    })
  | (LockViewCommon & {
      tone: 'locked';
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
       * covers four states that differ in what the reader can do next (override / take over /
       * waiting / expired), and only the sentence separates them.
       *
       * Optional on this tone, not required: the defensive no-holder branch has no name to give.
       */
      badgeName?: string;
      messageVisible?: undefined;
    })
  | (LockViewCommon & {
      tone: 'lost';
      badgeName?: undefined;
      /**
       * **Mandatory here.** The pen was taken from the reader mid-edit, with no gesture of theirs;
       * the badge flips to `Read-only` and there is no actor to name, so a sighted planner would
       * otherwise be left with a changed badge, a bare `Dismiss` button and nothing saying what
       * happened. This is the single transition ADR-0028 exists for, and the one state where the
       * badge is structurally incapable of carrying the fact.
       */
      messageVisible: true;
    });

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
