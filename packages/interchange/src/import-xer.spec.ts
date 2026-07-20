import { describe, expect, it } from 'vitest';

import { importGraphSchema } from './import-graph.js';
import { importXer } from './import-xer.js';
import { interchangeReportSchema, type ReportFinding } from './report.js';
import { buildXer, standardClndrData, type XerTableSpec } from './xer.fixtures.js';

// Excel/OLE serial 46023 === 2026-01-01 (base 1899-12-30).
const NEW_YEAR_SERIAL = 46023;

const PROJECT: XerTableSpec = {
  name: 'PROJECT',
  fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'plan_start_date', 'clndr_id'],
  rows: [['P1', 'Sample', '2026-01-05 00:00', '2026-01-04 00:00', 'C1']],
};

const CALENDAR: XerTableSpec = {
  name: 'CALENDAR',
  fields: ['clndr_id', 'clndr_name', 'default_flag', 'day_hr_cnt', 'clndr_data'],
  rows: [
    ['C1', 'Standard', 'Y', '8', standardClndrData([{ serial: NEW_YEAR_SERIAL, working: false }])],
  ],
};

/** A clean four-activity, four-relationship XER covering every ActivityType + DependencyType. */
function cleanXer(): string {
  const task: XerTableSpec = {
    name: 'TASK',
    fields: [
      'task_id',
      'proj_id',
      'clndr_id',
      'task_code',
      'task_name',
      'task_type',
      'target_drtn_hr_cnt',
    ],
    rows: [
      ['T1', 'P1', 'C1', 'A1000', 'Mobilise', 'TT_Task', '40'],
      ['T2', 'P1', '', 'A1010', 'Design', 'TT_Task', '80'],
      ['T3', 'P1', '', 'M1', 'Start', 'TT_Mile', '0'],
      ['T4', 'P1', '', 'M2', 'Finish', 'TT_FinMile', '0'],
    ],
  };
  const pred: XerTableSpec = {
    name: 'TASKPRED',
    fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'],
    rows: [
      ['R1', 'T2', 'T1', 'PR_FS', '0'], // T1 → T2 FS
      ['R2', 'T3', 'T1', 'PR_SS', '8'], // T1 → T3 SS, lag 8h
      ['R3', 'T4', 'T2', 'PR_FF', '0'], // T2 → T4 FF
      ['R4', 'T4', 'T3', 'PR_SF', '0'], // T3 → T4 SF
    ],
  };
  return buildXer([PROJECT, CALENDAR, task, pred]);
}

/** Helper: run importXer, asserting success, and return the payload. */
function importOk(xer: string) {
  const result = importXer({ content: xer, filename: 'sample.xer' });
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result;
}

