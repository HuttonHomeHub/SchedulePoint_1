import type { ConformanceFixture } from './schema.js';

/**
 * Structural validation of the conformance fixture — a TypeScript port of
 * `fixtures/tools/validate_fixture.py` (the canonical reference). This proves the fixture is
 * **well-formed**; it computes NO schedule dates (the engine, not this, is judged on dates).
 * Engine-free so it runs as a fast CI gate with no database or app dependency (ADR-0034).
 *
 * Checks: referential integrity, a single-cycle-free (DAG) main network, level-of-effort spans,
 * the intended open-end sets, and progress-field sanity. Feature coverage lives in `coverage.ts`.
 */
export interface StructuralResult {
  /** True when there are no errors (warnings are allowed). */
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Open-start activities we intend the fixture to have (everything else with no predecessor is a bug). */
const EXPECTED_OPEN_START = new Set([
  'A1000',
  'A2100',
  'A9500',
  'A2200',
  'A2210',
  'A2220',
  'A2230',
  'W4000',
  'W5000',
  'W7000',
]);

const EXPECTED_OPEN_FINISH = new Set(['A3900', 'A12700', 'A13000', 'W4000', 'W5000', 'W7000']);

function pushGroup<K>(map: Map<K, string[]>, key: K, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function validateStructure(fixture: ConformanceFixture): StructuralResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const activityIds = new Set(fixture.activities.map((a) => a.id));
  const calendarIds = new Set(fixture.calendars.map((c) => c.id));
  const wbsIds = new Set(fixture.wbs.map((w) => w.id));
  const resourceIds = new Set(fixture.resources.map((r) => r.id));
  const curveIds = new Set(fixture.resource_curves.map((c) => c.id));
  const roleIds = new Set(fixture.roles.map((r) => r.id));

  // 1. Referential integrity ------------------------------------------------
  for (const a of fixture.activities) {
    if (!calendarIds.has(a.calendar)) errors.push(`${a.id}: unknown calendar ${a.calendar}`);
    if (!wbsIds.has(a.wbs)) errors.push(`${a.id}: unknown WBS ${a.wbs}`);
  }
  for (const r of fixture.relationships) {
    if (!activityIds.has(r.predecessor)) {
      errors.push(`${r.id}: unknown predecessor ${r.predecessor}`);
    }
    if (!activityIds.has(r.successor)) errors.push(`${r.id}: unknown successor ${r.successor}`);
    if (r.predecessor === r.successor) errors.push(`${r.id}: self-loop`);
  }
  for (const s of fixture.assignments) {
    if (!activityIds.has(s.activity)) errors.push(`${s.id}: unknown activity ${s.activity}`);
    if (!resourceIds.has(s.resource)) errors.push(`${s.id}: unknown resource ${s.resource}`);
    if (!curveIds.has(s.curve)) errors.push(`${s.id}: unknown curve ${s.curve}`);
    if (s.role !== null && !roleIds.has(s.role)) errors.push(`${s.id}: unknown role ${s.role}`);
  }
  for (const s of fixture.steps) {
    if (!activityIds.has(s.activity)) errors.push(`step: unknown activity ${s.activity}`);
  }
  for (const e of fixture.expenses) {
    if (!activityIds.has(e.activity)) errors.push(`${e.id}: unknown activity ${e.activity}`);
  }
  for (const r of fixture.resources) {
    if (!calendarIds.has(r.calendar)) errors.push(`resource ${r.id}: unknown calendar`);
  }

  // Duplicate relationship pairs (P6 permits only one per ordered pair).
  const pairs = new Map<string, string[]>();
  for (const r of fixture.relationships) pushGroup(pairs, `${r.predecessor}->${r.successor}`, r.id);
  for (const [pair, ids] of pairs) {
    if (ids.length > 1) errors.push(`duplicate relationship pair ${pair}: ${ids.join(', ')}`);
  }

  // 2. DAG check (Kahn's topological sort over the main network) -------------
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const a of fixture.activities) indeg.set(a.id, 0);
  for (const r of fixture.relationships) {
    pushGroup(adj, r.predecessor, r.successor);
    indeg.set(r.successor, (indeg.get(r.successor) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const ordered = new Set<string>();
  while (queue.length > 0) {
    const n = queue.pop() as string;
    ordered.add(n);
    for (const m of adj.get(n) ?? []) {
      const d = (indeg.get(m) ?? 0) - 1;
      indeg.set(m, d);
      if (d === 0) queue.push(m);
    }
  }
  if (ordered.size !== activityIds.size) {
    const stuck = [...activityIds].filter((id) => !ordered.has(id)).sort();
    errors.push(
      `CYCLE DETECTED in main network. Activities not topologically ordered: ${stuck.join(', ')}`,
    );
  }

  // 3. Level-of-effort spans (need ≥1 predecessor and ≥1 successor) ----------
  const preds = new Map<string, number>();
  const succs = new Map<string, number>();
  for (const r of fixture.relationships) {
    preds.set(r.successor, (preds.get(r.successor) ?? 0) + 1);
    succs.set(r.predecessor, (succs.get(r.predecessor) ?? 0) + 1);
  }
  for (const a of fixture.activities) {
    if (a.activity_type === 'LEVEL_OF_EFFORT' && (!preds.get(a.id) || !succs.get(a.id))) {
      errors.push(`${a.id}: LOE without a full span`);
    }
  }

  // 4. Open ends (warn if they differ from the intended sets) ----------------
  const openStart = new Set(fixture.activities.map((a) => a.id).filter((id) => !preds.get(id)));
  const openFinish = new Set(fixture.activities.map((a) => a.id).filter((id) => !succs.get(id)));
  if (!setsEqual(openStart, EXPECTED_OPEN_START)) {
    warnings.push(
      `open starts differ. got=${sorted(openStart)} expected=${sorted(EXPECTED_OPEN_START)}`,
    );
  }
  if (!setsEqual(openFinish, EXPECTED_OPEN_FINISH)) {
    warnings.push(
      `open finishes differ. got=${sorted(openFinish)} expected=${sorted(EXPECTED_OPEN_FINISH)}`,
    );
  }

  // 5. Progress sanity ------------------------------------------------------
  const dd = fixture.project.data_date;
  for (const a of fixture.activities) {
    if (a.status === 'COMPLETED') {
      if (!a.actual_start || !a.actual_finish) {
        errors.push(`${a.id}: COMPLETED without both actual dates`);
      } else if (a.actual_finish > dd) {
        errors.push(`${a.id}: actual finish after data date`);
      }
      if (a.remaining_duration_h !== 0) errors.push(`${a.id}: COMPLETED with remaining duration`);
    }
    if (a.status === 'IN_PROGRESS') {
      if (!a.actual_start) errors.push(`${a.id}: IN_PROGRESS without actual start`);
      else if (a.actual_start > dd && a.activity_type !== 'LEVEL_OF_EFFORT') {
        errors.push(`${a.id}: actual start after data date`);
      }
    }
    if (a.status === 'NOT_STARTED' && (a.actual_start || a.actual_finish)) {
      errors.push(`${a.id}: NOT_STARTED with actual dates`);
    }
    if (
      (a.activity_type === 'START_MILESTONE' || a.activity_type === 'FINISH_MILESTONE') &&
      a.original_duration_h !== 0
    ) {
      errors.push(`${a.id}: milestone with non-zero duration`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function sorted(s: Set<string>): string {
  return `[${[...s].sort().join(', ')}]`;
}
