import { describe, expect, it } from 'vitest';

import type { CanonicalCalendar, CanonicalModel, CanonicalResource } from './canonical.js';
import { importGraphSchema, type ImportCalendarScope } from './import-graph.js';
import { importXer } from './import-xer.js';
import { mapCanonicalToImportGraph, type MapOptions } from './mapper.js';
import type { ReportFinding } from './report.js';
import { buildXer, standardClndrData, type XerTableSpec } from './xer.fixtures.js';

/**
 * Tests for the ONE decision the canonical → import-graph mapper makes: the **calendar tier** each
 * imported calendar lands at (ADR-0053 §5). Before this rule every imported calendar was created in the
 * shared organisation library, so schedule import was a tenant-wide pollution vector; the mapper is now
 * the single place that decides otherwise, and every decision is reported.
 *
 * Each source calendar type is asserted against its expected `scope` **and** its finding, plus the two
 * precedence cases the persistence layer depends on: a resource's calendar is forced to `ORG` whatever
 * the source called it (a resource is org-global — ADR-0053 §2 hard-rejects a project calendar on one),
 * and that forcing beats the `globalCalendarScope` option. The XER half asserts the `clndr_type` fidelity
 * this rests on: the column is now READ (it was neither read nor emitted before M5).
 */

const WORK_WEEK: CanonicalCalendar['workWeek'] = {
  monday: [{ start: '08:00', end: '16:00' }],
  tuesday: [{ start: '08:00', end: '16:00' }],
  wednesday: [{ start: '08:00', end: '16:00' }],
  thursday: [{ start: '08:00', end: '16:00' }],
  friday: [{ start: '08:00', end: '16:00' }],
  saturday: [],
  sunday: [],
};

function calendar(
  id: string,
  sourceType: CanonicalCalendar['sourceType'],
  name = `Calendar ${id}`,
): CanonicalCalendar {
  return { id, name, sourceType, workWeek: WORK_WEEK, exceptions: [] };
}

function resource(id: string, calendarId: string | null): CanonicalResource {
  return {
    id,
    name: `Resource ${id}`,
    code: null,
    kind: 'LABOUR',
    calendarId,
    costPerUnit: null,
    maxUnitsPerHour: null,
  };
}

function model(
  calendars: CanonicalCalendar[],
  resources: CanonicalResource[] = [],
): CanonicalModel {
  return {
    source: { format: 'XER', version: '18.8', filename: 'sample.xer' },
    project: { id: 'P1', name: 'Sample', dataDate: '2026-01-05', defaultCalendarId: null },
    calendars,
    activities: [],
    relationships: [],
    resources,
    assignments: [],
  };
}

/** Map and return the scope + findings for a single calendar, keyed by calendar id. */
function scopeOf(
  calendars: CanonicalCalendar[],
  resources: CanonicalResource[] = [],
  options: MapOptions = {},
): { scopes: Record<string, ImportCalendarScope>; findings: ReportFinding[] } {
  const { graph, findings } = mapCanonicalToImportGraph(model(calendars, resources), options);
  expect(importGraphSchema.safeParse(graph).success).toBe(true);
  const scopes: Record<string, ImportCalendarScope> = {};
  for (const c of graph.calendars) scopes[c.key] = c.scope;
  return { scopes, findings };
}

/** The calendar findings attributable to one source calendar. */
function calendarFindings(findings: readonly ReportFinding[], sourceRef: string): ReportFinding[] {
  return findings.filter((f) => f.entity === 'calendar' && f.sourceRef === sourceRef);
}

