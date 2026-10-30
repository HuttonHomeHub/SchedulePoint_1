import { seedSpecSchema, seedSwimlanesSchema, type SeedSpec } from '@repo/seed';
import { describe, expect, it } from 'vitest';

import { capabilityKeys, coverageReport, UNREACHABLE, unknownTags } from './coverage.js';

import { CAPABILITY_FAMILIES, capabilityFamilyKeys, capabilitySpecs } from './index.js';

/**
 * The gate on the capability tier (ADR-0066 M2.2). What it holds is narrow and worth stating: it
 * proves the catalogue **describes** every capability, not that the application implements any of
 * them correctly. That is the M3 differential's job. What it does catch is a capability quietly
 * falling out of the catalogue — the failure mode ADR-0066 §4 calls the worst kind, because a
 * catalogue with no plan for a feature looks exactly like a feature nobody has reached yet.
 */
describe('capability coverage', () => {
  const specs = capabilitySpecs();

  it('leaves no capability without either a plan or a stated reason', () => {
    const report = coverageReport(specs);
    // The assertion is on the LIST, not the count: a count tells you something broke, the list
    // tells you which capability stopped being demonstrated.
    expect(report.missing).toEqual([]);
    expect(report.reached + report.excepted).toBe(capabilityKeys().length);
  });

  it('excepts only real capability keys, and never one a plan already reaches', () => {
    const known = new Set(capabilityKeys());
    for (const key of Object.keys(UNREACHABLE)) expect(known.has(key)).toBe(true);

    // An exception that is also reached is a stale exception: the gap closed and the note claiming
    // it is still open would then be read as current. That is the ADR-0058 failure exactly.
    const report = coverageReport(specs);
    const staleExceptions = report.rows
      .filter((row) => row.exception !== null && row.reachedBy.length > 0)
      .map((row) => row.key);
    expect(staleExceptions).toEqual([]);
  });

  it('gives every exception a reason, and a debt number where one is tracked', () => {
    for (const [key, exception] of Object.entries(UNREACHABLE)) {
      expect(exception.reason.length, key).toBeGreaterThan(20);
      if (exception.debt !== null) expect(exception.debt).toBeGreaterThan(0);
    }
  });

  it('tags nothing the fixture does not name', () => {
    // A typo in a testTags string is otherwise completely silent — the key it meant to reach stays
    // unreached, and the mis-spelling is counted as coverage of nothing.
    expect(unknownTags(specs)).toEqual([]);
  });
});

