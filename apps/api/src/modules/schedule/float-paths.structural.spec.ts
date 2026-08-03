import { describe, expect, it } from 'vitest';

import { computeSchedule } from './engine/compute';
import { computeFloatPaths } from './engine/float-paths';
import { allMinutesWorkCalendar } from './engine/working-time-calendar';

/**
 * **Structural pin: the float-paths surface epic (F4) does not move the engine.**
 *
 * The epic's whole parity argument is that it changes a read-model and a client, never the CPM
 * engine — so the ADR-0034 recalc parity gate is untouched by construction rather than by assertion.
 * That claim is worth exactly as much as the thing enforcing it, so this enforces it.
 *
 * The specific temptation it guards is real and named in the plan: the service needs to know whether
 * more paths exist than it returned, and the obvious-looking move is to add a `hasMore` to
 * `computeFloatPaths`'s return type. That would change a pure engine module's contract — and its
 * goldens — for a presentation concern. The service asks for `maxPaths + 1` and slices instead.
 *
 * Deliberately asserts **arity and the named fields only**, not the full type text: a pin that fails
 * on an unrelated refactor gets deleted rather than fixed (the ADR-0053 M3 `EngineResource`
 * precedent).
 */
describe('F4 structural pin — the engine is not modified by the float-paths surface', () => {
  it('computeSchedule still takes exactly three parameters', () => {
    // (activities, edges, options). A fourth would mean the engine grew an input for this epic,
    // which is the thing the parity argument says did not happen.
    expect(computeSchedule.length).toBe(3);
  });

  it('computeFloatPaths still takes exactly five parameters', () => {
    // (activities, edges, options, targetId, maxPaths). The `+1` probe rides this signature
    // unchanged — if this arity moves, the probe was replaced by an engine-side flag.
    expect(computeFloatPaths.length).toBe(5);
  });

  it('a float path still carries exactly index / relativeFloat / activityIds', () => {
    // The engine's own return shape. `relativeFloatMinutes` and `hasMorePaths` are SERVICE-level
    // additions — if either appears here, the read-model leaked into the engine.
    const activities = [
      { id: 'A', durationMinutes: 1440, type: 'TASK' as const },
      { id: 'B', durationMinutes: 1440, type: 'TASK' as const },
    ];
    const edges = [
      { id: 'A-B', predecessorId: 'A', successorId: 'B', type: 'FS' as const, lagMinutes: 0 },
    ];
    const options = { dataDate: '2026-01-01', calendar: allMinutesWorkCalendar };
    const [path] = computeFloatPaths(activities, edges, options, 'B', 5);

    expect(path).toBeDefined();
    expect(Object.keys(path!).sort()).toEqual(['activityIds', 'index', 'relativeFloat']);
  });
});
