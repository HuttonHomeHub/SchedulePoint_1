import {
  runRevisionDiff,
  type BenchOptions,
  type BenchOutcome,
} from '../src/features/perf-probe/scenes/revision-diff';

import { PALETTE } from './link-routing-bench';

/**
 * The CLI entry point for M0 Condition A — now a **thin adapter** over
 * `src/features/perf-probe/scenes/revision-diff.ts`, which holds every line of the measurement it
 * used to hold itself.
 *
 * The move is `docs/specs/staff-performance-probe/` M3's: the staff panel has to run this same
 * scenario, and a second implementation of it would drift invisibly — each looking right alone,
 * with only somebody comparing two published numbers months apart ever seeing it (the ADR-0065
 * `routeOrthogonal` argument, and ADR-0121's `stackSeries`). F1 is the proof that the move changed
 * nothing: this driver's own output is the before/after oracle.
 *
 * What stays here is exactly what is peculiar to running from a script: a full-window canvas
 * appended to the document, the bench palette literal, and the `window` handle
 * `measure-revision-diff.mjs` calls. Everything else moved.
 */
declare global {
  interface Window {
    __benchRevisionDiff: (opts: BenchOptions) => Promise<BenchOutcome>;
  }
}

window.__benchRevisionDiff = async (opts: BenchOptions): Promise<BenchOutcome> => {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  return runRevisionDiff(ctx, { width: canvas.width, height: canvas.height }, PALETTE, opts);
};

export type { BenchOptions, BenchOutcome };
