import { describe, expect, it } from 'vitest';

import {
  boundReport,
  buildReportSchemas,
  interchangeReportSchema,
  interchangeReportStrictSchema,
  REPORT_LABEL_MAX_LENGTH,
  REPORT_SENTENCE_MAX_LENGTH,
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
    for (const part of ['finding', 'counts', 'advisory', 'collision', 'report'] as const) {
      expect(Object.keys(strict[part].shape).sort()).toEqual(Object.keys(strip[part].shape).sort());
    }
  });
});

describe('import advisories on the report (ADR-0162 D1/D2, M3-T4)', () => {
  const ADVISORY = {
    code: 'ZERO_DURATION_TASK' as const,
    entity: 'activity' as const,
    sourceRef: 'A1030',
    detail: 'imported as a task with no duration',
  };

  it('both modes accept a report with no advisories key and one with advisories', () => {
    for (const schema of [interchangeReportSchema, interchangeReportStrictSchema]) {
      expect(schema.parse(REPORT)).toEqual(REPORT);
      expect('advisories' in schema.parse(REPORT)).toBe(false);
      const withAdvisories = { ...REPORT, advisories: [ADVISORY] };
      expect(schema.parse(withAdvisories)).toEqual(withAdvisories);
    }
  });

  it('refuses an advisory code outside the closed vocabulary, in both modes', () => {
    const bad = { ...REPORT, advisories: [{ ...ADVISORY, code: 'SOMETHING_ELSE' }] };
    expect(interchangeReportSchema.safeParse(bad).success).toBe(false);
    expect(interchangeReportStrictSchema.safeParse(bad).success).toBe(false);
  });

  it('the reader strips an unknown key inside an advisory; the strict schema refuses it', () => {
    const extra = { ...REPORT, advisories: [{ ...ADVISORY, later: true }] };
    expect(interchangeReportSchema.parse(extra)).toEqual({ ...REPORT, advisories: [ADVISORY] });
    expect(interchangeReportStrictSchema.safeParse(extra).success).toBe(false);
  });
});

describe('the report bounds its free text (TECH_DEBT #399)', () => {
  const long = (n: number): string => 'x'.repeat(n);
  const oversized: InterchangeReport = {
    ...REPORT,
    sourceFilename: long(REPORT_LABEL_MAX_LENGTH + 1),
    drops: [
      {
        kind: 'drop',
        entity: 'activity',
        sourceRef: long(REPORT_LABEL_MAX_LENGTH + 1),
        detail: long(REPORT_SENTENCE_MAX_LENGTH + 1),
        reason: long(REPORT_SENTENCE_MAX_LENGTH + 1),
      },
    ],
    resourceCollisions: [
      {
        resourceKey: long(REPORT_LABEL_MAX_LENGTH + 1),
        name: long(REPORT_LABEL_MAX_LENGTH + 1),
        code: long(REPORT_LABEL_MAX_LENGTH + 1),
        existing: { id: 'lib-1', name: 'Crane', code: null, archived: false },
      },
    ],
    advisories: [
      {
        code: 'ZERO_DURATION_TASK',
        entity: 'activity',
        sourceRef: long(REPORT_LABEL_MAX_LENGTH + 1),
        detail: long(REPORT_SENTENCE_MAX_LENGTH + 1),
      },
    ],
  };

  it('both modes refuse an over-long value, field by field', () => {
    for (const schema of [interchangeReportSchema, interchangeReportStrictSchema]) {
      expect(schema.safeParse(oversized).success).toBe(false);
    }
    for (const field of ['sourceRef', 'detail', 'reason'] as const) {
      const finding = {
        kind: 'drop' as const,
        entity: 'activity',
        sourceRef: 'ok',
        detail: 'ok',
        reason: 'ok',
        [field]: long(5000),
      };
      expect(
        interchangeReportSchema.safeParse({ ...REPORT, drops: [finding] }).success,
        field,
      ).toBe(false);
    }
  });

  it('accepts a value exactly at the ceiling', () => {
    const atCeiling = {
      ...REPORT,
      drops: [
        {
          kind: 'drop' as const,
          entity: 'activity',
          sourceRef: long(REPORT_LABEL_MAX_LENGTH),
          detail: long(REPORT_SENTENCE_MAX_LENGTH),
        },
      ],
    };
    expect(interchangeReportStrictSchema.safeParse(atCeiling).success).toBe(true);
  });

  it('boundReport truncates instead of refusing, so the bounded report always validates', () => {
    const bounded = boundReport(oversized);
    expect(interchangeReportStrictSchema.safeParse(bounded).success).toBe(true);
    expect(bounded.drops[0]!.detail).toHaveLength(REPORT_SENTENCE_MAX_LENGTH);
    expect(bounded.drops[0]!.detail.endsWith('…')).toBe(true);
    expect(bounded.sourceFilename).toHaveLength(REPORT_LABEL_MAX_LENGTH);
  });

  it('boundReport leaves a report within the ceilings exactly as it was', () => {
    expect(boundReport(REPORT)).toEqual(REPORT);
    expect('advisories' in boundReport(REPORT)).toBe(false);
  });

  it('boundReport never leaves half of a surrogate pair at the cut', () => {
    const bounded = boundReport({
      ...REPORT,
      drops: [
        {
          kind: 'drop',
          entity: 'activity',
          sourceRef: null,
          detail: '😀'.repeat(REPORT_SENTENCE_MAX_LENGTH),
        },
      ],
    });
    const detail = bounded.drops[0]!.detail;
    expect(detail.length).toBeLessThanOrEqual(REPORT_SENTENCE_MAX_LENGTH);
    expect(detail.slice(0, -1)).toMatch(/^(?:😀)+$/u);
  });
});
