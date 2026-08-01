import { describe, expect, it } from 'vitest';

import { findWindowProblems, WINDOW_PROBLEM } from './window-rules';

const w = (startMinute: number, endMinute: number) => ({ startMinute, endMinute });

describe('findWindowProblems', () => {
  it('accepts an empty day', () => {
    // A weekday with no windows is a non-working day, not a mistake.
    expect(findWindowProblems([])).toEqual([]);
  });

  it('accepts a single window and a sorted split shift', () => {
    expect(findWindowProblems([w(480, 1020)])).toEqual([]);
    expect(findWindowProblems([w(480, 720), w(780, 1020)])).toEqual([]);
  });

  it('accepts windows that touch without overlapping', () => {
    // `[start, end)` — one ending at 720 and the next starting at 720 share no minute.
    expect(findWindowProblems([w(480, 720), w(720, 1020)])).toEqual([]);
  });

  it('reports an inverted or empty window on its own row', () => {
    expect(findWindowProblems([w(720, 480)])).toEqual([
      { index: 0, message: WINDOW_PROBLEM.INVERTED },
    ]);
    expect(findWindowProblems([w(480, 480)])).toEqual([
      { index: 0, message: WINDOW_PROBLEM.INVERTED },
    ]);
  });

  it('reports an overlap on the later row', () => {
    expect(findWindowProblems([w(480, 720), w(600, 900)])).toEqual([
      { index: 1, message: WINDOW_PROBLEM.OVERLAP },
    ]);
  });

  /**
   * An out-of-order row and an overlapping row are different mistakes with different fixes.
   * Calling a mis-ordering an "overlap" sends the planner to change hours that were correct.
   */
  it('distinguishes unsorted from overlapping', () => {
    expect(findWindowProblems([w(780, 1020), w(480, 720)])).toEqual([
      { index: 1, message: WINDOW_PROBLEM.UNSORTED },
    ]);
  });

  it('reports every problem, not just the first', () => {
    // A three-row day with two faults should not take two rounds of Save to discover.
    const problems = findWindowProblems([w(480, 720), w(600, 900), w(1000, 800)]);
    expect(problems).toEqual([
      { index: 1, message: WINDOW_PROBLEM.OVERLAP },
      { index: 2, message: WINDOW_PROBLEM.INVERTED },
    ]);
  });

  it('accepts a window running to the end of the day', () => {
    // 1440 is 24:00, the storage end of a full day and of a night shift's first half.
    expect(findWindowProblems([w(1200, 1440)])).toEqual([]);
  });
});
