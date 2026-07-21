import { describe, expect, it } from 'vitest';

import { importGraphSchema } from './import-graph.js';
import { importMspdi } from './import-mspdi.js';
import { MAX_ACTIVITIES, MAX_DEPENDENCIES } from './import-xer.js';
import {
  buildMspdi,
  standardWeekDays,
  type MspdiProjectSpec,
  type MspdiTaskSpec,
} from './mspdi.fixtures.js';
import { interchangeReportSchema } from './report.js';

/**
 * End-to-end tests for the `importMspdi` orchestrator (Task 3.3): an untrusted MSPDI file runs the SAME
 * detect → parse → adapt → map → validate/repair → report pipeline as the XER path, reusing the mapper,
 * ceiling checks, validate/repair step and report shape unchanged (ADR-0050). Covers a clean rich file
 * (WBS + constraints + progress + resources + assignments), the shared repair branches, structural
 * rejection, the graph-size ceiling, and the malicious-XML rejections at the importer boundary.
 */

const STD_CAL = {
  uid: 'C1',
  name: 'Standard',
  weekDays: standardWeekDays(),
  exceptions: [{ fromDate: '2026-01-01T00:00:00', working: false }],
};

const BASE: Omit<MspdiProjectSpec, 'tasks'> = {
  name: 'Sample',
  currentDate: '2026-01-05T00:00:00',
  saveVersion: '14',
  calendarUid: 'C1',
  calendars: [STD_CAL],
};

function importOk(spec: MspdiProjectSpec) {
  const result = importMspdi({ content: buildMspdi(spec), filename: 'sample.xml' });
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result;
}

