import { describe, expect, it } from 'vitest';

import type { OptimiseLayoutResult } from './optimise-layout';
import type { OptimiseRequest } from './optimise-layout-protocol';
import { runPool, type RunOne } from './optimise-pool';

/**
 * **The pool's contract** (`relayout-quality` D4): results come back in request order whatever order
 * the searches finish in, progress is summed, and one signal stops everything still running. The
 * searches are fakes the test finishes by hand, so a finishing order is chosen rather than hoped for.
 */
const request = (n: number): OptimiseRequest =>
  ({ dataDate: String(n) }) as unknown as OptimiseRequest;
const result = (n: number): OptimiseLayoutResult =>
  ({ evaluations: n * 10, lanes: new Map([['id', n]]) }) as unknown as OptimiseLayoutResult;

interface Pending {
  request: OptimiseRequest;
  signal: AbortSignal | undefined;
  progress: (n: number) => void;
  finish: (n: number) => void;
  fail: (error: Error) => void;
}

function fakeRunner(): { run: RunOne; started: Pending[] } {
  const started: Pending[] = [];
  const run: RunOne = (req, handlers) =>
    new Promise((resolve, reject) => {
      started.push({
        request: req,
        signal: handlers.signal,
        progress: (n) => handlers.onProgress?.(n),
        finish: (n) => resolve(result(n)),
        fail: reject,
      });
    });
  return { run, started };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('runPool', () => {
  it('returns results in request order however the searches finish', async () => {
    const { run, started } = fakeRunner();
    const done = runPool(run, [request(0), request(1), request(2)], { concurrency: 3 });
    started[2]!.finish(2);
    started[0]!.finish(0);
    started[1]!.finish(1);
    expect((await done).map((r) => r.lanes.get('id'))).toEqual([0, 1, 2]);
  });

  it('gives the same results at one worker as at many', async () => {
    const outcomes: number[][] = [];
    for (const concurrency of [1, 2, 4]) {
      const { run, started } = fakeRunner();
      const done = runPool(run, [request(0), request(1), request(2), request(3)], { concurrency });
      for (let finished = 0; finished < 4;) {
        await tick();
        const open = started.filter((s) => !('done' in s));
        const next = open[open.length - 1];
        if (!next) break;
        next.finish(Number(next.request.dataDate));
        Object.assign(next, { done: true });
        finished += 1;
      }
      outcomes.push((await done).map((r) => r.lanes.get('id')!));
    }
    expect(outcomes).toEqual([
      [0, 1, 2, 3],
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ]);
  });

  it('never has more searches running than the concurrency', async () => {
    const { run, started } = fakeRunner();
    const done = runPool(run, [request(0), request(1), request(2), request(3)], {
      concurrency: 2,
    });
    expect(started).toHaveLength(2);
    started[0]!.finish(0);
    await tick();
    expect(started).toHaveLength(3);
    started[1]!.finish(1);
    started[2]!.finish(2);
    await tick();
    started[3]!.finish(3);
    await done;
  });

  it('reports the evaluations of every search summed', async () => {
    const { run, started } = fakeRunner();
    const seen: number[] = [];
    const done = runPool(run, [request(0), request(1)], {
      concurrency: 2,
      onProgress: (n) => seen.push(n),
    });
    started[0]!.progress(100);
    started[1]!.progress(40);
    started[0]!.progress(150);
    started[0]!.finish(0);
    started[1]!.finish(1);
    await done;
    expect(seen).toEqual([100, 140, 190]);
  });

  it('stops every running search when one fails, and rejects with that failure', async () => {
    const { run, started } = fakeRunner();
    const done = runPool(run, [request(0), request(1), request(2)], { concurrency: 3 });
    started[1]!.fail(new Error('a missing width key'));
    await expect(done).rejects.toThrow('a missing width key');
    expect(started.map((s) => s.signal?.aborted)).toEqual([true, true, true]);
  });

  it('starts nothing further once a search has failed', async () => {
    const { run, started } = fakeRunner();
    const done = runPool(run, [request(0), request(1), request(2)], { concurrency: 1 });
    started[0]!.fail(new Error('boom'));
    await expect(done).rejects.toThrow('boom');
    await tick();
    expect(started).toHaveLength(1);
  });

  it('aborts every search when the caller aborts, and rejects as cancelled', async () => {
    const { run, started } = fakeRunner();
    const caller = new AbortController();
    const done = runPool(run, [request(0), request(1)], { concurrency: 2, signal: caller.signal });
    caller.abort();
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    expect(started.map((s) => s.signal?.aborted)).toEqual([true, true]);
  });

  it('starts nothing when the signal is already aborted', async () => {
    const { run, started } = fakeRunner();
    const caller = new AbortController();
    caller.abort();
    await expect(
      runPool(run, [request(0)], { concurrency: 1, signal: caller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(started).toHaveLength(0);
  });

  it('resolves an empty request list to an empty list', async () => {
    const { run } = fakeRunner();
    await expect(runPool(run, [], { concurrency: 3 })).resolves.toEqual([]);
  });
});
