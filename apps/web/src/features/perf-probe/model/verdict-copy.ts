import type { Verdict } from './judge';

/**
 * The sentence that goes with a verdict — **including the ones that are not a judgement**.
 *
 * `INDETERMINATE` always carried its reason. `REPORTED_ONLY` did not, so the panel and the
 * paste-ready report both printed a bare `REPORTED_ONLY`, underscore and all, with nothing beside
 * it. A reader meeting that for the first time cannot tell it from a failure code — and it is the
 * commonest outcome on this surface, because a quick check and the whole-plan framing are both
 * ungated by design. Found by the M5 ux review and, separately, by accessibility.
 *
 * Pure and shared, so the screen and the block somebody pastes into a document cannot say different
 * things about the same run.
 */
export function verdictNote(
  verdict: Verdict,
  run: {
    /** Whether a verdict was gated at all for this limb. */
    readonly gated: boolean;
    /** Repeats behind the figures. One repeat has no run-to-run spread to judge against. */
    readonly repeats: number;
    readonly indeterminateReason?: string | undefined;
  },
): string | null {
  if (verdict === 'INDETERMINATE') {
    return (
      run.indeterminateReason ??
      'this machine could not resolve the question — the repeats disagreed with each other.'
    );
  }

  if (verdict !== 'REPORTED_ONLY') return null;

  // Two ways to reach it, and they are different facts. The size is checked first because it is the
  // one the operator chose a moment ago and can change; the framing is a property of the question.
  if (run.repeats < 2) {
    return 'a quick check runs once, so there is no run-to-run spread to judge against. The figures are real; the verdict is withheld rather than guessed.';
  }
  return 'this framing is measured and deliberately never graded — the shipped painter is already known to drop frames at the whole-plan zoom, so a pass or a fail here would be about the bar rather than about this machine.';
}

/** The verdict as a reader should see it: no underscore, and never a bare enum. */
export function verdictLabel(verdict: Verdict): string {
  return verdict === 'REPORTED_ONLY' ? 'REPORTED, NOT GRADED' : verdict;
}
