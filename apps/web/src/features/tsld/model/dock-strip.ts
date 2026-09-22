import type { CanvasModeStatement } from '../components/CanvasModeBand';

/** Which of the canvas dock's mutually-exclusive strips is showing, or none. */
export type DockStrip =
  'conflict' | 'mode' | 'empty' | 'arrange-offer' | 'placement-migration' | null;

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
  /** `CANVAS_AUTHORING_FLOW_ENABLED` — passed in so the rule stays testable in both states. */
  readonly authoringFlowEnabled: boolean;
  /**
   * Whether the one-time placement migration (one-planning-surface M-I) has something to say about
   * this plan AND this reader has not already dismissed it. One boolean rather than a count and a
   * flag, because this function decides precedence and has no business knowing how many.
   */
  readonly hasPlacementMigrationNotice: boolean;
  /**
   * Whether a press of `Arrange` would move anything on this plan AND this reader could take the
   * offer AND they have not dismissed it. One boolean for the same reason as its neighbour above:
   * this function decides precedence, not content, and has no business knowing how many rows.
   *
   * **The "could take it" half is a precondition, not a shading.** The strip's entire content is an
   * offer to press a pen-gated command, so without the pen there is nothing left of it — ADR-0082's
   * omit clause, and the alternative is the permanently un-actionable notice ADR-0059 M6 and
   * ADR-0062 M6 both record shipping.
   */
  readonly hasArrangeOffer: boolean;
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
  if (input.modeStatement) return 'mode';
  if (
    input.authoringFlowEnabled &&
    input.showDiagram &&
    input.activityCount === 0 &&
    input.mode === 'select'
  ) {
    return 'empty';
  }
  /**
   * **Above the migration notice and below the empty notice**, and both halves are decided rather
   * than inherited.
   *
   * Above `placement-migration`: that notice is about something that happened on a deploy, once,
   * and this is a live fact about the plan under the reader's cursor — the same test that put the
   * migration last in the first place.
   *
   * Below `empty`: a plan with no activities has nothing to arrange, so `hasArrangeOffer` is false
   * there by construction and the two cannot genuinely compete. The ordering is written down
   * anyway, because "they cannot co-occur" is a property of today's inputs and this function's job
   * is to make the precedence a decision rather than an emergent one (its own docblock's rule).
   *
   * Like the migration notice it is **dismissible and does not return** within a session, which is
   * what makes losing to a conflict or an armed tool affordable: it waits.
   */
  if (input.hasArrangeOffer) return 'arrange-offer';
  /**
   * **Last, and the ordering is the decision.** Every strip above this one is about what the
   * planner is doing *now* — a write that just failed, a tool they just armed, a plan with nothing
   * in it yet. This one is about something that happened before they arrived, on a deploy, once.
   * A historical notice that outranked a live one would cover the sentence explaining the thing
   * under the reader's cursor.
   *
   * It also sits below `empty` rather than above it, on the same test: a migrated plan has
   * activities by construction (the migration converted constraints that were on them), so the two
   * can only co-occur if every activity was deleted afterwards — and for that reader "this plan is
   * empty" is the more useful sentence.
   *
   * It is **dismissible and does not return**, which is why it can afford to lose every contest:
   * it waits, and a planner who never arms a tool sees it at once. That property stopped being
   * unique to it when `arrange-offer` landed above it, which is why the two are separated by the
   * live/historical test above and not by which of them can be dismissed.
   */
  if (input.hasPlacementMigrationNotice) return 'placement-migration';
  return null;
}
