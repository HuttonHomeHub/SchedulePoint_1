import type { OptimiseLayoutResult } from './optimise-layout';
import type { OptimiseMessage, OptimiseRequest } from './optimise-layout-protocol';

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
