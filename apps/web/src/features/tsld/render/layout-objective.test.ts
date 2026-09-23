import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  compareObjectives,
  countCrossings,
  evaluateLayout,
  type LayoutObjective,
  type LayoutScene,
} from './layout-objective';
import type { RenderActivity, RenderEdge } from './render-model';

/**
 * **The layout objective's terms, one at a time** (NetPoint-layout M4-T2).
 *
 * FC-N0 (`scripts/measure-netpoint-agreement.mjs`) holds the whole vector to the harness on real
 * plans. These cases pin each term on a plan small enough to read, so a failure names the term.
 */
function task(id: string, lane: number, start: string, finish: string): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex: lane,
    label: id,
    earlyStart: start,
    earlyFinish: finish,
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
    isDriving: true,
  };
}

function scene(activities: RenderActivity[], edges: RenderEdge[] = []): LayoutScene {
  return { activities, edges, dataDate: '2026-01-01' };
}

const BASE: LayoutObjective = {
  overlaps: 0,
  occluded: 0,
  crossings: 0,
  contacts: 0,
  sameRow: 0,
  travel: 0,
  rows: 0,
};

describe('evaluateLayout', () => {
  it('counts a same-row drawn overlap once per pair', () => {
    const o = evaluateLayout(
      scene([task('A', 0, '2026-01-05', '2026-01-10'), task('B', 0, '2026-01-08', '2026-01-12')]),
    );
    expect(o.overlaps).toBe(1);
    expect(o.rows).toBe(1);
  });

  it('counts an UNLINKED end-to-end pair as a contact, and a linked one as not', () => {
    const a = task('A', 0, '2026-01-05', '2026-01-09');
    const b = task('B', 0, '2026-01-10', '2026-01-14');
    expect(evaluateLayout(scene([a, b])).contacts).toBe(1);
    expect(evaluateLayout(scene([a, b], [link('A', 'B')])).contacts).toBe(0);
  });

  it('does not count bars with room between them as a contact', () => {
    const o = evaluateLayout(
      scene([task('A', 0, '2026-01-05', '2026-01-06'), task('B', 0, '2026-01-20', '2026-01-24')]),
    );
    expect(o.contacts).toBe(0);
  });

  it('scores chains, travel and rows over the links', () => {
    const o = evaluateLayout(
      scene(
        [
          task('A', 0, '2026-01-05', '2026-01-09'),
          task('B', 0, '2026-01-12', '2026-01-16'),
          task('C', 3, '2026-01-19', '2026-01-23'),
        ],
        [link('A', 'B'), link('B', 'C')],
      ),
    );
    expect(o.sameRow).toBe(1);
    expect(o.travel).toBe(3);
    expect(o.rows).toBe(4);
  });

  it('is deterministic: the same scene scores the same, whatever the input order', () => {
    const acts = [
      task('A', 0, '2026-01-05', '2026-01-09'),
      task('B', 2, '2026-01-12', '2026-01-16'),
      task('C', 1, '2026-01-06', '2026-01-20'),
    ];
    const edges = [link('A', 'B'), link('C', 'B')];
    const forward = evaluateLayout(scene(acts, edges));
    const reversed = evaluateLayout(scene([...acts].reverse(), [...edges].reverse()));
    expect(reversed).toEqual(forward);
  });
});

describe('countCrossings', () => {
  it('counts a plus sign once, and a touch at an end not at all', () => {
    const h = [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ];
    expect(
      countCrossings([
        h,
        [
          { x: 5, y: 0 },
          { x: 5, y: 10 },
        ],
      ]),
    ).toBe(1);
    expect(
      countCrossings([
        h,
        [
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      ]),
    ).toBe(0);
  });

  it('never counts a line crossing itself', () => {
    const self = [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(countCrossings([self])).toBe(0);
  });
});

describe('compareObjectives', () => {
  it('ranks in the product owner’s order, with contacts directly below crossings', () => {
    const better = (over: Partial<LayoutObjective>, worse: Partial<LayoutObjective>): void => {
      expect(compareObjectives({ ...BASE, ...over }, { ...BASE, ...worse })).toBeLessThan(0);
    };
    better({ overlaps: 0, occluded: 9 }, { overlaps: 1 });
    better({ occluded: 0, crossings: 99 }, { occluded: 1 });
    better({ crossings: 0, contacts: 9 }, { crossings: 1 });
    better({ contacts: 0, sameRow: 0 }, { contacts: 1, sameRow: 9 });
    // More chains is better; it outranks travel.
    better({ sameRow: 2, travel: 99 }, { sameRow: 1 });
    better({ travel: 0, rows: 99 }, { travel: 1 });
    better({ rows: 1 }, { rows: 2 });
    expect(compareObjectives(BASE, { ...BASE })).toBe(0);
  });
});

describe('the objective is pure', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'layout-objective.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('reads no clock and no randomness, so a result cannot depend on the machine', () => {
    expect(src).not.toMatch(/performance\.now|Date\.now|new Date\(|Math\.random/);
  });

  it('does not import the CPM engine', () => {
    expect(src).not.toMatch(/from\s+['"][^'"]*(engine|schedule)[^'"]*['"]/);
  });
});
