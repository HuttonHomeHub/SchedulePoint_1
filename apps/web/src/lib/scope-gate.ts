/**
 * One scope's write gate. Lives in `lib/` because the plan workspace's object actions and the
 * canvas panel read it as well as the activity editor that derives it — a neutral tier keeps those
 * imports pointing down rather than sideways (`docs/TECH_DEBT.md` #548).
 */
export interface ScopeGate {
  /** May the caller save this scope right now. */
  writable: boolean;
  /**
   * Why not, as a sentence for the user — `null` when writable. Never a bare "Read-only": a
   * disabled control that does not say what would enable it is a dead end.
   */
  reason: string | null;
  /**
   * The scope is not merely un-writable but has nothing to show — the Cost tab for a role that
   * cannot read cost. Hidden rather than shaded, because shading implies a value is there.
   */
  readable: boolean;
  /**
   * The refusal is the caller's **role**, which no pen hand-off will change — present (and `true`)
   * only then, so a gate built any other way is unchanged. `reason` alone cannot say: both a Viewer
   * and a Planner whose pen was taken are `writable: false` with a sentence. A surface that renders
   * a read-only summary for the first and shaded editors for the second needs this (ADR-0083 D5,
   * `docs/TECH_DEBT.md` #64): the summary is right for a state that never flips, and wrong for one
   * that can flip under a reader mid-edit.
   */
  roleDenied?: true;
}