describe('mapCanonicalToImportGraph — calendar tier (ADR-0053 §5)', () => {
  it('lands a source PROJECT calendar at project scope, silently (it is the default, not a coercion)', () => {
    const { scopes, findings } = scopeOf([calendar('C1', 'PROJECT')]);
    expect(scopes.C1).toBe('PROJECT');
    expect(calendarFindings(findings, 'C1')).toEqual([]);
  });

  it('lands a source GLOBAL calendar at project scope by default, with a promote recommendation', () => {
    const { scopes, findings } = scopeOf([calendar('C1', 'GLOBAL', 'Standard 5-Day')]);
    expect(scopes.C1).toBe('PROJECT');
    const [finding, ...rest] = calendarFindings(findings, 'C1');
    expect(rest).toEqual([]);
    expect(finding?.kind).toBe('approximation');
    expect(finding?.detail).toContain('Standard 5-Day');
    expect(finding?.detail).toContain('project scope');
    expect(finding?.detail).toMatch(/promote/i);
  });

  it('lands a source GLOBAL calendar in the org library when globalCalendarScope: "ORG" is requested', () => {
    const { scopes, findings } = scopeOf([calendar('C1', 'GLOBAL')], [], {
      globalCalendarScope: 'ORG',
    });
    expect(scopes.C1).toBe('ORG');
    expect(calendarFindings(findings, 'C1')[0]?.detail).toContain('organisation');
  });

  it('forces a calendar an imported RESOURCE holds to org scope, whatever the source called it', () => {
    for (const sourceType of ['RESOURCE', 'PROJECT', 'GLOBAL'] as const) {
      const { scopes, findings } = scopeOf([calendar('C1', sourceType)], [resource('R1', 'C1')]);
      expect(scopes.C1).toBe('ORG');
      const found = calendarFindings(findings, 'C1');
      // Exactly ONE finding: the resource rule wins outright rather than stacking with the global rule.
      expect(found).toHaveLength(1);
      expect(found[0]?.detail).toContain('organisation');
      expect(found[0]?.reason).toMatch(/resource is organisation-global/);
    }
  });

  it('beats the globalCalendarScope option: a resource calendar is ORG even when globals go to PROJECT', () => {
    const { scopes } = scopeOf([calendar('C1', 'GLOBAL')], [resource('R1', 'C1')], {
      globalCalendarScope: 'PROJECT',
    });
    expect(scopes.C1).toBe('ORG');
  });

  it('lands an UNUSED source RESOURCE calendar at project scope (nothing org-global holds it)', () => {
    const { scopes, findings } = scopeOf([calendar('C1', 'RESOURCE')], [resource('R1', null)]);
    expect(scopes.C1).toBe('PROJECT');
    expect(calendarFindings(findings, 'C1')).toEqual([]);
  });

  it('decides per calendar, so one file can produce both tiers', () => {
    const { scopes } = scopeOf(
      [calendar('C1', 'PROJECT'), calendar('C2', 'RESOURCE'), calendar('C3', 'GLOBAL')],
      [resource('R1', 'C2')],
      { globalCalendarScope: 'ORG' },
    );
    expect(scopes).toEqual({ C1: 'PROJECT', C2: 'ORG', C3: 'ORG' });
  });
});

// ---------------------------------------------------------------------------------------------------------
// The XER half: `clndr_type` fidelity (it was neither read on import nor emitted on export before M5).
// ---------------------------------------------------------------------------------------------------------

const PROJECT_TABLE: XerTableSpec = {
  name: 'PROJECT',
  fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'plan_start_date'],
  rows: [['P1', 'Sample', '2026-01-05 00:00', '2026-01-04 00:00']],
};

/** A one-calendar XER whose `clndr_type` column carries `type` (omit the column entirely with `null`). */
function xerWithClndrType(type: string | null): string {
  const fields = ['clndr_id', 'clndr_name', 'default_flag', 'day_hr_cnt', 'clndr_data'];
  const row = ['C1', 'Standard', 'Y', '8', standardClndrData()];
  if (type !== null) {
    fields.splice(2, 0, 'clndr_type');
    row.splice(2, 0, type);
  }
  return buildXer([PROJECT_TABLE, { name: 'CALENDAR', fields, rows: [row] }]);
}

function importOk(xer: string, globalCalendarScope?: ImportCalendarScope) {
  const result = importXer({
    content: xer,
    ...(globalCalendarScope === undefined ? {} : { globalCalendarScope }),
  });
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result;
}

