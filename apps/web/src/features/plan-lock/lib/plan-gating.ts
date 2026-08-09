import type { PlanEditLockActor } from '@repo/types';

import { penReason } from './pen-reason';

/**
 * The plan-detail schedule-editing gate (ADR-0028). Composes the caller's role
 * capabilities with the edit-lock "pen" into the four booleans the route uses to
 * gate its schedule affordances. Pure so the matrix is testable without mounting
 * the screen (the route wires the inputs from `useOrgRole` + `usePlanPen`).
 *
 * The rule: on-canvas schedule editing (activities / dependencies / positions /
 * recalculate) requires **both** the role capability **and** holding the pen —
 * but only when the pen layer is active. With the pen off (`VITE_PLAN_EDIT_LOCK`
 * unset) gating falls back to role alone — today's behaviour, byte-for-byte. The
 * Contributor **progress** path is never pen-gated (Q-C).
 */
export interface PlanGatingInput {
  /** Is the pen layer active at all (`pen.penManaged`). */
  penManaged: boolean;
  /** Does the caller currently hold the pen (`pen.holdsPen`). */
  holdsPen: boolean;
  /** Role: may manage the hierarchy (plan metadata + baselines). */
  canWrite: boolean;
  /** Role: may report progress (Contributor path) — never pen-gated. */
  canProgress: boolean;
  /** Role: may recalculate the schedule. */
  canCalculate: boolean;
}

export interface PlanGating {
  /** May edit the schedule model (activities/dependencies/positions) — pen-gated. */
  canEditSchedule: boolean;
  /** May trigger a recalculate — pen-gated. */
  canRecalc: boolean;
  /** May report progress — role only, never pen-gated. */
  canProgress: boolean;
  /** A would-be editor (role allows it) who doesn't hold the pen — show the read-only hint. */
  penReadOnly: boolean;
}

export function derivePlanGating(input: PlanGatingInput): PlanGating {
  const { penManaged, holdsPen, canWrite, canProgress, canCalculate } = input;
  return {
    canEditSchedule: penManaged ? canWrite && holdsPen : canWrite,
    canRecalc: penManaged ? canCalculate && holdsPen : canCalculate,
    canProgress,
    penReadOnly: penManaged && canWrite && !holdsPen,
  };
}

/**
 * **Why a pen-gated schedule action is shut, as a sentence naming a control the reader has** —
 * or `null` when it is not shut (`docs/TECH_DEBT.md` #114.1, ADR-0082's "shade with a reason").
 *
 * The two refusals must never be conflated, and `canEditSchedule` alone cannot tell them apart
 * because it has already fused role and pen into one boolean (the ADR-0060 M6 observation). A
 * Viewer told to "start editing" is being pointed at a button their role will never give them; a
 * Planner told "your role cannot do this" is being told something false. Both are the
 * invented-sentence defect ADR-0060 records shipping once and this repo has now removed twice.
 *
 * `penReadOnly` is what distinguishes them, and it has been on this object since ADR-0028 — the
 * missing piece was never the data, it was that every caller assembled its own string from the
 * fused boolean and therefore could only ever guess.
 *
 * @param action a verb phrase completing "…to {action}" — "add activities", "recalculate".
 */
export function scheduleRefusal(
  gating: Pick<PlanGating, 'canEditSchedule' | 'penReadOnly'>,
  holder: PlanEditLockActor | null,
  action: string,
): string | null {
  if (gating.canEditSchedule) return null;
  // The role permits it and the pen is what is missing, so `penReason` picks the right frame —
  // "Start editing" when the pen is free, "Request control" when a peer holds it, named.
  if (gating.penReadOnly) return penReason(action, holder);
  // The role itself does not permit it. Taking the pen would not help, so offering it would be a
  // dead end dressed as a next step.
  return `Your role cannot ${action}.`;
}
