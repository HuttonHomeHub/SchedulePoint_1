import { describe, expect, it } from 'vitest';

import { importGraphSchema } from './import-graph.js';
import { importXer, MAX_ACTIVITIES, MAX_DEPENDENCIES } from './import-xer.js';
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

  it('maps an RSRC table to the resource library (M2)', () => {
    const rsrc: XerTableSpec = {
      name: 'RSRC',
      fields: ['rsrc_id', 'rsrc_name', 'rsrc_type'],
      rows: [
        ['RS1', 'Crew A', 'RT_Labor'],
        ['RS2', 'Crane', 'RT_Equip'],
      ],
    };
    const { graph, report } = importOk(xerWith(TWO_TASKS, undefined, [rsrc]));
    expect(graph.resources.map((r) => ({ key: r.key, name: r.name, kind: r.kind }))).toEqual([
      { key: 'RS1', name: 'Crew A', kind: 'LABOUR' },
      { key: 'RS2', name: 'Crane', kind: 'EQUIPMENT' },
    ]);
    expect(report.mapped.resources).toBe(2);
    expect(report.drops.some((d) => d.entity === 'RSRC')).toBe(false);
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

describe('importXer — graph-size ceiling (B1)', () => {
  const taskFields = [
    'task_id',
    'proj_id',
    'task_code',
    'task_name',
    'task_type',
    'target_drtn_hr_cnt',
  ];

  /** An XER with `count` distinct tasks (unique codes) and no logic. */
  function manyTasksXer(count: number): string {
    const rows: string[][] = [];
    for (let i = 1; i <= count; i += 1) {
      rows.push([`T${i}`, 'P1', `A${i}`, `Task ${i}`, 'TT_Task', '8']);
    }
    return buildXer([PROJECT, CALENDAR, { name: 'TASK', fields: taskFields, rows }]);
  }

  /**
   * An XER with `activityCount` tasks and exactly `edgeCount` unique, acyclic FS edges (the first
   * `edgeCount` of the `i < j` upper-triangular pairs) — so the dependency ceiling can be probed
   * independently of the activity ceiling.
   */
  function denseDepsXer(activityCount: number, edgeCount: number): string {
    const taskRows: string[][] = [];
    for (let i = 1; i <= activityCount; i += 1) {
      taskRows.push([`T${i}`, 'P1', `A${i}`, `Task ${i}`, 'TT_Task', '8']);
    }
    const predRows: string[][] = [];
    let e = 0;
    for (let i = 1; i <= activityCount && e < edgeCount; i += 1) {
      for (let j = i + 1; j <= activityCount && e < edgeCount; j += 1) {
        e += 1;
        // TASKPRED: task_id = successor, pred_task_id = predecessor ⇒ Ti → Tj (i < j, acyclic).
        predRows.push([`R${e}`, `T${j}`, `T${i}`, 'PR_FS', '0']);
      }
    }
    return buildXer([
      PROJECT,
      CALENDAR,
      { name: 'TASK', fields: taskFields, rows: taskRows },
      {
        name: 'TASKPRED',
        fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'],
        rows: predRows,
      },
    ]);
  }

  it('rejects a schedule just over the activity ceiling', () => {
    const result = importXer({ content: manyTasksXer(MAX_ACTIVITIES + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('limit');
      expect(result.error.code).toBe('TOO_MANY_ACTIVITIES');
      expect(result.error.message).toContain(String(MAX_ACTIVITIES));
    }
  });

  it('accepts a schedule exactly at the activity ceiling', () => {
    const result = importXer({ content: manyTasksXer(MAX_ACTIVITIES) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.activities).toHaveLength(MAX_ACTIVITIES);
  });

  it('rejects a schedule just over the dependency ceiling', () => {
    const result = importXer({ content: denseDepsXer(200, MAX_DEPENDENCIES + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('limit');
      expect(result.error.code).toBe('TOO_MANY_DEPENDENCIES');
    }
  });

  it('accepts a schedule exactly at the dependency ceiling', () => {
    const result = importXer({ content: denseDepsXer(200, MAX_DEPENDENCIES) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.dependencies).toHaveLength(MAX_DEPENDENCIES);
  });
});

describe('importXer — nothing is silently dropped', () => {
  it('reports every deviation in a file that stresses several at once', () => {
    const task: XerTableSpec = {
      name: 'TASK',
      fields: [
        'task_id',
        'proj_id',
        'wbs_id',
        'task_code',
        'task_name',
        'task_type',
        'target_drtn_hr_cnt',
        'cstr_type',
        'cstr_date',
      ],
      rows: [
        ['T1', 'P1', 'W1', 'DUP', 'One', 'TT_Task', '8', 'CS_MSO', '2026-01-06 00:00'], // real constraint (M2)
        ['T2', 'P1', 'W1', 'DUP', 'Two', 'TT_LOE', '8', '', ''], // duplicate code + unmapped type
      ],
    };
    const pred = predTable([
      ['R1', 'T2', 'T1', 'PR_FS', '0'],
      ['R2', 'T2', 'T1', 'PR_FS', '0'], // duplicate edge
      ['R3', 'T1', 'GHOST', 'PR_FS', '0'], // dangling
    ]);
    const wbs: XerTableSpec = {
      name: 'PROJWBS',
      fields: ['wbs_id', 'parent_wbs_id', 'proj_id', 'wbs_name', 'wbs_short_name'],
      rows: [['W1', '', 'P1', 'Area 1', 'A1']],
    };
    const { graph, report } = importOk(buildXer([PROJECT, CALENDAR, task, pred, wbs]));

    // Post-repair graph: 1 WBS summary + 2 real activities (codes disambiguated), 1 edge, acyclic.
    const real = graph.activities.filter((a) => a.type !== 'WBS_SUMMARY');
    expect(real.map((a) => a.code)).toEqual(['DUP', 'DUP-2']);
    expect(graph.activities.some((a) => a.type === 'WBS_SUMMARY')).toBe(true);
    expect(graph.dependencies).toHaveLength(1);
    // Real network mapped; the M2 keys report the constraint + WBS summary now carried, not dropped.
    expect(report.mapped).toEqual({
      activities: 2,
      relationships: 1,
      calendars: 1,
      wbsSummaries: 1,
      constraints: 1,
    });
    expect(real.every((a) => a.parentKey === graph.activities[0]?.key)).toBe(true); // both nest under W1

    // Each deviation is named somewhere in the report.
    expect(report.repairs.some((r) => r.detail.includes('renamed'))).toBe(true);
    expect(report.repairs.some((r) => r.detail.includes('de-duplicated'))).toBe(true);
    expect(report.repairs.some((r) => r.detail.includes('dangling'))).toBe(true);
    expect(report.approximations.some((a) => a.detail.includes('TT_LOE'))).toBe(true);
    // The primary constraint is carried on the real activity (not dropped).
    expect(graph.activities.find((a) => a.code === 'DUP')?.constraintType).toBe('MSO');
  });
});

describe('importXer — M2 rich fixture (WBS + constraints + progress + resources)', () => {
  const wbs: XerTableSpec = {
    name: 'PROJWBS',
    fields: ['wbs_id', 'parent_wbs_id', 'proj_id', 'wbs_name', 'wbs_short_name', 'seq_num'],
    rows: [
      ['W1', '', 'P1', 'Project', 'PRJ', '1'], // root: no parent → null
      ['W2', 'W1', 'P1', 'Area 1', 'A1', '2'], // child of W1
    ],
  };

  const task: XerTableSpec = {
    name: 'TASK',
    fields: [
      'task_id',
      'proj_id',
      'wbs_id',
      'task_code',
      'task_name',
      'task_type',
      'target_drtn_hr_cnt',
      'cstr_type',
      'cstr_date',
      'cstr_type2',
      'cstr_date2',
      'status_code',
      'act_start_date',
      'act_end_date',
      'complete_pct',
      'remain_drtn_hr_cnt',
    ],
    rows: [
      // Primary + secondary constraints (CS_MSOA→SNET, CS_MSOB→SNLT).
      [
        'T1',
        'P1',
        'W2',
        'A1000',
        'Build',
        'TT_Task',
        '40',
        'CS_MSOA',
        '2026-01-06 00:00',
        'CS_MSOB',
        '2026-01-20 00:00',
        '',
        '',
        '',
        '',
        '',
      ],
      // ALAP primary + an unrecognised secondary constraint kind (dropped + reported).
      [
        'T2',
        'P1',
        'W2',
        'A1010',
        'Fit',
        'TT_Task',
        '24',
        'CS_ALAP',
        '',
        'CS_BOGUS',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
      // In-progress activity.
      [
        'T3',
        'P1',
        'W2',
        'A1020',
        'Wire',
        'TT_Task',
        '16',
        '',
        '',
        '',
        '',
        'TK_Active',
        '2026-01-03 00:00',
        '',
        '50',
        '8',
      ],
      // Complete without an actual finish + remaining > 0 → N08 + N18 repairs.
      [
        'T4',
        'P1',
        'W2',
        'A1030',
        'Test',
        'TT_Task',
        '8',
        '',
        '',
        '',
        '',
        'TK_Complete',
        '2026-01-04 00:00',
        '',
        '100',
        '8',
      ],
      // Resource-dependent activity (drives the assignment repairs below).
      ['T5', 'P1', 'W2', 'A1040', 'Pour', 'TT_Rsrc', '40', '', '', '', '', '', '', '', '', ''],
    ],
  };

  const rsrc: XerTableSpec = {
    name: 'RSRC',
    fields: ['rsrc_id', 'rsrc_name', 'rsrc_short_name', 'rsrc_type', 'clndr_id'],
    rows: [
      ['RS1', 'Crew', 'CREW', 'RT_Labor', 'C1'], // calendar resolves
      ['RS2', 'Crane', 'CRANE', 'RT_Equip', ''],
      ['RS3', 'Concrete', 'CONC', 'RT_Mat', ''],
    ],
  };

  const taskRsrc: XerTableSpec = {
    name: 'TASKRSRC',
    fields: [
      'taskrsrc_id',
      'task_id',
      'rsrc_id',
      'target_qty',
      'target_qty_per_hr',
      'act_reg_qty',
      'act_ot_qty',
      'driving_flag',
    ],
    rows: [
      ['AS1', 'T5', 'RS1', '80', '1', '0', '0', 'Y'], // labour driver (kept)
      ['AS2', 'T5', 'RS2', '40', '', '0', '0', 'Y'], // second driver → demoted
      ['AS3', 'T5', 'RS3', '100', '', '0', '0', 'Y'], // MATERIAL driving → demoted
      ['AS4', 'T5', 'RS1', '10', '', '0', '0', 'N'], // duplicate (T5, RS1) pair → dropped
    ],
  };

  const { graph, report } = importOk(buildXer([PROJECT, CALENDAR, wbs, task, rsrc, taskRsrc]));

  const byCode = (code: string) => graph.activities.find((a) => a.code === code);

  it('produces a Zod-valid graph and report', () => {
    expect(importGraphSchema.safeParse(graph).success).toBe(true);
    expect(interchangeReportSchema.safeParse(report).success).toBe(true);
  });

  it('maps the WBS hierarchy to nested WBS_SUMMARY activities', () => {
    const summaries = graph.activities.filter((a) => a.type === 'WBS_SUMMARY');
    expect(summaries.map((s) => ({ key: s.key, code: s.code, parent: s.parentKey }))).toEqual([
      { key: 'wbs:W1', code: 'PRJ', parent: null },
      { key: 'wbs:W2', code: 'A1', parent: 'wbs:W1' },
    ]);
    // Every real activity nests under W2.
    for (const code of ['A1000', 'A1010', 'A1020', 'A1030', 'A1040']) {
      expect(byCode(code)?.parentKey).toBe('wbs:W2');
    }
  });

  it('maps primary + secondary constraints and the ALAP flag', () => {
    expect(byCode('A1000')).toMatchObject({
      constraintType: 'SNET',
      constraintDate: '2026-01-06',
      secondaryConstraintType: 'SNLT',
      secondaryConstraintDate: '2026-01-20',
      scheduleAsLateAsPossible: false,
    });
    expect(byCode('A1010')).toMatchObject({
      constraintType: null,
      secondaryConstraintType: null,
      scheduleAsLateAsPossible: true,
    });
    // The unrecognised CS_BOGUS constraint is dropped + reported.
    expect(
      report.approximations.some((a) => a.entity === 'constraint' && a.detail.includes('CS_BOGUS')),
    ).toBe(true);
  });

  it('maps in-progress progress and repairs a complete activity (N08 + N18)', () => {
    expect(byCode('A1020')?.progress).toMatchObject({
      status: 'IN_PROGRESS',
      percentComplete: 50,
      remainingDurationMinutes: 480,
    });
    // T4 completes without a finish and with remaining > 0 → data-date finish, remaining zeroed.
    expect(byCode('A1030')?.progress).toMatchObject({
      status: 'COMPLETE',
      actualFinish: '2026-01-05', // the data date
      remainingDurationMinutes: 0,
    });
    expect(
      report.repairs.some((r) => r.entity === 'progress' && r.detail.includes('data date')),
    ).toBe(true);
    expect(
      report.repairs.some((r) => r.entity === 'progress' && r.detail.includes('remaining')),
    ).toBe(true);
  });

  it('maps TT_Rsrc to a RESOURCE_DEPENDENT activity with a real duration', () => {
    expect(byCode('A1040')).toMatchObject({ type: 'RESOURCE_DEPENDENT', durationMinutes: 2400 });
  });

  it('maps the resource library with the three kinds', () => {
    expect(graph.resources.map((r) => ({ key: r.key, kind: r.kind, cal: r.calendarKey }))).toEqual([
      { key: 'RS1', kind: 'LABOUR', cal: 'C1' },
      { key: 'RS2', kind: 'EQUIPMENT', cal: null },
      { key: 'RS3', kind: 'MATERIAL', cal: null },
    ]);
  });

  it('repairs the assignments (dedupe, MATERIAL demotion, single driver)', () => {
    // AS4 (duplicate pair) dropped; AS1 stays driving; AS2/AS3 demoted.
    expect(graph.assignments.map((x) => ({ key: x.key, driving: x.isDriving }))).toEqual([
      { key: 'AS1', driving: true },
      { key: 'AS2', driving: false },
      { key: 'AS3', driving: false },
    ]);
    expect(
      report.repairs.some((r) => r.entity === 'assignment' && r.detail.includes('duplicate')),
    ).toBe(true);
    expect(
      report.repairs.some((r) => r.entity === 'assignment' && r.detail.includes('MATERIAL')),
    ).toBe(true);
    expect(
      report.repairs.some(
        (r) => r.entity === 'assignment' && r.detail.includes('already has a driver'),
      ),
    ).toBe(true);
  });

  it('reports the M2 counts (summaries excluded from the activity count)', () => {
    expect(report.mapped).toEqual({
      activities: 5,
      relationships: 0,
      calendars: 1,
      wbsSummaries: 2,
      constraints: 2,
      resources: 3,
      assignments: 3,
    });
  });
});
