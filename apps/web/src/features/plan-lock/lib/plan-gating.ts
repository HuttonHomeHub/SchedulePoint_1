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
