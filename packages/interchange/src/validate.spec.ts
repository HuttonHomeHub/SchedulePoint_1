import { describe, expect, it } from 'vitest';

import type { CanonicalModel } from './canonical.js';
import {
  importGraphSchema,
  type ImportActivity,
  type ImportDependency,
  type ImportGraph,
} from './import-graph.js';
import { mapCanonicalToImportGraph } from './mapper.js';
import { validateAndRepair } from './validate.js';

/** A minimal valid activity for hand-built validate fixtures. */
function activity(key: string, code = key): ImportActivity {
  return {
    key,
    code,
    name: `Activity ${key}`,
    type: 'TASK',
    durationMinutes: 480,
    calendarKey: null,
  };
}

/** An FS edge with a derived key. */
function edge(
  predecessorKey: string,
  successorKey: string,
  key = `${predecessorKey}->${successorKey}`,
): ImportDependency {
  return { key, predecessorKey, successorKey, type: 'FS', lagMinutes: 0 };
}

/** Wrap activities + dependencies in an otherwise-valid graph. */
function graphOf(activities: ImportActivity[], dependencies: ImportDependency[]): ImportGraph {
  return {
    plan: { name: 'Plan', dataDate: '2026-01-05', defaultCalendarKey: null },
    calendars: [],
    activities,
    dependencies,
  };
}

/** True when the directed predecessor→successor graph has no cycle. */
function isAcyclic(dependencies: readonly ImportDependency[]): boolean {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const e of dependencies) {
    nodes.add(e.predecessorKey);
    nodes.add(e.successorKey);
    const list = adjacency.get(e.predecessorKey);
    if (list === undefined) adjacency.set(e.predecessorKey, [e.successorKey]);
    else list.push(e.successorKey);
  }
  const state = new Map<string, number>();
  const visit = (node: string): boolean => {
    if (state.get(node) === 1) return false; // grey → back-edge
    if (state.get(node) === 2) return true;
    state.set(node, 1);
    for (const next of adjacency.get(node) ?? []) {
      if (!visit(next)) return false;
    }
    state.set(node, 2);
    return true;
  };
  for (const node of nodes) {
    if (!visit(node)) return false;
  }
  return true;
}

describe('validateAndRepair — duplicate activity codes', () => {
  it('suffixes later duplicates deterministically and reports each', () => {
    const { graph, findings } = validateAndRepair(
      graphOf([activity('A', 'DUP'), activity('B', 'DUP'), activity('C', 'DUP')], []),
    );
    expect(graph.activities.map((a) => a.code)).toEqual(['DUP', 'DUP-2', 'DUP-3']);
    const repairs = findings.filter((f) => f.kind === 'repair' && f.entity === 'activity');
    expect(repairs).toHaveLength(2);
    expect(repairs[0]?.sourceRef).toBe('B');
  });

  it('skips a suffix that would itself collide', () => {
    const { graph } = validateAndRepair(
      graphOf([activity('A', 'X'), activity('B', 'X-2'), activity('C', 'X')], []),
    );
    // C wants X → X-2 taken → X-3.
    expect(graph.activities.map((a) => a.code)).toEqual(['X', 'X-2', 'X-3']);
  });
});

describe('validateAndRepair — dangling edges', () => {
  it('drops an edge with a missing endpoint and reports it', () => {
    const { graph, findings } = validateAndRepair(
      graphOf(
        [activity('A'), activity('B')],
        [edge('A', 'B'), edge('A', 'GHOST'), edge('NOPE', 'B')],
      ),
    );
    expect(graph.dependencies).toHaveLength(1);
    expect(graph.dependencies[0]?.successorKey).toBe('B');
    const repairs = findings.filter(
      (f) => f.entity === 'relationship' && f.detail.includes('dangling'),
    );
    expect(repairs).toHaveLength(2);
  });
});

describe('validateAndRepair — duplicate edges', () => {
  it('keeps the first (pred, succ, type) and de-dups the rest', () => {
    const { graph, findings } = validateAndRepair(
      graphOf(
        [activity('A'), activity('B')],
        [edge('A', 'B', 'first'), edge('A', 'B', 'second'), edge('A', 'B', 'third')],
      ),
    );
    expect(graph.dependencies).toHaveLength(1);
    expect(graph.dependencies[0]?.key).toBe('first');
    expect(findings.filter((f) => f.detail.includes('de-duplicated'))).toHaveLength(2);
  });

  it('keeps two edges of different type between the same activities', () => {
    const fs: ImportDependency = {
      key: 'e1',
      predecessorKey: 'A',
      successorKey: 'B',
      type: 'FS',
      lagMinutes: 0,
    };
    const ss: ImportDependency = {
      key: 'e2',
      predecessorKey: 'A',
      successorKey: 'B',
      type: 'SS',
      lagMinutes: 0,
    };
    const { graph } = validateAndRepair(graphOf([activity('A'), activity('B')], [fs, ss]));
    expect(graph.dependencies).toHaveLength(2);
  });
});

