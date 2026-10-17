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

const plural = (n: number, unit: string): string => `${String(n)} ${unit}${n === 1 ? '' : 's'}`;

/**
 * What a **plural** move says — the pointer drag and the keyboard nudge of a selection announce the
 * same sentence, built here once for the reason this file exists. Deltas are signed: a positive
 * `dayDelta` is later, a positive `laneDelta` is down (lane 0 is the top). Dates only "will update"
 * when a day moved; a lane-only move triggers no recalculation and says nothing about dates.
 *
 * A zero/zero delta writes nothing and so is never announced; it returns `''` rather than throwing,
 * because this runs inside a promise handler where a throw would surface as a failed move.
 */
export function pluralMoveAnnouncement(f: {
  readonly count: number;
  readonly dayDelta: number;
  readonly laneDelta: number;
}): string {
  const parts: string[] = [];
  if (f.dayDelta !== 0) {
    parts.push(`${plural(Math.abs(f.dayDelta), 'day')} ${f.dayDelta > 0 ? 'later' : 'earlier'}`);
  }
  if (f.laneDelta !== 0) {
    parts.push(`${f.laneDelta > 0 ? 'down' : 'up'} ${plural(Math.abs(f.laneDelta), 'lane')}`);
  }
  if (parts.length === 0) return '';
  const subject = f.count === 1 ? '1 activity' : `${String(f.count)} activities`;
  return `${subject} moved ${parts.join(' and ')}${f.dayDelta !== 0 ? '; dates will update' : ''}.`;
}

/**
 * The one sentence that says a plural selection moves together, by pointer or by keyboard. Shown on
 * the bulk bar and spoken by the panel from this same function, so the two cannot drift.
 */
export function pluralMoveHint(count: number): string {
  return `Dragging any of these, or pressing Alt with an arrow key, moves all ${String(count)} activities.`;
}
