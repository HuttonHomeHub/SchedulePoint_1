import { describe, expect, it } from 'vitest';

import { CROSS_PLAN_LAG_CALENDAR_HINT } from '../../cross-plan-dependencies/schemas/cross-plan-schemas';

import { LAG_CALENDAR_HINT } from './dependency-schemas';

// Per-activity calendars exist (ADR-0037) and the engine resolves a Predecessor or Successor lag on
// that activity's calendar (`toEngineEdge`, schedule.service.ts), so the hint must not promise them
// as a future feature.
describe('the lag-calendar hints', () => {
  it.each([
    ['link form', LAG_CALENDAR_HINT],
    ['cross-plan form', CROSS_PLAN_LAG_CALENDAR_HINT],
  ])('say what Predecessor and Successor use today (%s)', (_name, hint) => {
    // The option labels as they appear in the select, so the hint cannot name a control that is not there.
    expect(hint).toContain('“24-hour (elapsed)”');
    expect(hint).toContain(
      '“Predecessor calendar” and “Successor calendar” count the wait on that',
    );
    expect(hint).toContain('activity’s own working calendar, or on ');
    expect(hint).not.toContain('—');
    expect(hint).not.toContain('arrive');
  });
});
