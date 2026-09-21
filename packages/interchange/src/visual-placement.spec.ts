import { describe, expect, it } from 'vitest';

import { mapExportGraphToCanonical } from './export-mapper.js';
import { buildRichExportGraph } from './export.fixtures.js';
import { importMspdi } from './import-mspdi.js';
import { importXer } from './import-xer.js';
import { buildMspdi, standardWeekDays } from './mspdi.fixtures.js';
import type { ReportFinding } from './report.js';
import { buildXer, standardClndrData, type XerTableSpec } from './xer.fixtures.js';

/**
 * The **hand-placement** across interchange (one-planning-surface M-G).
 *
 * The milestone's whole content is a shape and one honest report: the export graph carries
 * `visualStart`, **no parser writes it and no emitter reads it**, and the export direction says so
 * rather than presenting computed dates as fidelity.
 *
 * **The asymmetry with `assignment-lag.spec.ts` is the point, and it runs the opposite way.** That
 * milestone reports on IMPORT unconditionally because the reader cannot know whether a column it
 * cannot parse held anything. Here the importer knows with certainty that nothing was lost: a
 * hand-placement is a SchedulePoint concept, and P6 and MSPDI carry constraints and computed dates,
 * never "a human put this bar here". So import says **nothing**, and a standing finding would be
 * noise on every import forever.
 *
 * For the same reason `visualStart` is absent from the canonical model where `lagMinutes` is
 * present: that field's slot awaits a real export under an unknown column name (ADR-0071 §5), and
 * this one has no candidate column to discover.
 */

const placementFindings = (findings: readonly ReportFinding[]) =>
  findings.filter((f) => f.entity === 'activity' && f.detail.includes('hand-placed start'));

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
  rows: [['T1', 'P1', 'C1', 'A1000', 'Excavate', 'TT_Task', '40']],
};

describe('import — a source file cannot carry a placement, so nothing is reported', () => {
  /**
   * **The negative is the assertion**, and it is the one that would be easiest to get wrong by
   * copying the lag suite. Reporting here would be a false statement: the reader did not drop a
   * placement, because there was never one to drop.
   */
  it('XER: no placement finding, and no placement on the graph', () => {
    const content = buildXer([PROJECT, CALENDAR, TASK]);
    const result = importXer({ content, filename: 'sample.xer' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(placementFindings(result.report.drops)).toHaveLength(0);
    expect(result.graph.activities.every((a) => a.visualStart == null)).toBe(true);
  });

  it('MSPDI: no placement finding, and no placement on the graph', () => {
    const content = buildMspdi({
      name: 'Sample',
      currentDate: '2026-01-05T00:00:00',
      calendarUid: 'C1',
      calendars: [{ uid: 'C1', name: 'Standard', weekDays: standardWeekDays() }],
      tasks: [
        { uid: '1', name: 'Excavate', outlineLevel: 1, duration: 'PT40H0M0S', calendarUid: 'C1' },
      ],
    });
    const result = importMspdi({ content, filename: 'sample.xml' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(placementFindings(result.report.drops)).toHaveLength(0);
    expect(result.graph.activities.every((a) => a.visualStart == null)).toBe(true);
  });
});

describe('export — the placement reaches the mapper and is reported as dropped', () => {
  const withPlacement = (visualStart: string | null, count = 1) => {
    const graph = buildRichExportGraph();
    return {
      ...graph,
      activities: graph.activities.map((a, i) => (i < count ? { ...a, visualStart } : a)),
    };
  };

  it('reports the drop, with a count, when a real placement is about to be lost', () => {
    const { findings } = mapExportGraphToCanonical(withPlacement('2026-02-09'));
    const placed = placementFindings(findings);
    expect(placed).toHaveLength(1);
    expect(placed[0]?.kind).toBe('drop');
    // The count is named so a planner can tell whether the programme they are handing over is one
    // of the affected ones — "some data was dropped" is not actionable.
    expect(placed[0]?.detail).toMatch(/^1 activity\(ies\) carry a hand-placed start/);
  });

  /** ONE aggregate finding for the whole export, never one per bar — a placed phase is forty rows. */
  it('aggregates: many placed activities still produce exactly one finding', () => {
    const { findings } = mapExportGraphToCanonical(withPlacement('2026-02-09', 3));
    const placed = placementFindings(findings);
    expect(placed).toHaveLength(1);
    expect(placed[0]?.detail).toMatch(/^3 activity\(ies\) carry a hand-placed start/);
  });

  it('says nothing for a programme nobody has hand-placed', () => {
    // Conditional, unlike `lagMinutes`' import half — here we KNOW whether anything is lost, so a
    // standing finding would be a false alarm on the overwhelming majority of exports.
    const { findings } = mapExportGraphToCanonical(buildRichExportGraph());
    expect(placementFindings(findings)).toHaveLength(0);
  });

  /**
   * **The parity limb.** A field that reaches the mapper must not reach the FILE — the canonical
   * model is what both serialisers read, so an activity gaining a placement may not change a single
   * byte of either output.
   */
  it('changes no exported byte: the canonical model is identical with and without a placement', () => {
    const plain = mapExportGraphToCanonical(buildRichExportGraph());
    const placed = mapExportGraphToCanonical(withPlacement('2026-02-09', 3));
    expect(JSON.stringify(placed.model)).toBe(JSON.stringify(plain.model));
  });
});
