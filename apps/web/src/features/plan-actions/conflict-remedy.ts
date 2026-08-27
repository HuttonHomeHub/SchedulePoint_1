import {
  CONFLICT_FLAGS,
  type ConflictFlagFields,
  type ConflictKey,
} from '@/features/tsld/render/conflicts';

/**
 * **What to do about the conflict you have landed on** (ADR-0094 M4).
 *
 * The Next-conflict cycle centres and **selects** each flagged activity, so the surface that should
 * offer the remedy is the one already on screen: the selection bar. A second strip was designed,
 * costed and **withdrawn** — it would have re-created the duplicate ADR-0093 removed one day
 * earlier (`clear-visual-placement` is already a selection-consulting command), and
 * `selection-duplication.structural.test.ts` could not have seen it, because that gate compares two
 * registries and a third would have been invisible to it. Two reviewers reached that independently.
 *
 * **Why a total `Record`, not a lookup with a fallback.** `ConflictKey` is a closed union
 * (ADR-0094 M1-T1) precisely so this map cannot be partial. Adding a flag to `CONFLICT_FLAGS`
 * becomes a **typecheck failure here** rather than a conflict that reaches a planner with nothing
 * behind it — which is the "lit but inert" class this register has recorded shipping three times.
 * `conflict-remedy.structural.test.ts` pins that the two stay the same size.
 *
 * **Why the kind is a tag and not a handler.** Everything below is pure data: no React, no DOM, no
 * editor import. `features/tsld` must not import from `features/activities` (§5/§12), so the
 * component layer maps `openEditorAt` to an `ActivityEditorPurpose` at the composition root, the way
 * the selection bar's existing callbacks already do.
 */
export type ConflictRemedy =
  /**
   * The fix is an action the selection bar **already carries** — so it is named here and NOT
   * rendered a second time.
   *
   * This is the epic's own rule landing on it. M4-T1 moved `clear-visual-placement` onto the
   * selection bar because its subject is the selected object (ADR-0093). Having done that, rendering
   * a conflict-flavoured button beside it — same permission, same precondition, same effect,
   * different copy — would be ADR-0093's defect reproduced **inside one surface**, one day after
   * removing it between two. The conflict signal is carried by the count read-out and the canvas
   * highlight; the fix is carried by the item that already does it.
   */
  | { kind: 'barAction'; itemId: 'clear-visual-placement'; label: string }
  /** A route: open the activity editor where the problem actually lives. */
  | { kind: 'openEditorAt'; at: 'constraint' | 'resources'; label: string };

/**
 * Every conflict has a remedy, and that is a property of the set rather than a coincidence.
 *
 * It was not true of the first design: `negativeFloat` had none, so a "no button, explanation only"
 * state was specified for it. Dropping that flag (ADR-0094 D-f) removed the state along with the
 * flag — one root cause counted N times down a chain, which a planner cannot act on, is not a
 * conflict worth counting. If a remedy-less flag is ever proposed again, this is where the argument
 * has to be made rather than slipped past.
 */
export const CONFLICT_REMEDIES: Readonly<Record<ConflictKey, ConflictRemedy>> = {
  // The one type with a genuine one-click fix: the placement is the planner's own input, so
  // withdrawing it resolves the clash outright. It is also the one fix the bar already offers to
  // every activity, conflicting or not — a planner who changes their mind about a hand-placed bar
  // wants it back on the computed date whether or not the placement clashed with anything.
  visualConflict: {
    kind: 'barAction',
    itemId: 'clear-visual-placement',
    label: 'Clear visual start',
  },
  // A route, not a fix — which constraint to relax, or by how much, is the planner's judgement, and
  // the copy says so. It read "Fix the constraint…" until the ux gate put the two routes side by
  // side: they are structurally identical, so calling one a fix and the other a review promised a
  // single-click resolution from one of them that neither can give. This comment had said as much
  // since the map was written; the label had not.
  // `constraint` lands on Scheduling rather than General: send someone to a constraint and they
  // should arrive where the constraint is.
  constraintViolated: { kind: 'openEditorAt', at: 'constraint', label: 'Review the constraint…' },
  // Also a route. Re-level, widen the window or change the assignment — three different answers, so
  // offering one button would be picking for them.
  levelingWindowExceeded: { kind: 'openEditorAt', at: 'resources', label: 'Review resources…' },
};

/**
 * The conflict an activity leads with, or `null` if it is not flagged.
 *
 * Derived from `CONFLICT_FLAGS` against the activity itself rather than read off the cycle's
 * cursor — so the remedy appears whether a planner arrived by pressing Next conflict or simply
 * clicked the bar, and so there is still exactly ONE definition of what a conflict is. `keys[0]`
 * order is the set's own order, which is what "leads with" means for a multi-flag activity.
 */
export function leadingConflictKey(activity: ConflictFlagFields): ConflictKey | null {
  return CONFLICT_FLAGS.find((flag) => flag.matches(activity))?.key ?? null;
}

/** The inputs `clearVisualPlacementGate` needs. Named so both call sites pass the same thing. */
export interface ClearVisualPlacementInput {
  schedulingMode: 'EARLY' | 'VISUAL';
  canEditSchedule: boolean;
  lateOverlayActive: boolean;
  hasSelection: boolean;
  /** Why a pen-gated action is shut, given a phrase naming it — `null` when it is open. */
  scheduleRefusal: (action: string) => string | null;
}

/**
 * Whether this action **exists for this plan at all** — as opposed to existing and being shut.
 *
 * ADR-0082 draws that line and it is not a shade of the same thing: *omit* when the action does not
 * apply to the object, *shade with a reason* when it is shut by a state the reader can change or by
 * their role. A plan in Early mode has no hand-placed `visualStart` to clear, so there is nothing
 * here to refuse — and the control was holding 146 px of a row that wraps, to say so.
 *
 * **It is a separate predicate rather than a third field on the gate's return**, because
 * `BulkActionGate` is shared with the plural bar where `applicable` would be meaningless for `link`
 * and `remove`. The gate calls it, so `schedulingMode` is still read in exactly one place — which
 * is the property the gate's own docblock was extracted to protect.
 */
export function clearVisualPlacementApplies(
  input: Pick<ClearVisualPlacementInput, 'schedulingMode'>,
): boolean {
  return input.schedulingMode === 'VISUAL';
}

/**
 * Whether clearing a hand-placed `visualStart` is actionable, and why not when it is not.
 *
 * **Extracted because it now has two call sites** (ADR-0094 M4-T1): the command surface item and the
 * selection bar's remedy. It was four inline closures in the registry, and the precedence between
 * them is not obvious — the PERMANENT gates come before the transient one, so a Viewer with nothing
 * selected is told they cannot edit rather than (uselessly) to select something first. Two
 * independent copies of a four-condition ladder is how the count and the filter came to disagree
 * about the word "conflict" in the first place.
 */
export function clearVisualPlacementGate(input: ClearVisualPlacementInput): {
  enabled: boolean;
  reason: string | null;
} {
  if (!clearVisualPlacementApplies(input)) {
    return { enabled: false, reason: 'Only available in Visual mode' };
  }
  if (!input.canEditSchedule) {
    return { enabled: false, reason: input.scheduleRefusal('clear the placement') };
  }
  if (input.lateOverlayActive) {
    return { enabled: false, reason: 'Turn off the Late-start overlay to clear the placement' };
  }
  if (!input.hasSelection) return { enabled: false, reason: 'Select an activity first' };
  return { enabled: true, reason: null };
}