describe('the capability plans themselves', () => {
  const specs = capabilitySpecs();

  it('are valid seed specs', () => {
    for (const spec of specs) {
      expect(() => seedSpecSchema.parse(spec), spec.seedName).not.toThrow();
    }
  });

  it('stay small enough for a person to check by hand', () => {
    for (const spec of specs) {
      expect(spec.activities.length, spec.seedName).toBeGreaterThanOrEqual(3);
      // The one plan whose subject IS a count over 100, so it cannot be small: its 101 activities
      // are generated from one rule and are read for their codes, not their dates, which is what
      // the limit below protects. The exception is named so a second one has to be argued for.
      if (spec.seedName === 'capability-codes-wide') continue;
      // The entire point of this tier beside the 129-activity fixture. A plan that outgrows this is
      // one nobody will read, and an unread plan proves nothing about a date being wrong.
      expect(spec.activities.length, spec.seedName).toBeLessThanOrEqual(15);
    }
  });

  it('each state their expected outcome on the plan itself', () => {
    for (const spec of specs) {
      // Stored in the plan's own description, so the playbook's claim and the plan cannot drift
      // apart — they are one string, not two copies.
      expect(spec.plan.description, spec.seedName).toBeTruthy();
      expect((spec.plan.description ?? '').length, spec.seedName).toBeGreaterThan(60);
    }
  });

  it('the swimlane pair holds the same leaf activities, one by hand and one from the WBS', () => {
    const [byHand, byWbs] = capabilitySpecs('swimlanes');
    expect(byHand?.swimlanes?.source).toBe('MANUAL');
    expect(byWbs?.swimlanes).toEqual({ source: 'WBS', wbsLevel: 1 });
    const leaves = (spec: SeedSpec | undefined) =>
      (spec?.activities ?? []).filter((a) => a.type === 'TASK').map((a) => a.key);
    expect(leaves(byWbs)).toEqual(leaves(byHand));
    // Every filed leaf of the by-hand plan sits under a summary in the WBS plan, and the one
    // unassigned leaf under none, so the two derivations place the same activities together.
    const summaryOf = new Map((byWbs?.activities ?? []).map((a) => [a.key, a.parentKey]));
    for (const a of byHand?.activities ?? []) {
      expect(summaryOf.get(a.key) === null || summaryOf.get(a.key) === undefined, a.key).toBe(
        a.swimlaneKey == null,
      );
    }
  });

  it('the codes plan exhibits each state of "no value" the playbook describes', () => {
    const [plan] = capabilitySpecs('codes');
    const types = plan?.codes?.types ?? [];
    expect(types.map((t) => t.name)).toEqual(['Area', 'Trade', 'Phase']);
    const carried = (typeKey: string) =>
      new Set(
        (plan?.activities ?? []).flatMap((a) => {
          const value = a.codes?.[typeKey];
          return value === undefined ? [] : [value];
        }),
      );
    // Phase is used by nothing; Area and Trade each have one value no activity carries.
    expect(carried('phase').size).toBe(0);
    for (const type of types.filter((t) => t.key !== 'phase')) {
      expect(type.values.length - carried(type.key).size, type.key).toBe(1);
    }
    const without = (typeKey: string) =>
      (plan?.activities ?? []).filter((a) => a.codes?.[typeKey] === undefined).map((a) => a.key);
    expect(without('area')).toEqual(['CD_7', 'CD_8']);
    expect(without('trade')).toEqual(['CD_5', 'CD_8']);
  });

  it('the wide codes plan has Room one over the swimlane limit and Zone exactly at it', () => {
    const [plan] = capabilitySpecs('codes-wide');
    expect(plan?.activities).toHaveLength(101);
    const inUse = (typeKey: string) =>
      new Set((plan?.activities ?? []).map((a) => a.codes?.[typeKey]));
    expect(inUse('room').size).toBe(101);
    expect(inUse('zone').size).toBe(100);
    // Every value of both types is carried, so the count in use is the count of values.
    const types = plan?.codes?.types ?? [];
    expect(types.map((t) => [t.name, t.values.length])).toEqual([
      ['Room', 101],
      ['Zone', 100],
    ]);
    // Zone's one shared value is carried by exactly two activities, the first and the last.
    const sharers = (plan?.activities ?? []).filter((a) => a.codes?.['zone'] === 'z001');
    expect(sharers.map((a) => a.key)).toEqual(['CW_001', 'CW_101']);
    // Its own family: the eight-activity plan every earlier case reads is not widened.
    expect(capabilitySpecs('codes')[0]?.activities).toHaveLength(8);
    expect(capabilitySpecs('codes')).toHaveLength(1);
  });

  it('refuse a swimlane source the API would refuse', () => {
    const lane = { key: 'a', name: 'A' };
    expect(() => seedSwimlanesSchema.parse({ source: 'MANUAL', lanes: [lane, lane] })).toThrow();
    expect(() => seedSwimlanesSchema.parse({ source: 'WBS' })).toThrow();
    expect(() => seedSwimlanesSchema.parse({ source: 'WBS', wbsLevel: 4 })).toThrow();
    expect(() => seedSwimlanesSchema.parse({ source: 'WBS', wbsLevel: 2 })).not.toThrow();
  });

  it('have unique seed names, so a re-seed cannot silently merge two plans', () => {
    const names = specs.map((spec) => spec.seedName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('declare no PROJECT calendar name twice, so any two can be seeded into one project (#428)', () => {
    // A project calendar's name is unique within its project and the seeder treats the 409 as a
    // finding, so two plans built from one another must not both carry the inherited calendar.
    const names = specs.flatMap((spec) => spec.calendars.map((c) => c.name));
    const repeated = names.filter((name, index) => names.indexOf(name) !== index);
    expect(repeated).toEqual([]);
  });

  it('reference only keys they define', () => {
    for (const spec of specs) {
      const activityKeys = new Set(spec.activities.map((a) => a.key));
      const calendarKeys = new Set(spec.calendars.map((c) => c.key));
      const resourceKeys = new Set(spec.resources.map((r) => r.key));

      for (const dependency of spec.dependencies) {
        expect(activityKeys.has(dependency.predecessorKey), spec.seedName).toBe(true);
        expect(activityKeys.has(dependency.successorKey), spec.seedName).toBe(true);
      }
      for (const item of spec.activities) {
        if (item.calendarKey !== null)
          expect(calendarKeys.has(item.calendarKey), item.key).toBe(true);
        if (item.parentKey !== null) expect(activityKeys.has(item.parentKey), item.key).toBe(true);
      }
      for (const item of spec.resources) {
        if (item.calendarKey !== null)
          expect(calendarKeys.has(item.calendarKey), item.key).toBe(true);
        if (item.parentKey !== null) expect(resourceKeys.has(item.parentKey), item.key).toBe(true);
      }
      for (const item of spec.assignments) {
        expect(activityKeys.has(item.activityKey), spec.seedName).toBe(true);
        expect(resourceKeys.has(item.resourceKey), spec.seedName).toBe(true);
      }
      if (spec.plan.defaultCalendarKey !== null) {
        expect(calendarKeys.has(spec.plan.defaultCalendarKey), spec.seedName).toBe(true);
      }
    }
  });

  it('give a resource only an ORG calendar', () => {
    for (const spec of specs) {
      const scopeByKey = new Map(spec.calendars.map((c) => [c.key, c.scope]));
      for (const item of spec.resources) {
        // ADR-0053 §2: a project calendar on a resource is a hard 422. Catching it here means the
        // catalogue cannot ship a plan the seeder is guaranteed to fail halfway through.
        if (item.calendarKey !== null) {
          expect(scopeByKey.get(item.calendarKey), `${spec.seedName}/${item.key}`).toBe('ORG');
        }
      }
    }
  });

  it('never make a GROUP resource assignable or give it scheduling fields', () => {
    for (const spec of specs) {
      const groups = new Set(spec.resources.filter((r) => r.kind === 'GROUP').map((r) => r.key));
      for (const item of spec.resources.filter((r) => r.kind === 'GROUP')) {
        // The same-row CHECK `ck_resources_group_no_scheduling_fields` (ADR-0053 §3) rejects these.
        expect(item.calendarKey, item.key).toBeNull();
        expect(item.maxUnitsPerHour, item.key).toBeNull();
        expect(item.costPerUnit, item.key).toBeNull();
      }
      for (const item of spec.assignments) {
        expect(groups.has(item.resourceKey), `${spec.seedName}/${item.resourceKey}`).toBe(false);
      }
    }
  });

  it('only parent a WBS_SUMMARY, and never give one logic', () => {
    for (const spec of specs) {
      const byKey = new Map(spec.activities.map((a) => [a.key, a]));
      for (const item of spec.activities) {
        // ADR-0038: only a summary may be a parent, and a summary is never a dependency endpoint.
        if (item.parentKey !== null) {
          expect(byKey.get(item.parentKey)?.type, item.key).toBe('WBS_SUMMARY');
        }
      }
      const summaries = new Set(
        spec.activities.filter((a) => a.type === 'WBS_SUMMARY').map((a) => a.key),
      );
      for (const dependency of spec.dependencies) {
        expect(summaries.has(dependency.predecessorKey), spec.seedName).toBe(false);
        expect(summaries.has(dependency.successorKey), spec.seedName).toBe(false);
      }
    }
  });

  it('never state the same edge twice', () => {
    for (const spec of specs) {
      // An exact duplicate (the same ordered pair AND type) is a documented reject (ADR-0035 §13 as
      // amended, `uq_dependencies_pred_succ_type`), so this would fail mid-seed with a finding that says
      // nothing about the capability the plan is meant to demonstrate. A different type between the
      // same pair is the construction ladder and is legal, which `capability-redundant-logic-calendars`
      // relies on; this said "same pair" until 2026-10-17 and described the pre-amendment rule.
      const pairs = spec.dependencies.map((d) => `${d.predecessorKey}→${d.successorKey}:${d.type}`);
      expect(new Set(pairs).size, spec.seedName).toBe(pairs.length);
    }
  });
});

describe('the family registry', () => {
  it('filters to one family, and returns nothing for an unknown one', () => {
    for (const key of capabilityFamilyKeys()) {
      expect(capabilitySpecs(key).length).toBeGreaterThan(0);
    }
    expect(capabilitySpecs('not-a-family')).toEqual([]);
  });

  it('covers every registered builder when unfiltered', () => {
    expect(capabilitySpecs()).toHaveLength(CAPABILITY_FAMILIES.length);
  });
});
