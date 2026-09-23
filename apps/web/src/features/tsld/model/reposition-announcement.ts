/**
 * **What a move says, in one place** (NetPoint-layout M3, ADR-0153).
 *
 * Two surfaces announce a reposition — the pointer drop in `TsldPanel` and the keyboard nudge in
 * `use-coalesced-nudge` — and once a drop onto an occupied lane can land somewhere other than where
 * it was aimed, each had to learn three outcomes. The first version taught them separately and got
 * two of them wrong on review: the pointer path named the landed lane without saying it was not the
 * one asked for whenever the drop also rolled to a working day, and a diagonal drag that found no
 * free lane above announced "the next free lane" for a lane that had not changed at all. Both were
 * the same sentence built twice; this is the sentence built once.
 *
 * `requested`, `landed` and `original` are 0-based lanes; the reader hears them 1-based.
 */
export interface RepositionOutcomeFacts {
  readonly name: string;
  /** The formatted working day a drop onto a non-working day rolls to, when it did. */
  readonly snappedDate: string | null;
  readonly timeChanged: boolean;
  /** Whether the gesture asked for a lane change at all. */
  readonly laneChanged: boolean;
  readonly requested: number;
  readonly landed: number;
  readonly original: number;
}

export function repositionAnnouncement(f: RepositionOutcomeFacts): string {
  let sentence = `Moved “${f.name}”`;
  if (f.snappedDate) sentence += ` to ${f.snappedDate}, the next working day`;
  if (f.laneChanged) {
    const lane = f.landed + 1;
    const joiner = f.snappedDate ? ' in' : ' to';
    if (f.landed === f.original && f.requested !== f.original) {
      // Asked for a lane and got none: say so, and never name a lane as if the bar went there.
      sentence += `; no free lane above, so it stays in lane ${f.original + 1}`;
    } else if (f.landed !== f.requested) {
      sentence += `${joiner} lane ${lane}, the next free lane`;
    } else {
      sentence += `${joiner} lane ${lane}`;
    }
  }
  if (f.timeChanged && !f.snappedDate) sentence += '; dates will update';
  return `${sentence}.`;
}