describe('validateAndRepair — cycle breaking (deterministic, acyclic result)', () => {
  it('breaks a 2-cycle by dropping the lexicographically-largest edge', () => {
    const { graph, findings } = validateAndRepair(
      graphOf(
        [activity('T1', 'A1000'), activity('T2', 'A1010')],
        [edge('T1', 'T2'), edge('T2', 'T1')],
      ),
    );
    expect(graph.dependencies).toHaveLength(1);
    // Tuple "A1000 A1010 …" < "A1010 A1000 …" ⇒ the T2→T1 edge (larger) is dropped.
    expect(graph.dependencies[0]?.predecessorKey).toBe('T1');
    expect(graph.dependencies[0]?.successorKey).toBe('T2');
    expect(isAcyclic(graph.dependencies)).toBe(true);
    expect(findings.some((f) => f.detail.includes('cycle broken'))).toBe(true);
  });

  it('breaks a 3-cycle deterministically and leaves an acyclic graph', () => {
    const { graph, findings } = validateAndRepair(
      graphOf(
        [activity('T1', 'A1000'), activity('T2', 'A1010'), activity('T3', 'A1020')],
        [edge('T1', 'T2'), edge('T2', 'T3'), edge('T3', 'T1')],
      ),
    );
    expect(graph.dependencies).toHaveLength(2);
    // Largest tuple "A1020 A1000 …" ⇒ the T3→T1 edge is dropped.
    expect(graph.dependencies.some((e) => e.predecessorKey === 'T3')).toBe(false);
    expect(isAcyclic(graph.dependencies)).toBe(true);
    expect(findings.filter((f) => f.detail.includes('cycle broken'))).toHaveLength(1);
  });

  it('is insensitive to input edge order (same break either way)', () => {
    const forward = validateAndRepair(
      graphOf(
        [activity('T1', 'A1000'), activity('T2', 'A1010'), activity('T3', 'A1020')],
        [edge('T1', 'T2'), edge('T2', 'T3'), edge('T3', 'T1')],
      ),
    );
    const shuffled = validateAndRepair(
      graphOf(
        [activity('T3', 'A1020'), activity('T1', 'A1000'), activity('T2', 'A1010')],
        [edge('T3', 'T1'), edge('T2', 'T3'), edge('T1', 'T2')],
      ),
    );
    const keyset = (g: ImportGraph): string[] =>
      g.dependencies.map((e) => `${e.predecessorKey}->${e.successorKey}`).sort();
    expect(keyset(shuffled.graph)).toEqual(keyset(forward.graph));
  });

  it('breaks two independent cycles, one edge each', () => {
    const { graph } = validateAndRepair(
      graphOf(
        [activity('A'), activity('B'), activity('C'), activity('D')],
        [edge('A', 'B'), edge('B', 'A'), edge('C', 'D'), edge('D', 'C')],
      ),
    );
    expect(graph.dependencies).toHaveLength(2);
    expect(isAcyclic(graph.dependencies)).toBe(true);
  });
});

describe('mapCanonicalToImportGraph — hand-built canonical round-trips to a valid graph', () => {
  const model: CanonicalModel = {
    source: { format: 'XER', version: '18.8', filename: 'hand.xer' },
    project: { id: 'P1', name: 'Hand', dataDate: '2026-01-05', defaultCalendarId: 'CAL' },
    calendars: [
      {
        id: 'CAL',
        name: 'Standard',
        workWeek: {
          monday: [{ start: '08:00', end: '16:00' }],
          tuesday: [
            { start: '08:00', end: '12:00' },
            { start: '13:00', end: '17:00' },
          ],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
        exceptions: [{ date: '2026-01-01', working: false, shifts: [] }],
      },
    ],
    activities: [
      {
        id: 'A',
        code: 'A1000',
        name: 'Mobilise',
        type: 'TASK',
        durationMinutes: 2400,
        calendarId: 'CAL',
      },
      {
        id: 'B',
        code: 'A1010',
        name: 'Finish',
        type: 'FINISH_MILESTONE',
        durationMinutes: 0,
        calendarId: null,
      },
    ],
    relationships: [{ id: 'R', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 480 }],
  };

  it('translates calendar windows, keys, and lags into SchedulePoint vocabulary', () => {
    const { graph } = mapCanonicalToImportGraph(model);
    // Zod-valid domain graph.
    expect(importGraphSchema.safeParse(graph).success).toBe(true);
    expect(graph.plan).toEqual({ name: 'Hand', dataDate: '2026-01-05', defaultCalendarKey: 'CAL' });

    const cal = graph.calendars[0];
    expect(cal?.shifts).toEqual([
      { weekday: 0, startMinute: 480, endMinute: 960 }, // Monday 08:00–16:00
      { weekday: 1, startMinute: 480, endMinute: 720 }, // Tuesday split
      { weekday: 1, startMinute: 780, endMinute: 1020 },
    ]);
    expect(cal?.exceptions).toEqual([
      { startDate: '2026-01-01', endDate: '2026-01-01', label: null, windows: [] },
    ]);

    expect(
      graph.activities.map((a) => ({ key: a.key, code: a.code, dur: a.durationMinutes })),
    ).toEqual([
      { key: 'A', code: 'A1000', dur: 2400 },
      { key: 'B', code: 'A1010', dur: 0 },
    ]);
    expect(graph.dependencies[0]).toEqual({
      key: 'R',
      predecessorKey: 'A',
      successorKey: 'B',
      type: 'FS',
      lagMinutes: 480,
    });
  });

  it('leaves a clean graph unchanged through validate (no repairs)', () => {
    const { graph } = mapCanonicalToImportGraph(model);
    const validated = validateAndRepair(graph);
    expect(validated.findings).toHaveLength(0);
    expect(validated.graph).toEqual(graph);
  });
});
