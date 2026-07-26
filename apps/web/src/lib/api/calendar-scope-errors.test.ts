import { CALENDAR_ERROR } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { calendarErrorMessage, calendarScopeErrorMessage } from '@/lib/api/calendar-scope-errors';
import { ApiFetchError } from '@/lib/api/client';

/** An API error carrying a machine-readable `details.reason` (+ whatever else the reason ships). */
function apiError(status: number, details: Record<string, unknown>): ApiFetchError {
  return new ApiFetchError(status, {
    code: status === 409 ? 'CONFLICT' : 'UNPROCESSABLE_ENTITY',
    message: 'Server message.',
    details,
  });
}

describe('calendarScopeErrorMessage', () => {
  it('maps the 422 CALENDAR_WRONG_SCOPE to the shared sentence plus what to do next', () => {
    const message = calendarScopeErrorMessage(apiError(422, { reason: 'CALENDAR_WRONG_SCOPE' }));

    expect(message).toContain(CALENDAR_ERROR.CALENDAR_WRONG_SCOPE);
    expect(message).toContain('Pick an organisation calendar');
  });

  it('maps the 422 RESOURCE_REQUIRES_ORG_CALENDAR to the shared sentence plus the remedy', () => {
    const message = calendarScopeErrorMessage(
      apiError(422, { reason: 'RESOURCE_REQUIRES_ORG_CALENDAR' }),
    );

    expect(message).toContain(CALENDAR_ERROR.RESOURCE_REQUIRES_ORG_CALENDAR);
    expect(message).toContain('Promote the calendar to the organisation library');
  });

  it('maps the 422 CALENDAR_SCOPE_PROJECT_MISMATCH to its shared sentence', () => {
    expect(
      calendarScopeErrorMessage(apiError(422, { reason: 'CALENDAR_SCOPE_PROJECT_MISMATCH' })),
    ).toBe(CALENDAR_ERROR.CALENDAR_SCOPE_PROJECT_MISMATCH);
  });

  it('surfaces the 409 narrowing block with its per-class counts, correctly singularised', () => {
    const message = calendarScopeErrorMessage(
      apiError(409, {
        reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED',
        count: 6,
        plans: 2,
        activities: 1,
        resources: 3,
      }),
    );

    expect(message).toContain(CALENDAR_ERROR.CALENDAR_SCOPE_NARROWING_BLOCKED);
    expect(message).toContain('2 plans, 1 activity and 3 resources');
    expect(message).toContain('reassign them');
  });

  it('drops zero classes from the narrowing counts rather than saying "0 plans"', () => {
    const message = calendarScopeErrorMessage(
      apiError(409, {
        reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED',
        count: 1,
        plans: 0,
        activities: 0,
        resources: 1,
      }),
    );

    expect(message).toContain('1 resource');
    expect(message).not.toContain('0 ');
    expect(message).not.toContain('plans');
  });

  it('falls back to the total when the 409 carries no per-class breakdown', () => {
    const message = calendarScopeErrorMessage(
      apiError(409, { reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED', count: 4 }),
    );

    expect(message).toContain('4 references must move');
  });

  it('returns null for an unrelated error so the caller keeps its own handling', () => {
    expect(calendarScopeErrorMessage(apiError(409, { reason: 'CALENDAR_IN_USE', count: 2 }))).toBe(
      null,
    );
    expect(calendarScopeErrorMessage(new Error('boom'))).toBe(null);
    expect(calendarScopeErrorMessage(undefined)).toBe(null);
  });
});

describe('calendarErrorMessage', () => {
  it('prefers the scope message when the rejection is one of ADR-0053’s', () => {
    expect(
      calendarErrorMessage(apiError(422, { reason: 'CALENDAR_WRONG_SCOPE' }), 'fallback'),
    ).toContain(CALENDAR_ERROR.CALENDAR_WRONG_SCOPE);
  });

  it('keeps the server’s own message for any other error', () => {
    expect(calendarErrorMessage(new Error('Stale version.'), 'fallback')).toBe('Stale version.');
  });

  it('uses the caller’s fallback for a non-Error throw', () => {
    expect(calendarErrorMessage('nope', 'Couldn’t save.')).toBe('Couldn’t save.');
  });
});
