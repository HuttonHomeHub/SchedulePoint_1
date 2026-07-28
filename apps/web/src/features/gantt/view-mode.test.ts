import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLAN_VIEW_MODE,
  PLAN_VIEW_MODES,
  PLAN_VIEW_MODE_LABELS,
  parsePlanViewMode,
  planViewModeSearch,
} from './view-mode';

describe('parsePlanViewMode', () => {
  it('reads the two known views', () => {
    expect(parsePlanViewMode('tsld')).toBe('tsld');
    expect(parsePlanViewMode('gantt')).toBe('gantt');
  });

  // A hand-edited or stale URL must land on a working screen, never an error boundary — the
  // reason this parser is total. Each of these is a shape a real URL can actually produce.
  it.each([
    ['an unknown view', 'network'],
    ['an empty string', ''],
    ['a case mismatch', 'Gantt'],
    ['whitespace', ' gantt '],
    ['a repeated param (array)', ['tsld', 'gantt']],
    ['a number', 1],
    ['null', null],
    ['undefined', undefined],
    ['an object', { view: 'gantt' }],
  ])('degrades %s to the default', (_label, value) => {
    expect(parsePlanViewMode(value)).toBe(DEFAULT_PLAN_VIEW_MODE);
  });

  it('defaults to the TSLD — the diagram stays lens #1', () => {
    expect(DEFAULT_PLAN_VIEW_MODE).toBe('tsld');
  });
});

describe('planViewModeSearch', () => {
  it('omits the default so the common URL stays clean', () => {
    expect(planViewModeSearch('tsld')).toEqual({});
  });

  it('serialises a non-default view', () => {
    expect(planViewModeSearch('gantt')).toEqual({ view: 'gantt' });
  });

  it('round-trips every view through parse', () => {
    for (const view of PLAN_VIEW_MODES) {
      expect(parsePlanViewMode(planViewModeSearch(view).view)).toBe(view);
    }
  });
});

describe('the view registry', () => {
  it('labels every view', () => {
    for (const view of PLAN_VIEW_MODES) {
      expect(PLAN_VIEW_MODE_LABELS[view]).toBeTruthy();
    }
  });

  it('lists the TSLD first — the switch presents the default leftmost', () => {
    expect(PLAN_VIEW_MODES[0]).toBe(DEFAULT_PLAN_VIEW_MODE);
  });
});
