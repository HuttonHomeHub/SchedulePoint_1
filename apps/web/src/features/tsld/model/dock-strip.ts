import type { CanvasModeStatement } from '../components/CanvasModeBand';

/** Which of the canvas dock's mutually-exclusive strips is showing, or none. */
export type DockStrip =
  | 'conflict'
  | 'history'
  | 'mode'
  | 'layout-resolved'
  | 'empty'
  | 'arrange-offer'
  | 'touch-hint'
  | null;

/** What the precedence is decided from. Booleans, so the rule has no opinion about their sources. */
export interface DockStripInput {
  /** A write failed and is waiting to be dismissed. */
  readonly hasConflict: boolean;
  /** The mode band's sentence, or `null` for "say nothing" — the band's own contract. */
  readonly modeStatement: CanvasModeStatement | null;
  /** Whether the canvas is rendering a diagram at all. */
  readonly showDiagram: boolean;
  readonly activityCount: number;
  readonly mode: string;
  /**
   * Whether a finger has pressed this workspace and the reader has not dismissed the one-time
   * touch tip (`docs/specs/long-press-hint/`). Precedence only; the sentence is the host's.
   */
  readonly hasTouchGestureHint: boolean;
  /**
   * Whether a press of `Arrange` would move anything on this plan AND this reader could take the
   * offer AND they have not dismissed it. One boolean, because this function decides precedence, not content,
   * and has no business knowing how many rows.
   *
   * **The "could take it" half is a precondition, not a shading.** The strip's entire content is an
   * offer to press a pen-gated command, so without the pen there is nothing left of it — ADR-0082's
   * omit clause, and the alternative is the permanently un-actionable notice ADR-0059 M6 and
   * ADR-0062 M6 both record shipping.
   */
  readonly hasArrangeOffer: boolean;
  /**
   * Whether an edit just moved a bar clear of an overlap and the notice saying so is still bound to
   * the top undo step (NetPoint-layout M3). Precedence only; the sentence is the host's.
   */
  readonly hasLayoutResolvedNotice: boolean;
  /**
   * What the last undo/redo press left in the dock (undo-redo M1): `'failure'` for a step that did
   * not apply or a press that was refused, `'success'` for one that ran, `null` for neither. A
   * three-way value rather than two booleans because the two cases rank on opposite sides of the
   * mode band, and this function decides precedence, not content.
   *
   * A success that loses to the mode band is not withdrawn, only hidden: when the tool disarms and
   * the strip finally mounts, its 15 s window starts then, not when the press happened.
   */
  readonly historyResult: 'success' | 'failure' | null;
}

/**
 * **One decision about which strip the dock shows** (`docs/TECH_DEBT.md` #202(b)).
 *
 * ADR-0092 docked every transient strip into the Activities handle row, and the invariant that
 * matters is that **at most one is up**: the row is 36 px of shared width, and two strips in it is
 * how a control comes to sit on top of the control a planner meant to press. That invariant was
 * spelt three times in `TsldPanel`, in three shapes — `conflict ?`, `conflict ? null :`, and
 * `!conflict` inside a five-term `&&` — and held partly because `CanvasModeBand` returns `null` for
 * a null statement in a different file. A fourth strip had to rediscover all of that and spell it a
 * fourth way.
 *
 * **The order, and why.** A conflict outranks everything: it reports a write that FAILED and needs
 * dismissing, and it is the only strip carrying a consequence rather than an instruction. Below it
 * the mode band, whose surviving statements are the ones the command deck cannot restate (ADR-0114
 * D3 withdrew the three it could). Below that the empty-plan notice, which had already yielded to
 * an armed tool before this function existed.
 *
 * **`mode` above `empty` is the old guard restated, not a new rule.** The empty notice's guard
 * carried `mode === 'select'`, and `modeStatement` is null for every mode except the four tool
 * modes — so inside that term it could never be truthy, which is what the deleted comment there
 * said about the `!modeStatement` conjunct it called dead. Stating the precedence here turns an
 * emergent property into a written one.
 *
 * Pure and exported so the **decision** can be asserted rather than the DOM. Asserting "the empty
 * notice is absent" cannot distinguish "a conflict outranked it" from "the notice is broken" — the
 * ADR-0093 shape, where one green assertion covers two different facts.
 */
export function resolveDockStrip(input: DockStripInput): DockStrip {
  if (input.hasConflict) return 'conflict';
  /**
   * **A refused or failed undo ranks with `conflict`, directly under it.** It reports a write that
   * did NOT happen and needs dismissing — the same class as a conflict, and the only strip beside it
   * that carries a consequence rather than an instruction. It outranks an armed tool because the
   * planner pressed `Ctrl+Z` expecting something and got nothing: the sentence saying why must not
   * be the one a mode band covers.
   */
  if (input.historyResult === 'failure') return 'history';
  if (input.modeStatement) return 'mode';
  /**
   * **A successful undo/redo ranks directly below `mode`, and above `layout-resolved`.** It
   * reports the planner's last act, and yields to an armed tool for the same reason the
   * layout-resolved notice does (they have moved on; the step stays one `Ctrl+Z` away). It replaces
   * `layout-resolved` because both describe the top of the stack and only one can be true: undoing
   * the step a layout notice is bound to withdraws that notice anyway.
   */
  if (input.historyResult === 'success') return 'history';
  /**
   * **Directly below `mode`, above everything that is not about the planner's last act.** It reports
   * the consequence of the edit they just made — a bar they did not touch changed lane — and its
   * Undo is the one route to reversing that without hunting for which step it was. It yields to a
   * conflict (a write FAILED, which outranks one that succeeded) and to an armed tool (the planner
   * has already moved on to their next act, and the step stays one `Ctrl+Z` away). Everything below
   * it waits: the empty notice cannot co-occur (a plan with an overlap has activities), and the
   * Arrange offer is a standing fact that does not expire.
   */
  if (input.hasLayoutResolvedNotice) return 'layout-resolved';
  if (input.showDiagram && input.activityCount === 0 && input.mode === 'select') {
    return 'empty';
  }
  /**
   * **Below the empty notice, above the touch tip.** A plan with no activities has nothing to
   * arrange, so `hasArrangeOffer` is false there by construction and the two cannot genuinely
   * compete. The ordering is written down anyway, because "they cannot co-occur" is a property of
   * today's inputs and this function's job is to make the precedence a decision rather than an
   * emergent one (its own docblock's rule).
   *
   * It is a live fact about the plan under the reader's cursor, **dismissible and does not return**
   * within a session, which is what makes losing to a conflict or an armed tool affordable: it waits.
   */
  if (input.hasArrangeOffer) return 'arrange-offer';
  /**
   * **The lowest rung of all.** It teaches a gesture and says nothing about the plan, so it can
   * wait behind every strip above at no cost to the reader: it is dismissible, never returns once
   * dismissed, and a finger busy with a conflict, a tool or an empty plan will see it as soon as
   * the dock is quiet.
   */
  if (input.hasTouchGestureHint) return 'touch-hint';
  return null;
}
