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
  freeReadOnly: 'No one is editing this plan.',
  expired: (holder: PlanEditLockActor | null): string =>
    holder ? `${firstName(holder)} was editing (inactive).` : 'No one is editing this plan.',
  holding: 'You’re editing this plan.',
  incomingRequest: (requester: PlanEditLockActor): string =>
    `${firstName(requester)} is asking to edit this plan.`,
  heldByOther: (holder: PlanEditLockActor, heartbeatAt: string | null, now?: number): string => {
    const active = heartbeatAt ? ` (active ${relativeTime(heartbeatAt, now)})` : '';
    return `${firstName(holder)} is editing this plan${active}.`;
  },
  waitingForHandover: (holder: PlanEditLockActor): string =>
    `Requested — waiting for ${firstName(holder)} to hand over.`,
  canTakeOver: (holder: PlanEditLockActor): string =>
    `${firstName(holder)} hasn’t responded. You can take over.`,
  adminNote: 'As an admin, you can take over editing.',
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
  // Take-over confirm dialog.
  takeOverTitle: 'Take over editing?',
  takeOverBody: (holder: PlanEditLockActor): string =>
    `${firstName(holder)} is currently editing. Taking over will make the plan read-only for them. Any change they haven’t saved stays as it was.`,
} as const;
