import { describe, expect, it } from 'vitest';

import {
  importGraphSchema,
  type ImportActivity,
  type ImportCalendar,
  type ImportGraph,
  type ImportResource,
} from './import-graph.js';
import {
  leaveOutCalendarsOnlyMatchedResourcesHold,
  resourceOnlyCalendarKeys,
  type MatchedResource,
} from './library-match.js';
import { isResourceTierFinding, resourceTierFinding } from './mapper.js';
import { boundReport, REPORT_SENTENCE_MAX_LENGTH, type InterchangeReport } from './report.js';

/**
 * ADR-0208 D7: a calendar only matched resources hold is left out, and the mapper's tier sentence for it
 * is replaced by one saying why. Graphs are built by hand so each case names exactly the shape it tests.
 */

const calendar = (key: string, name = key): ImportCalendar => ({
  key,
  name,
  scope: 'ORG',
  shifts: [{ weekday: 0, startMinute: 480, endMinute: 960 }],
  exceptions: [],
});

const resource = (key: string, calendarKey: string | null): ImportResource => ({
  key,
  name: `Crew ${key}`,
  code: key,
  kind: 'LABOUR',
  calendarKey,
  costPerUnit: null,
  maxUnitsPerHour: null,
});

const activity = (key: string, calendarKey: string | null): ImportActivity => ({
  key,
  code: key,
  name: key,
  type: 'TASK',
  durationMinutes: 480,
  calendarKey,
  parentKey: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  scheduleAsLateAsPossible: false,
  progress: null,
});

function graphOf(parts: {
  calendars: ImportCalendar[];
  resources: ImportResource[];
  activities?: ImportActivity[];
  defaultCalendarKey?: string | null;
}): ImportGraph {
  return importGraphSchema.parse({
    plan: {
      name: 'P',
      dataDate: '2026-01-05',
      defaultCalendarKey: parts.defaultCalendarKey ?? null,
    },
    calendars: parts.calendars,
    activities: parts.activities ?? [activity('A1', null)],
    dependencies: [],
    resources: parts.resources,
    assignments: [],
  });
}

/** The report the mapper would have produced: one tier approximation per resource-held calendar. */
function reportFor(graph: ImportGraph, keys: readonly string[]): InterchangeReport {
  return {
    detectedFormat: 'XER',
    sourceVersion: null,
    sourceFilename: null,
    mapped: {
      activities: graph.activities.length,
      relationships: 0,
      calendars: graph.calendars.length,
    },
    approximations: keys.map((key) =>
      resourceTierFinding({
        id: key,
        name: graph.calendars.find((c) => c.key === key)?.name ?? key,
      }),
    ),
    repairs: [],
    drops: [],
  };
}

const matchedAll = (graph: ImportGraph, same = false): Map<string, MatchedResource> =>
  new Map(graph.resources.map((r) => [r.key, { name: r.name, keptCalendarSame: same }]));

