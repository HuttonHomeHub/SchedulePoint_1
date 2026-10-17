import { describe, expect, it } from 'vitest';

import { daysUntilExpiry, expirySentence, expirySummary } from './expiry-copy';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
/** The instant the server would serve, `n` days from now. */
const inDays = (n: number) => new Date(NOW + n * DAY).toISOString();

describe('the countdown', () => {
  it('says nothing at all while the sweep is not deleting', () => {
    // A countdown for a deletion that is not going to happen is worse than silence: it states a
    // consequence the system will not deliver. M3 ships the words; M4 arms the delete.
    expect(expirySentence(inDays(87), false, NOW)).toBeNull();
    expect(expirySummary([{ root: { expiresAt: inDays(1) } }], false, NOW)).toBeNull();
  });

  it('says nothing for a row no timer ever removes, however old it is (ADR-0195 D4)', () => {
    // A deleted resource or an organisation calendar has no `expiresAt`. A countdown derived from
    // its age would be a promise the sweep never keeps.
    expect(expirySentence(null, true, NOW)).toBeNull();
  });

  it('counts down in whole days', () => {
    expect(expirySentence(inDays(87), true, NOW)).toBe('Expires in 87 days');
  });

  it('reads urgently at the edge WITHOUT reaching for colour', () => {
    // The wording is the whole signal (WCAG 1.4.1) — it survives a colour-blind reader, a
    // black-and-white print and a screen reader alike.
    expect(expirySentence(inDays(1), true, NOW)).toBe('Expires tomorrow');
  });

  it('says "soon", not "now", once past the cutoff', () => {
    // Nothing happens at the instant the reader is looking: the row is queued for the next sweep.
    // "Now" would claim an action is occurring and send someone hunting for a row still on screen.
    expect(expirySentence(inDays(-5), true, NOW)).toBe('Expiring soon');
    expect(expirySentence(inDays(0), true, NOW)).toBe('Expiring soon');
  });

  it('follows the instant it is GIVEN, which is how it follows the served period', () => {
    // The same row on two hosts is two different `expiresAt`s; nothing here holds a period.
    expect(expirySentence(inDays(60), true, NOW)).toBe('Expires in 60 days');
    expect(expirySentence(inDays(15), true, NOW)).toBe('Expires in 15 days');
  });

  it('floors across the UK clock change: it is millisecond arithmetic with no calendar day in it', () => {
    const now = new Date('2026-10-25T01:30:00.000Z').getTime();
    const instant = (ms: number) => new Date(now + ms).toISOString();
    expect(daysUntilExpiry(instant(DAY - 1), now)).toBe(0);
    expect(daysUntilExpiry(instant(DAY), now)).toBe(1);
    expect(daysUntilExpiry(instant(-1), now)).toBe(-1);
  });

  it('withholds a sentence for an unparseable instant rather than throwing or printing nonsense', () => {
    expect(daysUntilExpiry('not-a-date', NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(expirySentence('not-a-date', true, NOW)).toBeNull();
  });
});

describe('the aggregate line', () => {
  it('separates the soon-to-expire subset from the total', () => {
    // "2 deletions expire within 7 days" over a list of five reads as though all five are
    // imminent; a reader acting on that restores things with months left.
    const groups = [
      { root: { expiresAt: inDays(1) } },
      { root: { expiresAt: inDays(80) } },
      { root: { expiresAt: inDays(70) } },
    ];
    expect(expirySummary(groups, true, NOW)).toBe('1 of 3 deletions expires within 7 days.');
  });

  it('says so plainly when everything is imminent', () => {
    const groups = [{ root: { expiresAt: inDays(1) } }, { root: { expiresAt: inDays(2) } }];
    expect(expirySummary(groups, true, NOW)).toBe('All 2 deletions expire within 7 days.');
  });

  it('counts a deletion that never expires in the total, but never as soon', () => {
    // Two deletions, one imminent and one with no timer: "All 2" would be false, "1 of 2" is true.
    const groups = [{ root: { expiresAt: inDays(1) } }, { root: { expiresAt: null } }];
    expect(expirySummary(groups, true, NOW)).toBe('1 of 2 deletions expires within 7 days.');
  });

  it('is silent when nothing is near', () => {
    expect(expirySummary([{ root: { expiresAt: inDays(80) } }], true, NOW)).toBeNull();
    expect(expirySummary([{ root: { expiresAt: null } }], true, NOW)).toBeNull();
  });
});
