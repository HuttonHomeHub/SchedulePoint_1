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
  /**
   * Present while swimlanes are shown: where the bar is, in its swimlane's terms. The sentence then
   * names the swimlane and the lane within it ("in Mechanical, lane 2 of 3", ui-architecture C9) and
   * never a bare "lane N", because a stored lane number means nothing in a stack of swimlanes and a
   * display lane means something different from the lane the listener sees counted in the gutter.
   * `requested`/`landed`/`original` still say whether the bar went where it was aimed.
   */
  readonly swimlane?: SwimlaneLaneFacts;
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

/**
 * Where a bar is on the swimlane layout, in the words the announcements use (C9), and how it got
 * there. One shape for the model that decides it, the outcome that carries it and the sentences
 * that speak it.
 */
export interface SwimlaneLaneFacts {
  /** The swimlane's name, or "No swimlane". */
  readonly swimlane: string;
  /** 0-based within the swimlane. */
  readonly lane: number;
  /** How many lanes the swimlane has once the move has landed. */
  readonly count: number;
  /** True when the move put the bar in a different swimlane. */
  readonly changedSwimlane: boolean;
  /** The display lane that is, in the stack as it stands before the write. */
  readonly displayLane: number;
  /**
   * How it came to be there, which the sentence must not guess from lane numbers: `asked` is where
   * it was aimed, `next-free` is past an occupied lane, `remembered` is back in the lane it last
   * held in that swimlane, and `stays` is that no lane was free that way.
   */
  readonly how: 'asked' | 'next-free' | 'remembered' | 'stays';
}

/** "Mechanical, lane 2 of 3" — the C9 form. */
export const swimlanePlace = (f: SwimlaneLaneFacts): string =>
  `${f.swimlane}, lane ${String(f.lane + 1)} of ${String(f.count)}`;

function swimlaneRepositionAnnouncement(f: RepositionOutcomeFacts, s: SwimlaneLaneFacts): string {
  let sentence = `Moved “${f.name}”`;
  if (f.snappedDate) sentence += ` to ${f.snappedDate}, the next working day`;
  if (f.laneChanged) {
    const place = swimlanePlace(s);
    if (s.how === 'stays') {
      sentence += `; no free lane that way, so it stays in ${place}`;
    } else {
      const lead = s.changedSwimlane ? (f.snappedDate ? ', into' : ' to') : ', in';
      sentence += `${lead} ${place}`;
      if (s.how === 'next-free') sentence += ', the next free lane';
      if (s.how === 'remembered') sentence += ', back in its remembered lane';
    }
  }
  if (f.timeChanged && !f.snappedDate) sentence += '; dates will update';
  return `${sentence}.`;
}

export function repositionAnnouncement(f: RepositionOutcomeFacts): string {
  if (f.swimlane !== undefined) return swimlaneRepositionAnnouncement(f, f.swimlane);
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

/**
 * Said when a lane move on the swimlane layout found no free lane that way and nothing was written.
 * Off the swimlane layout the host says its own version of this; here the swimlane is part of it.
 */
export function stayInSwimlaneAnnouncement(name: string, s: SwimlaneLaneFacts): string {
  return `No free lane that way for “${name}”; it stays in ${swimlanePlace(s)}.`;
}

/**
 * What a **plural** move on the swimlane layout says: what actually moved, never the delta that was
 * asked for (a bar with no free lane stays, so "down 2 lanes" can be untrue of some of them) and never
 * a bare "lane", since each bar moved inside its own swimlane. A move in time adds the dates note.
 */
export function swimlanePluralAnnouncement(f: {
  readonly moved: number;
  readonly total: number;
  readonly direction: 'up' | 'down';
  readonly timeChanged: boolean;
}): string {
  const subject = (n: number): string => (n === 1 ? '1 activity' : `${String(n)} activities`);
  const stuck = f.total - f.moved;
  const lead =
    stuck === 0
      ? `${subject(f.moved)} moved ${f.direction} in ${f.moved === 1 ? 'its' : 'their'} swimlane${f.moved === 1 ? '' : 's'}`
      : `${String(f.moved)} of ${subject(f.total)} moved ${f.direction} in their swimlanes; ${String(stuck)} had no free lane`;
  return `${lead}${f.timeChanged ? '; dates will update' : ''}.`;
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

/** Said when a keyboard move is refused because an earlier write has not finished. */
export const STILL_SAVING_NOTE = 'Still saving the previous move.';

/** Said when a plural move was attempted and nothing was written, and no other message says why. */
export const MOVE_FAILED_NOTE = 'Couldn’t move the selection.';