describe('importXer — CALENDAR.clndr_type drives the tier (ADR-0053 §5)', () => {
  it('reads CA_Project → project scope', () => {
    expect(importOk(xerWithClndrType('CA_Project')).graph.calendars[0]?.scope).toBe('PROJECT');
  });

  it('reads CA_Base → project scope by default, org scope on the explicit opt-in', () => {
    expect(importOk(xerWithClndrType('CA_Base')).graph.calendars[0]?.scope).toBe('PROJECT');
    expect(importOk(xerWithClndrType('CA_Base'), 'ORG').graph.calendars[0]?.scope).toBe('ORG');
  });

  it('reads CA_Rsrc → org scope when a resource holds it (the US-3 resource rule)', () => {
    const xer = buildXer([
      PROJECT_TABLE,
      {
        name: 'CALENDAR',
        fields: ['clndr_id', 'clndr_name', 'clndr_type', 'day_hr_cnt', 'clndr_data'],
        rows: [['C1', 'Crew', 'CA_Rsrc', '8', standardClndrData()]],
      },
      {
        name: 'RSRC',
        fields: ['rsrc_id', 'rsrc_short_name', 'rsrc_name', 'rsrc_type', 'clndr_id'],
        rows: [['R1', 'CR', 'Crew', 'RT_Labor', 'C1']],
      },
    ]);
    const { graph, report } = importOk(xer);
    expect(graph.calendars[0]?.scope).toBe('ORG');
    expect(graph.resources[0]?.calendarKey).toBe('C1');
    expect(report.approximations.some((f) => f.entity === 'calendar' && f.sourceRef === 'C1')).toBe(
      true,
    );
  });

  it('falls back to project scope for an ABSENT clndr_type column, without a spurious finding', () => {
    const { graph, report } = importOk(xerWithClndrType(null));
    expect(graph.calendars[0]?.scope).toBe('PROJECT');
    expect(report.approximations.filter((f) => f.sourceRef === 'C1')).toEqual([]);
  });

  it('falls back to project scope for an UNRECOGNISED clndr_type, and reports it', () => {
    const { graph, report } = importOk(xerWithClndrType('CA_Nonsense'));
    expect(graph.calendars[0]?.scope).toBe('PROJECT');
    expect(
      report.approximations.some((f) => f.sourceRef === 'C1' && f.detail.includes('CA_Nonsense')),
    ).toBe(true);
  });

  it('does NOT claim the calendar type was dropped any more (the mapping contract is honest)', () => {
    const { report } = importOk(xerWithClndrType('CA_Base'));
    const calendarDrop = report.drops.find((f) => f.entity === 'calendar');
    expect(calendarDrop?.detail).not.toMatch(/calendar type/);
    expect(calendarDrop?.detail).toMatch(/base-calendar inheritance/);
  });
});

describe('importXer — CALENDAR.day_hr_cnt is the calendar’s standard working day (ADR-0068)', () => {
  /** A calendar's hours-per-day is the day↔minute factor for every duration measured on it, so
      losing it re-reads the file's own durations at 24 h/day — a 5-day task arriving as 2. */
  it('carries the source figure into the import graph', () => {
    expect(importOk(xerWithClndrType(null)).graph.calendars[0]?.hoursPerDay).toBe(8);
  });

  it('carries a fractional figure exactly, without rounding to a whole hour', () => {
    const xer = buildXer([
      PROJECT_TABLE,
      {
        name: 'CALENDAR',
        fields: ['clndr_id', 'clndr_name', 'default_flag', 'day_hr_cnt', 'clndr_data'],
        rows: [['C1', 'Site', 'Y', '7.5', standardClndrData()]],
      },
    ]);
    expect(importOk(xer).graph.calendars[0]?.hoursPerDay).toBe(7.5);
  });

  /** Absent = "let the target derive it", NOT "assume eight" — inventing a figure here would be a
      silent retiming dressed up as a default. */
  it('omits it entirely when the source has no day_hr_cnt column', () => {
    const xer = buildXer([
      PROJECT_TABLE,
      {
        name: 'CALENDAR',
        fields: ['clndr_id', 'clndr_name', 'default_flag', 'clndr_data'],
        rows: [['C1', 'Standard', 'Y', standardClndrData()]],
      },
    ]);
    expect(importOk(xer).graph.calendars[0]).not.toHaveProperty('hoursPerDay');
  });

  it('rejects an out-of-range figure rather than storing an impossible day', () => {
    const xer = buildXer([
      PROJECT_TABLE,
      {
        name: 'CALENDAR',
        fields: ['clndr_id', 'clndr_name', 'default_flag', 'day_hr_cnt', 'clndr_data'],
        rows: [['C1', 'Broken', 'Y', '0', standardClndrData()]],
      },
    ]);
    expect(importOk(xer).graph.calendars[0]).not.toHaveProperty('hoursPerDay');
  });
});
