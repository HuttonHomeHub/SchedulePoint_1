import { describe, expect, it } from 'vitest';

import type { CanonicalModel } from './canonical.js';
import {
  importGraphSchema,
  type ImportActivity,
  type ImportAssignment,
  type ImportDependency,
  type ImportGraph,
  type ImportProgress,
  type ImportResource,
  type ImportResourceKind,
} from './import-graph.js';
import { mapCanonicalToImportGraph } from './mapper.js';
import type { ReportFinding } from './report.js';
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
    parentKey: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    scheduleAsLateAsPossible: false,
    progress: null,
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
    resources: [],
    assignments: [],
  };
}

/** A WBS-summary activity (0 duration, optional parent). */
function summary(key: string, parentKey: string | null = null, code = key): ImportActivity {
  return { ...activity(key, code), type: 'WBS_SUMMARY', durationMinutes: 0, parentKey };
}

/** A minimal resource. */
function resource(
  key: string,
  kind: ImportResourceKind = 'LABOUR',
  calendarKey: string | null = null,
): ImportResource {
  return {
    key,
    name: `Resource ${key}`,
    code: null,
    kind,
    calendarKey,
    costPerUnit: null,
    maxUnitsPerHour: null,
  };
}

/** A minimal assignment. */
function assign(
  key: string,
  activityKey: string,
  resourceKey: string,
  isDriving = false,
): ImportAssignment {
  return {
    key,
    activityKey,
    resourceKey,
    budgetedUnits: 0,
    unitsPerHour: null,
    isDriving,
    actualUnits: 0,
  };
}

/** Wrap an arbitrary set of graph parts (calendars/resources/assignments default empty). */
function fullGraph(parts: Partial<ImportGraph>): ImportGraph {
  return {
    plan: { name: 'Plan', dataDate: '2026-01-05', defaultCalendarKey: null },
    calendars: [],
    activities: [],
    dependencies: [],
    resources: [],
    assignments: [],
    ...parts,
  };
}

/** A default-progress block, overridable per-field. */
function progress(overrides: Partial<ImportProgress> = {}): ImportProgress {
  return {
    status: 'NOT_STARTED',
    percentComplete: 0,
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    actualStart: null,
    actualFinish: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
    ...overrides,
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
        parentId: null,
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
      {
        id: 'B',
        code: 'A1010',
        name: 'Finish',
        type: 'FINISH_MILESTONE',
        durationMinutes: 0,
        calendarId: null,
        parentId: null,
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
    ],
    relationships: [{ id: 'R', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 480 }],
    resources: [],
    assignments: [],
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

const repaired = (findings: ReportFinding[], entity: string, substr: string): boolean =>
  findings.some((f) => f.kind === 'repair' && f.entity === entity && f.detail.includes(substr));

describe('validateAndRepair — WBS parentage (ADR-0038)', () => {
  it('nulls a parent that does not resolve to an activity', () => {
    const a = { ...activity('A'), parentKey: 'GHOST' };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.parentKey).toBeNull();
    expect(repaired(findings, 'wbs', 'not found')).toBe(true);
  });

  it('nulls a parent that is not a WBS summary', () => {
    const child = { ...activity('A'), parentKey: 'B' };
    const { graph, findings } = validateAndRepair(graphOf([child, activity('B')], []));
    expect(graph.activities[0]?.parentKey).toBeNull();
    expect(repaired(findings, 'wbs', 'not a WBS summary')).toBe(true);
  });

  it('keeps a valid parent pointing at a WBS summary', () => {
    const child = { ...activity('A'), parentKey: 'S1' };
    const { graph, findings } = validateAndRepair(graphOf([summary('S1'), child], []));
    expect(graph.activities.find((x) => x.key === 'A')?.parentKey).toBe('S1');
    expect(findings.filter((f) => f.entity === 'wbs')).toHaveLength(0);
  });

  it('breaks a WBS parent cycle deterministically', () => {
    const s1 = summary('S1', 'S2');
    const s2 = summary('S2', 'S1');
    const { graph, findings } = validateAndRepair(graphOf([s1, s2], []));
    // Largest key (S2) has its parent cleared; S1 keeps S2 → acyclic.
    expect(graph.activities.find((x) => x.key === 'S2')?.parentKey).toBeNull();
    expect(graph.activities.find((x) => x.key === 'S1')?.parentKey).toBe('S2');
    expect(repaired(findings, 'wbs', 'cycle')).toBe(true);
  });

  it('drops a dependency touching a WBS summary', () => {
    const { graph, findings } = validateAndRepair(
      graphOf([summary('S1'), activity('A')], [edge('A', 'S1'), edge('S1', 'A')]),
    );
    expect(graph.dependencies).toHaveLength(0);
    expect(repaired(findings, 'relationship', 'WBS summary')).toBe(true);
  });
});

describe('validateAndRepair — constraint pairing (ADR-0035 §7)', () => {
  it('drops a primary constraint type with no date', () => {
    const a = { ...activity('A'), constraintType: 'MSO' as const, constraintDate: null };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.constraintType).toBeNull();
    expect(repaired(findings, 'constraint', 'primary')).toBe(true);
  });

  it('drops a primary constraint date with no type', () => {
    const a = { ...activity('A'), constraintType: null, constraintDate: '2026-01-06' };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.constraintDate).toBeNull();
    expect(repaired(findings, 'constraint', 'primary')).toBe(true);
  });

  it('drops an orphaned secondary constraint but keeps a valid primary', () => {
    const a = {
      ...activity('A'),
      constraintType: 'SNET' as const,
      constraintDate: '2026-01-06',
      secondaryConstraintType: 'FNLT' as const,
      secondaryConstraintDate: null,
    };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.constraintType).toBe('SNET');
    expect(graph.activities[0]?.secondaryConstraintType).toBeNull();
    expect(repaired(findings, 'constraint', 'secondary')).toBe(true);
  });
});

