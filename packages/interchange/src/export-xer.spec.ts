import { describe, expect, it } from 'vitest';

import { exportXer } from './export-xer.js';
import { buildExportGraph, toComparable } from './export.fixtures.js';
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

  it('drops and reports out-of-M4a-scope data (constraints) rather than silently omitting it', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) =>
        a.key === 'A1' ? { ...a, constraintType: 'SNET', constraintDate: '2026-02-01' } : a,
      ),
    });
    const exported = exportXer({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.report.drops.some((d) => /constraint/.test(d.detail))).toBe(true);
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
});