describe('importXer — clean file → correct import graph', () => {
  const { graph, report } = importOk(cleanXer());

  it('produces a Zod-valid import graph and report', () => {
    expect(importGraphSchema.safeParse(graph).success).toBe(true);
    expect(interchangeReportSchema.safeParse(report).success).toBe(true);
  });

  it('maps the plan and data date', () => {
    expect(graph.plan).toEqual({
      name: 'Sample',
      dataDate: '2026-01-05',
      defaultCalendarKey: 'C1',
    });
  });

  it('maps the calendar to weekday minute shifts + a dated exception', () => {
    expect(graph.calendars).toHaveLength(1);
    const cal = graph.calendars[0];
    // Mon–Fri (weekday 0–4) 08:00–16:00.
    expect(cal?.shifts).toEqual(
      [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
    );
    expect(cal?.exceptions).toEqual([
      { startDate: '2026-01-01', endDate: '2026-01-01', label: null, windows: [] },
    ]);
  });

  it('maps every ActivityType with exact hours→minutes durations', () => {
    expect(
      graph.activities.map((a) => ({ code: a.code, type: a.type, dur: a.durationMinutes })),
    ).toEqual([
      { code: 'A1000', type: 'TASK', dur: 2400 }, // 40h × 60
      { code: 'A1010', type: 'TASK', dur: 4800 }, // 80h × 60
      { code: 'M1', type: 'START_MILESTONE', dur: 0 },
      { code: 'M2', type: 'FINISH_MILESTONE', dur: 0 },
    ]);
    // Activity calendar reference resolves by key; unknown/blank → inherit (null).
    expect(graph.activities[0]?.calendarKey).toBe('C1');
    expect(graph.activities[1]?.calendarKey).toBeNull();
  });

  it('maps every DependencyType with exact hours→minutes lag', () => {
    expect(
      graph.dependencies.map((d) => ({
        from: d.predecessorKey,
        to: d.successorKey,
        type: d.type,
        lag: d.lagMinutes,
      })),
    ).toEqual([
      { from: 'T1', to: 'T2', type: 'FS', lag: 0 },
      { from: 'T1', to: 'T3', type: 'SS', lag: 480 }, // 8h × 60
      { from: 'T2', to: 'T4', type: 'FF', lag: 0 },
      { from: 'T3', to: 'T4', type: 'SF', lag: 0 },
    ]);
  });

  it('reports the right counts and no repairs/approximations for clean data', () => {
    expect(report.detectedFormat).toBe('XER');
    expect(report.sourceVersion).toBe('18.8');
    expect(report.sourceFilename).toBe('sample.xer');
    expect(report.mapped).toEqual({ activities: 4, relationships: 4, calendars: 1 });
    expect(report.repairs).toHaveLength(0);
    expect(report.approximations).toHaveLength(0);
    // The one honest drop even on a clean file: P6 calendar metadata SchedulePoint can't express.
    expect(report.drops.some((d) => d.entity === 'calendar')).toBe(true);
  });
});

describe('importXer — unit coercion', () => {
  it('reports a lossy (rounded) duration and coerces it', () => {
    const task: XerTableSpec = {
      name: 'TASK',
      fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
      rows: [['T1', 'P1', 'A1000', 'Odd', 'TT_Task', '1.234']],
    };
    const { graph, report } = importOk(buildXer([PROJECT, CALENDAR, task]));
    expect(graph.activities[0]?.durationMinutes).toBe(74); // round(1.234 × 60 = 74.04)
    expect(
      report.approximations.some((a) => a.entity === 'activity' && a.detail.includes('rounded')),
    ).toBe(true);
  });
});

/** Build an XER around the clean PROJECT/CALENDAR with a custom TASK + TASKPRED (and optional extra tables). */
function xerWith(task: XerTableSpec, pred?: XerTableSpec, extra: XerTableSpec[] = []): string {
  return buildXer([PROJECT, CALENDAR, task, ...(pred ? [pred] : []), ...extra]);
}

const TWO_TASKS: XerTableSpec = {
  name: 'TASK',
  fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
  rows: [
    ['T1', 'P1', 'A1000', 'One', 'TT_Task', '8'],
    ['T2', 'P1', 'A1010', 'Two', 'TT_Task', '8'],
  ],
};

function predTable(rows: ReadonlyArray<ReadonlyArray<string>>): XerTableSpec {
  return {
    name: 'TASKPRED',
    fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'],
    rows,
  };
}

const hasRepair = (findings: ReportFinding[], substr: string): boolean =>
  findings.some((f) => f.kind === 'repair' && f.detail.includes(substr));

describe('importXer — repair branches (repaired graph AND report entry)', () => {
  it('drops a dangling edge', () => {
    const { graph, report } = importOk(
      xerWith(TWO_TASKS, predTable([['R1', 'T2', 'GHOST', 'PR_FS', '0']])),
    );
    expect(graph.dependencies).toHaveLength(0);
    expect(hasRepair(report.repairs, 'dangling')).toBe(true);
  });

  it('de-duplicates a repeated (pred, succ, type) edge', () => {
    const { graph, report } = importOk(
      xerWith(
        TWO_TASKS,
        predTable([
          ['R1', 'T2', 'T1', 'PR_FS', '0'],
          ['R2', 'T2', 'T1', 'PR_FS', '0'],
        ]),
      ),
    );
    expect(graph.dependencies).toHaveLength(1);
    expect(hasRepair(report.repairs, 'de-duplicated')).toBe(true);
  });

  it('breaks a 2-cycle and yields an acyclic graph', () => {
    const { graph, report } = importOk(
      xerWith(
        TWO_TASKS,
        predTable([
          ['R1', 'T2', 'T1', 'PR_FS', '0'],
          ['R2', 'T1', 'T2', 'PR_FS', '0'],
        ]),
      ),
    );
    expect(graph.dependencies).toHaveLength(1);
    expect(graph.dependencies[0]?.predecessorKey).toBe('T1'); // deterministic break drops T2→T1
    expect(hasRepair(report.repairs, 'cycle broken')).toBe(true);
  });

  it('breaks a 3-cycle deterministically', () => {
    const threeTasks: XerTableSpec = {
      name: 'TASK',
      fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
      rows: [
        ['T1', 'P1', 'A1000', 'One', 'TT_Task', '8'],
        ['T2', 'P1', 'A1010', 'Two', 'TT_Task', '8'],
        ['T3', 'P1', 'A1020', 'Three', 'TT_Task', '8'],
      ],
    };
    const { graph, report } = importOk(
      xerWith(
        threeTasks,
        predTable([
          ['R1', 'T2', 'T1', 'PR_FS', '0'], // T1 → T2
          ['R2', 'T3', 'T2', 'PR_FS', '0'], // T2 → T3
          ['R3', 'T1', 'T3', 'PR_FS', '0'], // T3 → T1
        ]),
      ),
    );
    expect(graph.dependencies).toHaveLength(2);
    // Largest tuple "A1020 A1000 …" ⇒ the T3→T1 edge is dropped.
    expect(graph.dependencies.some((e) => e.predecessorKey === 'T3')).toBe(false);
    expect(report.repairs.filter((r) => r.detail.includes('cycle broken'))).toHaveLength(1);
  });

  it('suffixes a duplicate activity code', () => {
    const dupCode: XerTableSpec = {
      name: 'TASK',
      fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
      rows: [
        ['T1', 'P1', 'A1000', 'One', 'TT_Task', '8'],
        ['T2', 'P1', 'A1000', 'Two', 'TT_Task', '8'],
      ],
    };
    const { graph, report } = importOk(xerWith(dupCode));
    expect(graph.activities.map((a) => a.code)).toEqual(['A1000', 'A1000-2']);
    expect(hasRepair(report.repairs, 'renamed')).toBe(true);
  });

  it('coerces an unmapped activity type to TASK and reports it', () => {
    const loe: XerTableSpec = {
      name: 'TASK',
      fields: ['task_id', 'proj_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'],
      rows: [['T1', 'P1', 'A1000', 'Hammock', 'TT_LOE', '8']],
    };
    const { graph, report } = importOk(xerWith(loe));
    expect(graph.activities[0]?.type).toBe('TASK');
    expect(report.approximations.some((a) => a.detail.includes('TT_LOE'))).toBe(true);
  });

  it('drops an out-of-scope RSRC table and reports it', () => {
    const rsrc: XerTableSpec = {
      name: 'RSRC',
      fields: ['rsrc_id', 'rsrc_name'],
      rows: [
        ['RS1', 'Crew A'],
        ['RS2', 'Crane'],
      ],
    };
    const { report } = importOk(xerWith(TWO_TASKS, undefined, [rsrc]));
    const drop = report.drops.find((d) => d.entity === 'RSRC');
    expect(drop?.detail).toContain('2');
  });
});

describe('importXer — structural rejection', () => {
  it('rejects a non-XER file at the parse stage', () => {
    const result = importXer({ content: 'not an xer at all' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('parse');
      expect(result.error.code).toBe('NOT_XER');
    }
  });

  it('rejects a well-formed XER with no PROJECT record at the adapt stage', () => {
    const noProject = buildXer([CALENDAR, TWO_TASKS]);
    const result = importXer({ content: noProject });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('adapt');
      expect(result.error.code).toBe('NO_PROJECT');
    }
  });
});

describe('importXer — nothing is silently dropped', () => {
  it('reports every deviation in a file that stresses several at once', () => {
    const task: XerTableSpec = {
      name: 'TASK',
      fields: [
        'task_id',
        'proj_id',
        'task_code',
        'task_name',
        'task_type',
        'target_drtn_hr_cnt',
        'cstr_type',
      ],
      rows: [
        ['T1', 'P1', 'DUP', 'One', 'TT_Task', '8', 'CS_MSO'], // constraint present (M2 drop)
        ['T2', 'P1', 'DUP', 'Two', 'TT_WBS', '8', ''], // duplicate code + unmapped type
      ],
    };
    const pred = predTable([
      ['R1', 'T2', 'T1', 'PR_FS', '0'],
      ['R2', 'T2', 'T1', 'PR_FS', '0'], // duplicate edge
      ['R3', 'T1', 'GHOST', 'PR_FS', '0'], // dangling
    ]);
    const wbs: XerTableSpec = {
      name: 'PROJWBS',
      fields: ['wbs_id', 'wbs_name'],
      rows: [['W1', 'Area 1']],
    };
    const { graph, report } = importOk(buildXer([PROJECT, CALENDAR, task, pred, wbs]));

    // Post-repair graph: 2 activities (codes disambiguated), 1 edge (dangling + dup dropped), acyclic.
    expect(graph.activities.map((a) => a.code)).toEqual(['DUP', 'DUP-2']);
    expect(graph.dependencies).toHaveLength(1);
    expect(report.mapped).toEqual({ activities: 2, relationships: 1, calendars: 1 });

    // Each deviation is named somewhere in the report.
    expect(report.repairs.some((r) => r.detail.includes('renamed'))).toBe(true);
    expect(report.repairs.some((r) => r.detail.includes('de-duplicated'))).toBe(true);
    expect(report.repairs.some((r) => r.detail.includes('dangling'))).toBe(true);
    expect(report.approximations.some((a) => a.detail.includes('TT_WBS'))).toBe(true);
    expect(
      report.drops.some((d) => d.entity === 'activity' && d.detail.includes('constraint')),
    ).toBe(true);
    expect(report.drops.some((d) => d.entity === 'PROJWBS')).toBe(true);
  });
});
