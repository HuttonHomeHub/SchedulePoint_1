import type { ActivityScope } from '../schemas/activity-scope-schemas';

/**
 * The tabbed activity editor's per-scope write gate (ADR-0060 §6), in the shape of
 * `derivePlanGating`. Pure, so the whole matrix is testable without mounting a dialog.
 *
 * One place decides every scope's read-only state **and the sentence explaining it**. That
 * pairing is the point: the house pattern is shade-with-a-reason, never hide (ADR-0059 M6 shipped
 * a control that was lit but inert, and the RESOURCE_DEPENDENT calendar picker was another) — and
 * a reason that lives next to the boolean cannot drift from it.
 *
 * The three write paths do NOT share a gate, which is the whole reason the editor saves per scope:
 *
 * - **Definition scopes** (general / scheduling / cost / measure) need the role capability **and**
 *   the pen, exactly like every other structural activity write.
 * - **Progress** needs the role capability alone — never the pen (ADR-0028 Q-C), so a Contributor
 *   can report progress while someone else holds the pen.
 * - **Steps** are pen-gated as of ADR-0060 §5 (M0), which also added the server-side assertion. A
 *   single fused Save would have to pick one of these three rules and break the other two.
 */
export interface ActivityEditorGatingInput {
  /** Is the pen layer active at all (`pen.penManaged`). */
  penManaged: boolean;
  /** Does the caller currently hold the pen (`pen.holdsPen`). */
  holdsPen: boolean;
  /** Role: may edit an activity's definition (`activity:update` — Planner / Org Admin). */
  canWrite: boolean;
  /** Role: may report progress (Contributor and up) — never pen-gated. */
  canProgress: boolean;
  /**
   * Role: may read cost and earned-value figures. Derived client-side from the role, because the
   * activity DTO returns `null` for both "unset" and "not permitted" and the client cannot tell
   * them apart. Sound today — `cost:read` and `activity:update` are granted to exactly the same
   * roles — and recorded in TECH_DEBT #62 against the day those sets diverge.
   */
  canReadCost: boolean;
}

export type ActivityWritePath = ActivityScope | 'progress' | 'steps' | 'logic' | 'resources';

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
}

export type ActivityEditorGating = Record<ActivityWritePath, ScopeGate>;

const NO_ROLE = 'Your role cannot edit activity details.';
/**
 * The app's existing sentence for this exact state — `tsld-toolbar-items.tsx` shades every pen-gated
 * command with "Start editing to …" and has since ADR-0031.
 *
 * The first draft invented "Someone else is editing this plan. Take over the edit lock to make
 * changes.", which was both a fourth variant of one message and, in the common case, **false**:
 * nobody holds the pen when a plan has just been opened, so there is no one to take it from and
 * nothing to take over — the reader is told to fight a phantom instead of pressing Start editing.
 */
const NO_PEN = 'Start editing to change this activity.';
const NO_PROGRESS_ROLE = 'Your role cannot report progress.';

export function deriveActivityEditorGating(input: ActivityEditorGatingInput): ActivityEditorGating {
  const { penManaged, holdsPen, canWrite, canProgress, canReadCost } = input;

  // The definition rule, shared by all four definition scopes and (since M0) by steps.
  const penGated = (): ScopeGate => {
    if (!canWrite) return { writable: false, reason: NO_ROLE, readable: true };
    if (penManaged && !holdsPen) return { writable: false, reason: NO_PEN, readable: true };
    return { writable: true, reason: null, readable: true };
  };

  const definition = penGated();

  return {
    general: definition,
    scheduling: definition,
    measure: definition,
    // Same write rule as the other definition scopes, but a role that cannot read cost has nothing
    // to look at — an empty tab of disabled money fields would be worse than no tab.
    cost: canReadCost ? definition : { writable: false, reason: null, readable: false },
    // Never pen-gated (ADR-0028 Q-C) — this is the capability a merged Save would have destroyed.
    progress: canProgress
      ? { writable: true, reason: null, readable: true }
      : { writable: false, reason: NO_PROGRESS_ROLE, readable: true },
    steps: definition,
    // Logic and Resources join the definition side unchanged — **the same object**, not a second
    // expression of the same rule. Adding a link or an assignment has always needed the role and
    // the pen, and reusing the object is what makes "this epic changes no permission" checkable
    // rather than asserted (the identity test in the sibling suite).
    logic: definition,
    resources: definition,
  };
}
