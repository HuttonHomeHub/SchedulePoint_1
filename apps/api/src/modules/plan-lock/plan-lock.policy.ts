import type { PlanEditLockState } from '@repo/types';

/**
 * Pure edit-lock state machine + timing policy (ADR-0028). Kept free of Nest,
 * Prisma, and HTTP so the transitions are exhaustively unit-testable with a fixed
 * `now`. The service reads the row under the plan advisory lock and drives these
 * helpers to decide what to write; the controller/DTO project the result.
 *
 * The timings are **server config** (never client input — a client cannot request
 * a longer lease or a shorter grace). They are module constants for v1; promote to
 * env-validated config if they ever need per-deployment tuning.
 */

/** Lease time-to-live: how long a lock survives after its last heartbeat. */
export const LOCK_TTL_MS = 120_000;
/** Client heartbeat cadence (advisory to the client; the server enforces the TTL). */
export const LOCK_HEARTBEAT_MS = 30_000;
/**
 * A live holder is "inactive" once their last heartbeat is older than this (≈ 3
 * missed beats) — a peer may then take over WITHOUT waiting out the grace window.
 * Deliberately < {@link LOCK_TTL_MS}, so there is a window where the lease is still
 * live but the holder is presumed away.
 */
export const LOCK_INACTIVE_AFTER_MS = 90_000;
/**
 * How long a peer's request-control must age before they may take over a still-active
 * holder (the graceful hand-off grace window, Q-A).
 */
export const LOCK_HANDOFF_GRACE_MS = 45_000;

/** The lock-row fields the policy reasons over (a structural subset of the Prisma row). */
export interface LockRowView {
  holderUserId: string;
  heartbeatAt: Date;
  expiresAt: Date;
  requestedByUserId: string | null;
  requestedAt: Date | null;
}

/** The caller's relevant lock permissions in the plan's organisation. */
export interface LockPermissions {
  acquire: boolean;
  request: boolean;
  override: boolean;
}

/** Derive the lock state as seen by `myUserId`. A null row (or expired lease) is free. */
export function deriveLockState(
  row: LockRowView | null,
  now: Date,
  myUserId: string,
): PlanEditLockState {
  if (!row) return 'FREE';
  if (row.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return row.holderUserId === myUserId ? 'HELD_BY_ME' : 'HELD_BY_OTHER';
}

/** True when a live holder has missed enough heartbeats to be presumed away. */
export function isHolderInactive(row: LockRowView, now: Date): boolean {
  return now.getTime() - row.heartbeatAt.getTime() > LOCK_INACTIVE_AFTER_MS;
}

/** True when a pending request has aged past the grace window. */
export function isGraceElapsed(row: LockRowView, now: Date): boolean {
  if (!row.requestedAt) return false;
  return now.getTime() - row.requestedAt.getTime() >= LOCK_HANDOFF_GRACE_MS;
}

/** When a pending request's grace window elapses (advisory countdown for the client). */
export function graceEndsAt(row: LockRowView | null): Date | null {
  if (!row?.requestedAt) return null;
  return new Date(row.requestedAt.getTime() + LOCK_HANDOFF_GRACE_MS);
}

/**
 * Whether `myUserId` may take over a live lock *right now* — the single
 * server-authoritative rule shared by `status` (to light the button) and `acquire`
 * (to permit the write). An override holder takes over immediately; a request-control
 * holder needs the holder inactive, or their own pending request past grace.
 */
export function canTakeOverNow(
  row: LockRowView,
  now: Date,
  myUserId: string,
  perms: LockPermissions,
): boolean {
  if (perms.override) return true;
  if (!perms.request) return false;
  return (
    isHolderInactive(row, now) || (row.requestedByUserId === myUserId && isGraceElapsed(row, now))
  );
}

/** The capability flags the client uses to render affordances (never re-derives policy). */
export interface LockCapabilities {
  canAcquire: boolean;
  canRequest: boolean;
  canTakeOver: boolean;
  canOverride: boolean;
}

/** Resolve the capability flags for `myUserId` from the derived state + permissions. */
export function computeCapabilities(
  state: PlanEditLockState,
  row: LockRowView | null,
  now: Date,
  myUserId: string,
  perms: LockPermissions,
): LockCapabilities {
  const heldByOther = state === 'HELD_BY_OTHER';
  return {
    canAcquire: (state === 'FREE' || state === 'EXPIRED') && perms.acquire,
    canRequest: heldByOther && perms.request,
    canTakeOver: heldByOther && row !== null && canTakeOverNow(row, now, myUserId, perms),
    canOverride: heldByOther && perms.override,
  };
}
