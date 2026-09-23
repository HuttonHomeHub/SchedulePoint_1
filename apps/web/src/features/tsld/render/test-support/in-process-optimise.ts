import { optimiseLayout } from '../optimise-layout';
import type { OptimiseLayoutResult } from '../optimise-layout';
import { workingDayPredicate, type OptimiseRequest } from '../optimise-layout-protocol';

/**
 * `runOptimiseLayout` without a worker, for suites under jsdom, which has none. It runs the same
 * `optimiseLayout` the worker runs, on the same request, so a suite exercises the real search and
 * only the thread is different. Use it as a module mock:
 *
 *   vi.mock('../render/run-optimise-layout', () => import('../render/test-support/in-process-optimise'));
 *
 * That the real worker loads and runs in a browser is the `e2e-arrange` journey's half.
 */
export function runOptimiseLayout(request: OptimiseRequest): Promise<OptimiseLayoutResult> {
  return Promise.resolve(
    optimiseLayout(
      {
        activities: request.activities,
        edges: request.edges,
        dataDate: request.dataDate,
        isWorkingDay: request.workingDays ? workingDayPredicate(request.workingDays) : undefined,
      },
      request.options,
    ),
  );
}
