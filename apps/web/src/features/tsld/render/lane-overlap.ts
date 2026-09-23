/**
 * Same-lane time-overlap detection (TECH_DEBT #24c). Auto-arrange (`packLanes`, `@repo/layout`) guarantees a lane
 * never holds two bars whose spans overlap in time, but a **manual** lane drop (canvas drag or the
 * `Alt+↑/↓` nudge) has no such guarantee — a planner can drop a bar into a lane where it visually
 * overlaps another. This pure pass finds every activity that shares a lane with a time-overlapping
 * neighbour so the painter can draw a cue and the accessible layer can speak it.
 *
 * Convention mirrors {@link packLanes}: spans are the **inclusive** dates the bar is drawn at, so two
 * activities in a lane overlap iff **neither** finishes strictly before the other starts
 * (`a.finish < b.start`). Dates are compared as `YYYY-MM-DD` strings — lexicographic order equals
 * chronological order for that format, so no date parsing (or a data date) is needed. An activity with
 * a null start/finish (uncalculated — not drawn) is ignored.
 */

/** An activity's drawn span for overlap detection: its lane and inclusive start/finish dates. */
export interface LaneSpan {
  id: string;
  laneIndex: number;
  /** Inclusive `YYYY-MM-DD` bounds the bar is drawn at, or null when uncalculated (not drawn). */
  start: string | null;
  finish: string | null;
}

/**
 * Every unordered pair of activities that share a lane and overlap in time, each as `[a, b]` with
 * `a < b`, sorted — so a pair has one spelling and the list has one order. This is **the** sweep; the
 * NetPoint-layout auto-resolve (ADR-0153) reasons about which bar of a pair caused it, so it needs the
 * pairs, and {@link laneOverlapIds} is derived from them rather than being a second predicate.
 * O(n log n + k) — bucket by lane, sort each lane by start, then sweep keeping the still-open spans.
 */
export function laneOverlapPairs(spans: readonly LaneSpan[]): [string, string][] {
  const byLane = new Map<number, LaneSpan[]>();
  for (const span of spans) {
    if (span.start === null || span.finish === null) continue; // not drawn → can't overlap
    const lane = byLane.get(span.laneIndex);
    if (lane) lane.push(span);
    else byLane.set(span.laneIndex, [span]);
  }

  const pairs: [string, string][] = [];
  for (const lane of byLane.values()) {
    if (lane.length < 2) continue;
    const sorted = [...lane].sort((a, b) =>
      a.start! < b.start! ? -1 : a.start! > b.start! ? 1 : a.finish! < b.finish! ? -1 : 1,
    );
    // Sweep: `active` holds spans that haven't finished before the current one starts. Every one
    // that remains when a new span arrives overlaps it.
    const active: LaneSpan[] = [];
    for (const span of sorted) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        if (active[i]!.finish! < span.start!) active.splice(i, 1); // finished strictly before → clear
      }
      for (const open of active) {
        pairs.push(open.id < span.id ? [open.id, span.id] : [span.id, open.id]);
      }
      active.push(span);
    }
  }
  return pairs.sort((p, q) =>
    p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0,
  );
}

/**
 * The ids of activities that share a lane with at least one time-overlapping neighbour. Both sides of
 * every overlapping pair are returned (each overlapping bar carries the cue). Derived from
 * {@link laneOverlapPairs}, so the cue and the auto-resolve cannot disagree about what overlaps.
 */
export function laneOverlapIds(spans: readonly LaneSpan[]): Set<string> {
  const overlapping = new Set<string>();
  for (const [a, b] of laneOverlapPairs(spans)) {
    overlapping.add(a);
    overlapping.add(b);
  }
  return overlapping;
}
