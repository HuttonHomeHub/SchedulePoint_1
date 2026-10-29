/**
 * What the Codes… dialog may do, and why not. Pure, so the matrix is testable without mounting the
 * dialog (the `derivePlanGating` precedent).
 *
 * `writable` and `reason` are the workspace's own pen-gated schedule gate and its sentence
 * (`scheduleRefusal`), passed in rather than rebuilt: two answers to one question start to disagree.
 * `roleDenied` is the one thing they cannot say — whether the refusal is the caller's **role**, which
 * no pen hand-off will change. A role that can never write sees a read-only list with no write
 * controls at all (ADR-0083 D5); a Planner without the pen sees the same controls shaded in place,
 * because that state can flip under them mid-session.
 */
export interface CodesGate {
  writable: boolean;
  reason: string | null;
  roleDenied: boolean;
  /**
   * May the caller see and use the restore lists. `code:restore` is held by exactly the roles that
   * hold the writes (Planner, Org Admin), so it is the negation of `roleDenied`; the lists are still
   * shown, shaded, to a Planner who has lost the pen.
   */
  canRestore: boolean;
}

export function deriveCodesGate(input: {
  writable: boolean;
  reason: string | null;
  roleDenied: boolean;
}): CodesGate {
  return { ...input, canRestore: !input.roleDenied };
}
