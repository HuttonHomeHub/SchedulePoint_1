/**
 * Same-lane time-overlap detection (TECH_DEBT #24c). Auto-arrange (`auto-pack.ts`) guarantees a lane
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
 * The ids of activities that share a lane with at least one time-overlapping neighbour. Both sides of
 * every overlapping pair are returned (each overlapping bar carries the cue). O(n log n) — bucket by
 * lane, sort each lane by start, then sweep keeping the still-open intervals.
 */
export function laneOverlapIds(spans: readonly LaneSpan[]): Set<string> {
  const byLane = new Map<number, LaneSpan[]>();
  for (const span of spans) {
    if (span.start === null || span.finish === null) continue; // not drawn → can't overlap
    const lane = byLane.get(span.laneIndex);
    if (lane) lane.push(span);
    else byLane.set(span.laneIndex, [span]);
  }

  const overlapping = new Set<string>();
  for (const lane of byLane.values()) {
    if (lane.length < 2) continue;
    const sorted = [...lane].sort((a, b) =>
      a.start! < b.start! ? -1 : a.start! > b.start! ? 1 : a.finish! < b.finish! ? -1 : 1,
    );
    // Sweep: `active` holds spans that haven't finished before the current one starts. Any that
    // remain when a new span arrives overlap it (and it overlaps them).
    const active: LaneSpan[] = [];
    for (const span of sorted) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        if (active[i]!.finish! < span.start!) active.splice(i, 1); // finished strictly before → clear
      }
      if (active.length > 0) {
        overlapping.add(span.id);
        for (const open of active) overlapping.add(open.id);
      }
      active.push(span);
    }
  }
  return overlapping;
}
