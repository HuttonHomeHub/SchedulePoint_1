import { describe, expect, it } from 'vitest';

import { formatRelative } from './relative-time';

/**
 * Boundaries, against a **fixed clock** — `docs/TESTING.md` forbids relying on the wall clock, and
 * a relative-time formatter is all boundary: every defect in one lives at a threshold or at zero.
 */
const NOW = new Date('2026-08-19T12:00:00.000Z');
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelative', () => {
  it.each([
    [0, 'just now'],
    [59 * SECOND, 'just now'],
    [60 * SECOND, '1 minute ago'],
    [2 * MINUTE, '2 minutes ago'],
    [59 * MINUTE, '59 minutes ago'],
    [HOUR, '1 hour ago'],
    [23 * HOUR, '23 hours ago'],
    [DAY, '1 day ago'],
    [6 * DAY, '6 days ago'],
    [7 * DAY, '1 week ago'],
    // 30 days is FOUR weeks, not one month — it floors below the five-week threshold, and
    // "4 weeks ago" is the more useful answer anyway for someone reasoning about a programme.
    [30 * DAY, '4 weeks ago'],
    [35 * DAY, '1 month ago'],
    [365 * DAY, '1 year ago'],
  ])('renders %ims ago as "%s"', (offset, expected) => {
    expect(formatRelative(ago(offset), NOW)).toBe(expected);
  });

  it('never renders a future instant as the future', () => {
    // Clock skew between a server and a browser is normal. "in 3 seconds" on a list of things that
    // have already happened reads as a fault rather than as skew, so the least wrong thing is said
    // instead.
    expect(formatRelative(new Date(NOW.getTime() + 3 * SECOND), NOW)).toBe('just now');
    expect(formatRelative(new Date(NOW.getTime() + 2 * DAY), NOW)).toBe('just now');
  });

  it('accepts the ISO string the API actually sends', () => {
    expect(formatRelative('2026-08-19T11:00:00.000Z', NOW)).toBe('1 hour ago');
  });

  it('says "1 minute" rather than "1 minutes"', () => {
    expect(formatRelative(ago(MINUTE), NOW)).not.toContain('1 minutes');
  });
});
