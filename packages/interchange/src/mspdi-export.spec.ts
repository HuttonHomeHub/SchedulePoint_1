import { describe, expect, it } from 'vitest';

import { exportMspdi } from './export-mspdi.js';
import { buildExportGraph, buildRichExportGraph, toComparable } from './export.fixtures.js';
import type { ImportConstraintType } from './import-graph.js';
import { importSchedule } from './import-schedule.js';
import { childElements, detectMspdi, parseMspdi } from './mspdi-parser.js';

/**
 * Tests for the pure MSPDI export pipeline (ADR-0050 M4b): the `exportMspdi` orchestrator + emitter +
 * serialiser, and — the headline correctness gate — the **round trip** (`export → importSchedule →
 * structural equivalence`). The equivalence is exact for the core network because the fixtures avoid the
 * documented lossy coercions (fractional-hour durations, multi-day exception ranges). It reuses the *same*
 * `buildExportGraph` / `toComparable` harness as the XER round trip — the same canonical model serialises to
 * both formats (ADR-0050: a format is a serialiser, not a second pipeline).
 */

/** Decode exported bytes to text for structural assertions. */
function asText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** All `<Task>` elements across the parsed `<Tasks>` containers. */
function tasksOf(bytes: Uint8Array): ReturnType<typeof childElements> {
  const parsed = parseMspdi(bytes);
  if (!parsed.ok) throw new Error('expected a parseable MSPDI document');
  return childElements(parsed.document.project, 'Tasks').flatMap((c) => childElements(c, 'Task'));
}

