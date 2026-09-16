/**
 * How many a landing box holds, stated because the box can now hide some of them.
 *
 * **A scrolling card's fold is invisible.** Content below it cannot be told from content that does
 * not exist — the failure ADR-0127 states as "a picture quietly missing rows is unnoticeable" —
 * and M9's height cap introduces exactly that fold on a screen where every box previously showed
 * everything it had. So a box that can scroll owes its reader a total.
 *
 * **It is worded, never a bare numeral.** A lone "8" beside a heading is a number about nothing,
 * and the four boxes hold four different things: plans, programmes and items are not
 * interchangeable words here even though three of them are currently the same eight rows.
 *
 * It is NOT a live region and does not announce. The count changes only when the one query
 * refetches, "Recently changed" already announces its settled count once for the screen
 * (`useSettledCountAnnouncement`), and a second spoken number for the same eight plans is noise in
 * the one channel a screen-reader user cannot skim past.
 */
export function SectionCount({
  count,
  noun,
}: {
  count: number;
  /** Singular. The plural is `${noun}s`, which is true of every noun this screen uses. */
  noun: string;
}): React.ReactElement {
  return (
    <span className="text-muted-foreground text-sm">
      {count} {noun}
      {count === 1 ? '' : 's'}
    </span>
  );
}
