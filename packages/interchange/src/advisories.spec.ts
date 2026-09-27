import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ZERO_DURATION_ADVISORY_DETAIL, zeroDurationAdvisories } from './advisories.js';
import type { ImportGraph } from './import-graph.js';
import { importMspdi } from './import-mspdi.js';
import { importXer } from './import-xer.js';
import { buildMspdi, standardWeekDays } from './mspdi.fixtures.js';
import { interchangeReportStrictSchema } from './report.js';
import { buildXer, standardClndrData, type XerTableSpec } from './xer.fixtures.js';

/**
 * **The zero-duration import advisory** (ADR-0162 D1/D2, M5-T1).
 *
 * Each case checks the report against the STRICT schema, the producer's own contract, so an
 * advisory that drifted in shape would fail here rather than be stripped silently by the tolerant
 * reader the web uses (FC-5 (b) vs (c)).
 */
const PROJECT: XerTableSpec = {
  name: 'PROJECT',
  fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'plan_start_date', 'clndr_id'],
  rows: [['P1', 'Sample', '2026-01-05 00:00', '2026-01-04 00:00', 'C1']],
};
const CALENDAR: XerTableSpec = {
  name: 'CALENDAR',
  fields: ['clndr_id', 'clndr_name', 'default_flag', 'day_hr_cnt', 'clndr_data'],
  rows: [['C1', 'Standard', 'Y', '8', standardClndrData([])]],
};

function xerWith(rows: string[][]): string {
  return buildXer([
    PROJECT,
    CALENDAR,
    {
      name: 'TASK',
      fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
      rows,
    },
  ]);
}

function xerReport(xer: string) {
  const result = importXer({ content: xer, filename: 'sample.xer' });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  expect(interchangeReportStrictSchema.safeParse(result.report).success).toBe(true);
  return result.report;
}

describe('zeroDurationAdvisories — XER', () => {
  it('names a zero-hour TT_Task by its code, and nothing else', () => {
    const report = xerReport(
      xerWith([
        ['T1', 'P1', 'Z1', 'Pour slab', 'TT_Task', '0'],
        ['T2', 'P1', 'A1', 'Work', 'TT_Task', '40'],
        ['T3', 'P1', 'M1', 'Start', 'TT_Mile', '0'],
        ['T4', 'P1', 'M2', 'Finish', 'TT_FinMile', '0'],
        ['T5', 'P1', 'L1', 'Supervision', 'TT_LOE', '0'],
      ]),
    );
    expect(report.advisories).toEqual([
      {
        code: 'ZERO_DURATION_TASK',
        entity: 'activity',
        sourceRef: 'Z1',
        detail: ZERO_DURATION_ADVISORY_DETAIL,
      },
    ]);
  });

  it('carries no advisories key for a file with none — absent, never empty (FC-5 (a))', () => {
    const report = xerReport(xerWith([['T1', 'P1', 'A1', 'Work', 'TT_Task', '40']]));
    expect('advisories' in report).toBe(false);
  });

  it('never files an advisory as a finding', () => {
    const report = xerReport(xerWith([['T1', 'P1', 'Z1', 'Pour slab', 'TT_Task', '0']]));
    const findings = [...report.approximations, ...report.repairs, ...report.drops];
    expect(findings.some((f) => f.detail === ZERO_DURATION_ADVISORY_DETAIL)).toBe(false);
  });

  it('names exactly A7550 in the torture XER (spec E15)', () => {
    const torture = readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        'engine-conformance',
        'fixtures',
        'p6_torture_test_v1.xer',
      ),
    );
    const result = importXer({ content: torture, filename: 'p6_torture_test_v1.xer' });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    expect(interchangeReportStrictSchema.safeParse(result.report).success).toBe(true);
    expect(result.report.advisories?.map((a) => a.sourceRef)).toEqual(['A7550']);
  });
});

describe('zeroDurationAdvisories — MSPDI', () => {
  const base = {
    name: 'Sample',
    currentDate: '2026-01-05T00:00:00',
    saveVersion: '14',
    calendarUid: 'C1',
    calendars: [{ uid: 'C1', name: 'Standard', weekDays: standardWeekDays(), exceptions: [] }],
  };

  it('names a zero-duration non-milestone task, and not a milestone or a summary', () => {
    const result = importMspdi({
      content: buildMspdi({
        ...base,
        tasks: [
          { uid: '1', id: '1', name: 'Area', outlineLevel: 1, summary: true },
          {
            uid: '2',
            id: '2',
            wbs: 'Z1',
            name: 'Pour slab',
            outlineLevel: 2,
            duration: 'PT0H0M0S',
          },
          {
            uid: '3',
            id: '3',
            wbs: 'A1',
            name: 'Work',
            outlineLevel: 2,
            duration: 'PT40H0M0S',
          },
          { uid: '4', id: '4', wbs: 'M1', name: 'Done', outlineLevel: 2, milestone: true },
        ],
      }),
      filename: 'sample.xml',
    });
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    expect(interchangeReportStrictSchema.safeParse(result.report).success).toBe(true);
    expect(result.report.advisories?.map((a) => a.sourceRef)).toEqual(['Z1']);
  });
});

describe('zeroDurationAdvisories — the predicate', () => {
  const activity = (type: string, durationMinutes: number, code: string) =>
    ({ type, durationMinutes, code }) as unknown as ImportGraph['activities'][number];

  it('advises on a zero-duration TASK only', () => {
    const graph = {
      activities: [
        activity('TASK', 0, 'Z1'),
        activity('TASK', 480, 'A1'),
        activity('START_MILESTONE', 0, 'M1'),
        activity('FINISH_MILESTONE', 0, 'M2'),
        activity('LEVEL_OF_EFFORT', 0, 'L1'),
        activity('WBS_SUMMARY', 0, 'W1'),
        activity('RESOURCE_DEPENDENT', 0, 'R1'),
      ],
    };
    expect(zeroDurationAdvisories(graph).map((a) => a.sourceRef)).toEqual(['Z1']);
  });
});

describe('both orchestrators produce advisories (census)', () => {
  it.each(['import-xer.ts', 'import-mspdi.ts'])('%s calls zeroDurationAdvisories', (file) => {
    const source = readFileSync(join(import.meta.dirname, file), 'utf8');
    expect(source).toContain('zeroDurationAdvisories(');
    expect(source).toContain('advisories.length > 0 ? { advisories } : {}');
  });
});
