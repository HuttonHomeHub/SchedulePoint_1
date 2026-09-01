import type { CanvasModeStatement } from '../components/CanvasModeBand';

/** Which of the canvas dock's mutually-exclusive strips is showing, or none. */
export type DockStrip = 'conflict' | 'mode' | 'empty' | null;

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
  return null;
}