describe('importMspdi — clean rich file → correct import graph + report', () => {
  const tasks: MspdiTaskSpec[] = [
    { uid: '1', id: '1', name: 'Project', outlineLevel: 1, summary: true },
    { uid: '2', id: '2', name: 'Area', outlineLevel: 2, summary: true },
    {
      uid: '3',
      id: '3',
      wbs: 'A1000',
      name: 'Build',
      outlineLevel: 3,
      duration: 'PT40H0M0S',
      calendarUid: 'C1',
      constraintType: '4', // SNET
      constraintDate: '2026-01-06T00:00:00',
    },
    {
      uid: '4',
      id: '4',
      wbs: 'A1010',
      name: 'Fit',
      outlineLevel: 3,
      duration: 'PT16H0M0S',
      percentComplete: '50',
      actualStart: '2026-01-05T00:00:00',
      remainingDuration: 'PT8H0M0S',
      predecessors: [{ uid: '3', type: '1', linkLag: '0' }], // FS from Build
    },
    {
      uid: '5',
      id: '5',
      wbs: 'M1',
      name: 'Complete',
      outlineLevel: 3,
      milestone: true,
      predecessors: [{ uid: '4', type: '1' }], // has predecessor → FINISH milestone
    },
  ];

  const { graph, report } = importOk({
    ...BASE,
    tasks,
    resources: [
      { uid: '10', name: 'Crew', type: '1', calendarUid: 'C1' },
      { uid: '11', name: 'Cement', type: '0' },
    ],
    assignments: [{ uid: '100', taskUid: '3', resourceUid: '10', work: 'PT80H0M0S' }],
  });

  it('produces a Zod-valid import graph and report', () => {
    expect(importGraphSchema.safeParse(graph).success).toBe(true);
    expect(interchangeReportSchema.safeParse(report).success).toBe(true);
  });

  it('maps the plan, data date and calendar', () => {
    expect(graph.plan).toEqual({
      name: 'Sample',
      dataDate: '2026-01-05',
      defaultCalendarKey: 'C1',
    });
    expect(graph.calendars[0]?.shifts).toEqual(
      [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
    );
  });

  it('maps the WBS hierarchy to nested WBS_SUMMARY activities', () => {
    const summaries = graph.activities.filter((a) => a.type === 'WBS_SUMMARY');
    expect(summaries.map((s) => ({ key: s.key, parent: s.parentKey }))).toEqual([
      { key: '1', parent: null },
      { key: '2', parent: '1' },
    ]);
    for (const key of ['3', '4', '5']) {
      expect(graph.activities.find((a) => a.key === key)?.parentKey).toBe('2');
    }
  });

  it('maps constraints, progress and the finish milestone', () => {
    const build = graph.activities.find((a) => a.key === '3');
    expect(build).toMatchObject({ constraintType: 'SNET', constraintDate: '2026-01-06' });
    expect(graph.activities.find((a) => a.key === '4')?.progress).toMatchObject({
      status: 'IN_PROGRESS',
      percentComplete: 50,
    });
    expect(graph.activities.find((a) => a.key === '5')?.type).toBe('FINISH_MILESTONE');
  });

  it('maps the dependency network and the resource assignment', () => {
    expect(
      graph.dependencies.map((d) => ({ from: d.predecessorKey, to: d.successorKey, type: d.type })),
    ).toEqual([
      { from: '3', to: '4', type: 'FS' },
      { from: '4', to: '5', type: 'FS' },
    ]);
    expect(graph.assignments).toHaveLength(1);
    expect(graph.resources).toHaveLength(2);
  });

  it('reports the MSPDI format, version and M2 counts', () => {
    expect(report.detectedFormat).toBe('MSPDI');
    expect(report.sourceVersion).toBe('14');
    expect(report.sourceFilename).toBe('sample.xml');
    expect(report.mapped).toEqual({
      activities: 3,
      relationships: 2,
      calendars: 1,
      wbsSummaries: 2,
      constraints: 1,
      resources: 2,
      assignments: 1,
    });
  });
});

describe('importMspdi — shared repair branches (reusing the XER validate/repair step)', () => {
  const twoTasks: MspdiTaskSpec[] = [
    { uid: '1', name: 'One', duration: 'PT8H0M0S' },
    { uid: '2', name: 'Two', duration: 'PT8H0M0S' },
  ];

  it('drops a dangling edge (predecessor not present)', () => {
    const { graph, report } = importOk({
      ...BASE,
      tasks: [{ ...twoTasks[1]!, uid: '2', predecessors: [{ uid: '999' }] }],
    });
    expect(graph.dependencies).toHaveLength(0);
    expect(report.repairs.some((r) => r.detail.includes('dangling'))).toBe(true);
  });

  it('breaks a 2-cycle and yields an acyclic graph', () => {
    const { graph, report } = importOk({
      ...BASE,
      tasks: [
        { uid: '1', name: 'One', duration: 'PT8H0M0S', predecessors: [{ uid: '2', type: '1' }] },
        { uid: '2', name: 'Two', duration: 'PT8H0M0S', predecessors: [{ uid: '1', type: '1' }] },
      ],
    });
    expect(graph.dependencies).toHaveLength(1);
    expect(report.repairs.some((r) => r.detail.includes('cycle broken'))).toBe(true);
  });

  it('suffixes a duplicate activity code (same WBS code)', () => {
    const { graph, report } = importOk({
      ...BASE,
      tasks: [
        { uid: '1', wbs: 'DUP', name: 'One', duration: 'PT8H0M0S' },
        { uid: '2', wbs: 'DUP', name: 'Two', duration: 'PT8H0M0S' },
      ],
    });
    expect(graph.activities.map((a) => a.code)).toEqual(['DUP', 'DUP-2']);
    expect(report.repairs.some((r) => r.detail.includes('renamed'))).toBe(true);
  });
});

describe('importMspdi — structural rejection', () => {
  it('rejects a non-MSPDI file at the parse stage', () => {
    const result = importMspdi({ content: '<Root><Name>x</Name></Root>' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('parse');
      expect(result.error.code).toBe('NOT_MSPDI');
    }
  });

  it('rejects a .mpp binary with guidance at the parse stage', () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    const result = importMspdi({ content: ole });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('parse');
      expect(result.error.code).toBe('UNSUPPORTED_MPP');
      expect(result.error.message).toContain('Save As');
    }
  });

  it('rejects a project with no data date at the adapt stage', () => {
    const result = importMspdi({
      content: buildMspdi({ name: 'S', calendars: [STD_CAL], tasks: [{ uid: '1', name: 'A' }] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('adapt');
      expect(result.error.code).toBe('NO_DATA_DATE');
    }
  });
});

describe('importMspdi — graph-size ceiling', () => {
  function manyTasks(count: number): MspdiTaskSpec[] {
    const tasks: MspdiTaskSpec[] = [];
    for (let i = 1; i <= count; i += 1) {
      tasks.push({ uid: String(i), wbs: `A${i}`, name: `Task ${i}`, duration: 'PT8H0M0S' });
    }
    return tasks;
  }

  it('rejects a schedule just over the activity ceiling', () => {
    const result = importMspdi({
      content: buildMspdi({ ...BASE, tasks: manyTasks(MAX_ACTIVITIES + 1) }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('limit');
      expect(result.error.code).toBe('TOO_MANY_ACTIVITIES');
      expect(result.error.message).toContain(String(MAX_ACTIVITIES));
    }
  });

  it('accepts a schedule exactly at the activity ceiling', () => {
    const result = importMspdi({
      content: buildMspdi({ ...BASE, tasks: manyTasks(MAX_ACTIVITIES) }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.activities).toHaveLength(MAX_ACTIVITIES);
  });

  it('exposes the shared dependency ceiling constant', () => {
    expect(MAX_DEPENDENCIES).toBeGreaterThan(0);
  });
});

describe('importMspdi — malicious-XML rejection at the importer boundary', () => {
  it('rejects a billion-laughs payload without expansion (the entity stays inert)', () => {
    const bomb = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE lolz [',
      ' <!ENTITY lol "lol">',
      ' <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">',
      ' <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">',
      ']>',
      '<Project xmlns="http://schemas.microsoft.com/project"><Name>&lol3;</Name>',
      '<CurrentDate>2026-01-05T00:00:00</CurrentDate><Tasks/></Project>',
    ].join('\n');
    const start = Date.now();
    const result = importMspdi({ content: bomb });
    // It parses (entity left literal, not expanded) — an empty plan; crucially it did not hang or blow up.
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.plan.name.length).toBeLessThan(50);
  });

  it('rejects an external-entity (XXE) reference as inert (no file read)', () => {
    const xxe = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
      '<Project xmlns="http://schemas.microsoft.com/project"><Name>&xxe;</Name></Project>',
    ].join('');
    const result = importMspdi({ content: xxe });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MALFORMED_STRUCTURE');
  });

  it('rejects an oversize file with a typed code', () => {
    const result = importMspdi({
      content: buildMspdi({ ...BASE, tasks: [{ uid: '1', name: 'A', duration: 'PT8H0M0S' }] }),
      caps: { maxBytes: 20 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects a too-many-nodes file with a typed code', () => {
    const result = importMspdi({
      content: buildMspdi({ ...BASE, tasks: [{ uid: '1', name: 'A', duration: 'PT8H0M0S' }] }),
      caps: { maxNodes: 3 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TOO_MANY_NODES');
  });
});
