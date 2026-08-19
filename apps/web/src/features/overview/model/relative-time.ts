/**
 * How long ago, in words.
 *
 * **This is the fifth relative-time implementation in this repository** — `NoteItem`, `staff.tsx`'s
 * retention copy, `lock-copy` and `float-path-rows` each grew their own. Rather than becoming the
 * fifth by default it lives here, pure and injectable, and the others move to it when they are next
 * touched. It sits in a feature's `model/` rather than `components/ui/` deliberately: it is a
 * formatting concern, not a component, and `components/ui` is for things that render.
 *
 * **`now` is a parameter, never `Date.now()` inside.** `docs/TESTING.md` forbids reliance on the
 * wall clock, and a function that reads it cannot be tested at a boundary — which is where every
 * bug in this kind of code lives.
 *
 * It floors at "just now" and **never renders a future instant as one**: clock skew between a
 * server and a browser is normal, and "in 3 seconds" on a list of things that already happened
 * reads as a fault rather than as skew.
 */
export function formatRelative(instant: Date | string, now: Date): string {
  const then = typeof instant === 'string' ? new Date(instant) : instant;
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  // A future instant is skew, not the future. Say the least wrong thing.
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * The exact instant, for the `<time datetime>` and the accessible text.
 *
 * A relative time is a poor primary for people accountable for dates (`docs/UX_STANDARDS.md` §6),
 * so the precise value always travels with it — in the markup rather than only in a hover title,
 * which a keyboard or touch reader never sees.
 */
export function exactInstant(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return date.toISOString();
}
