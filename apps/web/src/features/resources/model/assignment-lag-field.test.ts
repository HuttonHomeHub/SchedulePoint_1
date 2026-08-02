import { describe, expect, it } from 'vitest';

import {
  LAG_DAYS_UNAVAILABLE,
  LAG_TOO_LARGE,
  assignmentLagHelp,
  assignmentLagLabel,
  formatAssignmentLagRead,
  parseAssignmentLag,
  seedAssignmentLag,
} from './assignment-lag-field';

/**
 * The join-lag field's grammar (ADR-0071 M4). The interesting half is the **degraded** path: unlike a
 * relationship lag there is no `lagDays` to fall back to, so this field's answer to "the calendar
 * hasn't loaded" is to keep the units that need no factor rather than to hide.
 */
describe('parseAssignmentLag — with the activity calendar resolved', () => {
  const EIGHT_HOUR = 8;

  it('reads days against the activity calendar, not against 24 hours', () => {
    // The whole point of ADR-0068: `1d` on an eight-hour calendar is 480 working minutes. Defaulting
    // the factor to 24 would store 1,440 and silently schedule three days' work.
    expect(parseAssignmentLag('1d', EIGHT_HOUR)).toEqual({ ok: true, minutes: 480 });
    expect(parseAssignmentLag('2d 4h', EIGHT_HOUR)).toEqual({ ok: true, minutes: 960 + 240 });
  });

  it('reads a bare number as days, which is what the field has always meant', () => {
    expect(parseAssignmentLag('2', EIGHT_HOUR)).toEqual({ ok: true, minutes: 960 });
  });

  it('treats a blank field as no lag rather than an error', () => {
    // "Joins with the activity" is the default and the overwhelming majority — a required field here
    // would make the common case the one that needs typing.
    expect(parseAssignmentLag('', EIGHT_HOUR)).toEqual({ ok: true, minutes: 0 });
    expect(parseAssignmentLag('   ', undefined)).toEqual({ ok: true, minutes: 0 });
  });

  it('refuses a negative lag — a resource cannot join before its activity starts', () => {
    const result = parseAssignmentLag('-4h', EIGHT_HOUR);
    expect(result.ok).toBe(false);
  });

  it('refuses a value past the API’s own ceiling, at the field rather than by a 422', () => {
    // ASSIGNMENT_LAG_MINUTES_MAX is 5,256,000 — ten years of 24-hour minutes. Asked for in days on a
    // 24-hour calendar that is 3,650; one more day is over.
    expect(parseAssignmentLag('3650d', 24)).toEqual({ ok: true, minutes: 5_256_000 });
    expect(parseAssignmentLag('3651d', 24)).toEqual({ ok: false, message: LAG_TOO_LARGE });
  });
});

describe('parseAssignmentLag — with the activity calendar unresolved', () => {
  it('still accepts hours and minutes, which need no factor at all', () => {
    // The degraded state that is better than hiding the field: a planner can type a four-hour lift
    // while the calendar list is still in flight.
    expect(parseAssignmentLag('4h', undefined)).toEqual({ ok: true, minutes: 240 });
    expect(parseAssignmentLag('90m', undefined)).toEqual({ ok: true, minutes: 90 });
    expect(parseAssignmentLag('1h 30m', undefined)).toEqual({ ok: true, minutes: 90 });
  });

  it('refuses days — and says so, rather than guessing what a day is worth', () => {
    // Both spellings of days: the explicit unit, and the bare number that means the same thing.
    // Guessing 24 or 8 here would be silently wrong in opposite directions (ADR-0070 §3).
    expect(parseAssignmentLag('2d', undefined)).toEqual({
      ok: false,
      message: LAG_DAYS_UNAVAILABLE,
    });
    expect(parseAssignmentLag('2', undefined)).toEqual({
      ok: false,
      message: LAG_DAYS_UNAVAILABLE,
    });
    expect(parseAssignmentLag('1d 4h', undefined)).toEqual({
      ok: false,
      message: LAG_DAYS_UNAVAILABLE,
    });
  });

  it('says which units are available in the label and the help', () => {
    expect(assignmentLagLabel(undefined)).toContain('hours or minutes');
    expect(assignmentLagHelp(undefined)).toContain('hasn’t loaded yet');
    // Resolved, the label stops naming units and the help states the day's worth.
    expect(assignmentLagLabel(8)).toBe('Joins after');
    expect(assignmentLagHelp(8)).toContain('8 working hours');
  });
});

describe('seedAssignmentLag — a value shown is a value the field accepts back', () => {
  it('round-trips through the field on the resolved path', () => {
    const text = seedAssignmentLag(960 + 240, 8);
    expect(text).toBe('2d 4h');
    expect(parseAssignmentLag(text, 8)).toEqual({ ok: true, minutes: 1200 });
  });

  it('round-trips in hours and minutes when the factor is unresolved', () => {
    // The seed must not render days the field would then refuse — a value the planner cannot re-enter
    // is a value they cannot correct.
    const text = seedAssignmentLag(1200, undefined);
    expect(text).not.toContain('d');
    expect(parseAssignmentLag(text, undefined)).toEqual({ ok: true, minutes: 1200 });
  });

  it('seeds an unlagged assignment as 0d rather than blank', () => {
    // Blank reads as "not set"; 0d says the resource joins with the activity, which is a real answer.
    expect(seedAssignmentLag(0, 8)).toBe('0d');
    expect(seedAssignmentLag(undefined, 8)).toBe('0d');
  });
});

describe('formatAssignmentLagRead — the read-only row', () => {
  it('appends nothing for an unlagged assignment', () => {
    // "· 0d" reads as a setting somebody chose, when it is simply what every unlagged row has.
    expect(formatAssignmentLagRead(0, 8)).toBeNull();
  });

  it('names the delay for a lagged one', () => {
    expect(formatAssignmentLagRead(480, 8)).toBe(' · joins after 1d');
  });
});
