import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compareObjectives } from '../render/layout-objective';
import type { LayoutPartition } from '../render/layout-partition';
import type { OptimiseRequest } from '../render/optimise-layout-protocol';
import { pickBestStart } from '../render/relayout-starts';
import type { RenderActivity, RenderEdge } from '../render/render-model';
import { runOptimiseLayout as searchInProcess } from '../render/test-support/in-process-optimise';
import { DEFAULT_VIEW_TOGGLES } from '../render/view-toggles';

import {
  relayoutBudget,
  useArrangeSearch,
  type ArrangeSearchInput,
  type ArrangeSearchState,
} from './use-arrange-search';

/**
 * **What each Arrange option is asked to search with** (`docs/specs/relayout-quality`, M1).
 *
 * The search itself is `optimise-layout.test.ts`'s. This file pins the one decision the hook makes
 * about it: Re-layout may use as many rows as the diagram has now (CQ-1, answered 2026-10-17) and
 * Tidy keeps the budget it has always had, so a request is read for what it carries.
 */
const requests = vi.hoisted(() => [] as OptimiseRequest[]);

vi.mock('../render/run-optimise-layout', async () => {
  const inProcess = await import('../render/test-support/in-process-optimise');
  return {
    runOptimiseLayout: (request: OptimiseRequest) => {
      requests.push(request);
      return inProcess.runOptimiseLayout(request);
    },
    runOptimiseLayoutPool: (
      batch: readonly OptimiseRequest[],
      handlers: { signal?: AbortSignal; onProgress?: (n: number) => void },
    ) => {
      requests.push(...batch);
      return inProcess.runOptimiseLayoutPool(batch, handlers);
    },
  };
});

function day(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

function bar(id: string, laneIndex: number, start: number, length: number): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex,
    label: id,
    drawnStart: day(start),
    drawnFinish: day(start + length - 1),
    isCritical: false,
    isNearCritical: false,
  };
}

function inputOf(
  activities: RenderActivity[],
  packChanges: { id: string; laneIndex: number }[],
): ArrangeSearchInput {
  return {
    activities,
    edges: [],
    dataDate: '2026-01-01',
    isWorkingDay: null,
    packChanges,
    textToggles: DEFAULT_VIEW_TOGGLES,
  };
}

async function ready(input: ArrangeSearchInput): Promise<ArrangeSearchState> {
  const { result } = renderHook(() => useArrangeSearch(true, input));
  await waitFor(() => expect(result.current.kind).toBe('ready'), { timeout: 15_000 });
  return result.current;
}

describe('relayoutBudget', () => {
  it('is the taller of the rows the diagram has and the rows the pack needs', () => {
    expect(
      relayoutBudget(
        new Map([
          ['a', 0],
          ['b', 3],
        ]),
        new Map([
          ['a', 0],
          ['b', 1],
        ]),
      ),
    ).toBe(4);
    expect(
      relayoutBudget(
        new Map([
          ['a', 0],
          ['b', 0],
        ]),
        new Map([
          ['a', 0],
          ['b', 1],
        ]),
      ),
    ).toBe(2);
  });

  it('counts the rows by the height it is given, which is how swimlanes are budgeted', () => {
    const lanes = new Map([['a', 0]]);
    expect(relayoutBudget(lanes, lanes, () => 7)).toBe(7);
  });
});

describe('useArrangeSearch row budget', () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it('lets Re-layout use the rows the diagram has now, and Tidy keep the seed budget', async () => {
    // Four sequential bars drawn in four rows: the pack needs one.
    const activities = [
      bar('a', 0, 0, 5),
      bar('b', 1, 10, 5),
      bar('c', 2, 20, 5),
      bar('d', 3, 30, 5),
    ];
    const packChanges = activities.map((a) => ({ id: a.id, laneIndex: 0 }));
    await ready(inputOf(activities, packChanges));

    const [tidy, relayout] = requests;
    expect(requests).toHaveLength(2);
    expect(tidy?.options).toEqual({});
    expect(relayout?.options).toEqual({ budget: 4 });
  });

  it('budgets a pack taller than the diagram at the pack, which is what it was', async () => {
    // Two bars drawn on top of each other in one row: the pack needs two.
    const activities = [bar('a', 0, 0, 10), bar('b', 0, 5, 10)];
    await ready(
      inputOf(activities, [
        { id: 'a', laneIndex: 0 },
        { id: 'b', laneIndex: 1 },
      ]),
    );

    expect(requests[1]?.options).toEqual({ budget: 2 });
  });

  it('adds no budget to a plan over the search limit, where Re-layout is only scored', async () => {
    const activities = Array.from({ length: 301 }, (_, i) =>
      bar(`a${String(i).padStart(3, '0')}`, i, i * 6, 3),
    );
    const state = await ready(
      inputOf(
        activities,
        activities.map((a) => ({ id: a.id, laneIndex: 0 })),
      ),
    );

    expect(state.kind === 'ready' && state.bounded).toEqual({ drawn: 301, limit: 300 });
    expect(requests.map((r) => r.options)).toEqual([{ passes: 0 }, { passes: 0 }]);
  });
});

