import { useEffect, useState } from 'react';

import type { LayoutObjective } from '../render/layout-objective';
import { OPTIMISE_MAX_ACTIVITIES } from '../render/optimise-layout';
import { workingDaySpanOf, type OptimiseRequest } from '../render/optimise-layout-protocol';
import { axisDayOf, type RenderActivity, type RenderEdge } from '../render/render-model';
import { runOptimiseLayout } from '../render/run-optimise-layout';

/**
 * **What each Arrange option would do, worked out while the dialog is open** (NetPoint-layout M5).
 *
 * Tidy seeds from the rows the planner has; Re-layout seeds from `packLanes` over the drawn spans,
 * which is what `Arrange` did before this epic. Both run in a module worker, one after the other,
 * because a whole Tidy is measured at 4.2 s on a 144-activity plan (M4, FC-N2 (b)). Closing the dialog
 * aborts the run, so nothing keeps computing behind a dismissed dialog.
 *
 * **Above {@link OPTIMISE_MAX_ACTIVITIES} drawn activities the search is not offered**, because a
 * whole Tidy there is measured past 10 s. Re-layout is then evaluated but not searched, so its
 * figures describe the plain pack, and Tidy is reported as bounded for the dialog to explain.
 */
export type ArrangeChoice = 'tidy' | 'relayout';

export interface ArrangeOutcome {
  /** The moves the confirm writes: only activities whose lane changes. */
  changes: { id: string; laneIndex: number }[];
  before: LayoutObjective;
  after: LayoutObjective;
}

export type ArrangeSearchState =
  | { kind: 'computing'; evaluations: number }
  | {
      kind: 'ready';
      tidy: ArrangeOutcome | null;
      relayout: ArrangeOutcome;
      /** Set when Tidy was not run because the plan is over the size limit. */
      bounded: { drawn: number; limit: number } | null;
    }
  | { kind: 'error'; message: string };

export interface ArrangeSearchInput {
  /** What the canvas draws: `RenderActivity` carries the DRAWN dates (ADR-0148). */
  activities: readonly RenderActivity[];
  edges: readonly RenderEdge[];
  dataDate: string;
  isWorkingDay: ((dayOffset: number) => boolean) | null | undefined;
  /** Today's pack (`arrangeSummary.changes`), the seed Re-layout starts from. */
  packChanges: readonly { id: string; laneIndex: number }[];
}

/** The inputs a worker needs, with the working-day predicate sampled over the drawn span. */
export function arrangeRequest(
  input: ArrangeSearchInput,
  seed: ReadonlyMap<string, number>,
  options: OptimiseRequest['options'],
): OptimiseRequest {
  let from = 0;
  let to = 0;
  for (const a of input.activities) {
    if (a.earlyStart === null) continue;
    from = Math.min(from, axisDayOf(a.type, input.dataDate, a.earlyStart));
    to = Math.max(to, axisDayOf(a.type, input.dataDate, a.earlyFinish ?? a.earlyStart));
  }
  return {
    activities: input.activities.map((a) => ({ ...a, laneIndex: seed.get(a.id) ?? a.laneIndex })),
    edges: [...input.edges],
    dataDate: input.dataDate,
    // A month either side covers the lag walks that start inside the plan.
    workingDays: input.isWorkingDay
      ? workingDaySpanOf(input.isWorkingDay, from - 31, to + 31)
      : null,
    options,
  };
}

/** The moves from `current` to `lanes`, in a fixed order. */
export function changesBetween(
  activities: readonly RenderActivity[],
  lanes: ReadonlyMap<string, number>,
): { id: string; laneIndex: number }[] {
  return activities
    .filter((a) => (lanes.get(a.id) ?? a.laneIndex) !== a.laneIndex)
    .map((a) => ({ id: a.id, laneIndex: lanes.get(a.id)! }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export function drawnCount(activities: readonly RenderActivity[]): number {
  return activities.filter((a) => a.earlyStart !== null).length;
}

export function useArrangeSearch(
  open: boolean,
  input: ArrangeSearchInput | null,
): ArrangeSearchState {
  // Each result is tagged with the input it answers, so a new input reads as "computing" without an
  // effect having to reset anything: a stale answer is never shown for a different plan.
  const [result, setResult] = useState<{
    input: ArrangeSearchInput;
    state: ArrangeSearchState;
  } | null>(null);

  useEffect(() => {
    if (!open || input === null) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const setState = (state: ArrangeSearchState): void => setResult({ input, state });

    const current = new Map(input.activities.map((a) => [a.id, a.laneIndex]));
    const packed = new Map(current);
    for (const c of input.packChanges) packed.set(c.id, c.laneIndex);
    const drawn = drawnCount(input.activities);
    const bounded = drawn > OPTIMISE_MAX_ACTIVITIES;

    let tidyEvaluations = 0;
    const progress = (base: number) => (n: number) => {
      if (!signal.aborted) setState({ kind: 'computing', evaluations: base + n });
    };

    void (async () => {
      try {
        let tidy: ArrangeOutcome | null = null;
        // The diagram as it stands, scored. Tidy's seed is exactly that, so it comes for free when
        // Tidy runs; when it is bounded, one evaluation with no search supplies it.
        let before: LayoutObjective | null = null;
        if (bounded) {
          const r = await runOptimiseLayout(arrangeRequest(input, current, { passes: 0 }), {
            signal,
          });
          before = r.seed;
        } else {
          const r = await runOptimiseLayout(arrangeRequest(input, current, {}), {
            signal,
            onProgress: progress(0),
          });
          tidyEvaluations = r.evaluations;
          before = r.seed;
          tidy = { changes: changesBetween(input.activities, r.lanes), before, after: r.final };
        }
        const r = await runOptimiseLayout(
          arrangeRequest(input, packed, bounded ? { passes: 0 } : {}),
          { signal, onProgress: progress(tidyEvaluations) },
        );
        // Re-layout's own seed is the pack, so its "before" is the diagram's, never the pack's.
        const relayout: ArrangeOutcome = {
          changes: changesBetween(input.activities, r.lanes),
          before: before ?? r.seed,
          after: r.final,
        };
        if (!signal.aborted) {
          setState({
            kind: 'ready',
            tidy,
            relayout,
            bounded: bounded ? { drawn, limit: OPTIMISE_MAX_ACTIVITIES } : null,
          });
        }
      } catch (error) {
        if (signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'The layout could not be worked out.',
        });
      }
    })();

    return () => controller.abort();
  }, [open, input]);

  return result !== null && result.input === input ? result.state : COMPUTING;
}

const COMPUTING: ArrangeSearchState = { kind: 'computing', evaluations: 0 };
