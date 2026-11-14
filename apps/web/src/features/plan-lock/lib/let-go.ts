/**
 * When a tab that holds the pen stops renewing it (ADR-0220 D5 and D8). Pure, so the whole truth
 * table is one unit test and the two triggers share one rule.
 *
 * The tab only ever stops renewing; it never releases, because a visible sibling tab of the same
 * person shares the lease and keeps it alive with its own beats.
 */

/**
 * A tab hidden this long stops beating (D5), so a plan left in the background does not keep
 * colleagues out for ever. 15 minutes by the product owner's answer; the server then calls the
 * holder inactive from 90 s after the last beat, and the plan is free from 120 s.
 */
export const HIDDEN_LET_GO_MS = 15 * 60_000;

/**
 * A visible tab with no pointer, key, wheel or touch input for this long stops beating (D8). Measured
 * from the last input by the clock; the plan is then free 120 s after the last beat (a peer may take over from 90 s).
 */
export const IDLE_LET_GO_MS = 30 * 60_000;

export interface BeatInput {
  now: number;
  /** When the tab was hidden, or `null` while it is visible. */
  hiddenSince: number | null;
  /** The last pointer, key, wheel or focus input in this tab (reset when the tab is shown). */
  lastInputAt: number;
  /** This tab's unsaved-work registry holds a report (ADR-0060): typed changes must not be put at risk. */
  hasUnsavedWork: boolean;
}

/**
 * `beat` renews the lease. `hidden` skips it for a backgrounded tab (D5, whatever is unsaved: a hidden
 * tab cannot be typed into). `idle` skips it for a visible tab nobody has touched (D8); only that
 * one puts the tab to rest, because only then does the status poll need to pause (R5).
 */
export type BeatDecision = 'beat' | 'hidden' | 'idle';

export function decideBeat({
  now,
  hiddenSince,
  lastInputAt,
  hasUnsavedWork,
}: BeatInput): BeatDecision {
  if (hiddenSince !== null && now - hiddenSince >= HIDDEN_LET_GO_MS) return 'hidden';
  if (hiddenSince === null && !hasUnsavedWork && now - lastInputAt >= IDLE_LET_GO_MS) return 'idle';
  return 'beat';
}
