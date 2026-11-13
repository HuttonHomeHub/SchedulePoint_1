import { describe, expect, it } from 'vitest';

import { lockCopy, relativeTime } from './lock-copy';

const NOW = new Date('2026-07-11T12:00:00.000Z').getTime();
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

describe('relativeTime', () => {
  it('reads "just now" under a minute', () => {
    expect(relativeTime(ago(30_000), NOW)).toBe('just now');
  });

  it('reads whole minutes', () => {
    expect(relativeTime(ago(2 * 60_000), NOW)).toBe('2 min ago');
    expect(relativeTime(ago(59 * 60_000), NOW)).toBe('59 min ago');
  });

  it('reads whole hours past an hour', () => {
    expect(relativeTime(ago(2 * 3_600_000), NOW)).toBe('2 hr ago');
  });

  it('clamps a future instant to "just now" (never negative)', () => {
    expect(relativeTime(ago(-5_000), NOW)).toBe('just now');
  });
});

describe('the cancel-request copy', () => {
  it('labels the control and states both ways in once the countdown has run out', () => {
    const holder = { id: 'a', name: 'Alexandra Smith', email: 'a@x.com' };
    expect(lockCopy.cancelRequest).toBe('Cancel request');
    expect(lockCopy.canTakeOverRequested(holder)).toBe(
      'You can take over editing from Alexandra now, or you will start editing when they hand over or leave.',
    );
  });
});
