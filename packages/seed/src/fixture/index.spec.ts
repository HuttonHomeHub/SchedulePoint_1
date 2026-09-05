import { describe, expect, it } from 'vitest';

import { fixtureSpec } from './index.js';

/**
 * The **fixture mapper**'s own tests (ADR-0066 M1). They sit beside the mapper rather than beside
 * the seeder because the two are now separate packages: `@repo/seed-http` knows how to CREATE a
 * spec through the API and nothing about where one came from, and every assertion below is about
 * the translation out of the P6 torture fixture into the application's vocabulary.
 */
describe('fixtureSpec', () => {
  it('maps the whole fixture and names what has no SchedulePoint concept', () => {
    const spec = fixtureSpec();
    // 129 real activities + 18 WBS nodes, each of which becomes a WBS_SUMMARY activity (ADR-0038).
    expect(spec.activities.length).toBe(129 + 18);
    expect(spec.dependencies).toHaveLength(188);
    expect(spec.calendars).toHaveLength(8);
    expect(spec.resources).toHaveLength(22);
    expect(spec.assignments).toHaveLength(45);

    // Roles, activity-code types and UDFs have no schema here. Reported, never silently dropped —
    // a reader must be able to tell "the app cannot hold this" from "the seeder forgot".
    const kinds = new Set(spec.unplaceable.map((u) => u.entity));
    expect(kinds).toEqual(new Set(['role', 'activity_code_type', 'udf_definition']));
    expect(spec.unplaceable.every((u) => u.reason.length > 0)).toBe(true);
  });

  it('maps P6 activity kinds to the domain, including Level of Effort', () => {
    const spec = fixtureSpec();
    const byType = new Map<string, number>();
    for (const activity of spec.activities) {
      byType.set(activity.type, (byType.get(activity.type) ?? 0) + 1);
    }
    // TASK_DEPENDENT is P6's name for an ordinary task; LOE is the capability the importer was
    // silently coercing away (the defect that motivated ADR-0066).
    expect(byType.get('TASK')).toBe(103);
    expect(byType.get('LEVEL_OF_EFFORT')).toBe(5);
    expect(byType.get('RESOURCE_DEPENDENT')).toBe(2);
    expect(byType.get('WBS_SUMMARY')).toBe(3 + 18);
  });

  it('carries the conformance test tags, so coverage is computable', () => {
    const tagged = fixtureSpec().activities.filter((a) => a.testTags.length > 0);
    expect(tagged.length).toBeGreaterThan(0);
  });
});

describe('fixtureSpec reads the project block', () => {
  it('takes the plan’s data date from the fixture’s data date, not its planned start', () => {
    // These are different dates in the fixture, and confusing them is not cosmetic: the data date
    // floors every computed early start (ADR-0023/0033), so against the planned start the API
    // rightly refused twenty actuals with ACTUAL_AFTER_DATA_DATE — and an unprogressed activity
    // landed on it, which is the "everything starts 02 Mar 2026" that was reported.
    expect(fixtureSpec().plan.dataDate).toBe('2026-03-02');
  });

  it('carries the fixture’s scheduling options through instead of defaulting them', () => {
    // `use_expected_finish_dates` is ON in the fixture, and without it every `expectedFinish` in the
    // data is inert (ADR-0035 §9) — the capability would be present and unexercised.
    expect(fixtureSpec().plan.options.useExpectedFinishDates).toBe(true);
  });

  it('maps P6’s LINEAR loading curve to the domain’s UNIFORM', () => {
    const curves = new Set(fixtureSpec().assignments.map((a) => a.curveType));
    expect(curves.has('UNIFORM')).toBe(true);
    expect([...curves]).not.toContain('LINEAR');
  });

  it('expands a dated exception range into one entry per day', () => {
    const dates = fixtureSpec().calendars.flatMap((c) => c.exceptions.map((e) => e.date));
    // Taking only a range's first day would quietly re-open a two-week shutdown, and every activity
    // across it would move with nothing failing.
    expect(dates.length).toBeGreaterThan(fixtureSpec().calendars.length);
    expect(dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
  });
});
