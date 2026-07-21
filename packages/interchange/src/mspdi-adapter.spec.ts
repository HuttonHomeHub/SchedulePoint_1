import { describe, expect, it } from 'vitest';

import { canonicalModelSchema, type CanonicalModel } from './canonical.js';
import { adaptMspdiToCanonical } from './mspdi-adapter.js';
import { parseMspdi } from './mspdi-parser.js';
import {
  buildMspdi,
  standardWeekDays,
  type MspdiProjectSpec,
  type MspdiTaskSpec,
} from './mspdi.fixtures.js';
import type { ReportFinding } from './report.js';

/**
 * Fixture-driven tests for the MSPDI → canonical adapter (Task 3.3): the one place MS Project's element
 * vocabulary, numeric enums, the `PT#H#M#S` duration convention, the tenths-of-a-minute lag unit and the
 * outline-level WBS model are interpreted. Every mapping produces the SAME format-neutral canonical model
 * the XER adapter yields, plus honest findings — so the downstream mapper / validate / report reuse is
 * exercised end-to-end by `import-mspdi.spec.ts`.
 */

const STD_CAL = {
  uid: 'C1',
  name: 'Standard',
  weekDays: standardWeekDays(),
  exceptions: [{ fromDate: '2026-01-01T00:00:00', toDate: '2026-01-01T23:59:00', working: false }],
};

