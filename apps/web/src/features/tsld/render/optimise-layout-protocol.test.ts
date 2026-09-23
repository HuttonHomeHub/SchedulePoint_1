import { describe, expect, it } from 'vitest';

import { optimiseLayout } from './optimise-layout';
import {
  handleOptimiseRequest,
  PROGRESS_EVERY,
  workingDayPredicate,
  workingDaySpanOf,
  type OptimiseMessage,
} from './optimise-layout-protocol';
import type { RenderActivity, RenderEdge } from './render-model';

/**
 * **The worker boundary** (NetPoint-layout M4-T3). jsdom has no worker, so the handler the worker
 * binds to is tested directly; what reaches a real browser is the journey's half (M5).
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

const ACTIVITIES = [
  task('A', 0, '2026-01-05', '2026-01-09'),
  task('B', 2, '2026-01-12', '2026-01-16'),
  task('C', 1, '2026-01-05', '2026-01-30'),
  task('D', 0, '2026-01-20', '2026-01-24'),
];
const EDGES: RenderEdge[] = [
  { id: 'AB', predecessorId: 'A', successorId: 'B', type: 'FS', isDriving: true },
  { id: 'BD', predecessorId: 'B', successorId: 'D', type: 'FS', isDriving: true },
];

describe('handleOptimiseRequest', () => {
  it('posts the same result a direct call returns, and a result a structured clone keeps', () => {
    const messages: OptimiseMessage[] = [];
    handleOptimiseRequest(
      {
        activities: ACTIVITIES,
        edges: EDGES,
        dataDate: '2026-01-01',
        workingDays: null,
        options: {},
      },
      (m) => messages.push(structuredClone(m)),
    );
    const done = messages.at(-1);
    expect(done?.type).toBe('done');
    const direct = optimiseLayout({ activities: ACTIVITIES, edges: EDGES, dataDate: '2026-01-01' });
    if (done?.type !== 'done') throw new Error('no result');
    expect([...done.result.lanes]).toEqual([...direct.lanes]);
    expect(done.result.final).toEqual(direct.final);
  });

  it('posts progress every PROGRESS_EVERY evaluations', () => {
    const messages: OptimiseMessage[] = [];
    handleOptimiseRequest(
      {
        activities: ACTIVITIES,
        edges: EDGES,
        dataDate: '2026-01-01',
        workingDays: null,
        options: {},
      },
      (m) => messages.push(m),
    );
    const done = messages.at(-1);
    if (done?.type !== 'done') throw new Error('no result');
    const progress = messages.filter((m) => m.type === 'progress');
    expect(progress).toHaveLength(Math.floor(done.result.evaluations / PROGRESS_EVERY));
  });

  it('reports a failure as a message rather than throwing inside the worker', () => {
    const messages: OptimiseMessage[] = [];
    expect(() => handleOptimiseRequest(null as never, (m) => messages.push(m))).not.toThrow();
    expect(messages.at(-1)?.type).toBe('failed');
  });
});

describe('the working-day span', () => {
  it('round-trips a predicate over its span, and treats a day outside it as worked', () => {
    const weekend = (d: number): boolean => d % 7 !== 5 && d % 7 !== 6;
    const span = workingDaySpanOf(weekend, 0, 30);
    const rebuilt = workingDayPredicate(span);
    for (let d = 0; d <= 30; d += 1) expect(rebuilt(d), `day ${String(d)}`).toBe(weekend(d));
    expect(rebuilt(40)).toBe(true);
    expect(rebuilt(-3)).toBe(true);
  });
});
