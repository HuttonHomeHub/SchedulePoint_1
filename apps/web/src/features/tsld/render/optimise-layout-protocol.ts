import {
  optimiseLayout,
  type OptimiseLayoutOptions,
  type OptimiseLayoutResult,
} from './optimise-layout';
import type { RenderActivity, RenderEdge } from './render-model';
import { tableMeasure } from './row-text-layout';
import type { TsldViewToggles } from './view-toggles';

/**
 * **The optimiser's worker boundary** (NetPoint-layout M4-T3, FC-N2 (b)).
 *
 * The measured runs are past 2,000 ms, so Tidy and Re-layout run in a module worker, the first in
 * `apps/web` (ADR-0152). Everything that crosses the boundary must survive structured clone, and the
 * scene's working-day predicate is a function, which does not. So the caller sends the non-working
 * day offsets over a span instead, and the worker rebuilds the predicate from them.
 *
 * The handler is here rather than in the worker file so it can be tested without a worker: jsdom has
 * none. The worker file is two lines that bind it to `self`.
 */
export interface WorkingDaySpan {
  /** First and last day offset (from the data date) the list covers, inclusive. */
  from: number;
  to: number;
  /** Offsets inside the span that are not worked. */
  nonWorking: number[];
}

export interface OptimiseRequest {
  activities: RenderActivity[];
  edges: RenderEdge[];
  dataDate: string;
  /** Null when the plan has no calendar loaded: every day is worked, as the painter assumes. */
  workingDays: WorkingDaySpan | null;
  /**
   * The text widths the routes read (links-and-labels M2-T3, spec §4.4): `[key, width]`, measured on
   * the main thread by the painter's memo (`text-width-table.ts`). A key missing here fails the
   * search rather than routing with a guessed width.
   */
  textWidths: [string, number][];
  /** The text toggles the planner is looking at (spec D-7). */
  textToggles: TsldViewToggles;
  options: Omit<OptimiseLayoutOptions, 'onProgress'>;
}

export type OptimiseMessage =
  | { type: 'progress'; evaluations: number }
  | { type: 'done'; result: OptimiseLayoutResult }
  | { type: 'failed'; message: string };

/** How often progress is posted, in evaluations. Often enough to move a bar, rarely enough not to flood. */
export const PROGRESS_EVERY = 25;

/**
 * The predicate the scene carries, rebuilt from a span. A day outside the span counts as worked:
 * the span covers the plan's drawn extent, and a lag walk that leaves it is already off the canvas.
 */
export function workingDayPredicate(span: WorkingDaySpan): (dayOffset: number) => boolean {
  const off = new Set(span.nonWorking);
  return (d) => d < span.from || d > span.to || !off.has(d);
}

/** The inverse, for the caller: sample a predicate over a span. */
export function workingDaySpanOf(
  isWorkingDay: (dayOffset: number) => boolean,
  from: number,
  to: number,
): WorkingDaySpan {
  const nonWorking: number[] = [];
  for (let d = from; d <= to; d += 1) if (!isWorkingDay(d)) nonWorking.push(d);
  return { from, to, nonWorking };
}

export function handleOptimiseRequest(
  request: OptimiseRequest,
  post: (message: OptimiseMessage) => void,
): void {
  try {
    const result = optimiseLayout(
      {
        activities: request.activities,
        edges: request.edges,
        dataDate: request.dataDate,
        isWorkingDay: request.workingDays ? workingDayPredicate(request.workingDays) : undefined,
        text: { measure: tableMeasure(request.textWidths), toggles: request.textToggles },
      },
      {
        ...request.options,
        onProgress: (evaluations) => {
          if (evaluations % PROGRESS_EVERY === 0) post({ type: 'progress', evaluations });
        },
      },
    );
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  }
}