function adaptOk(spec: MspdiProjectSpec): { model: CanonicalModel; findings: ReportFinding[] } {
  const parsed = parseMspdi(buildMspdi(spec));
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error.code}`);
  const adapted = adaptMspdiToCanonical(parsed.document, 'sample.xml');
  if (!adapted.ok) throw new Error(`adapt failed: ${adapted.error.code}`);
  return { model: adapted.model, findings: adapted.findings };
}

const BASE: MspdiProjectSpec = {
  name: 'Sample',
  currentDate: '2026-01-05T00:00:00',
  calendarUid: 'C1',
  calendars: [STD_CAL],
};

describe('adaptMspdiToCanonical — project + calendars', () => {
  const { model } = adaptOk({
    ...BASE,
    tasks: [{ uid: '1', id: '1', name: 'A', duration: 'PT8H0M0S', outlineLevel: 1 }],
  });

  it('produces a Zod-valid canonical model with MSPDI provenance', () => {
    expect(canonicalModelSchema.safeParse(model).success).toBe(true);
    expect(model.source.format).toBe('MSPDI');
    expect(model.source.version).toBe('14');
    expect(model.source.filename).toBe('sample.xml');
  });

  it('maps the project name, data date and default calendar', () => {
    expect(model.project.name).toBe('Sample');
    expect(model.project.dataDate).toBe('2026-01-05');
    expect(model.project.defaultCalendarId).toBe('C1');
  });

  it('maps the weekly work pattern (Mon–Fri 08:00–16:00) and a dated exception', () => {
    const cal = model.calendars[0];
    expect(cal?.workWeek.monday).toEqual([{ start: '08:00', end: '16:00' }]);
    expect(cal?.workWeek.friday).toEqual([{ start: '08:00', end: '16:00' }]);
    expect(cal?.workWeek.sunday).toEqual([]);
    expect(cal?.workWeek.saturday).toEqual([]);
    expect(cal?.exceptions).toEqual([{ date: '2026-01-01', working: false, shifts: [] }]);
  });

  it('falls back to StatusDate when CurrentDate is absent', () => {
    const { model: m } = adaptOk({
      name: 'S',
      statusDate: '2026-02-02T00:00:00',
      calendars: [STD_CAL],
      tasks: [{ uid: '1', name: 'A', duration: 'PT8H0M0S' }],
    });
    expect(m.project.dataDate).toBe('2026-02-02');
  });

  it('rejects a project with no data date', () => {
    const parsed = parseMspdi(
      buildMspdi({ name: 'S', calendars: [STD_CAL], tasks: [{ uid: '1', name: 'A' }] }),
    );
    if (!parsed.ok) throw new Error('parse failed');
    const adapted = adaptMspdiToCanonical(parsed.document, null);
    expect(adapted.ok).toBe(false);
    if (!adapted.ok) expect(adapted.error.code).toBe('NO_DATA_DATE');
  });
});

describe('adaptMspdiToCanonical — activity types + durations', () => {
  it('maps TASK, both milestone directions and WBS_SUMMARY', () => {
    const tasks: MspdiTaskSpec[] = [
      { uid: '1', id: '1', name: 'Summary', outlineLevel: 1, summary: true },
      { uid: '2', id: '2', name: 'Work', outlineLevel: 2, duration: 'PT40H0M0S' },
      { uid: '3', id: '3', name: 'Kickoff', outlineLevel: 2, milestone: true }, // no predecessor → START
      {
        uid: '4',
        id: '4',
        name: 'Done',
        outlineLevel: 2,
        milestone: true,
        predecessors: [{ uid: '2', type: '1' }], // has predecessor → FINISH
      },
    ];
    const { model } = adaptOk({ ...BASE, tasks });
    const byId = (id: string) => model.activities.find((a) => a.id === id);
    expect(byId('1')?.type).toBe('WBS_SUMMARY');
    expect(byId('2')).toMatchObject({ type: 'TASK', durationMinutes: 2400 }); // 40h × 60
    expect(byId('3')?.type).toBe('START_MILESTONE');
    expect(byId('4')?.type).toBe('FINISH_MILESTONE');
    // A milestone / summary carries zero duration.
    expect(byId('1')?.durationMinutes).toBe(0);
    expect(byId('3')?.durationMinutes).toBe(0);
  });

  it('derives WBS parentId from the outline structure (nearest preceding lower-level summary)', () => {
    const tasks: MspdiTaskSpec[] = [
      { uid: '1', name: 'Project', outlineLevel: 1, summary: true },
      { uid: '2', name: 'Task under project', outlineLevel: 2, duration: 'PT8H0M0S' },
      { uid: '3', name: 'Area', outlineLevel: 2, summary: true },
      { uid: '4', name: 'Task under area', outlineLevel: 3, duration: 'PT8H0M0S' },
    ];
    const { model } = adaptOk({ ...BASE, tasks });
    const parentOf = (id: string) => model.activities.find((a) => a.id === id)?.parentId;
    expect(parentOf('1')).toBeNull();
    expect(parentOf('2')).toBe('1');
    expect(parentOf('3')).toBe('1');
    expect(parentOf('4')).toBe('3');
  });

  it('rounds a fractional ISO duration and reports it', () => {
    const { model, findings } = adaptOk({
      ...BASE,
      tasks: [{ uid: '1', name: 'Odd', duration: 'PT1H0M30S' }],
    });
    expect(model.activities[0]?.durationMinutes).toBe(61); // 60 + round(30/60=0.5)=61
    expect(findings.some((f) => f.entity === 'activity' && f.detail.includes('rounded'))).toBe(
      true,
    );
  });
});

describe('adaptMspdiToCanonical — constraints', () => {
  const numbers: Array<[string, string | null]> = [
    ['2', 'MSO'],
    ['3', 'MFO'],
    ['4', 'SNET'],
    ['5', 'SNLT'],
    ['6', 'FNET'],
    ['7', 'FNLT'],
  ];

  it.each(numbers)('maps MSP constraint number %s → canonical %s', (num, expected) => {
    const { model } = adaptOk({
      ...BASE,
      tasks: [
        {
          uid: '1',
          name: 'C',
          duration: 'PT8H0M0S',
          constraintType: num,
          constraintDate: '2026-01-10T00:00:00',
        },
      ],
    });
    expect(model.activities[0]?.constraintType).toBe(expected);
    expect(model.activities[0]?.constraintDate).toBe('2026-01-10');
  });

  it('maps ASAP (0) to no constraint and ALAP (1) to the flag', () => {
    const { model } = adaptOk({
      ...BASE,
      tasks: [
        { uid: '1', name: 'ASAP', duration: 'PT8H0M0S', constraintType: '0' },
        { uid: '2', name: 'ALAP', duration: 'PT8H0M0S', constraintType: '1' },
      ],
    });
    expect(model.activities[0]).toMatchObject({
      constraintType: null,
      scheduleAsLateAsPossible: false,
    });
    expect(model.activities[1]).toMatchObject({
      constraintType: null,
      scheduleAsLateAsPossible: true,
    });
  });

  it('maps a Deadline to a secondary FNLT constraint and reports the approximation', () => {
    const { model, findings } = adaptOk({
      ...BASE,
      tasks: [{ uid: '1', name: 'D', duration: 'PT8H0M0S', deadline: '2026-03-01T00:00:00' }],
    });
    expect(model.activities[0]).toMatchObject({
      secondaryConstraintType: 'FNLT',
      secondaryConstraintDate: '2026-03-01',
    });
    expect(findings.some((f) => f.detail.includes('deadline'))).toBe(true);
  });

  it('drops an out-of-range constraint number and reports it', () => {
    const { model, findings } = adaptOk({
      ...BASE,
      tasks: [
        {
          uid: '1',
          name: 'X',
          duration: 'PT8H0M0S',
          constraintType: '99',
          constraintDate: '2026-01-10T00:00:00',
        },
      ],
    });
    expect(model.activities[0]?.constraintType).toBeNull();
    expect(findings.some((f) => f.entity === 'constraint')).toBe(true);
  });
});

describe('adaptMspdiToCanonical — progress', () => {
  it('maps an in-progress task', () => {
    const { model } = adaptOk({
      ...BASE,
      tasks: [
        {
          uid: '1',
          name: 'WIP',
          duration: 'PT16H0M0S',
          percentComplete: '50',
          actualStart: '2026-01-03T00:00:00',
          remainingDuration: 'PT8H0M0S',
        },
      ],
    });
    expect(model.activities[0]?.progress).toMatchObject({
      status: 'IN_PROGRESS',
      percentComplete: 50,
      actualStart: '2026-01-03',
      remainingDurationMinutes: 480,
    });
  });

  it('maps a complete task and leaves an un-progressed task with null progress', () => {
    const { model } = adaptOk({
      ...BASE,
      tasks: [
        {
          uid: '1',
          name: 'Done',
          duration: 'PT8H0M0S',
          percentComplete: '100',
          actualFinish: '2026-01-04T00:00:00',
        },
        { uid: '2', name: 'Fresh', duration: 'PT8H0M0S' },
      ],
    });
    expect(model.activities[0]?.progress).toMatchObject({
      status: 'COMPLETE',
      actualFinish: '2026-01-04',
    });
    expect(model.activities[1]?.progress).toBeNull();
  });
});

describe('adaptMspdiToCanonical — relationships', () => {
  it('maps every MSP link type number and tenths-of-a-minute lag', () => {
    const tasks: MspdiTaskSpec[] = [
      { uid: '1', name: 'P1', duration: 'PT8H0M0S' },
      { uid: '2', name: 'P2', duration: 'PT8H0M0S' },
      { uid: '3', name: 'P3', duration: 'PT8H0M0S' },
      { uid: '4', name: 'P4', duration: 'PT8H0M0S' },
      {
        uid: '5',
        name: 'Succ',
        duration: 'PT8H0M0S',
        predecessors: [
          { uid: '1', type: '0' }, // FF
          { uid: '2', type: '1', linkLag: '4800' }, // FS, 4800 tenths = 480 min = 8h
          { uid: '3', type: '2' }, // SF
          { uid: '4', type: '3' }, // SS
        ],
      },
    ];
    const { model } = adaptOk({ ...BASE, tasks });
    expect(
      model.relationships.map((r) => ({
        from: r.predecessorId,
        to: r.successorId,
        type: r.type,
        lag: r.lagMinutes,
      })),
    ).toEqual([
      { from: '1', to: '5', type: 'FF', lag: 0 },
      { from: '2', to: '5', type: 'FS', lag: 480 },
      { from: '3', to: '5', type: 'SF', lag: 0 },
      { from: '4', to: '5', type: 'SS', lag: 0 },
    ]);
  });

  it('coerces an unmapped link type to FS and reports it', () => {
    const { model, findings } = adaptOk({
      ...BASE,
      tasks: [
        { uid: '1', name: 'P', duration: 'PT8H0M0S' },
        { uid: '2', name: 'S', duration: 'PT8H0M0S', predecessors: [{ uid: '1', type: '9' }] },
      ],
    });
    expect(model.relationships[0]?.type).toBe('FS');
    expect(findings.some((f) => f.entity === 'relationship')).toBe(true);
  });
});

describe('adaptMspdiToCanonical — resources + assignments', () => {
  it('maps the three resource kinds (Cost → EQUIPMENT with a report)', () => {
    const { model, findings } = adaptOk({
      ...BASE,
      tasks: [{ uid: '1', name: 'A', duration: 'PT8H0M0S' }],
      resources: [
        { uid: '1', name: 'Crew', type: '1', calendarUid: 'C1' }, // Work → LABOUR
        { uid: '2', name: 'Cement', type: '0' }, // Material → MATERIAL
        { uid: '3', name: 'Budget', type: '2' }, // Cost → EQUIPMENT + report
      ],
    });
    expect(model.resources.map((r) => ({ id: r.id, kind: r.kind, cal: r.calendarId }))).toEqual([
      { id: '1', kind: 'LABOUR', cal: 'C1' },
      { id: '2', kind: 'MATERIAL', cal: null },
      { id: '3', kind: 'EQUIPMENT', cal: null },
    ]);
    expect(findings.some((f) => f.entity === 'resource' && f.detail.includes('EQUIPMENT'))).toBe(
      true,
    );
  });

  it('maps assignments with Work-hours budgeted units', () => {
    const { model } = adaptOk({
      ...BASE,
      tasks: [{ uid: '1', name: 'A', duration: 'PT8H0M0S' }],
      resources: [{ uid: '10', name: 'Crew', type: '1' }],
      assignments: [{ uid: '100', taskUid: '1', resourceUid: '10', work: 'PT80H0M0S' }],
    });
    expect(model.assignments).toEqual([
      {
        id: '100',
        activityId: '1',
        resourceId: '10',
        budgetedUnits: 80, // 80h of work
        unitsPerHour: null,
        isDriving: false,
        actualUnits: 0,
      },
    ]);
  });
});
