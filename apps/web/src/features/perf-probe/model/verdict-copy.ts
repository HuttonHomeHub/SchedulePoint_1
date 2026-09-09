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
    /**
     * Whether the baseline left less headroom than the bar — `docs/TECH_DEBT.md` #260.
     *
     * Read on the **ungated** path, which is the one that needs it. A gated saturated run is
     * already INDETERMINATE and carries the judge's own reason; an ungated one prints a delta with
     * a "never graded" sentence beside it that says nothing about the delta being a ceiling
     * artefact. Optional so a caller that has no judged difference — an absolute limb, a stored row
     * this bundle cannot read — is not forced to invent a value; `undefined` means "not a
     * difference run", never "measured and fine".
     */
    readonly saturated?: boolean | undefined;
  },
): string | null {
  if (verdict === 'INDETERMINATE') {
    return (
      run.indeterminateReason ??
      'this machine could not resolve the question — the repeats disagreed with each other.'
    );
  }

  if (verdict !== 'REPORTED_ONLY') return null;

  // Checked before either ungating reason, because it is the strongest thing that can be said about
  // this run: the other two withhold a verdict, and this one says the figure printed above cannot
  // mean what it looks like. A reader who stops after the first sentence should get that one.
  const ceiling = run.saturated === true ? `${SATURATED_CAVEAT} ` : '';

  // Two ways to reach it, and they are different facts. The size is checked first because it is the
  // one the operator chose a moment ago and can change; the framing is a property of the question.
  if (run.repeats < 2) {
    return `${ceiling}a quick check runs once, so there is no run-to-run spread to judge against. The figures are real; the verdict is withheld rather than guessed.`;
  }
  return `${ceiling}this framing is measured and deliberately never graded — the shipped painter is already known to drop frames at the whole-plan zoom, so a pass or a fail here would be about the bar rather than about this machine.`;
}

/**
 * The one sentence that goes beside a saturated delta, wherever one is printed.
 *
 * **Exported so a renderer can put it next to the figure itself**, not only after the verdict. The
 * defect `docs/TECH_DEBT.md` #260 records is a `delta -0.19 pp` that reads as "the overlay is
 * free"; a caveat three lines below it in a paste-ready block is a caveat the person reading the
 * number may never reach.
 *
 * Written without figures so it can sit anywhere. The numbers are on the row already — the judge's
 * own `indeterminateReason` carries them for the gated case, and `headroomPp` is on every result.
 */
export const SATURATED_CAVEAT =
  'the baseline had less room left than the bar, so this difference could not have failed however ' +
  'much the feature cost — read it as a property of the ceiling, not as a measurement.';

/** The verdict as a reader should see it: no underscore, and never a bare enum. */
export function verdictLabel(verdict: Verdict): string {
  return verdict === 'REPORTED_ONLY' ? 'REPORTED, NOT GRADED' : verdict;
}
