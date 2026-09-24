import { describe, expect, it } from 'vitest';

import { mapExportGraphToCanonical } from './export-mapper.js';
import { buildRichExportGraph } from './export.fixtures.js';
import { importMspdi } from './import-mspdi.js';
import { importXer } from './import-xer.js';
import { buildMspdi, standardWeekDays } from './mspdi.fixtures.js';
import type { ReportFinding } from './report.js';
import { LAYOUT_LABEL_PLACED_START, LAYOUT_LABEL_ROW } from './xer-layout-fields.js';
import { buildXer, standardClndrData, type XerTableSpec } from './xer.fixtures.js';

/**
 * The **hand-placement** across interchange (one-planning-surface M-G; amended by layout-interchange
 * M2, spec §0.1, deliberately).
 *
 * **A foreign file cannot carry a placement, and SchedulePoint's own XER now can.** P6 and MSPDI hold
 * constraints and computed dates, never "a human put this bar here", so a foreign import reports
 * nothing about placement: the importer knows with certainty that nothing was lost, and a standing
 * finding would be noise on every import forever. That half of M-G's reasoning stands.
 *
 * What it said beside that — that no parser writes `visualStart` and the canonical model has no slot
 * for one — was true of foreign files and was stated of every file. SchedulePoint's XER carries the
 * placement and the row in two user-defined fields only it writes (`xer-layout-fields.ts`), so a
 * SchedulePoint file restores both, and switching the option off reports what was present and not
 * applied. The export half is unchanged in M2: the file does not carry a placement until M3.
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

describe('import — a foreign file cannot carry a placement, so nothing is reported', () => {
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

describe('import — a SchedulePoint XER restores its layout', () => {
  const layoutTables: XerTableSpec[] = [
    {
      name: 'UDFTYPE',
      fields: ['udf_type_id', 'table_name', 'udf_type_name', 'udf_type_label', 'logical_data_type'],
      rows: [
        ['1', 'TASK', 'user_field_1', LAYOUT_LABEL_PLACED_START, 'FT_TEXT'],
        ['2', 'TASK', 'user_field_2', LAYOUT_LABEL_ROW, 'FT_INT'],
      ],
    },
    {
      name: 'UDFVALUE',
      fields: [
        'udf_type_id',
        'fk_id',
        'proj_id',
        'udf_date',
        'udf_number',
        'udf_text',
        'udf_code_id',
      ],
      rows: [
        ['1', 'T1', 'P1', '', '', '2026-01-12', ''],
        ['2', 'T1', 'P1', '', '3', '', ''],
      ],
    },
  ];
  const content = buildXer([PROJECT, CALENDAR, TASK, ...layoutTables]);

  it('writes the placement and the row onto the graph, and counts both', () => {
    const result = importXer({ content, filename: 'sample.xer' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.graph.activities[0]).toMatchObject({ visualStart: '2026-01-12', laneIndex: 3 });
    expect(result.report.mapped).toMatchObject({ placements: 1, lanes: 1 });
    // Nothing about the layout is dropped: the only drop is the fixture calendar's, which the foreign
    // import of the same network reports too.
    expect(result.report.drops.filter((f) => f.entity === 'activity')).toEqual([]);
  });

  it('IGNORE takes the foreign path exactly, and says what was not applied', () => {
    const ignored = importXer({ content, filename: 'sample.xer', restoreLayout: 'IGNORE' });
    const foreign = importXer({
      content: buildXer([PROJECT, CALENDAR, TASK]),
      filename: 'sample.xer',
    });
    expect(ignored.ok && foreign.ok).toBe(true);
    if (!ignored.ok || !foreign.ok) return;
    expect(ignored.graph).toEqual(foreign.graph);
    expect(ignored.report.mapped).toEqual(foreign.report.mapped);
    expect(ignored.report.drops).toEqual([
      ...foreign.report.drops,
      expect.objectContaining({
        entity: 'activity',
        detail: expect.stringMatching(/layout for 1 activity; it was not applied/),
      }),
    ]);
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
