import { describe, expect, it } from 'vitest';

import type { ExportGraph } from './export-graph.js';
import { mapExportGraphToCanonical } from './export-mapper.js';
import { exportMspdi } from './export-mspdi.js';
import { exportXer } from './export-xer.js';
import { buildLaidOutExportGraph } from './export.fixtures.js';
import { importXer } from './import-xer.js';
import { LAYOUT_LABEL_SWIMLANES } from './xer-layout-fields.js';

/**
 * The swimlane writer (swimlanes M4-T5): what a plan with swimlanes writes, that a plan without them
 * writes exactly what it always did, and that the shipped reader (M4-T4) accepts every byte of it.
 */

const bytesOf = (graph: ExportGraph): Buffer => {
  const exported = exportXer({ graph });
  if (!exported.ok) throw new Error(exported.error.code);
  return Buffer.from(exported.bytes);
};

/** The rich plan with three hand-made swimlanes and three of its tasks in them. */
function manualGraph(names = ['North', 'Empty', 'South']): ExportGraph {
  const base = buildLaidOutExportGraph();
  const tasks = base.activities.filter((a) => a.type !== 'WBS_SUMMARY');
  const member = new Map([
    [tasks[0]?.key, { swimlaneKey: 'n', swimlaneLane: 2 }],
    [tasks[1]?.key, { swimlaneKey: 'n', swimlaneLane: 0 }],
    [tasks[2]?.key, { swimlaneKey: 's', swimlaneLane: null }],
  ]);
  const keys = ['n', 'e', 's'];
  return {
    ...base,
    plan: { ...base.plan, swimlaneSource: 'MANUAL', swimlaneWbsLevel: null },
    swimlanes: names.map((name, i) => ({ key: keys[i] ?? `k${String(i)}`, name })),
    activities: base.activities.map((a) => ({ ...a, ...(member.get(a.key) ?? {}) })),
  };
}

describe('export — a plan without swimlanes writes what it always did', () => {
  it('is byte-identical whether the graph says NONE, says nothing, or lists nothing', () => {
    const plain = bytesOf(buildLaidOutExportGraph());
    const base = buildLaidOutExportGraph();
    const none = bytesOf({
      ...base,
      plan: { ...base.plan, swimlaneSource: 'NONE', swimlaneWbsLevel: null },
      swimlanes: [],
    });
    expect(none.equals(plain)).toBe(true);
    expect(plain.toString('utf8')).not.toContain('swimlane');
  });

  it('a swimlane-free plan reports no swimlane finding', () => {
    const { findings } = mapExportGraphToCanonical(buildLaidOutExportGraph(), {
      carriesLayout: true,
    });
    expect(findings.filter((f) => f.detail.toLowerCase().includes('swimlane'))).toEqual([]);
  });
});

describe('export — a MANUAL plan round trips through the real reader', () => {
  it('keeps names in order, the empty one, membership by code and the lanes', () => {
    const graph = manualGraph();
    const bytes = bytesOf(graph);
    expect(bytes.toString('utf8')).toContain(LAYOUT_LABEL_SWIMLANES);

    const imported = importXer({ content: bytes, filename: 'sw.xer' });
    if (!imported.ok) throw new Error(imported.error.code);
    expect(imported.graph.plan).toMatchObject({ swimlaneSource: 'MANUAL', swimlaneWbsLevel: null });
    expect(imported.graph.swimlanes?.map((s) => s.name)).toEqual(['North', 'Empty', 'South']);
    const nameOfKey = new Map(imported.graph.swimlanes?.map((s) => [s.key, s.name]));
    const wrote = new Map(graph.swimlanes?.map((s) => [s.key, s.name]));
    const back = new Map(imported.graph.activities.map((a) => [a.code, a]));
    let members = 0;
    for (const a of graph.activities) {
      const got = back.get(a.code);
      const wantName = a.swimlaneKey == null ? undefined : wrote.get(a.swimlaneKey);
      const gotName = got?.swimlaneKey == null ? undefined : nameOfKey.get(got.swimlaneKey);
      expect(gotName, a.code).toBe(wantName);
      expect(got?.swimlaneLane ?? null, a.code).toBe(
        wantName === undefined ? null : (a.swimlaneLane ?? null),
      );
      if (wantName !== undefined) members += 1;
    }
    expect(members).toBe(3);
    expect(imported.report.repairs.filter((f) => f.detail.includes('swimlane'))).toEqual([]);
    expect(imported.report.drops.filter((f) => f.detail.includes('swimlane'))).toEqual([]);
  });

  it('keeps non-ASCII names, and survives a name with a quote and a backslash', () => {
    const graph = manualGraph(['Étage "1"', 'Zone \\ B', '南']);
    const imported = importXer({ content: bytesOf(graph), filename: 'sw.xer' });
    if (!imported.ok) throw new Error(imported.error.code);
    expect(imported.graph.swimlanes?.map((s) => s.name)).toEqual(['Étage "1"', 'Zone \\ B', '南']);
  });

  it('writes a NONE-sourced plan that still holds hand-made swimlanes', () => {
    const base = manualGraph();
    const graph: ExportGraph = { ...base, plan: { ...base.plan, swimlaneSource: 'NONE' } };
    const imported = importXer({ content: bytesOf(graph), filename: 'sw.xer' });
    if (!imported.ok) throw new Error(imported.error.code);
    expect(imported.graph.plan.swimlaneSource).toBe('NONE');
    expect(imported.graph.swimlanes?.map((s) => s.name)).toEqual(['North', 'Empty', 'South']);
  });

  it('is deterministic: the same plan writes the same bytes', () => {
    expect(bytesOf(manualGraph()).equals(bytesOf(manualGraph()))).toBe(true);
  });

  it('reports one approximation naming the counts', () => {
    const { findings } = mapExportGraphToCanonical(manualGraph(), { carriesLayout: true });
    expect(findings.filter((f) => f.detail.includes('swimlane'))).toEqual([
      expect.objectContaining({
        kind: 'approximation',
        detail: expect.stringContaining('3 swimlane(s) and 3 membership(s)') as string,
      }),
    ]);
  });
});

