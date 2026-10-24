/**
 * The reference plan as the swimlane rule and ground pictures need it (swimlanes M2-T2,
 * `shoot-swimlane-rule.mjs`): the power plant, split by system as the M0 reading split it, laid out
 * by the partitioned Re-layout, with its display lanes and swimlane extents.
 *
 * Runs in node, because the partitioned search is the harness's (`netpoint-swimlane-run.ts`) and the
 * corpus is read with `fs`. Also counts the link runs that coincide with a boundary, because that is
 * a statement about the routed links and only the painter's own routes can answer it.
 */
import { LANE_HEIGHT, screenYOfLane } from '../src/features/tsld/render/geometry';
import { paintScene, type SwimlaneMarks, type TsldScene } from '../src/features/tsld/render/paint';

import { linkPaths, PALETTE, recordingCtx } from './crossing-probe';
import { CASES, displayOf, run } from './netpoint-swimlane-run';

export const VIEW = { pxPerDay: 1, originX: 20, originY: 40 } as const;
export const SIZE = { width: 1646, height: 820 } as const;

export function swimlaneScene(): {
  scene: TsldScene;
  marks: SwimlaneMarks;
  swimlanes: number;
  rows: number;
  links: number;
  horizontalRuns: number;
  coincident: number;
  boundaries: number;
} {
  const c = CASES.power();
  const result = run('power');
  const stored = (result.lanes[c.name] as { relayoutSame: [string, number][] }).relayoutSame;
  const local = new Map(stored);
  const display = displayOf(c, local);

  const rowsOf = new Map(c.order.map((k) => [k, 1]));
  for (const [id, lane] of local) {
    const k = c.partition.get(id)!;
    rowsOf.set(k, Math.max(rowsOf.get(k)!, lane + 1));
  }
  const extents: SwimlaneMarks['extents'][number][] = [];
  let next = 0;
  for (const k of c.order) {
    const laneCount = rowsOf.get(k)!;
    extents.push({ firstLane: next, laneCount });
    next += laneCount;
  }

  const scene: TsldScene = {
    activities: c.activities.map((a) => ({ ...a, laneIndex: display.get(a.id) ?? a.laneIndex })),
    edges: c.edges,
    dataDate: c.dataDate,
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    gridTiers: true,
    monthBands: true,
  };

  // Paint once into the recorder with the rule and ground ON, and read the routed links back.
  const marks: SwimlaneMarks = { extents, ground: true };
  const { ctx, paths } = recordingCtx();
  paintScene(
    ctx as Parameters<typeof paintScene>[0],
    { ...scene, swimlaneMarks: marks },
    VIEW,
    { width: SIZE.width, height: next * LANE_HEIGHT + 200 },
    PALETTE,
    1,
  );
  const links = linkPaths(paths);
  const boundaryYs = extents.slice(1).map((e) => screenYOfLane(e.firstLane, VIEW));
  let horizontalRuns = 0;
  let coincident = 0;
  for (const link of links) {
    for (let i = 1; i < link.pts.length; i += 1) {
      const a = link.pts[i - 1]!;
      const b = link.pts[i]!;
      if (a.y !== b.y || a.x === b.x) continue;
      horizontalRuns += 1;
      // The rule is drawn on round(y) + 0.5; a run within a pixel of it is hidden by, or hides, it.
      if (boundaryYs.some((y) => Math.abs(a.y - y) <= 1)) coincident += 1;
    }
  }
  return {
    scene,
    marks,
    swimlanes: c.order.length,
    rows: next,
    links: links.length,
    horizontalRuns,
    coincident,
    boundaries: boundaryYs.length,
  };
}
