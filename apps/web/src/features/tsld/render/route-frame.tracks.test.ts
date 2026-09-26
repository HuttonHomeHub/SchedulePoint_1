import { describe, expect, it } from 'vitest';

import { PORT_OFFSET_PX } from './link-tracks';
import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import {
  NODE_REACH_PX,
  type Point,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';
import { routeFrame } from './route-frame';
import { allItems, sceneRowText } from './row-text-layout';
import { FIXED_WIDTH_TEXT } from './test-support/fixed-width-text';
import { recordingCtx } from './test-support/recording-ctx';
import { textIndexOf } from './text-index';

/**
 * **The two-way track pass, as the frame and the painter use it** (`docs/TECH_DEBT.md` #395 item 9).
 *
 * `link-tracks.test.ts` pins the pass and `nodeHeadTrim` on their own. Until this suite, the two
 * places that use them were reached only by the browser journey: the route frame handing the pass
 * its lines and writing the split lines back, and the painter trimming an arrowhead that ends
 * beside a node centre rather than on it.
 *
 * The scene is the journey's (`e2e-netpoint-grammar/links.spec.ts`, "two links on one track at a
 * crowded node are drawn apart"), with its dates written out: one track at Task 0's finish carries
 * an arrival and a departure, and the frame splits it at every zoom from 4 to 64 px a day.
 */
function act(id: string, lane: number, start: string, finish: string): RenderActivity {
  return {
    id,
    type: 'TASK',
    label: id,
    earlyStart: start,
    earlyFinish: finish,
    isCritical: false,
    isNearCritical: false,
    laneIndex: lane,
  };
}

function edge(p: string, s: string): RenderEdge {
  return {
    id: `${p}>${s}`,
    predecessorId: p,
    successorId: s,
    type: 'FS',
    lagDays: 0,
    isDriving: true,
  };
}

function scene(): TsldScene {
  return {
    activities: [
      act('T0', 0, '2026-01-05', '2026-01-12'),
      act('T1', 2, '2026-01-05', '2026-01-07'),
      act('T2', 3, '2026-01-05', '2026-01-07'),
      act('T3', 2, '2026-01-13', '2026-01-18'),
      act('T4', 0, '2026-01-13', '2026-01-14'),
      act('T5', 0, '2026-01-19', '2026-01-25'),
    ],
    edges: [
      edge('T0', 'T3'),
      edge('T0', 'T4'),
      edge('T0', 'T5'),
      edge('T1', 'T3'),
      edge('T2', 'T4'),
      edge('T3', 'T5'),
      edge('T4', 'T5'),
    ],
    dataDate: '2026-01-05',
    view: { ...DEFAULT_VIEW_TOGGLES },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
}

const VIEW: Viewport = { pxPerDay: 12, originX: 0, originY: 0 };

function frame() {
  const s = scene();
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const rectCache: RectCache = new Map();
  const text = textIndexOf(
    allItems(
      sceneRowText(
        s,
        VIEW,
        { width: 4000, height: 1000 },
        FIXED_WIDTH_TEXT.toggles,
        FIXED_WIDTH_TEXT.measure,
        rectCache,
      ),
    ),
  );
  return routeFrame(s, VIEW, new Set(byId.keys()), byId, rectCache, text);
}

/** Every vertical segment of a line, with its x and the way it travels (+1 down, -1 up). */
function verticals(line: readonly Point[]): { x: number; dir: number }[] {
  const out: { x: number; dir: number }[] = [];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
      out.push({ x: a.x, dir: Math.sign(b.y - a.y) });
    }
  }
  return out;
}

describe('routeFrame: the two-way track pass is wired in', () => {
  it('splits the shared track and writes the split lines back into the frame', () => {
    const f = frame();
    expect(f.tracks?.split).toBe(1);
    const x = f.tracks!.splitAt[0]!;
    const segs = [...f.lines.values()].flatMap(verticals);
    const west = segs.filter((s) => Math.abs(s.x - (x - PORT_OFFSET_PX)) < 1e-6);
    const east = segs.filter((s) => Math.abs(s.x - (x + PORT_OFFSET_PX)) < 1e-6);
    // One side carries the down-travelling segments and the other the up-travelling ones.
    expect(west.length).toBeGreaterThan(0);
    expect(east.length).toBeGreaterThan(0);
    expect(new Set(west.map((s) => s.dir)).size).toBe(1);
    expect(new Set(east.map((s) => s.dir)).size).toBe(1);
    expect(west[0]!.dir).toBe(-east[0]!.dir);
  });
});

const PALETTE = {
  canvasGround: '#000001',
  gridLine: '#000002',
  laneRule: '#000003',
  edge: '#000004',
  bar: '#000005',
  nodeRim: '#000005',
  nodeRimNear: '#000009',
  nodeRimCritical: '#000008',
  linkMinor: '#000006',
  linkDriving: '#000007',
  linkMark: '#3d2070',
  attachDot: '#3d2071',
  critical: '#000008',
  nearCritical: '#000009',
  selection: '#00000a',
  outline: '#00000b',
  labelBeside: '#00000c',
  labelInside: '#00000d',
  labelInsideCritical: '#00000d',
  labelInsideNearCritical: '#00000d',
  barStroke: '#00000e',
  hoverRing: '#00000f',
  handleHalo: '#000010',
} as unknown as TsldPalette;

describe('paintScene: an arrowhead beside a node centre stops at the rim', () => {
  it('trims a split arrival back to where its vertical meets the rim, not a full reach', () => {
    const f = frame();
    const x = f.tracks!.splitAt[0]!;
    // The split arrivals: links whose tip sits exactly one port offset beside the node's x.
    const arrivals = [...f.lines.values()].filter(
      (line) => Math.abs(Math.abs(line.at(-1)!.x - x) - PORT_OFFSET_PX) < 1e-6,
    );
    expect(arrivals.length).toBeGreaterThan(0);

    const { ctx, log } = recordingCtx();
    paintScene(ctx, scene(), VIEW, { width: 1200, height: 400 }, PALETTE);
    const moves = log
      .filter((l) => l.startsWith('moveTo('))
      .map((l) => JSON.parse(l.slice('moveTo('.length, -1)) as [number, number]);
    const drawnAt = (p: Point): boolean =>
      moves.some(([mx, my]) => Math.abs(mx - p.x) < 0.01 && Math.abs(my - p.y) < 0.01);

    // √(reach² − δ²): where a vertical δ from the centre meets the rim.
    const trim = Math.sqrt(NODE_REACH_PX ** 2 - PORT_OFFSET_PX ** 2);
    for (const line of arrivals) {
      const tip = line.at(-1)!;
      const prev = line.at(-2)!;
      const back = Math.sign(prev.y - tip.y);
      expect(drawnAt({ x: tip.x, y: tip.y + back * trim })).toBe(true);
      // Neither untrimmed, under the disc, nor trimmed by the full reach meant for a centre tip.
      expect(drawnAt(tip)).toBe(false);
      expect(drawnAt({ x: tip.x, y: tip.y + back * NODE_REACH_PX })).toBe(false);
    }
  });
});
