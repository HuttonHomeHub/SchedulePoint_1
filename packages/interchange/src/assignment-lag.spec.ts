import { describe, expect, it } from 'vitest';

import { mapExportGraphToCanonical } from './export-mapper.js';
import { buildRichExportGraph } from './export.fixtures.js';
import { importMspdi } from './import-mspdi.js';
import { importXer } from './import-xer.js';
import { buildMspdi, standardWeekDays } from './mspdi.fixtures.js';
import type { ReportFinding } from './report.js';
import { buildXer, standardClndrData, type XerTableSpec } from './xer.fixtures.js';

/**
 * The per-assignment **join lag** across interchange (ADR-0071 §5 / F6 M5).
 *
 * The milestone's whole content is a shape and two honest reports: the canonical model carries
 * `lagMinutes`, **no parser writes it and no emitter reads it**, and both directions say so rather
 * than presenting a silent zero as fidelity. These tests make that a contract instead of a paragraph
 * — in particular so that a future wiring of a real P6 column has to come past them.
 *
 * The asymmetry between the two directions is the point, and each half asserts it:
 * - **Import** cannot know whether anything was lost (the column is unreadable), so the finding is
 *   unconditional wherever assignments exist — a standing statement of what the reader does not do.
 * - **Export** knows exactly, so the finding is conditional on a non-zero lag actually being present.
 */

const joinDelayFindings = (findings: readonly ReportFinding[]) =>
  findings.filter((f) => f.entity === 'assignment' && f.detail.includes('join delay'));

// Excel/OLE serial 46023 === 2026-01-01 (base 1899-12-30) — the sibling suites' convention.
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
const TASK: XerTableSpec = {
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
  rows: [['T1', 'P1', 'C1', 'A1000', 'Mobilise', 'TT_Task', '80']],
};

function xerWith(assignments: boolean): string {
  if (!assignments) return buildXer([PROJECT, CALENDAR, TASK]);
  const rsrc: XerTableSpec = {
    name: 'RSRC',
    fields: ['rsrc_id', 'rsrc_name', 'rsrc_short_name', 'rsrc_type', 'clndr_id'],
    rows: [['RS1', 'Crane', 'CRANE', 'RT_Equip', '']],
  };
  // The fixture's own TASKRSRC vocabulary — no lag column of any kind, which is precisely the
  // evidence gap ADR-0071 §5 refuses to code around.
  const taskRsrc: XerTableSpec = {
    name: 'TASKRSRC',
    fields: [
      'taskrsrc_id',
      'task_id',
      'rsrc_id',
      'target_qty',
      'target_qty_per_hr',
      'driving_flag',
    ],
    rows: [['AS1', 'T1', 'RS1', '40', '1', 'N']],
  };
  return buildXer([PROJECT, CALENDAR, TASK, rsrc, taskRsrc]);
}

function importXerOk(content: string) {
  const result = importXer({ content, filename: 'sample.xer' });
  if (!result.ok) throw new Error(`import failed: ${result.error.code}`);
  return result;
}

describe('import — the join lag is not read, and the report says so', () => {
  it('XER: every imported assignment joins with its activity, reported once', () => {
    const { graph, report } = importXerOk(xerWith(true));
    expect(graph.assignments.length).toBeGreaterThan(0);
    expect(graph.assignments.every((a) => a.lagMinutes === 0)).toBe(true);

    // ONE finding, not one per row: this is a capability the format reader lacks, not a per-row loss.
    const lag = joinDelayFindings(report.drops);
    expect(lag).toHaveLength(1);
    // The reason names the EVIDENCE gap, not the field — the field's name is exactly what this
    // repository does not know (ADR-0071 §5).
    expect(lag[0]?.reason).toMatch(/verified no P6 export/i);
  });

  it('reports nothing when the file carries no assignments at all', () => {
    // A core-network import has no assignment capability to lose. A standing finding on every such
    // file would be noise, and noise is how a reader learns to skip the section that matters.
    const { graph, report } = importXerOk(xerWith(false));
    expect(graph.assignments).toHaveLength(0);
    expect(joinDelayFindings(report.drops)).toHaveLength(0);
  });

  it('MSPDI: <Assignment><Delay> is not read on assumption', () => {
    const content = buildMspdi({
      name: 'Sample',
      currentDate: '2026-01-05T00:00:00',
      calendarUid: 'C1',
      calendars: [{ uid: 'C1', name: 'Standard', weekDays: standardWeekDays() }],
      tasks: [
        {
          uid: '1',
          name: 'Mobilise',
          outlineLevel: 1,
          duration: 'PT80H0M0S',
          calendarUid: 'C1',
        },
      ],
      resources: [{ uid: '10', name: 'Crane' }],
      assignments: [{ uid: '100', taskUid: '1', resourceUid: '10', work: 'PT40H0M0S' }],
    });
    const result = importMspdi({ content, filename: 'sample.xml' });
    if (!result.ok) throw new Error(`import failed: ${result.error.code}`);
    expect(result.graph.assignments.every((a) => a.lagMinutes === 0)).toBe(true);
    const lag = joinDelayFindings(result.report.drops);
    expect(lag).toHaveLength(1);
    expect(lag[0]?.reason).toMatch(/unverified equivalent/i);
  });
});

describe('export — the lag reaches the canonical model and is reported as dropped', () => {
  const withLag = (lagMinutes: number) => {
    const graph = buildRichExportGraph();
    return { ...graph, assignments: graph.assignments.map((a) => ({ ...a, lagMinutes })) };
  };

  it('carries a stored lag into the canonical model', () => {
    // The value must REACH the mapper, or the drop report below could not be truthful about whether
    // anything was lost. This is the half a bare "not supported" comment would have skipped.
    const { model } = mapExportGraphToCanonical(withLag(960));
    expect(model.assignments[0]?.lagMinutes).toBe(960);
  });

  it('reports the drop, with a count, when a real value is about to be lost', () => {
    const { findings } = mapExportGraphToCanonical(withLag(480));
    const lag = joinDelayFindings(findings);
    expect(lag).toHaveLength(1);
    expect(lag[0]?.kind).toBe('drop');
    // The count is named so a planner can tell whether the programme they are handing over is one of
    // the affected ones — "some data was dropped" is not actionable.
    expect(lag[0]?.detail).toMatch(/^1 resource assignment\(s\) carry a join delay/);
  });

  it('says nothing for a plan whose resources all join with their activities', () => {
    // Conditional, unlike the import side — here we KNOW whether anything is lost, so a standing
    // finding would be a false alarm on the overwhelming majority of exports.
    const { findings } = mapExportGraphToCanonical(buildRichExportGraph());
    expect(joinDelayFindings(findings)).toHaveLength(0);
  });
});