describe('exportMspdi', () => {
  it('produces a re-parseable, well-formed .xml for the core network', () => {
    const result = exportMspdi({ graph: buildExportGraph() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The bytes are a valid MSPDI our own detector/parser accept.
    expect(detectMspdi(result.bytes).ok).toBe(true);
    const parsed = parseMspdi(result.bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // The core-network vocabulary is present with the mapped rows: 3 tasks, 2 predecessor links, 1 calendar.
    const tasks = childElements(parsed.document.project, 'Tasks').flatMap((c) =>
      childElements(c, 'Task'),
    );
    expect(tasks).toHaveLength(3);
    const links = tasks.flatMap((t) => childElements(t, 'PredecessorLink'));
    expect(links).toHaveLength(2);
    const calendars = childElements(parsed.document.project, 'Calendars').flatMap((c) =>
      childElements(c, 'Calendar'),
    );
    expect(calendars).toHaveLength(1);

    // The report counts what was written; no core-network data was dropped.
    expect(result.report.detectedFormat).toBe('MSPDI');
    expect(result.report.mapped.activities).toBe(3);
    expect(result.report.mapped.relationships).toBe(2);
    expect(result.report.mapped.calendars).toBe(1);
    expect(result.report.drops).toEqual([]);
  });

  it('round-trips the core network: export → re-import → structurally equivalent', () => {
    const original = buildExportGraph();
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const reimported = importSchedule({ content: exported.bytes, filename: 'roundtrip.xml' });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;

    expect(toComparable(reimported.graph)).toEqual(toComparable(original));
  });

  it('round-trips a fractional-hour duration exactly (90 min → PT1H30M0S → 90 min)', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) =>
        a.key === 'A1' ? { ...a, durationMinutes: 90 } : a,
      ),
    });
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // The emitted duration is the exact ISO-8601 timespan.
    expect(asText(exported.bytes)).toContain('PT1H30M0S');

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const a1 = reimported.graph.activities.find((a) => a.code === 'A1000');
    expect(a1?.durationMinutes).toBe(90);
  });

  it('round-trips a negative lag (lead) through tenths-of-a-minute LinkLag', () => {
    const original = buildExportGraph({
      dependencies: [
        { key: 'R1', predecessorKey: 'A1', successorKey: 'A2', type: 'SS', lagMinutes: -120 },
      ],
    });
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // -120 min → -1200 tenths.
    expect(asText(exported.bytes)).toContain('<LinkLag>-1200</LinkLag>');

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const dep = reimported.graph.dependencies[0];
    expect(dep?.type).toBe('SS');
    expect(dep?.lagMinutes).toBe(-120);
  });

  it('maps each relationship type to the correct MSP link Type number (0=FF,1=FS,2=SF,3=SS)', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.filter((a) => a.key !== 'M1'),
      dependencies: [
        { key: 'R1', predecessorKey: 'A1', successorKey: 'A2', type: 'FF', lagMinutes: 0 },
      ],
    });
    const ff = exportMspdi({ graph: original });
    expect(ff.ok).toBe(true);
    if (!ff.ok) return;
    expect(asText(ff.bytes)).toContain('<Type>0</Type>');

    // And the mapping round-trips: FF re-imports as FF, SF as SF.
    for (const [type, num] of [
      ['FF', '0'],
      ['FS', '1'],
      ['SF', '2'],
      ['SS', '3'],
    ] as const) {
      const g = buildExportGraph({
        activities: buildExportGraph().activities.filter((a) => a.key !== 'M1'),
        dependencies: [
          { key: 'R1', predecessorKey: 'A1', successorKey: 'A2', type, lagMinutes: 0 },
        ],
      });
      const exported = exportMspdi({ graph: g });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;
      expect(asText(exported.bytes)).toContain(`<Type>${num}</Type>`);
      const reimported = importSchedule({ content: exported.bytes });
      expect(reimported.ok).toBe(true);
      if (!reimported.ok) return;
      expect(reimported.graph.dependencies[0]?.type).toBe(type);
    }
  });

  it('preserves a non-ASCII plan/activity name exactly through the UTF-8 encoding', () => {
    const original = buildExportGraph({
      plan: { name: 'Café — Århus 桥', dataDate: '2026-01-05', defaultCalendarKey: 'CAL1' },
    });
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    // No XML-special characters, so the name survives byte-exact.
    expect(reimported.graph.plan.name).toBe('Café — Århus 桥');
  });

  it('escapes XML special characters (& < > ") so untrusted text cannot break or inject structure', () => {
    // A name that both carries all four special chars AND tries to inject an element.
    const hostileName = 'A & B </Name><Injected>x</Injected> "<end>"';
    const original = buildExportGraph({
      plan: { name: hostileName, dataDate: '2026-01-05', defaultCalendarKey: 'CAL1' },
    });
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const text = asText(exported.bytes);
    // Every special char is escaped in the serialised bytes …
    expect(text).toContain('&amp;');
    expect(text).toContain('&lt;');
    expect(text).toContain('&gt;');
    expect(text).toContain('&quot;');
    // … and the injection never materialised as a real element.
    expect(text).not.toContain('<Injected>');

    // The document is still well-formed and re-imports with the network intact (3 activities).
    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.graph.activities).toHaveLength(3);
    // The parser deliberately disables entity processing (anti-entity-expansion), so a special char
    // re-reads in its safe, inert ENCODED form rather than being decoded — a documented coercion.
    expect(reimported.graph.plan.name).toBe(
      'A &amp; B &lt;/Name&gt;&lt;Injected&gt;x&lt;/Injected&gt; &quot;&lt;end&gt;&quot;',
    );
  });

  it('exports an empty (task-less) plan as a valid file', () => {
    const original = buildExportGraph({ activities: [], dependencies: [] });
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(detectMspdi(exported.bytes).ok).toBe(true);
    expect(tasksOf(exported.bytes)).toHaveLength(0);
    expect(exported.report.mapped.activities).toBe(0);
  });

  it('serialises a constraint + resource (no longer drops) so they round-trip (M4c)', () => {
    const original = buildExportGraph({
      activities: buildExportGraph().activities.map((a) =>
        a.key === 'A1'
          ? { ...a, constraintType: 'SNET' as const, constraintDate: '2026-02-01' }
          : a,
      ),
      resources: [
        {
          key: 'RES1',
          name: 'Crew',
          code: 'CR',
          kind: 'LABOUR',
          calendarKey: null,
          costPerUnit: null,
          maxUnitsPerHour: null,
        },
      ],
    });
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // Neither category is dropped any more.
    expect(exported.report.drops).toEqual([]);

    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.graph.activities.find((a) => a.code === 'A1000')?.constraintType).toBe(
      'SNET',
    );
    expect(reimported.graph.resources.map((r) => r.name)).toContain('Crew');
  });

  // --- M4c: the full-plan (rich-scope) round trip ---------------------------------------------------

  it('round-trips the FULL plan (WBS + constraints + progress + resources), MSP-lossy fields aside', () => {
    const original = buildRichExportGraph();
    const exported = exportMspdi({ graph: original });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // Nothing is a silent drop; MSP-inexpressible detail is surfaced as approximations.
    expect(exported.report.drops).toEqual([]);

    const reimported = importSchedule({ content: exported.bytes, filename: 'rich.xml' });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    // Equal for everything MSP can represent (the driving flag + production rate are normalised away).
    expect(toComparable(reimported.graph, 'MSPDI')).toEqual(toComparable(original, 'MSPDI'));
  });

  it('reports the MSP-lossy dimensions of the rich plan as approximations (driving flag + secondary constraint)', () => {
    const exported = exportMspdi({ graph: buildRichExportGraph() });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const details = exported.report.approximations.map((a) => a.detail).join('\n');
    // The secondary FNLT constraint is exported as an MSP deadline …
    expect(details).toMatch(/deadline/i);
    // … and the driving-resource flag cannot ride an MSP assignment.
    expect(details).toMatch(/driving/i);
    // The primary constraint + progress + WBS are NOT approximated (they round-trip exactly).
    expect(exported.report.approximations.some((a) => /driving/i.test(a.detail))).toBe(true);
  });

  it('round-trips the 6 MSP-expressible constraint types; the 2 mandatory ones are lossy-with-a-finding', () => {
    const expressible: ImportConstraintType[] = ['SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'];
    for (const type of expressible) {
      const g = buildExportGraph({
        activities: buildExportGraph().activities.map((a) =>
          a.key === 'A1' ? { ...a, constraintType: type, constraintDate: '2026-02-01' } : a,
        ),
      });
      const exported = exportMspdi({ graph: g });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;
      const reimported = importSchedule({ content: exported.bytes });
      expect(reimported.ok).toBe(true);
      if (!reimported.ok) return;
      expect(reimported.graph.activities.find((a) => a.code === 'A1000')?.constraintType).toBe(
        type,
      );
    }

    // A mandatory constraint has no MSP equivalent → dropped-with-an-approximation, not silently lost.
    for (const type of ['MANDATORY_START', 'MANDATORY_FINISH'] as const) {
      const g = buildExportGraph({
        activities: buildExportGraph().activities.map((a) =>
          a.key === 'A1' ? { ...a, constraintType: type, constraintDate: '2026-02-01' } : a,
        ),
      });
      const exported = exportMspdi({ graph: g });
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;
      expect(exported.report.approximations.some((a) => /Microsoft Project/i.test(a.detail))).toBe(
        true,
      );
      const reimported = importSchedule({ content: exported.bytes });
      expect(reimported.ok).toBe(true);
      if (!reimported.ok) return;
      expect(
        reimported.graph.activities.find((a) => a.code === 'A1000')?.constraintType,
      ).toBeNull();
    }
  });

  it('round-trips a WBS parent chain via outline levels', () => {
    const exported = exportMspdi({ graph: buildRichExportGraph() });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const reimported = importSchedule({ content: exported.bytes });
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const summaries = reimported.graph.activities.filter((a) => a.type === 'WBS_SUMMARY');
    expect(summaries.map((s) => s.key).sort()).toEqual(['wbs:100', 'wbs:110']);
    expect(reimported.graph.activities.find((a) => a.key === 'wbs:110')?.parentKey).toBe('wbs:100');
    expect(reimported.graph.activities.find((a) => a.code === 'A1010')?.parentKey).toBe('wbs:110');
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
    const result = exportMspdi({ graph: buildExportGraph({ activities: many, dependencies: [] }) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.stage).toBe('limit');
    expect(result.error.code).toBe('TOO_MANY_ACTIVITIES');
  });
});