describe('useArrangeSearch multi-start', () => {
  beforeEach(() => {
    requests.length = 0;
  });

  const link = (predecessorId: string, successorId: string): RenderEdge => ({
    predecessorId,
    successorId,
    type: 'FS',
    isDriving: true,
  });

  /** Two interleaved chains scattered over rows, with one SS-like link the date order mispacks. */
  function linkedPlan(): ArrangeSearchInput {
    const activities = [
      bar('a1', 0, 0, 4),
      bar('a2', 3, 5, 4),
      bar('a3', 1, 10, 4),
      bar('b1', 2, 1, 6),
      bar('b2', 5, 8, 3),
      bar('b3', 4, 12, 4),
      bar('c1', 0, 3, 5),
      bar('x1', 4, 12, 2),
      bar('x2', 5, 2, 2),
    ];
    const packChanges = [
      { id: 'a1', laneIndex: 0 },
      { id: 'b1', laneIndex: 1 },
      { id: 'c1', laneIndex: 2 },
      { id: 'x2', laneIndex: 0 },
    ];
    return {
      ...inputOf(activities, packChanges),
      edges: [
        link('a1', 'a2'),
        link('a2', 'a3'),
        link('b1', 'b2'),
        link('b2', 'b3'),
        link('x1', 'x2'),
      ],
    };
  }

  it('searches from more than the pack when the starts differ, each with its own budget', async () => {
    await ready(linkedPlan());

    const [tidy, ...relayout] = requests;
    expect(tidy?.options).toEqual({});
    expect(relayout.length).toBeGreaterThan(1);
    for (const r of relayout) expect(r.options?.budget).toBeGreaterThanOrEqual(6);
  });

  it('keeps the best start by the product order, and is never worse than the pack start', async () => {
    const state = await ready(linkedPlan());
    const relayout = requests.slice(1);
    const results = relayout.map((r) => searchInProcess(r));
    const finals = await Promise.all(results);
    const best = finals[pickBestStart(finals)]!;

    expect(state.kind === 'ready' && state.relayout.after).toEqual(best.final);
    expect(compareObjectives(best.final, finals[0]!.final)).toBeLessThanOrEqual(0);
  });

  it('gives the same answer every time it is asked', async () => {
    const first = await ready(linkedPlan());
    requests.length = 0;
    const second = await ready(linkedPlan());

    expect(second.kind === 'ready' && second.relayout.changes).toEqual(
      first.kind === 'ready' ? first.relayout.changes : null,
    );
  });
});

describe('useArrangeSearch inside swimlanes (swimlanes M2-T6)', () => {
  beforeEach(() => {
    requests.length = 0;
  });

  const link = (predecessorId: string, successorId: string): RenderEdge => ({
    predecessorId,
    successorId,
    type: 'FS',
    isDriving: true,
  });

  const partition: LayoutPartition = {
    swimlaneOf: new Map([
      ['n1', 'north'],
      ['n2', 'north'],
      ['n3', 'north'],
      ['s1', 'south'],
      ['s2', 'south'],
    ]),
    order: ['north', 'empty', 'south'],
  };

  /** Lanes are lanes INSIDE each swimlane here: north is drawn in two rows, south in one. */
  function swimlanePlan(): ArrangeSearchInput {
    return {
      ...inputOf(
        [
          bar('n1', 0, 0, 6),
          bar('n2', 1, 2, 6),
          bar('n3', 0, 12, 4),
          bar('s1', 0, 1, 5),
          bar('s2', 0, 14, 3),
        ],
        // Ignored while swimlanes are shown: a stored-lane pack means nothing in these lanes.
        [{ id: 'n1', laneIndex: 9 }],
      ),
      edges: [link('n1', 'n3'), link('n2', 's2'), link('s1', 's2')],
      swimlanes: partition,
    };
  }

  it('hands the partition to every search, and to nothing when swimlanes are not shown', async () => {
    await ready(swimlanePlan());
    expect(requests.length).toBeGreaterThanOrEqual(2);
    for (const r of requests) expect(r.options.partition).toEqual(partition);

    requests.length = 0;
    const { swimlanes: _shown, ...plain } = swimlanePlan();
    await ready(plain);
    for (const r of requests) expect(r.options).not.toHaveProperty('partition');
  });

  it("budgets Re-layout in the diagram's height: the swimlanes' rows added, an empty one counted", async () => {
    await ready(swimlanePlan());
    // north 2 + empty 1 + south 1 = 4 rows drawn now; the partitioned pack needs no more, so 4.
    const relayout = requests.slice(1);
    for (const r of relayout) expect(r.options.budget).toBeGreaterThanOrEqual(4);
    expect(relayout[0]?.options.budget).toBe(4);
  });

  it('seeds start 0 from the partitioned pack, not from the stored-lane changes it was handed', async () => {
    await ready(swimlanePlan());
    const start0 = requests[1]!;
    // Lanes inside a swimlane: n1 and n3 do not overlap, n2 overlaps n1; s1 and s2 share lane 0.
    const lane = new Map(start0.activities.map((a) => [a.id, a.laneIndex]));
    expect(lane.get('n1')).toBe(0);
    expect(lane.get('n2')).toBe(1);
    expect(lane.get('s1')).toBe(0);
    expect(lane.get('s2')).toBe(0);
  });

  it('answers in lanes inside each swimlane and never moves a bar out of its own', async () => {
    const state = await ready(swimlanePlan());
    if (state.kind !== 'ready') throw new Error('not ready');
    for (const outcome of [state.tidy, state.relayout]) {
      for (const change of outcome?.changes ?? []) {
        // A lane inside a swimlane is small: it can never be a stacked display lane past the diagram.
        expect(change.laneIndex).toBeGreaterThanOrEqual(0);
        expect(change.laneIndex).toBeLessThan(4);
      }
    }
  });

  it('gives the same answer every time it is asked', async () => {
    const first = await ready(swimlanePlan());
    requests.length = 0;
    const second = await ready(swimlanePlan());
    expect(second.kind === 'ready' && second.relayout.changes).toEqual(
      first.kind === 'ready' ? first.relayout.changes : null,
    );
    expect(second.kind === 'ready' && second.tidy?.changes).toEqual(
      first.kind === 'ready' ? first.tidy?.changes : null,
    );
  });
});
