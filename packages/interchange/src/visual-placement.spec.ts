import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { mapExportGraphToCanonical } from './export-mapper.js';
import { exportMspdi } from './export-mspdi.js';
import { exportXer } from './export-xer.js';
import { buildLaidOutExportGraph, buildRichExportGraph } from './export.fixtures.js';
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

describe('export — the placement reaches the mapper and is reported honestly per format', () => {
  const withPlacement = (visualStart: string | null, count = 1) => {
    const graph = buildRichExportGraph();
    return {
      ...graph,
      activities: graph.activities.map((a, i) => (i < count ? { ...a, visualStart } : a)),
    };
  };

  it('a format without the fields (MSPDI) reports the drop, with a count', () => {
    const { findings } = mapExportGraphToCanonical(withPlacement('2026-02-09'));
    const placed = placementFindings(findings);
    expect(placed).toHaveLength(1);
    expect(placed[0]?.kind).toBe('drop');
    // The count is named so a planner can tell whether the programme they are handing over is one
    // of the affected ones — "some data was dropped" is not actionable.
    expect(placed[0]?.detail).toMatch(/^1 activity\(ies\) carry a hand-placed start/);
  });

  it('XER carries the layout, so the finding is an approximation naming both counts', () => {
    const graph = buildLaidOutExportGraph();
    const { findings } = mapExportGraphToCanonical(graph, { carriesLayout: true });
    const placed = graph.activities.filter((a) => a.visualStart != null).length;
    const layout = findings.filter((f) => f.detail.includes('SchedulePoint layout fields'));
    expect(layout).toEqual([
      expect.objectContaining({
        kind: 'approximation',
        detail: `${String(placed)} hand-placed start(s) and ${String(graph.activities.length)} lane(s) written as SchedulePoint layout fields; P6 and other tools show every activity at its computed dates`,
      }),
    ]);
    expect(findings.filter((f) => f.kind === 'drop' && f.detail.includes('hand-placed'))).toEqual(
      [],
    );
  });

  /** ONE aggregate finding for the whole export, never one per bar — a placed phase is forty rows. */
  it('aggregates: many placed activities still produce exactly one finding', () => {
    const { findings } = mapExportGraphToCanonical(withPlacement('2026-02-09', 3));
    const placed = placementFindings(findings);
    expect(placed).toHaveLength(1);
    expect(placed[0]?.detail).toMatch(/^3 activity\(ies\) carry a hand-placed start/);
  });

  it('says nothing for a programme nobody has hand-placed, in either format', () => {
    // Rows alone are never reported: no tool but SchedulePoint has rows, so nothing reads differently.
    const graph = { ...buildRichExportGraph() };
    const rowsOnly = {
      ...graph,
      activities: graph.activities.map((a, i) => ({ ...a, laneIndex: i })),
    };
    for (const options of [{}, { carriesLayout: true }]) {
      const { findings } = mapExportGraphToCanonical(rowsOnly, options);
      expect(findings.filter((f) => f.detail.includes('hand-placed'))).toEqual([]);
    }
  });

  /**
   * **FC-7** (replacing M-G's parity limb, which asserted the placement reached no byte of the file —
   * now false for XER by design). Every table of the XER **other than the two layout tables** is
   * byte-identical to what the exporter wrote before this epic, for a fully laid-out rich plan. The
   * golden was written by the pre-M3 exporter (`a9021394`) from the same graph and is never regenerated.
   */
  it('FC-7: every scheduling table is byte-identical to the pre-epic export', () => {
    const golden = readFileSync(
      fileURLToPath(new URL('./golden/fc7-rich-export.pre-epic.xer', import.meta.url)),
      'utf8',
    );
    const exported = exportXer({ graph: buildLaidOutExportGraph() });
    if (!exported.ok) throw new Error(exported.error.code);
    const text = new TextDecoder().decode(exported.bytes);
    const tablesOf = (xer: string) =>
      xer
        .split(/(?=^%T\t)/m)
        .filter((block) => block.startsWith('%T\t'))
        .map((block) => block.replace(/%E\s*$/, '').trimEnd());
    const layoutTables = new Set(['UDFTYPE', 'UDFVALUE']);
    const nameOf = (block: string) => block.slice(3, block.indexOf('\n'));
    const now = tablesOf(text);
    expect(now.filter((b) => !layoutTables.has(nameOf(b)))).toEqual(tablesOf(golden));
    // And the layout really is there, so a green run cannot mean the new tables went missing.
    expect(now.map(nameOf).filter((n) => layoutTables.has(n))).toEqual(['UDFTYPE', 'UDFVALUE']);
    // The header line is scheduling content too (version, date).
    expect(text.split('\n')[0]).toBe(golden.split('\n')[0]);
  });

  // The M3 security review: a format that does not write the layout never carries it on the canonical
  // model, so no emitter can begin reading a field it was never meant to carry.
  it('only a format that writes the layout carries it on the canonical model', () => {
    const graph = buildLaidOutExportGraph();
    const without = mapExportGraphToCanonical(graph).model.activities;
    expect(without.filter((a) => a.layout !== undefined)).toEqual([]);
    const withIt = mapExportGraphToCanonical(graph, { carriesLayout: true }).model.activities;
    expect(withIt.filter((a) => a.layout !== undefined)).toHaveLength(graph.activities.length);
  });

  it('the MSPDI export is unchanged by the layout on the canonical model', () => {
    const plain = exportMspdi({ graph: buildRichExportGraph() });
    const laidOut = exportMspdi({
      graph: {
        ...buildRichExportGraph(),
        activities: buildRichExportGraph().activities.map((a, i) => ({ ...a, laneIndex: i })),
      },
    });
    if (!plain.ok || !laidOut.ok) throw new Error('mspdi export failed');
    expect(Buffer.from(laidOut.bytes).equals(Buffer.from(plain.bytes))).toBe(true);
  });

  it('decode(emit) round-trips the layout through the real XER bytes', () => {
    const graph = buildLaidOutExportGraph();
    const exported = exportXer({ graph });
    if (!exported.ok) throw new Error(exported.error.code);
    const imported = importXer({ content: exported.bytes, filename: 'rich.xer' });
    if (!imported.ok) throw new Error(imported.error.code);
    const byCode = new Map(imported.graph.activities.map((a) => [a.code, a]));
    for (const a of graph.activities) {
      const back = byCode.get(a.code);
      expect(back?.laneIndex ?? null, a.code).toBe(a.laneIndex ?? null);
      expect(back?.visualStart ?? null, a.code).toBe(
        a.type === 'WBS_SUMMARY' ? null : (a.visualStart ?? null),
      );
    }
  });
});
