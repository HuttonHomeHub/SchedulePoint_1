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
    expect(hint).toContain('count the wait on that activity’s own working calendar');
    expect(hint).toContain('or on the plan’s calendar if it has none of its own');
    expect(hint).not.toContain('arrive');
  });
});
