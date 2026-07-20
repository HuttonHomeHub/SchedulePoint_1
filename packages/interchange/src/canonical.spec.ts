import { describe, expect, it } from 'vitest';

import { canonicalModelSchema, type CanonicalModel } from './canonical.js';
import { interchangeReportSchema, type InterchangeReport } from './report.js';

/**
 * A hand-built, in-scope M1 network model: one project, one calendar (Mon–Fri 08:00–16:00 with a New
 * Year holiday exception), two activities and a finish-to-start link. No parser/mapper yet (Tasks
 * 1.2/1.3) — this only proves the canonical types + their Zod schemas round-trip a realistic fixture.
 */
const fixture: CanonicalModel = {
  source: { format: 'XER', version: '18.8', filename: 'sample.xer' },
  project: { id: 'P1', name: 'Sample project', dataDate: '2026-01-05', defaultCalendarId: 'CAL-1' },
  calendars: [
    {
      id: 'CAL-1',
      name: 'Standard 5-day',
      workWeek: {
        monday: [{ start: '08:00', end: '16:00' }],
        tuesday: [{ start: '08:00', end: '16:00' }],
        wednesday: [{ start: '08:00', end: '16:00' }],
        thursday: [{ start: '08:00', end: '16:00' }],
        friday: [{ start: '08:00', end: '16:00' }],
        saturday: [],
        sunday: [],
      },
      exceptions: [{ date: '2026-01-01', working: false, shifts: [] }],
    },
  ],
  activities: [
    {
      id: 'A1',
      code: 'A1000',
      name: 'Mobilise',
      type: 'TASK',
      durationMinutes: 2400,
      calendarId: 'CAL-1',
    },
    {
      id: 'A2',
      code: 'A1010',
      name: 'Complete',
      type: 'FINISH_MILESTONE',
      durationMinutes: 0,
      calendarId: null,
    },
  ],
  relationships: [{ id: 'R1', predecessorId: 'A1', successorId: 'A2', type: 'FS', lagMinutes: 0 }],
};

const report: InterchangeReport = {
  detectedFormat: 'XER',
  sourceVersion: '18.8',
  sourceFilename: 'sample.xer',
  mapped: { activities: 2, relationships: 1, calendars: 1 },
  approximations: [
    {
      kind: 'approximation',
      entity: 'activity',
      sourceRef: 'A1',
      detail: 'duration "5d" → 2400min',
      reason: 'hours/days normalised to working-minutes (ADR-0036)',
    },
  ],
  repairs: [],
  drops: [
    {
      kind: 'drop',
      entity: 'resource',
      sourceRef: null,
      detail: '3 resource assignments not imported',
      reason: 'resources are out of M1 scope (ADR-0050)',
    },
  ],
};

describe('canonical interchange model', () => {
  it('round-trips a hand-built network model through its Zod schema', () => {
    const parsed = canonicalModelSchema.parse(fixture);
    expect(parsed).toEqual(fixture);
  });

  it('rejects an out-of-range duration', () => {
    const bad = structuredClone(fixture);
    bad.activities[0]!.durationMinutes = -1;
    expect(canonicalModelSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown relationship type', () => {
    const bad = structuredClone(fixture) as unknown as { relationships: Array<{ type: string }> };
    bad.relationships[0]!.type = 'XX';
    expect(canonicalModelSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unexpected extra key (strict schema catches drift)', () => {
    const bad = { ...fixture, unexpected: true };
    expect(canonicalModelSchema.safeParse(bad).success).toBe(false);
  });
});

describe('interchange report', () => {
  it('round-trips a hand-built report through its Zod schema', () => {
    const parsed = interchangeReportSchema.parse(report);
    expect(parsed).toEqual(report);
  });

  it('rejects an unknown finding kind', () => {
    const bad = structuredClone(report) as unknown as { drops: Array<{ kind: string }> };
    bad.drops[0]!.kind = 'nonsense';
    expect(interchangeReportSchema.safeParse(bad).success).toBe(false);
  });
});
