import type { OptimiseLayoutResult } from './optimise-layout';
import type { OptimiseMessage, OptimiseRequest } from './optimise-layout-protocol';
import { runPool, type PoolHandlers } from './optimise-pool';

/**
 * Run Tidy or Re-layout in a module worker and resolve with its result.
 *
 * The worker is created per run and terminated when the run settles or is aborted, so a dismissed
 * dialog leaves nothing computing. `new URL(…, import.meta.url)` with `type: 'module'` is the form
 * Vite builds into a same-origin file, which the site's `script-src 'self'` allows; an inline `blob:`
 * worker would be refused by the same policy.
 */
export function runOptimiseLayout(
  request: OptimiseRequest,
  handlers: { onProgress?: (evaluations: number) => void; signal?: AbortSignal } = {},
): Promise<OptimiseLayoutResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimise-layout.worker.ts', import.meta.url), {
      type: 'module',
      name: 'optimise-layout',
    });
    const stop = (): void => worker.terminate();
    handlers.signal?.addEventListener('abort', () => {
      stop();
      reject(new DOMException('The layout search was cancelled.', 'AbortError'));
    });
    worker.onmessage = (event: MessageEvent<OptimiseMessage>) => {
      const message = event.data;
      if (message.type === 'progress') handlers.onProgress?.(message.evaluations);
      else {
        stop();
        if (message.type === 'done') resolve(message.result);
        else reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      stop();
      reject(new Error(event.message || 'The layout search stopped unexpectedly.'));
    };
    worker.postMessage(request);
  });
}

/**
 * How many searches to run at once: one core is left to the page, as the spec's D4 says, and never
 * fewer than one. It decides how long Re-layout takes and nothing else, since the pick is made over
 * results in request order (`runPool`).
 */
export function poolConcurrency(searches: number): number {
  const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  return Math.min(searches, Math.max(1, cores - 1));
}

/** Run every request in a module worker each, `concurrency` at a time, and resolve in request order. */
export function runOptimiseLayoutPool(
  requests: readonly OptimiseRequest[],
  handlers: Partial<PoolHandlers> = {},
): Promise<OptimiseLayoutResult[]> {
  return runPool(runOptimiseLayout, requests, {
    ...handlers,
    concurrency: handlers.concurrency ?? poolConcurrency(requests.length),
  });
}
