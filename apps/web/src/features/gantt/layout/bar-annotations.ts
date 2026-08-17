import type { ActivitySummary } from '@repo/types';

/**
 * **What is drawn *beside* a bar: its name, and whether it is pinned.**
 *
 * Two M5 legibility items, together because they occupy the same strip of chart to the right of the
 * bar and would otherwise be two components competing for it.
 *
 * **Bar labels (B10f)** are called out in the spec as "the largest single legibility win in a
 * printed programme", and both P6 and Powerproject do it: a chart whose bars are anonymous forces
 * the reader's eye back to the grid for every one, which on paper means back across the page.
 *
 * **The constraint badge** sustains what the one-per-session note says at the moment a constraint is
 * written. The note explains the *event*; the badge is the *state*, and without it a planner
 * returning to a plan next week has no way to see which bars are pinned — which is exactly when it
 * matters, because a pinned bar is the one that will not move when the logic says it should.
 */

/** A label's level of detail. */
export type BarLabelMode = 'none' | 'name';

/**
 * Whether a bar is wide enough to be worth labelling, and whether there is room to the right.
 *
 * The rule is ADR-0054's Dates-toggle rule applied to text: at a dense zoom the labels collide into
 * a grey smear that is less legible than no labels at all, so they are withheld rather than allowed
 * to overlap. Withheld by **available room**, not by a zoom threshold — a threshold is a second
 * answer to "does this fit?" that goes stale the moment a font or a column width changes.
 */
export function barLabelMode({
  chartPx,
  barRight,
  labelChars,
}: {
  chartPx: number;
  /** The bar's right edge in chart pixels. */
  barRight: number;
  labelChars: number;
}): BarLabelMode {
  // ~6 px per character at the chart's text size, plus the gap. An estimate, and deliberately a
  // generous one: over-estimating withholds a label that would have fitted, which is a smaller harm
  // than printing one that runs off the page or over the next bar.
  const needed = labelChars * 6 + 8;
  return barRight + needed <= chartPx ? 'name' : 'none';
}

/**
 * The constraint badge for an activity, or null.
 *
 * Returns the **glyph and the words**, never a colour: colour alone would fail WCAG 1.4.1, and the
 * words are what the `sr-only` text and the `title` both use — one string, so the badge cannot say
 * something different to a sighted reader and a screen-reader one.
 */
export function constraintBadge(
  activity: Pick<ActivitySummary, 'constraintType'>,
): { glyph: string; label: string } | null {
  if (activity.constraintType === null) return null;
  // One mark for every constraint kind rather than a glyph per type. A planner needs to know THAT a
  // bar is pinned at a glance; which kind is a fact the editor states precisely, and eight glyphs
  // nobody can tell apart would be a legend the chart has no room for.
  return {
    glyph: '◆',
    label: `Constrained (${CONSTRAINT_WORDS[activity.constraintType] ?? 'pinned'})`,
  };
}

/** The plain words for a constraint type — the editor's vocabulary, not a second one. */
const CONSTRAINT_WORDS: Record<string, string> = {
  START_NO_EARLIER_THAN: 'start no earlier than',
  START_NO_LATER_THAN: 'start no later than',
  FINISH_NO_EARLIER_THAN: 'finish no earlier than',
  FINISH_NO_LATER_THAN: 'finish no later than',
  MANDATORY_START: 'mandatory start',
  MANDATORY_FINISH: 'mandatory finish',
  AS_LATE_AS_POSSIBLE: 'as late as possible',
};
