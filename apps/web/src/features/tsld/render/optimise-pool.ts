import type { OptimiseLayoutResult } from './optimise-layout';
import type { OptimiseRequest } from './optimise-layout-protocol';

/** One search: what `runOptimiseLayout` is, and what a test substitutes for it. */
export type RunOne = (
  request: OptimiseRequest,
  handlers: { onProgress?: (evaluations: number) => void; signal?: AbortSignal },
) => Promise<OptimiseLayoutResult>;

export interface PoolHandlers {
  /** How many searches run at once. Changes how long the answer takes, never what it is. */
  concurrency: number;
  signal?: AbortSignal;
  /** The evaluations of every search so far, summed. */
  onProgress?: (evaluations: number) => void;
}

/**
 * **Run several searches at once and hand back every result in request order** (`relayout-quality`
 * D4). Order is the request's, not the order the searches finish in, so whatever picks among the
 * results is deterministic however many ran at once.
 *
 * One signal governs the lot: the caller's abort, or the first search to fail, aborts every search
 * still running, so a dismissed dialog or a failed start leaves nothing computing. The rejection is
 * the first failure's (or an `AbortError` for the caller's abort).
 */
export function runPool(
  run: RunOne,
  requests: readonly OptimiseRequest[],
  { concurrency, signal, onProgress }: PoolHandlers,
): Promise<OptimiseLayoutResult[]> {
  return new Promise((resolve, reject) => {
    const results: OptimiseLayoutResult[] = new Array<OptimiseLayoutResult>(requests.length);
    const progress = requests.map(() => 0);
    const inner = new AbortController();
    let next = 0;
    let finished = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      inner.abort();
      reject(error);
    };
    if (signal?.aborted) {
      fail(new DOMException('The layout search was cancelled.', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', () =>
      fail(new DOMException('The layout search was cancelled.', 'AbortError')),
    );

    const launch = (): void => {
      if (settled || next >= requests.length) return;
      const index = next;
      next += 1;
      run(requests[index]!, {
        signal: inner.signal,
        onProgress: (n) => {
          progress[index] = n;
          if (!settled) onProgress?.(progress.reduce((sum, p) => sum + p, 0));
        },
      }).then(
        (result) => {
          if (settled) return;
          results[index] = result;
          progress[index] = result.evaluations;
          finished += 1;
          if (finished === requests.length) {
            settled = true;
            resolve(results);
          } else launch();
        },
        (error: unknown) => fail(error instanceof Error ? error : new Error(String(error))),
      );
    };

    if (requests.length === 0) {
      settled = true;
      resolve(results);
      return;
    }
    for (let i = 0; i < Math.min(Math.max(1, concurrency), requests.length); i += 1) launch();
  });
}