describe('leaveOutCalendarsOnlyMatchedResourcesHold', () => {
  it('leaves out a calendar only a matched resource holds and nulls the holder’s key (E1)', () => {
    const graph = graphOf({ calendars: [calendar('C1')], resources: [resource('R1', 'C1')] });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, ['C1']),
      matchedAll(graph),
    );
    expect(out.leftOut).toEqual(['C1']);
    expect(out.graph.calendars).toEqual([]);
    expect(out.graph.resources[0]?.calendarKey).toBeNull();
    // graph' is still a valid graph: every key it references exists.
    expect(() => importGraphSchema.parse(out.graph)).not.toThrow();
  });

  it('swaps the tier approximation for one approximation, in place (the count is unchanged)', () => {
    const graph = graphOf({
      calendars: [calendar('C1'), calendar('C2')],
      resources: [resource('R1', 'C1'), resource('R2', 'C2')],
    });
    const report = reportFor(graph, ['C1', 'C2']);
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      report,
      new Map([['R1', { name: 'Crew R1', keptCalendarSame: false }]]),
    );
    expect(out.leftOut).toEqual(['C1']);
    expect(out.report.approximations).toHaveLength(2);
    expect(out.report.approximations[0]?.detail).toBe(
      'calendar “C1” was not created: the only resources in the file that use it (“Crew R1”) ' +
        'matched existing resources, which keep their own calendars',
    );
    expect(out.report.approximations[0]?.kind).toBe('approximation');
    // C2's holder is not matched, so the mapper's own sentence for it stands untouched.
    expect(out.report.approximations[1]).toEqual(report.approximations[1]);
  });

  it('says the calendars are the same when every matched holder keeps an identical one', () => {
    const graph = graphOf({ calendars: [calendar('C1')], resources: [resource('R1', 'C1')] });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, ['C1']),
      matchedAll(graph, true),
    );
    expect(out.report.approximations[0]?.reason).toBe(
      'the calendar each of them already has is the same as the file’s, so nothing was lost',
    );
  });

  it('says the working week differs, naming only the holders that differ', () => {
    const graph = graphOf({
      calendars: [calendar('C1')],
      resources: [resource('R1', 'C1'), resource('R2', 'C1')],
    });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, ['C1']),
      new Map([
        ['R1', { name: 'Crew R1', keptCalendarSame: true }],
        ['R2', { name: 'Crew R2', keptCalendarSame: false }],
      ]),
    );
    expect(out.report.approximations[0]?.reason).toBe(
      'the file gives “Crew R2” a different working week, so its work is scheduled on the calendar ' +
        'the library already holds; an import never changes an existing resource’s calendar',
    );
  });

  it('uses the plural wording for several holders that differ, and shows only three names', () => {
    const graph = graphOf({
      calendars: [calendar('C1')],
      resources: ['R1', 'R2', 'R3', 'R4', 'R5'].map((key) => resource(key, 'C1')),
    });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, ['C1']),
      matchedAll(graph),
    );
    const finding = out.report.approximations[0];
    expect(finding?.detail).toContain('(“Crew R1”, “Crew R2”, “Crew R3” and 2 more)');
    expect(finding?.reason).toContain('“Crew R1”, “Crew R2”, “Crew R3” and 2 more a different');
    expect(finding?.reason).toContain('so their work');
  });

  it('keeps a calendar an inserted resource also holds (E8)', () => {
    const graph = graphOf({
      calendars: [calendar('C1')],
      resources: [resource('R1', 'C1'), resource('R2', 'C1')],
    });
    const report = reportFor(graph, ['C1']);
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      report,
      new Map([['R1', { name: 'Crew R1', keptCalendarSame: false }]]),
    );
    expect(out.leftOut).toEqual([]);
    expect(out.graph).toBe(graph);
    expect(out.report).toBe(report);
  });

  it('keeps a calendar an activity also uses (E6)', () => {
    const graph = graphOf({
      calendars: [calendar('C1')],
      resources: [resource('R1', 'C1')],
      activities: [activity('A1', 'C1')],
    });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, ['C1']),
      matchedAll(graph),
    );
    expect(out.leftOut).toEqual([]);
  });

  it('keeps the plan default calendar (E7)', () => {
    const graph = graphOf({
      calendars: [calendar('C1')],
      resources: [resource('R1', 'C1')],
      defaultCalendarKey: 'C1',
    });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, ['C1']),
      matchedAll(graph),
    );
    expect(out.leftOut).toEqual([]);
  });

  it('never leaves out a calendar no resource holds (E11)', () => {
    const graph = graphOf({ calendars: [calendar('C1')], resources: [resource('R1', null)] });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, []),
      matchedAll(graph),
    );
    expect(out.leftOut).toEqual([]);
    expect(resourceOnlyCalendarKeys(graph).size).toBe(0);
  });

  it('can leave every calendar out (E17)', () => {
    const graph = graphOf({ calendars: [calendar('C1')], resources: [resource('R1', 'C1')] });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, ['C1']),
      matchedAll(graph),
    );
    expect(out.graph.calendars).toHaveLength(0);
  });

  it('appends the new sentence when the report no longer carries the tier one', () => {
    const graph = graphOf({ calendars: [calendar('C1')], resources: [resource('R1', 'C1')] });
    const out = leaveOutCalendarsOnlyMatchedResourcesHold(
      graph,
      reportFor(graph, []),
      matchedAll(graph),
    );
    expect(out.report.approximations).toHaveLength(1);
  });
});

describe('isResourceTierFinding', () => {
  it('recognises the builder’s finding for its own calendar only', () => {
    const finding = resourceTierFinding({ id: 'C1', name: 'Crew Shift' });
    expect(isResourceTierFinding(finding, 'C1')).toBe(true);
    expect(isResourceTierFinding(finding, 'C2')).toBe(false);
    expect(isResourceTierFinding({ ...finding, kind: 'repair' }, 'C1')).toBe(false);
  });

  it('still matches after boundReport clamps a 2,100-character name and a 600-character key (R4)', () => {
    const longKey = `K${'x'.repeat(600)}`;
    const name = 'N'.repeat(2100);
    const graph = graphOf({
      calendars: [calendar(longKey, name)],
      resources: [resource('R1', longKey)],
    });
    const bounded = boundReport(reportFor(graph, [longKey]));
    const finding = bounded.approximations[0];
    // The clamp really changed it, or this test proves nothing.
    expect(finding?.detail.length).toBe(REPORT_SENTENCE_MAX_LENGTH);
    expect(finding?.sourceRef).not.toBe(longKey);
    expect(isResourceTierFinding(finding!, longKey)).toBe(true);

    const out = leaveOutCalendarsOnlyMatchedResourcesHold(graph, bounded, matchedAll(graph));
    expect(out.leftOut).toEqual([longKey]);
    expect(out.report.approximations).toHaveLength(1);
    // The swapped-in sentence is bounded like any other, so it is clamped, not refused (#399).
    expect(out.report.approximations[0]?.detail.length).toBe(REPORT_SENTENCE_MAX_LENGTH);
    expect(out.report.approximations[0]?.detail.startsWith('calendar “NNN')).toBe(true);
  });
});
