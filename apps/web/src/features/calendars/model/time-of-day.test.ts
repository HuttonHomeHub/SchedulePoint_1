import { describe, expect, it } from 'vitest';

import { formatTimeOfDay, parseTimeOfDay } from './time-of-day';

describe('parseTimeOfDay', () => {
  it.each([
    ['00:00', 0],
    ['08:00', 480],
    ['8:00', 480], // a leading zero is not worth correcting a planner over
    ['12:30', 750],
    ['23:59', 1439],
  ])('parses %s as %i minutes', (input, minutes) => {
    expect(parseTimeOfDay(input)).toEqual({ ok: true, minutes });
  });

  /**
   * The value this module exists for. Storage ends a full day at 1440, and `<input type="time">`
   * cannot express it — which is why the editor takes text (spec Q2).
   */
  it('parses 24:00 as the end of the day', () => {
    expect(parseTimeOfDay('24:00')).toEqual({ ok: true, minutes: 1440 });
  });

  it('rejects a time past the end of the day', () => {
    // 24:30 is not a long day; it is past midnight, which is the NEXT day's window.
    expect(parseTimeOfDay('24:30')).toEqual({ ok: false, reason: 'range' });
    expect(parseTimeOfDay('25:00')).toEqual({ ok: false, reason: 'range' });
    expect(parseTimeOfDay('08:60')).toEqual({ ok: false, reason: 'range' });
  });

  it.each(['', '   '])('reports an empty field as empty, not malformed (%s)', (input) => {
    expect(parseTimeOfDay(input)).toEqual({ ok: false, reason: 'empty' });
  });

  it.each(['8', '800', '8am', '08:0', '08:000', '-8:00', '08:00:00'])(
    'rejects %s as malformed',
    (input) => {
      expect(parseTimeOfDay(input)).toEqual({ ok: false, reason: 'format' });
    },
  );

  it('ignores surrounding whitespace', () => {
    expect(parseTimeOfDay('  08:00  ')).toEqual({ ok: true, minutes: 480 });
  });
});

describe('formatTimeOfDay', () => {
  it.each([
    [0, '00:00'],
    [480, '08:00'],
    [750, '12:30'],
    [1439, '23:59'],
    [1440, '24:00'],
  ])('formats %i as %s', (minutes, expected) => {
    expect(formatTimeOfDay(minutes)).toBe(expected);
  });

  it('round-trips every minute of the day', () => {
    // The pair must be exact inverses: a planner who opens a calendar and saves without touching
    // anything must send back what was stored, to the minute.
    for (let minutes = 0; minutes <= 1440; minutes += 1) {
      expect(parseTimeOfDay(formatTimeOfDay(minutes))).toEqual({ ok: true, minutes });
    }
  });

  it('formats the end of the day as 24:00, never 00:00', () => {
    // The two are different instants, and conflating them is exactly the read-time inference the
    // storage-honesty rule forbids.
    expect(formatTimeOfDay(1440)).not.toBe(formatTimeOfDay(0));
  });
});
