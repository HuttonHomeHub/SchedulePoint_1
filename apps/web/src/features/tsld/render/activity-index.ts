import type { RenderActivity } from './render-model';

/**
 * The id→activity index every paint reads (ADR-0078 S2).
 *
 * Its own module for the ordering reason ADR-0078 §3a records: `paint-frame.ts` builds it as part
 * of the per-frame context, and `paint.ts` re-exports it — a module cannot be lifted while it
 * depends on something re-exported around it. Moved verbatim; `paint.ts` still exports
 * `activityIndexFor`, so `paint.test.ts`'s memo-identity assertion is untouched.
 */

/**
 * Id→activity index memoised on the activities ARRAY identity, the {@link edgeFanOuts} pattern
 * one field over: `scene.activities` carries the same reference-stability contract as
 * `scene.edges` (the scene is only rebuilt on a data / selection / hover-id change), and
 * `TsldCanvas`'s own `activityIndexRef` already relies on it. Rebuilding the Map inside
 * `paintScene` cost one O(n) allocation per dirty frame — continuously, during pan/zoom/drag.
 */
const activityIndexes = new WeakMap<
  readonly RenderActivity[],
  ReadonlyMap<string, RenderActivity>
>();

/**
 * The memoised id→activity index the painter reads: the SAME array instance returns the SAME
 * (identical) map; a new array instance recomputes. Exported so the memo identity is
 * unit-testable — the painter is its only production caller.
 */
export function activityIndexFor(
  activities: readonly RenderActivity[],
): ReadonlyMap<string, RenderActivity> {
  let index = activityIndexes.get(activities);
  if (!index) {
    index = new Map(activities.map((a) => [a.id, a]));
    activityIndexes.set(activities, index);
  }
  return index;
}