describe('export — a WBS plan writes its source and level and nothing the reader would discard', () => {
  it('restores WBS at the level, with no hand-made swimlane and no repair finding', () => {
    const base = manualGraph();
    const graph: ExportGraph = {
      ...base,
      plan: { ...base.plan, swimlaneSource: 'WBS', swimlaneWbsLevel: 2 },
    };
    const imported = importXer({ content: bytesOf(graph), filename: 'sw.xer' });
    if (!imported.ok) throw new Error(imported.error.code);
    expect(imported.graph.plan).toMatchObject({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2 });
    expect(imported.graph.swimlanes ?? []).toEqual([]);
    expect(imported.graph.activities.filter((a) => a.swimlaneKey != null)).toEqual([]);
    expect(imported.report.repairs.filter((f) => f.detail.includes('swimlane'))).toEqual([]);
  });
});

describe('export — the reader never refuses what is written', () => {
  it('leaves out a name the reader would refuse and a repeat ignoring case, and reports them', () => {
    const many = Array.from({ length: 96 }, (_, i) => `Lane ${String(i)}`);
    const graph = manualGraph(['Fine', 'fine', 'Tab\there', ' padded ', ...many]);
    const mapped = mapExportGraphToCanonical(graph, { carriesLayout: true });
    expect(mapped.model.swimlanes?.names).toHaveLength(97);
    expect(mapped.model.swimlanes?.names.slice(0, 2)).toEqual(['Fine', 'Lane 0']);
    expect(
      mapped.findings.filter((f) => f.kind === 'drop' && f.detail.includes('3 swimlane(s)')),
    ).toHaveLength(1);
    const imported = importXer({ content: bytesOf(graph), filename: 'sw.xer' });
    if (!imported.ok) throw new Error(imported.error.code);
    expect(imported.graph.swimlanes).toHaveLength(97);
    expect(imported.report.repairs.filter((f) => f.detail.includes('swimlane'))).toEqual([]);
  });
});

describe('export — a format without the fields reports the loss', () => {
  it('MSPDI writes the same file and says the swimlanes are not written', () => {
    const plain = exportMspdi({ graph: buildLaidOutExportGraph() });
    const withLanes = exportMspdi({ graph: manualGraph() });
    if (!plain.ok || !withLanes.ok) throw new Error('mspdi export failed');
    expect(withLanes.report.drops.some((f) => f.detail.includes('swimlane'))).toBe(true);
    expect(Buffer.from(withLanes.bytes).equals(Buffer.from(plain.bytes))).toBe(true);
  });
});

describe('export — P6 activity codes are reported, not written (ADR-0210 D13)', () => {
  const coded = (): ExportGraph => ({
    ...buildLaidOutExportGraph(),
    codeTypeCount: 2,
    swimlaneCodeName: 'Area',
  });

  it('writes the same bytes as a plan without codes, in both formats', () => {
    expect(bytesOf(coded()).equals(bytesOf(buildLaidOutExportGraph()))).toBe(true);
    const plain = exportMspdi({ graph: buildLaidOutExportGraph() });
    const withCodes = exportMspdi({ graph: coded() });
    if (!plain.ok || !withCodes.ok) throw new Error('mspdi export failed');
    expect(Buffer.from(withCodes.bytes).equals(Buffer.from(plain.bytes))).toBe(true);
  });

  it('names the code types and the code swimlane source it left out', () => {
    const { findings } = mapExportGraphToCanonical(coded(), { carriesLayout: true });
    const drops = findings.filter((f) => f.kind === 'drop').map((f) => f.detail);
    expect(drops).toContain(
      '2 code type(s) and the values set on activities were not written to the exported file',
    );
    expect(drops.some((d) => d.includes('from the code Area'))).toBe(true);
  });

  it('says nothing about codes when the plan holds none', () => {
    const { findings } = mapExportGraphToCanonical(buildLaidOutExportGraph(), {
      carriesLayout: true,
    });
    expect(findings.filter((f) => /code type|from the code/.test(f.detail))).toEqual([]);
  });
});
