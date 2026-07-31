import { scaleSpec, type SeedActivity, type SeedSpec } from '@repo/seed';

import type { RenderActivity, RenderEdge } from '../src/features/tsld/render/render-model';

/**
 * A **realistic** scene for the hand-run draw benchmark, built from the ADR-0066 scale generator.
 *
 * The bench's original scene was a uniform grid: 2,000 identical five-day TASK bars, every one the
 * same width, every edge the same span. That is the same failure the scale generator's own docblock
 * exists to avoid, applied to the paint side — a number measured on a picture the product never
 * draws. A real programme has milestone diamonds, wide summary brackets, LOE spans, bars of a dozen
 * different widths and a logic set that is dense inside a band and sparse across bands, and each of
 * those costs the painter a different amount.
 *
 * ## What this does NOT do
 *
 * **It does not schedule.** The bars are laid out in the generator's own band-and-chain order — each
 * band starts where the previous one ended, and within a band each activity follows the last — which
 * is a *layout*, not a CPM result. The real dates come from the engine, and nothing here approximates
 * it: the painter's cost depends on how many bars there are, what type each is, which lane it sits in
 * and how wide it is, and none of those needs a date to be *correct*, only plausible. Reading a
 * schedule out of this scene would be reading a fiction.
 */

/** Lanes the bands are dealt into. The TSLD packs a plan into far fewer lanes than it has bands. */
const LANES = 50;

export interface ScaleScene {
  activities: RenderActivity[];
  edges: RenderEdge[];
  /** Quoted with the measurement, so a number always carries the picture it came from. */
  summary: string;
}

export function scaleScene(count: number): ScaleScene {
  const spec = scaleSpec({ activities: count });
  const placed = layOut(spec);

  const activities: RenderActivity[] = spec.activities.map((activity) => {
    const bar = placed.get(activity.key)!;
    return {
      id: activity.key,
      type: activity.type,
      laneIndex: bar.lane,
      label: `${activity.code} ${activity.name} · ${String(activity.durationMinutes / 1440)}d`,
      earlyStart: iso(bar.startDay),
      earlyFinish: iso(bar.finishDay),
      // The generator does not compute criticality (it does not schedule), so the flag is dealt to
      // the chain spine — the bars a real critical path runs through. It changes the palette a bar
      // is drawn with, which is the only thing the painter reads it for.
      isCritical: bar.spine,
      isNearCritical: false,
    };
  });

  const edges: RenderEdge[] = spec.dependencies.map((dependency, index) => ({
    predecessorId: dependency.predecessorKey,
    successorId: dependency.successorKey,
    type: dependency.type,
    isDriving: index % 3 === 0,
  }));

  const summaries = spec.activities.filter((a) => a.type === 'WBS_SUMMARY').length;
  const milestones = spec.activities.filter(
    (a) => a.type === 'START_MILESTONE' || a.type === 'FINISH_MILESTONE',
  ).length;

  return {
    activities,
    edges,
    summary:
      `${String(spec.activities.length)} bars (${String(spec.activities.length - summaries)} ` +
      `activities, ${String(summaries)} WBS summaries, ${String(milestones)} milestones), ` +
      `${String(edges.length)} links across ${String(LANES)} lanes`,
  };
}

interface Bar {
  lane: number;
  startDay: number;
  finishDay: number;
  /** On the band chain rather than hanging off it — painted as critical. */
  spine: boolean;
}

/**
 * Sub-phases within a phase run **concurrently** — that is what a phase is — and each phase starts
 * a quarter of the way into the one before it.
 *
 * The concurrency is not decoration. A first attempt ran the bands nose-to-tail, which made a
 * 2,000-activity plan **twenty-eight years** long; the "whole plan" zoom then culled roughly nine
 * bars in ten, and the comparison against the synthetic grid — which fits entirely on screen and
 * culls nothing — was measuring the cull rather than the painter. Spread this way the plan spans
 * about two and a half years and fills the viewport at 2 px/day, which is what makes the two scenes
 * answer the same question.
 */
const PHASE_OVERLAP = 0.25;

/**
 * Lay the plan out in the generator's own order. A leaf follows the previous leaf in its band; the
 * bands of a phase all start together; a summary spans its children.
 */
function layOut(spec: SeedSpec): Map<string, Bar> {
  const bars = new Map<string, Bar>();
  const leavesByParent = new Map<string, SeedActivity[]>();
  for (const activity of spec.activities) {
    if (activity.type === 'WBS_SUMMARY' || activity.parentKey === null) continue;
    const bucket = leavesByParent.get(activity.parentKey);
    if (bucket === undefined) leavesByParent.set(activity.parentKey, [activity]);
    else bucket.push(activity);
  }

  // Bands, grouped by the phase they hang off, in the generator's order.
  const phases = new Map<string, string[]>();
  for (const bandKey of leavesByParent.keys()) {
    const phaseKey = spec.activities.find((a) => a.key === bandKey)?.parentKey ?? bandKey;
    const bucket = phases.get(phaseKey);
    if (bucket === undefined) phases.set(phaseKey, [bandKey]);
    else bucket.push(bandKey);
  }

  let bandIndex = 0;
  let phaseStart = 0;
  for (const bandKeys of phases.values()) {
    let longest = 0;
    for (const bandKey of bandKeys) {
      let cursor = phaseStart;
      const lane = bandIndex % LANES;
      bandIndex += 1;
      for (const activity of leavesByParent.get(bandKey) ?? []) {
        const days = Math.max(0, Math.round(activity.durationMinutes / 1440));
        bars.set(activity.key, {
          lane,
          startDay: cursor,
          finishDay: cursor + Math.max(0, days - 1),
          spine: activity.type === 'TASK',
        });
        cursor += days === 0 ? 1 : days;
      }
      longest = Math.max(longest, cursor - phaseStart);
    }
    phaseStart += Math.max(1, Math.round(longest * PHASE_OVERLAP));
  }

  // A summary spans its children; a phase spans its sub-phases. Two passes, deepest first, so a
  // phase reads the sub-phase extents this loop has already set.
  for (const depth of ['band', 'phase'] as const) {
    for (const summary of spec.activities.filter((a) => a.type === 'WBS_SUMMARY')) {
      const isBand = summary.parentKey !== null;
      if ((depth === 'band') !== isBand) continue;
      const children = spec.activities.filter((a) => a.parentKey === summary.key);
      const extents = children
        .map((child) => bars.get(child.key))
        .filter((bar) => bar !== undefined);
      if (extents.length === 0) continue;
      bars.set(summary.key, {
        lane: (bars.get(children[0]!.key)?.lane ?? 0) % LANES,
        startDay: Math.min(...extents.map((bar) => bar.startDay)),
        finishDay: Math.max(...extents.map((bar) => bar.finishDay)),
        spine: false,
      });
    }
  }

  return bars;
}

function iso(day: number): string {
  return new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
}
