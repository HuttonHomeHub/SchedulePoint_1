import { describe, expect, it } from 'vitest';

import { daysUntilExpiry, expirySentence, expirySummary } from './expiry-copy';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe('the countdown', () => {
  it('says nothing at all while the sweep is not deleting', () => {
    // A countdown for a deletion that is not going to happen is worse than silence: it states a
    // consequence the system will not deliver. M3 ships the words; M4 arms the delete.
    expect(expirySentence(daysAgo(3), 90, false, NOW)).toBeNull();
    expect(expirySummary([{ root: { deletedAt: daysAgo(89) } }], 90, false, NOW)).toBeNull();
  });

  it('counts down in whole days', () => {
    expect(expirySentence(daysAgo(3), 90, true, NOW)).toBe('Expires in 87 days');
  });

  it('reads urgently at the edge WITHOUT reaching for colour', () => {
    // The wording is the whole signal (WCAG 1.4.1) — it survives a colour-blind reader, a
    // black-and-white print and a screen reader alike.
    expect(expirySentence(daysAgo(89), 90, true, NOW)).toBe('Expires tomorrow');
  });

  it('says "soon", not "now", once past the cutoff', () => {
    // Nothing happens at the instant the reader is looking: the row is queued for the next sweep.
    // "Now" would claim an action is occurring and send someone hunting for a row still on screen.
    expect(expirySentence(daysAgo(95), 90, true, NOW)).toBe('Expiring soon');
    expect(expirySentence(daysAgo(90), 90, true, NOW)).toBe('Expiring soon');
  });

  it('follows the SERVED period, not a constant', () => {
    // The same row, two hosts. A hardcoded 90 would tell the second one the wrong thing forever.
    expect(expirySentence(daysAgo(30), 90, true, NOW)).toBe('Expires in 60 days');
    expect(expirySentence(daysAgo(30), 45, true, NOW)).toBe('Expires in 15 days');
  });

  it('degrades to the full period on an unparseable date rather than throwing', () => {
    expect(daysUntilExpiry('not-a-date', 90, NOW)).toBe(90);
  });
});

describe('the aggregate line', () => {
  it('separates the soon-to-expire subset from the total', () => {
    // "2 deletions expire within 7 days" over a list of five reads as though all five are
    // imminent; a reader acting on that restores things with months left.
    const groups = [
      { root: { deletedAt: daysAgo(89) } },
      { root: { deletedAt: daysAgo(1) } },
      { root: { deletedAt: daysAgo(2) } },
    ];
    expect(expirySummary(groups, 90, true, NOW)).toBe('1 of 3 deletions expires within 7 days.');
  });

  it('says so plainly when everything is imminent', () => {
    const groups = [{ root: { deletedAt: daysAgo(89) } }, { root: { deletedAt: daysAgo(88) } }];
    expect(expirySummary(groups, 90, true, NOW)).toBe('All 2 deletions expire within 7 days.');
  });

  it('is silent when nothing is near', () => {
    expect(expirySummary([{ root: { deletedAt: daysAgo(1) } }], 90, true, NOW)).toBeNull();
  });
});
