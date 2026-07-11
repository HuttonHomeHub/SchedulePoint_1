import type { PlanEditLockActor, PlanEditLockReason } from '@repo/types';

/**
 * Centralised, reviewed copy for the edit-lock banner (UX_STANDARDS: copy is a
 * reviewed artefact, not scattered literals). Keeping it here lets the ux-reviewer
 * audit every string in one place and the component stay a pure renderer.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * A short, human "active {relative}" phrase for a holder's last heartbeat — "just
 * now", "2 min ago", "1 hr ago". `now` is injectable for deterministic tests. Kept
 * coarse (no seconds) so the polite live region isn't spammed with ticking numbers.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const deltaMs = Math.max(0, now - new Date(iso).getTime());
  if (deltaMs < MINUTE) return 'just now';
  if (deltaMs < HOUR) {
    const mins = Math.floor(deltaMs / MINUTE);
    return `${mins} min ago`;
  }
  const hrs = Math.floor(deltaMs / HOUR);
  return `${hrs} hr ago`;
}

/** First name (or the whole name) for friendlier inline copy. */
function firstName(actor: PlanEditLockActor): string {
  return actor.name.trim().split(/\s+/)[0] || actor.name;
}

export const lockCopy = {
  free: 'No one is editing this plan.',
  loading: 'Checking who’s editing this plan…',
  expired: (holder: PlanEditLockActor | null): string =>
    holder ? `${firstName(holder)} was editing (inactive).` : 'No one is editing this plan.',
  holding: 'You’re editing this plan.',
  incomingRequest: (requester: PlanEditLockActor): string =>
    `${firstName(requester)} is asking to edit this plan.`,
  heldByOther: (holder: PlanEditLockActor): string => `${firstName(holder)} is editing this plan.`,
  /**
   * Supplementary "(active {relative})" shown as an **aria-hidden** aside so a
   * poll flipping the minute bucket doesn't re-announce the whole banner. Null
   * when there's no heartbeat to describe.
   */
  activeAside: (heartbeatAt: string | null, now?: number): string | null =>
    heartbeatAt ? `active ${relativeTime(heartbeatAt, now)}` : null,
  /**
   * The advisory grace countdown for the "waiting" row (design §6) — **aria-hidden**
   * so it never spams the live region; the transition to "you can take over" is
   * announced by the banner re-rendering. Null once elapsed / when unknown.
   */
  graceCountdown: (graceEndsAt: string | null, now: number = Date.now()): string | null => {
    if (!graceEndsAt) return null;
    const secs = Math.ceil((new Date(graceEndsAt).getTime() - now) / 1000);
    return secs > 0 ? `~${secs}s` : null;
  },
  waitingForHandover: (holder: PlanEditLockActor): string =>
    `Requested — waiting for ${firstName(holder)} to hand over.`,
  // Covers both take-over paths (grace elapsed after a request, or holder inactive),
  // so the copy never over-claims "hasn't responded" when no request was made.
  canTakeOver: (holder: PlanEditLockActor): string =>
    `You can take over editing from ${firstName(holder)}.`,
  adminNote: 'As an admin, you can take over editing.',
  /** Shown at the Activities / Logic-diagram sections when the pen is held elsewhere. */
  scheduleReadOnlyHint: 'Read-only — use “Start editing” at the top of Schedule to make changes.',
  /** Distinct from the 409 "changed elsewhere — refresh" copy (ADR-0028). */
  lost: (reason: PlanEditLockReason): string =>
    reason === 'PLAN_EDIT_LOCK_LOST'
      ? 'Editing control was taken over — you’re now read-only.'
      : 'You’re not the current editor — take the pen to edit.',
  // Control labels.
  startEditing: 'Start editing',
  stopEditing: 'Stop editing',
  requestControl: 'Request control',
  takeOverNow: 'Take over now',
  takeOver: 'Take over',
  handOver: 'Hand over',
  keepEditing: 'Keep editing',
  dismiss: 'Dismiss',
  // Badges (text carries the state — never colour alone, WCAG 1.4.1).
  badgeEditing: 'Editing',
  badgeLocked: 'Locked',
  badgeReadOnly: 'Read-only',
  /** Free + the caller may take the pen — invites the "Start editing" CTA rather than reading as a wall. */
  badgeAvailable: 'Available',
  // Take-over confirm dialog.
  takeOverTitle: 'Take over editing?',
  takeOverBody: (holder: PlanEditLockActor): string =>
    `${firstName(holder)} is currently editing. Taking over will make the plan read-only for them. Any change they haven’t saved stays as it was.`,
} as const;
