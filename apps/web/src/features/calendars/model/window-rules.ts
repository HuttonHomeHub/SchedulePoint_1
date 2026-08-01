import type { CalendarWindow } from '@repo/types';

/**
 * The client's copy of the server's `AreWindowsOrdered` rule.
 *
 * A copy, deliberately, and stated as one: the API stays the enforcing boundary — this exists so a
 * planner is told *before* pressing Save which pair is wrong, not so the server can be trusted
 * less. The two must agree, which is why both sides' comments name the other and why the case
 * table below matches the API e2e's rejection list one for one.
 *
 * The rule: within a day, every window has `start < end`, the array is **sorted**, and no two
 * overlap. Unsorted is a rejection rather than a quiet re-sort — storage is order-sensitive, and
 * reordering an author's input hides which pair they got wrong.
 */

/** A per-row problem, keyed by the row's index so the message lands on the offending control. */
export interface WindowProblem {
  index: number;
  message: string;
}

export const WINDOW_PROBLEM = {
  INVERTED: 'The end time must be after the start time.',
  OVERLAP: 'These hours overlap the row above.',
  UNSORTED: 'Put the day’s hours in order, earliest first.',
} as const;

/**
 * Every problem in one day's window set, in row order.
 *
 * Returns ALL of them rather than the first: a planner correcting a three-row day should not have
 * to press Save three times to discover three problems, which is the same reason the form has an
 * error summary rather than a single message.
 */
export function findWindowProblems(windows: readonly CalendarWindow[]): WindowProblem[] {
  const problems: WindowProblem[] = [];

  windows.forEach((window, index) => {
    if (window.endMinute <= window.startMinute) {
      problems.push({ index, message: WINDOW_PROBLEM.INVERTED });
      return;
    }
    const previous = windows[index - 1];
    if (previous === undefined) return;
    // Compared against the row ABOVE, in the order the author typed — an out-of-order row and an
    // overlapping row are different mistakes with different fixes, and saying "overlap" for a
    // simple mis-ordering sends the planner to change hours that were right.
    if (window.startMinute < previous.startMinute) {
      problems.push({ index, message: WINDOW_PROBLEM.UNSORTED });
    } else if (window.startMinute < previous.endMinute) {
      problems.push({ index, message: WINDOW_PROBLEM.OVERLAP });
    }
  });

  return problems;
}
