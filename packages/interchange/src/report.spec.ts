import { describe, expect, it } from 'vitest';

import {
  buildReportSchemas,
  interchangeReportSchema,
  interchangeReportStrictSchema,
  type InterchangeReport,
} from './report.js';

/**
 * ADR-0162 D9 (closes `docs/TECH_DEBT.md` #387): the report is read tolerantly and produced strictly,
 * from one field list. The web half drives the three parse sites
 * (`apps/web/src/features/interchange/api/report-tolerance.test.ts`); this suite pins the two modes.
 */

const REPORT: InterchangeReport = {
  detectedFormat: 'MSPDI',
  sourceVersion: null,
  sourceFilename: 'riverside.xml',
  mapped: { activities: 2, relationships: 1, calendars: 0, placements: 1 },
  approximations: [
    { kind: 'approximation', entity: 'calendar', sourceRef: null, detail: 'coerced to 24/7' },
  ],
  repairs: [
    {
      kind: 'repair',
      entity: 'relationship',
      sourceRef: 'A→B',
      detail: 'duplicate removed',
      reason: 'duplicate edge',
    },
  ],
  drops: [],
  resourceCollisions: [
    {
      resourceKey: 'r1',
      name: 'Crane',
      code: null,
      existing: { id: 'lib-1', name: 'Crane', code: 'CR', archived: true },
    },
  ],
};

/** One unknown key at every object level the report has. */
function withExtraKeys(): unknown {
  const r = structuredClone(REPORT) as unknown as Record<string, unknown> & {
    mapped: Record<string, unknown>;
    approximations: Record<string, unknown>[];
    resourceCollisions: (Record<string, unknown> & { existing: Record<string, unknown> })[];
  };
  r.extra = 1;
  r.mapped.extra = 1;
  r.approximations[0]!.extra = 1;
  r.resourceCollisions[0]!.extra = 1;
  r.resourceCollisions[0]!.existing.extra = 1;
  return r;
}

describe('the interchange report schema, read and produced (ADR-0162 D9)', () => {
  it('both modes accept the same report when it carries no extra key', () => {
    expect(interchangeReportSchema.parse(REPORT)).toEqual(REPORT);
    expect(interchangeReportStrictSchema.parse(REPORT)).toEqual(REPORT);
  });

  it('the reader strips an unknown key at every level and keeps every known field', () => {
    expect(interchangeReportSchema.parse(withExtraKeys())).toEqual(REPORT);
  });

  it('the strict schema refuses an unknown key at every level', () => {
    const result = interchangeReportStrictSchema.safeParse(withExtraKeys());
    expect(result.success).toBe(false);
    const paths = (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
    expect(paths.sort()).toEqual(
      [
        '',
        'mapped',
        'approximations.0',
        'resourceCollisions.0',
        'resourceCollisions.0.existing',
      ].sort(),
    );
  });

  it('the reader still refuses a known key with a wrong value: a negative count', () => {
    const bad = withExtraKeys() as { mapped: Record<string, unknown> };
    bad.mapped.activities = -1;
    expect(interchangeReportSchema.safeParse(bad).success).toBe(false);
  });

  it('the reader still refuses an unknown finding kind, and a missing required field', () => {
    const kind = withExtraKeys() as { approximations: { kind: string }[] };
    kind.approximations[0]!.kind = 'nonsense';
    expect(interchangeReportSchema.safeParse(kind).success).toBe(false);

    const missing = withExtraKeys() as {
      resourceCollisions: { existing: Record<string, unknown> }[];
    };
    delete missing.resourceCollisions[0]!.existing.archived;
    expect(interchangeReportSchema.safeParse(missing).success).toBe(false);
  });

  it('the two modes are built over the same fields, so they agree on which keys exist', () => {
    const strip = buildReportSchemas('strip');
    const strict = buildReportSchemas('strict');
    for (const part of ['finding', 'counts', 'collision', 'report'] as const) {
      expect(Object.keys(strict[part].shape).sort()).toEqual(Object.keys(strip[part].shape).sort());
    }
  });
});
