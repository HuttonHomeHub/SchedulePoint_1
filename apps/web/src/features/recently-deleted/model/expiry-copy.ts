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
 */

/** Whole days between two instants, floored — the unit a reader thinks in. */
export function daysUntilExpiry(
  deletedAt: string,
  retentionDays: number,
  now = Date.now(),
): number {
  const deleted = new Date(deletedAt).getTime();
  if (Number.isNaN(deleted)) return retentionDays;
  const elapsedMs = now - deleted;
  const remainingMs = retentionDays * 24 * 60 * 60 * 1000 - elapsedMs;
  return Math.floor(remainingMs / (24 * 60 * 60 * 1000));
}

/**
 * @returns null when the sweep is not deleting yet — the countdown is withheld entirely rather
 * than shown as a reassurance, because a number that is not going to happen is worse than silence.
 */
export function expirySentence(
  deletedAt: string,
  retentionDays: number,
  active: boolean,
  now = Date.now(),
): string | null {
  if (!active) return null;
  const days = daysUntilExpiry(deletedAt, retentionDays, now);
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
  groups: readonly { root: { deletedAt: string } }[],
  retentionDays: number,
  active: boolean,
  now = Date.now(),
): string | null {
  if (!active || groups.length === 0) return null;
  const soon = groups.filter(
    (g) => daysUntilExpiry(g.root.deletedAt, retentionDays, now) <= 7,
  ).length;
  if (soon === 0) return null;
  return soon === groups.length
    ? `All ${soon} ${soon === 1 ? 'deletion expires' : 'deletions expire'} within 7 days.`
    : `${soon} of ${groups.length} deletions ${soon === 1 ? 'expires' : 'expire'} within 7 days.`;
}
