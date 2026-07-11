import { lockCopy } from '../lib/lock-copy';

/**
 * A lightweight inline "read-only — start editing above" note for the schedule
 * sections the pen gates (Activities, Logic diagram). The single `EditLockBanner`
 * lives at the top of the Schedule region, which can be scrolled well out of view
 * by the time a Planner reaches those sections and finds their edit affordances
 * gone; this hint explains the gap in place (UX review). The route renders it only
 * when the caller could edit but doesn't hold the pen.
 */
export function PenReadOnlyNote(): React.ReactElement {
  return <p className="text-muted-foreground mt-1 text-sm">{lockCopy.scheduleReadOnlyHint}</p>;
}
