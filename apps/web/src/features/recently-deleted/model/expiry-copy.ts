/**
 * How long a deletion has left, in words.
 *
 * **The urgency is carried by the WORDING, never by colour** (WCAG 1.4.1). "Expires tomorrow" reads
 * as urgent to everyone — a colour-blind reader, a black-and-white print, a screen reader. That is
 * an acceptance criterion here rather than a habit that happens to hold, because the natural next
 * change to this feature is an amber badge, and this docblock is what the reviewer will read.
 *
 * The precedent is `features/staff/model/retention-copy.ts`, which states the same rule for the
 * staff panel's sentences.
 *
 * **The instant comes from the server, row by row** (ADR-0195 D4). It used to be derived here from a
 * row's `deletedAt` and the period, which is only true of a row a timer actually removes: a deleted
 * resource or an organisation calendar never expires, and a project calendar goes with its project's
 * clock, not its own. So a row with no `expiresAt` has no countdown to state, whatever its age.
 */

/** Whole days until an instant, floored — the unit a reader thinks in. */
export function daysUntilExpiry(expiresAt: string, now = Date.now()): number {
  const expires = new Date(expiresAt).getTime();
  // Degrades to "a long way off" on an unparseable instant rather than throwing or shouting.
  if (Number.isNaN(expires)) return Number.POSITIVE_INFINITY;
  return Math.floor((expires - now) / (24 * 60 * 60 * 1000));
}

/**
 * @returns null when the sweep is not deleting yet, or when no timer ever removes this row — the
 * countdown is withheld entirely rather than shown as a reassurance, because a number that is not
 * going to happen is worse than silence.
 */
export function expirySentence(
  expiresAt: string | null,
  active: boolean,
  now = Date.now(),
): string | null {
  if (!active || expiresAt === null) return null;
  const days = daysUntilExpiry(expiresAt, now);
  // An instant we cannot read is withheld, not printed as a number of days.
  if (!Number.isFinite(days)) return null;
  // **"Expiring soon", never "Expiring now".** Nothing happens at the instant a reader looks at
  // this: the row is queued for the next sweep, which may be up to an interval away. "Now" claims
  // an action is occurring and would send someone hunting for a row that is still there.
  if (days <= 0) return 'Expiring soon';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

/**
 * The aggregate line above the list.
 *
 * **Separates the soon-to-expire subset from the total.** "2 deletions · 41 items · expire within
 * 7 days" reads as though the whole total is imminent when only part of it is; a reader who acts on
 * that restores things that had months left.
 */
export function expirySummary(
  groups: readonly { root: { expiresAt: string | null } }[],
  active: boolean,
  now = Date.now(),
): string | null {
  if (!active || groups.length === 0) return null;
  // A deletion with no timer is never "soon", but it still counts in the total, so "1 of 3" stays
  // a true statement about the whole list.
  const soon = groups.filter(
    (g) => g.root.expiresAt !== null && daysUntilExpiry(g.root.expiresAt, now) <= 7,
  ).length;
  if (soon === 0) return null;
  return soon === groups.length
    ? `All ${soon} ${soon === 1 ? 'deletion expires' : 'deletions expire'} within 7 days.`
    : `${soon} of ${groups.length} deletions ${soon === 1 ? 'expires' : 'expire'} within 7 days.`;
}
