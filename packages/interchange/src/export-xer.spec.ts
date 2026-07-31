import { describe, expect, it } from 'vitest';

import { exportXer } from './export-xer.js';
import { buildExportGraph, buildRichExportGraph, toComparable } from './export.fixtures.js';
import type { ImportConstraintType } from './import-graph.js';
import { importSchedule } from './import-schedule.js';
import { detectXer, parseXer } from './xer-parser.js';

/**
 * Tests for the pure XER export pipeline (ADR-0050 M4a): the `exportXer` orchestrator + emitter +
 * serialiser, and — the headline correctness gate — the **round trip** (`export → importSchedule →
 * structural equivalence`). The equivalence is exact for the core network because the fixtures avoid the
 * two documented lossy coercions (fractional-hour durations, multi-day exception ranges).
 */

/** Decode exported bytes to text for structural assertions. */
function asText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

describe('exportXer', () => {
  it('produces a re-parseable, well-formed .xer for the core network', () => {
    const result = exportXer({ graph: buildExportGraph() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The bytes are a valid XER our own detector/parser accept.
    expect(detectXer(result.bytes).ok).toBe(true);
    const parsed = parseXer(result.bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // The core-network tables are present with the mapped rows.
    expect(parsed.document.tables.get('PROJECT')?.rows).toHaveLength(1);
    expect(parsed.document.tables.get('CALENDAR')?.rows).toHaveLength(1);
    expect(parsed.document.tables.get('TASK')?.rows).toHaveLength(3);
    expect(parsed.document.tables.get('TASKPRED')?.rows).toHaveLength(2);

    // The report counts what was written; no core-network data was dropped.
    expect(result.report.mapped.activities).toBe(3);
    expect(result.report.mapped.relationships).toBe(2);
    expect(result.report.mapped.calendars).toBe(1);
    expect(result.report.drops).toEqual([]);
  });

  it('round-trips the core network: export → re-import → structurally equivalent', () => {
    const original = buildExportGraph();
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const reimported = importSchedule({ content: exported.bytes, filename: 'roundtrip.xer' });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;

    expect(toComparable(reimported.graph)).toEqual(toComparable(original));
  });

  /**
   * A Level of Effort survives the XER round trip as an LOE, not as a task.
   *
   * The two facts asserted together are the point. Its **type** must come back, because an LOE and a
   * TASK schedule differently — an LOE spans its SS/FF logic and never drives, a TASK schedules from
   * a duration and does. And its **duration** must come back, because P6 writes one and dropping it
   * would make export→import lossy for a field the file plainly carries.
   */
  it('round-trips a Level of Effort as LEVEL_OF_EFFORT, duration intact', () => {
    const original = buildExportGraph();
    const loe = { ...original.activities[0]!, type: 'LEVEL_OF_EFFORT' as const };
    const graph = { ...original, activities: [loe, ...original.activities.slice(1)] };

    const exported = exportXer({ graph });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(asText(exported.bytes)).toContain('TT_LOE');

    const reimported = importSchedule({ content: exported.bytes, filename: 'loe.xer' });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(toComparable(reimported.graph)).toEqual(toComparable(graph));
    // Belt and braces: `toComparable` could in principle normalise the type away.
    expect(reimported.graph.activities[0]?.type).toBe('LEVEL_OF_EFFORT');
    expect(reimported.graph.activities[0]?.durationMinutes).toBe(loe.durationMinutes);
  });

  it('round-trips a fractional-hour duration exactly (90 min → 1.5h → 90 min)', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) =>
        a.key === 'A1' ? { ...a, durationMinutes: 90 } : a,
      ),
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // The emitted duration is the exact hours value.
    expect(asText(exported.bytes)).toContain('1.5');

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const a1 = reimported.graph.activities.find((a) => a.code === 'A1000');
    expect(a1?.durationMinutes).toBe(90);
  });

  it('round-trips a negative lag (lead)', () => {
    const original = buildExportGraph({
      dependencies: [
        { key: 'R1', predecessorKey: 'A1', successorKey: 'A2', type: 'SS', lagMinutes: -120 },
      ],
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const dep = reimported.graph.dependencies[0];
    expect(dep?.type).toBe('SS');
    expect(dep?.lagMinutes).toBe(-120);
  });

  it('preserves a non-ASCII plan/activity name through the UTF-8 encoding', () => {
    const original = buildExportGraph({
      plan: { name: 'Café — Århus 桥', dataDate: '2026-01-05', defaultCalendarKey: 'CAL1' },
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.graph.plan.name).toBe('Café — Århus 桥');
  });

  it('exports an empty (task-less) plan as a valid file (CQ-5 default)', () => {
    const original = buildExportGraph({ activities: [], dependencies: [] });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(detectXer(exported.bytes).ok).toBe(true);
    expect(exported.report.mapped.activities).toBe(0);
  });

  it('serialises a constraint (no longer a drop) so it round-trips (M4c)', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) =>
        a.key === 'A1'
          ? { ...a, constraintType: 'SNET' as const, constraintDate: '2026-02-01' }
          : a,
      ),
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // The category is now emitted, not dropped.
    expect(exported.report.drops).toEqual([]);

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const a1 = reimported.graph.activities.find((a) => a.code === 'A1000');
    expect(a1?.constraintType).toBe('SNET');
    expect(a1?.constraintDate).toBe('2026-02-01');
  });

  // --- M4c: the full-plan (rich-scope) round trip ---------------------------------------------------

  it('round-trips the FULL plan: WBS + constraints + ALAP + progress + resources/assignments', () => {
    const original = buildRichExportGraph();
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    // Everything in scope is emitted exactly for XER — nothing is dropped or approximated.
    expect(exported.report.drops).toEqual([]);
    expect(exported.report.approximations).toEqual([]);
    expect(exported.report.mapped).toMatchObject({
      activities: 4, // 2 WBS summaries excluded.
      wbsSummaries: 2,
      constraints: 2, // A1's primary + secondary.
      resources: 1,
      assignments: 1,
    });

    const reimported = importSchedule({ content: exported.bytes, filename: 'rich.xer' });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    // No repair was needed — the re-imported graph matches the original exactly.
    expect(reimported.report.repairs).toEqual([]);
    expect(toComparable(reimported.graph, 'XER')).toEqual(toComparable(original, 'XER'));
  });

  it('round-trips every one of the 8 constraint types to itself', () => {
    const types: ImportConstraintType[] = [
      'SNET',
      'SNLT',
      'FNET',
      'FNLT',
      'MSO',
      'MFO',
      'MANDATORY_START',
      'MANDATORY_FINISH',
    ];
    for (const type of types) {
      const original = buildExportGraph({
        activities: buildExportGraph().activities.map((a) =>
          a.key === 'A1' ? { ...a, constraintType: type, constraintDate: '2026-02-01' } : a,
        ),
      });
      const exported = exportXer({ graph: original });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;
      const reimported = importSchedule({ content: exported.bytes });
      expect(reimported.ok).toBe(true);
      if (!reimported.ok) return;
      const a1 = reimported.graph.activities.find((a) => a.code === 'A1000');
      expect(a1?.constraintType).toBe(type);
      expect(a1?.constraintDate).toBe('2026-02-01');
    }
  });

  it('round-trips ALAP (as-late-as-possible) as a CS_ALAP constraint slot', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) =>
        a.key === 'A1' ? { ...a, scheduleAsLateAsPossible: true } : a,
      ),
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(asText(exported.bytes)).toContain('CS_ALAP');

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const a1 = reimported.graph.activities.find((a) => a.code === 'A1000');
    expect(a1?.scheduleAsLateAsPossible).toBe(true);
    expect(a1?.constraintType).toBeNull();
  });

  it('round-trips each progress status (NOT_STARTED / IN_PROGRESS / COMPLETE)', () => {
    const cases = [
      { code: 'A1000', status: 'NOT_STARTED' as const, progress: null },
      {
        code: 'A1010',
        status: 'IN_PROGRESS' as const,
        progress: {
          status: 'IN_PROGRESS' as const,
          percentComplete: 50,
          percentCompleteType: 'DURATION' as const,
          physicalPercentComplete: null,
          actualStart: '2026-01-06',
          actualFinish: null,
          remainingDurationMinutes: 1440,
          suspendDate: null,
          resumeDate: null,
          expectedFinish: null,
        },
      },
      {
        code: 'MS100',
        status: 'COMPLETE' as const,
        progress: {
          status: 'COMPLETE' as const,
          percentComplete: 100,
          percentCompleteType: 'DURATION' as const,
          physicalPercentComplete: null,
          actualStart: '2026-01-06',
          actualFinish: '2026-01-09',
          remainingDurationMinutes: 0,
          suspendDate: null,
          resumeDate: null,
          expectedFinish: null,
        },
      },
    ];
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) => {
        const match = cases.find((c) => c.code === a.code);
        return match ? { ...a, progress: match.progress } : a;
      }),
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    for (const c of cases) {
      const activity = reimported.graph.activities.find((a) => a.code === c.code);
      expect(activity?.progress?.status ?? 'NOT_STARTED').toBe(c.status);
    }
  });

  it('round-trips suspend/resume + expected-finish progress (XER-only dimensions)', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) =>
        a.key === 'A1'
          ? {
              ...a,
              progress: {
                status: 'IN_PROGRESS' as const,
                percentComplete: 30,
                percentCompleteType: 'PHYSICAL' as const,
                physicalPercentComplete: 30,
                actualStart: '2026-01-06',
                actualFinish: null,
                remainingDurationMinutes: 960,
                suspendDate: '2026-01-08',
                resumeDate: '2026-01-12',
                expectedFinish: '2026-01-20',
              },
            }
          : a,
      ),
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const a1 = reimported.graph.activities.find((a) => a.code === 'A1000');
    expect(a1?.progress?.suspendDate).toBe('2026-01-08');
    expect(a1?.progress?.resumeDate).toBe('2026-01-12');
    expect(a1?.progress?.expectedFinish).toBe('2026-01-20');
    expect(a1?.progress?.percentCompleteType).toBe('PHYSICAL');
  });

  it('round-trips a WBS parent chain and a driving assignment', () => {
    const original = buildRichExportGraph();
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;

    // The nested WBS tree: wbs:100 (root) ⟵ wbs:110 (child) ⟵ A1010.
    const summaries = reimported.graph.activities.filter((a) => a.type === 'WBS_SUMMARY');
    expect(summaries.map((s) => s.key).sort()).toEqual(['wbs:100', 'wbs:110']);
    expect(reimported.graph.activities.find((a) => a.key === 'wbs:110')?.parentKey).toBe('wbs:100');
    expect(reimported.graph.activities.find((a) => a.code === 'A1010')?.parentKey).toBe('wbs:110');

    // The driving assignment.
    const assignment = reimported.graph.assignments[0];
    expect(assignment?.isDriving).toBe(true);
    expect(assignment?.budgetedUnits).toBe(40);
    expect(assignment?.actualUnits).toBe(10);
  });

  it('rejects a graph past the activity ceiling with a typed limit error', () => {
    const many = Array.from({ length: 5001 }, (_unused, i) => ({
      key: `A${i}`,
      code: `C${i}`,
      name: `Task ${i}`,
      type: 'TASK' as const,
      durationMinutes: 60,
      calendarKey: null,
      parentKey: null,
      constraintType: null,
      constraintDate: null,
      secondaryConstraintType: null,
      secondaryConstraintDate: null,
      scheduleAsLateAsPossible: false,
      progress: null,
    }));
    const result = exportXer({ graph: buildExportGraph({ activities: many, dependencies: [] }) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('limit');
    expect(result.error.code).toBe('TOO_MANY_ACTIVITIES');
  });

  // --- M5: the calendar tier round-trips through `clndr_type` (ADR-0053 §5) -------------------------

  /** The `CALENDAR` row for `clndrId`, as the parser's field → value map. */
  function calendarRow(bytes: Uint8Array, clndrId: string): ReadonlyMap<string, string> {
    const parsed = parseXer(bytes);
    if (!parsed.ok) throw new Error('expected a parseable XER document');
    const row = parsed.document.tables
      .get('CALENDAR')
      ?.rows.find((r) => r.get('clndr_id') === clndrId);
    if (row === undefined) throw new Error(`no CALENDAR row for ${clndrId}`);
    return row;
  }

  /** A tiered three-calendar export graph: one project, one shared, one a resource holds. */
  function tieredGraph() {
    const template = buildExportGraph().calendars[0];
    if (template === undefined) throw new Error('fixture must carry a calendar');
    return buildExportGraph({
      calendars: [
        { ...template, key: 'CAL1', name: 'Site', scope: 'PROJECT' },
        { ...template, key: 'CAL2', name: 'Shared 5-Day', scope: 'ORG' },
        { ...template, key: 'CAL3', name: 'Crew Shift', scope: 'ORG' },
      ],
      resources: [
        {
          key: 'RES1',
          name: 'Crew',
          code: 'CR',
          kind: 'LABOUR',
          // A resource holds CAL3, so it must emit as a RESOURCE calendar — that is what makes a
          // re-import put it back in the shared library rather than in the receiving project.
          calendarKey: 'CAL3',
          costPerUnit: null,
          maxUnitsPerHour: null,
        },
      ],
    });
  }

  it('emits clndr_type from the calendar tier: CA_Project / CA_Base / CA_Rsrc', () => {
    const result = exportXer({ graph: tieredGraph() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(calendarRow(result.bytes, 'CAL1').get('clndr_type')).toBe('CA_Project');
    expect(calendarRow(result.bytes, 'CAL2').get('clndr_type')).toBe('CA_Base');
    expect(calendarRow(result.bytes, 'CAL3').get('clndr_type')).toBe('CA_Rsrc');
  });

  it('round-trips every tier when the importer opts global calendars back into the org library', () => {
    const original = tieredGraph();
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const reimported = importSchedule({
      content: exported.bytes,
      globalCalendarScope: 'ORG',
    });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(toComparable(reimported.graph)).toEqual(toComparable(original));
  });

  it('lands the exported GLOBAL calendar project-local WITHOUT that opt-in — the receiving tenant decides', () => {
    const exported = exportXer({ graph: tieredGraph() });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const scopeByKey = Object.fromEntries(reimported.graph.calendars.map((c) => [c.key, c.scope]));
    // CAL2 (CA_Base) defers to the default; CAL3 (CA_Rsrc, held by a resource) is still forced to ORG.
    expect(scopeByKey).toEqual({ CAL1: 'PROJECT', CAL2: 'PROJECT', CAL3: 'ORG' });
  });
});