describe('validateAndRepair — progress (ADR-0035 §6)', () => {
  it('clamps out-of-range percents', () => {
    const a = {
      ...activity('A'),
      progress: progress({ percentComplete: 150, physicalPercentComplete: -5 }),
    };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.progress?.percentComplete).toBe(100);
    expect(graph.activities[0]?.progress?.physicalPercentComplete).toBe(0);
    expect(repaired(findings, 'progress', 'clamped')).toBe(true);
  });

  it('N08 — completes without an actual finish → sets the finish to the data date', () => {
    const a = {
      ...activity('A'),
      progress: progress({ status: 'COMPLETE', actualStart: '2026-01-02', actualFinish: null }),
    };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.progress?.actualFinish).toBe('2026-01-05'); // the data date
    expect(graph.activities[0]?.progress?.status).toBe('COMPLETE');
    expect(repaired(findings, 'progress', 'data date')).toBe(true);
  });

  it('N18 — remaining > 0 on a complete activity → zeroed', () => {
    const a = {
      ...activity('A'),
      progress: progress({
        status: 'COMPLETE',
        actualFinish: '2026-01-04',
        remainingDurationMinutes: 480,
      }),
    };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.progress?.remainingDurationMinutes).toBe(0);
    expect(repaired(findings, 'progress', 'remaining')).toBe(true);
  });

  it('drops a resume date that precedes its suspend date', () => {
    const a = {
      ...activity('A'),
      progress: progress({
        status: 'IN_PROGRESS',
        actualStart: '2026-01-02',
        suspendDate: '2026-01-10',
        resumeDate: '2026-01-08',
      }),
    };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.progress?.resumeDate).toBeNull();
    expect(repaired(findings, 'progress', 'resume')).toBe(true);
  });

  it('derives status from actuals (no finding for a pure derivation)', () => {
    const a = {
      ...activity('A'),
      progress: progress({ status: 'NOT_STARTED', percentComplete: 50 }),
    };
    const { graph, findings } = validateAndRepair(graphOf([a], []));
    expect(graph.activities[0]?.progress?.status).toBe('IN_PROGRESS');
    expect(findings.filter((f) => f.entity === 'progress')).toHaveLength(0);
  });
});

describe('validateAndRepair — resources + assignments (ADR-0039/0040)', () => {
  it('nulls an unresolved resource calendar reference', () => {
    const { graph, findings } = validateAndRepair(
      fullGraph({
        calendars: [{ key: 'CAL', name: 'Std', shifts: [], exceptions: [] }],
        resources: [resource('R1', 'LABOUR', 'GHOST')],
      }),
    );
    expect(graph.resources[0]?.calendarKey).toBeNull();
    expect(repaired(findings, 'resource', 'calendar')).toBe(true);
  });

  it('keeps a resolvable resource calendar', () => {
    const { graph, findings } = validateAndRepair(
      fullGraph({
        calendars: [{ key: 'CAL', name: 'Std', shifts: [], exceptions: [] }],
        resources: [resource('R1', 'LABOUR', 'CAL')],
      }),
    );
    expect(graph.resources[0]?.calendarKey).toBe('CAL');
    expect(findings.filter((f) => f.entity === 'resource')).toHaveLength(0);
  });

  it('drops an assignment whose activity or resource does not resolve', () => {
    const { graph, findings } = validateAndRepair(
      fullGraph({
        activities: [activity('A')],
        resources: [resource('R1')],
        assignments: [
          assign('X1', 'A', 'R1'),
          assign('X2', 'GHOST', 'R1'),
          assign('X3', 'A', 'NOPE'),
        ],
      }),
    );
    expect(graph.assignments.map((x) => x.key)).toEqual(['X1']);
    expect(
      findings.filter((f) => f.entity === 'assignment' && f.detail.includes('not found')),
    ).toHaveLength(2);
  });

  it('de-duplicates a repeated (activity, resource) pair, keeping the first', () => {
    const { graph, findings } = validateAndRepair(
      fullGraph({
        activities: [activity('A')],
        resources: [resource('R1')],
        assignments: [assign('X1', 'A', 'R1'), assign('X2', 'A', 'R1')],
      }),
    );
    expect(graph.assignments.map((x) => x.key)).toEqual(['X1']);
    expect(repaired(findings, 'assignment', 'duplicate')).toBe(true);
  });

  it('demotes a MATERIAL resource that is marked driving', () => {
    const { graph, findings } = validateAndRepair(
      fullGraph({
        activities: [activity('A')],
        resources: [resource('R1', 'MATERIAL')],
        assignments: [assign('X1', 'A', 'R1', true)],
      }),
    );
    expect(graph.assignments[0]?.isDriving).toBe(false);
    expect(repaired(findings, 'assignment', 'MATERIAL')).toBe(true);
  });

  it('keeps at most one driver per activity (first wins)', () => {
    const { graph, findings } = validateAndRepair(
      fullGraph({
        activities: [activity('A')],
        resources: [resource('R1'), resource('R2')],
        assignments: [assign('X1', 'A', 'R1', true), assign('X2', 'A', 'R2', true)],
      }),
    );
    expect(graph.assignments.map((x) => x.isDriving)).toEqual([true, false]);
    expect(repaired(findings, 'assignment', 'already has a driver')).toBe(true);
  });
});
