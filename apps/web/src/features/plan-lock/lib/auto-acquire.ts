import type { PlanEditLockStatus } from '@repo/types';

/**
 * When the app takes the pen on a planner's behalf (ADR-0220). Pure, like `plan-lock.policy.ts` on
 * the server, so the whole truth table is one unit test.
 *
 * Both decisions read only the server's `state` and `canAcquire`, never a role (ADR-0028: the client
 * never re-derives lock policy), and **neither can ever yield a take-over** — a take-over is a
 * person's act, so the hook that acts on these sends `{ takeover: false }` and nothing else.
 */

/** The two states in which nobody holds a live lease. */
function isFree(status: PlanEditLockStatus | undefined): status is PlanEditLockStatus {
  return status?.state === 'FREE' || status?.state === 'EXPIRED';
}

export interface AutoAcquireInput {
  /** The status as read for this opening, or `undefined` while it is still loading. */
  status: PlanEditLockStatus | undefined;
  /** The tab is in the foreground — a plan opened in a background tab waits until first shown. */
  visible: boolean;
  /** The person let go of the pen (Stop, hand-over, lost to a peer) during this opening. */
  declined: boolean;
  /** This opening has already taken its one decision. */
  autoAttempted: boolean;
}

/** Take the pen when the plan opens and nobody holds it. */
export function shouldAutoAcquire({
  status,
  visible,
  declined,
  autoAttempted,
}: AutoAcquireInput): boolean {
  if (!isFree(status) || !status.canAcquire) return false;
  return visible && !declined && !autoAttempted;
}

export interface RetakeInput {
  /** The status read after the heartbeat was refused. */
  status: PlanEditLockStatus | undefined;
  /** This loss has already been answered with one silent retake. */
  retakenForThisLoss: boolean;
}

/**
 * Take the pen back after a heartbeat said the lease was gone, when the refetched status shows nobody
 * holds it: the lease was released by this person's own other tab or by a reload, not taken by anyone.
 */
export function shouldRetakeAfterLoss({ status, retakenForThisLoss }: RetakeInput): boolean {
  if (!isFree(status) || !status.canAcquire) return false;
  return !retakenForThisLoss;
}
