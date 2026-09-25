import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compareObjectives, evaluateLayout } from './layout-objective';
import { optimiseLayout } from './optimise-layout';
import type { RenderActivity, RenderEdge } from './render-model';
import { FIXED_WIDTH_TEXT } from './test-support/fixed-width-text';

/**
 * **Tidy and Re-layout's guarantees** (NetPoint-layout M4-T3, FC-N3).
 *
 * The search accepts a move only on a strict improvement, so its result can never be worse than the
 * repaired seed. That is a claim about every input, so it is checked on a sweep of generated plans,
 * not on one picked example. The generator is a fixed-seed PRNG, so a failure reproduces.
 */
const DATA_DATE = '2026-01-01';

function day(offset: number): string {
  const d = new Date(Date.UTC(2026, 0, 1 + offset));
  return d.toISOString().slice(0, 10);
}

function task(id: string, lane: number, start: number, length: number): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex: lane,
    label: id,
    earlyStart: day(start),
    earlyFinish: day(start + length - 1),
    isCritical: false,
    isNearCritical: false,
  };
}

function link(pred: string, succ: string): RenderEdge {
  return {
    id: `${pred}-${succ}`,
    predecessorId: pred,
    successorId: succ,
    type: 'FS',
    isDriving: false,
  };
}

/** mulberry32 — a fixed-seed PRNG, so every generated plan reproduces. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small plan with forward links and a seed that may overlap. */
function generated(seed: number): { activities: RenderActivity[]; edges: RenderEdge[] } {
  const rand = prng(seed);
  const n = 6 + Math.floor(rand() * 7);
  const activities = Array.from({ length: n }, (_, i) =>
    task(
      `a${String(i).padStart(2, '0')}`,
      Math.floor(rand() * 4),
      Math.floor(rand() * 40),
      2 + Math.floor(rand() * 8),
    ),
  );
  const edges: RenderEdge[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (rand() < 0.2) edges.push(link(activities[i]!.id, activities[j]!.id));
    }
  }
  return { activities, edges };
}

describe('optimiseLayout', () => {
  // Two hundred searches, each routing the whole plan: a count cap, not a time budget (FC-N3), so
  // the test's own clock gets room it does not need on a quiet runner (links-and-labels M4 review).
  it('is never worse than its repaired seed, on 200 generated plans (FC-N3)', () => {
    let improved = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const { activities, edges } = generated(seed);
      const r = optimiseLayout(
        { activities, edges, dataDate: DATA_DATE, text: FIXED_WIDTH_TEXT },
        { passes: 3 },
      );
      expect(compareObjectives(r.final, r.repaired), `seed ${String(seed)}`).toBeLessThanOrEqual(0);
      expect(r.final.overlaps, `seed ${String(seed)}`).toBe(0);
      // The reported objective is the objective of the reported lanes, not a stale copy.
      const rescored = evaluateLayout({
        activities: activities.map((a) => ({ ...a, laneIndex: r.lanes.get(a.id)! })),
        edges,
        dataDate: DATA_DATE,
        text: FIXED_WIDTH_TEXT,
      });
      expect(rescored, `seed ${String(seed)}`).toEqual(r.final);
      if (compareObjectives(r.final, r.repaired) < 0) improved += 1;
    }
    // A sweep in which nothing ever improves would pass the inequality above vacuously.
    expect(improved).toBeGreaterThan(20);
  }, 20_000);

  it('never uses more rows than the seed when the seed has no overlap (CQ-1: no extra rows)', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { activities, edges } = generated(seed);
      const packed = optimiseLayout(
        { activities, edges, dataDate: DATA_DATE, text: FIXED_WIDTH_TEXT },
        { passes: 1 },
      );
      // Re-run from the repaired, overlap-free layout: now the budget binds.
      const seedLanes = activities.map((a) => ({ ...a, laneIndex: packed.lanes.get(a.id)! }));
      const rows = Math.max(...seedLanes.map((a) => a.laneIndex)) + 1;
      const r = optimiseLayout({
        activities: seedLanes,
        edges,
        dataDate: DATA_DATE,
        text: FIXED_WIDTH_TEXT,
      });
      expect(r.final.rows, `seed ${String(seed)}`).toBeLessThanOrEqual(rows);
      expect(r.overBudget).toBe(false);
    }
  });

  it('repairs an overlap even when that needs a row, and says so', () => {
    const r = optimiseLayout({
      activities: [task('A', 0, 0, 10), task('B', 0, 5, 10)],
      edges: [],
      dataDate: DATA_DATE,
      text: FIXED_WIDTH_TEXT,
    });
    expect(r.seed.overlaps).toBe(1);
    expect(r.final.overlaps).toBe(0);
    expect(r.overBudget).toBe(true);
  });

  it('gives the same lanes whatever order activities and links arrive in', () => {
    const { activities, edges } = generated(7);
    const a = optimiseLayout({ activities, edges, dataDate: DATA_DATE, text: FIXED_WIDTH_TEXT });
    const b = optimiseLayout({
      activities: [...activities].reverse(),
      edges: [...edges].reverse(),
      dataDate: DATA_DATE,
      text: FIXED_WIDTH_TEXT,
    });
    expect([...b.lanes].sort()).toEqual([...a.lanes].sort());
  });

  it('moves nothing and reports nothing moved on a layout it cannot improve', () => {
    const r = optimiseLayout({
      activities: [task('A', 0, 0, 5), task('B', 0, 10, 5)],
      edges: [link('A', 'B')],
      dataDate: DATA_DATE,
      text: FIXED_WIDTH_TEXT,
    });
    expect(r.moved).toEqual([]);
    expect(r.final).toEqual(r.seed);
  });

  it('stops at its evaluation cap and says so', () => {
    const { activities, edges } = generated(3);
    const r = optimiseLayout(
      { activities, edges, dataDate: DATA_DATE, text: FIXED_WIDTH_TEXT },
      { evaluationsPerPass: 2 },
    );
    expect(r.capped).toBe(true);
  });
});

describe('the search is a pure function of its input', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'optimise-layout.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('reads no clock and no randomness: its caps are counts', () => {
    expect(src).not.toMatch(/performance\.now|Date\.now|new Date\(|Math\.random|setTimeout/);
  });

  it('does not import the CPM engine', () => {
    expect(src).not.toMatch(/from\s+['"][^'"]*(engine|schedule)[^'"]*['"]/);
  });
});
