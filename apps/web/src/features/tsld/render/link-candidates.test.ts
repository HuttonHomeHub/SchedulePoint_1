import { describe, expect, it } from 'vitest';

import {
  gutterBelow,
  MAX_ROUTE_CANDIDATES,
  obeysPorts,
  routeCandidates,
  type RouteShape,
} from './link-candidates';
import { linkEndOf, portFor, type LinkEnd } from './link-ports';
import {
  LANE_HEIGHT,
  type Point,
  type Rect,
  type RenderActivity,
  type Viewport,
} from './render-model';

/**
 * **The shapes a link may take** (node-to-node links spec §4.2). Each shape has a case that makes
 * it; the cap and the "never empty" property are pinned separately, because a candidate generator
 * that returns nothing for some geometry is how a link ends up drawn by the fallback.
 */
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const BAR_H = 6;

function bar(
  id: string,
  lane: number,
  x: number,
  w: number,
  type: RenderActivity['type'] = 'TASK',
) {
  const cy = VIEW.originY + lane * LANE_HEIGHT + LANE_HEIGHT / 2;
  const activity: RenderActivity = {
    id,
    type,
    laneIndex: lane,
    label: id,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-02',
    isCritical: false,
    isNearCritical: false,
  };
  const rect: Rect = { x, y: cy - BAR_H / 2, w, h: BAR_H };
  return {
    activity,
    rect,
    start: { x, y: cy },
    finish: { x: x + w, y: cy },
    end: (at: Point): LinkEnd => linkEndOf(activity, at, rect),
  };
}

const shapes = (lane1: number, lane2: number, pred: LinkEnd, succ: LinkEnd): RouteShape[] =>
  routeCandidates(pred, succ, lane1, lane2, VIEW).map((c) => c.shape);

describe('routeCandidates', () => {
  it('FS between adjacent lanes offers VH before HV, then HVH, then the gutter', () => {
    const a = bar('a', 0, 100, 60);
    const b = bar('b', 1, 260, 60);
    const got = routeCandidates(a.end(a.finish), b.end(b.start), 0, 1, VIEW);
    expect(got.map((c) => c.shape)).toEqual(['VH', 'HV', 'HVH', 'HVH', 'HVH', 'HVH', 'HVH', 'VHV']);
    expect(got[0]!.line).toEqual([a.finish, { x: 160, y: 90 }, b.start]);
    expect(got.at(-1)!.line).toEqual([a.finish, { x: 160, y: 60 }, { x: 260, y: 60 }, b.start]);
    // Orders are the fixed positions, gaps and all: V (0) and H (1) were not made.
    expect(got.map((c) => c.order)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('a same-lane FS is one horizontal, or round a gutter', () => {
    const a = bar('a', 2, 100, 60);
    const b = bar('b', 2, 200, 60);
    expect(shapes(2, 2, a.end(a.finish), b.end(b.start))).toEqual(['H', 'VHV', 'VHV']);
  });

  it('a vertically aligned pair is one vertical', () => {
    const a = bar('a', 0, 100, 60);
    const b = bar('b', 3, 160, 60);
    expect(shapes(0, 3, a.end(a.finish), b.end(b.start))).toEqual(['V']);
  });

  it('a tight FS whose gap is under the stub cannot bend at either node', () => {
    // 10 px between finish and start: under the 14 px and 17 px stubs, so VH, HV and every HVH go,
    // and the gutter route is what is left.
    const a = bar('a', 0, 100, 60);
    const b = bar('b', 1, 170, 60);
    expect(shapes(0, 1, a.end(a.finish), b.end(b.start))).toEqual(['VHV']);
  });

  it('an SS in one lane goes round, since a start node may not be left eastward', () => {
    const a = bar('a', 0, 100, 60);
    const b = bar('b', 0, 200, 60);
    expect(shapes(0, 0, a.end(a.start), b.end(b.start))).toEqual(['VHV', 'VHV']);
  });

  it('an embed takes only vertical-first or vertical-last shapes', () => {
    const a = bar('a', 0, 100, 60);
    const b = bar('b', 2, 260, 60);
    const embed = a.end({ x: 130, y: 30 });
    for (const c of routeCandidates(embed, b.end(b.start), 0, 2, VIEW)) {
      expect(['V', 'VH', 'VHV']).toContain(c.shape);
    }
  });

  it('a milestone is left by its centre for a vertical and by its side for a horizontal', () => {
    const m = bar('m', 0, 93, 14, 'FINISH_MILESTONE');
    const b = bar('b', 1, 200, 60);
    const end = m.end(m.finish);
    const got = routeCandidates(end, b.end(b.start), 0, 1, VIEW);
    const vh = got.find((c) => c.shape === 'VH')!;
    expect(vh.line[0]).toEqual(portFor(end, 'V')!.point);
    const hv = got.find((c) => c.shape === 'HV')!;
    expect(hv.line[0]).toEqual(portFor(end, 'H')!.point);
  });

  it('non-adjacent lanes offer the two gutters nearest each end', () => {
    const a = bar('a', 0, 100, 60);
    const b = bar('b', 4, 300, 60);
    const vhv = routeCandidates(a.end(a.finish), b.end(b.start), 0, 4, VIEW).filter(
      (c) => c.shape === 'VHV',
    );
    expect(vhv.map((c) => c.line[1]!.y)).toEqual([gutterBelow(0, VIEW), gutterBelow(3, VIEW)]);
  });

  it('every candidate obeys both ports and there are never more than eleven', () => {
    let rng = 7;
    const rand = (n: number): number => {
      rng = (rng * 1103515245 + 12345) % 2147483648;
      return rng % n;
    };
    const kinds = ['TASK', 'START_MILESTONE', 'FINISH_MILESTONE', 'LEVEL_OF_EFFORT'] as const;
    let checked = 0;
    for (let i = 0; i < 2000; i += 1) {
      const la = rand(5);
      const lb = rand(5);
      const a = bar('a', la, rand(400), 14 + rand(120), kinds[rand(4)]);
      let bx = rand(600);
      if (la === lb) bx = a.rect.x + a.rect.w + rand(200); // one lane cannot hold two overlapping bars
      const b = bar('b', lb, bx, 14 + rand(120), kinds[rand(4)]);
      const ends: [Point, Point][] = [
        [a.finish, b.start],
        [a.start, b.start],
        [a.finish, b.finish],
        [a.start, b.finish],
        [{ x: a.rect.x + a.rect.w / 2, y: a.start.y }, b.start],
      ];
      for (const [p, s] of ends) {
        const pred = a.end(p);
        const succ = b.end(s);
        const got = routeCandidates(pred, succ, la, lb, VIEW);
        expect(got.length).toBeLessThanOrEqual(MAX_ROUTE_CANDIDATES);
        for (const c of got) {
          const pp = c.shape === 'VH' || c.shape === 'V' || c.shape === 'VHV' ? 'V' : 'H';
          const sp = c.shape === 'HV' || c.shape === 'V' || c.shape === 'VHV' ? 'V' : 'H';
          expect(obeysPorts(c.line, portFor(pred, pp)!, portFor(succ, sp)!)).toBe(true);
        }
        // Never empty unless the two ends are one point (abutting bars sharing a node).
        const coincide = Math.hypot(p.x - s.x, p.y - s.y) <= 0.5;
        if (!coincide) {
          expect(got.length, `${la}:${lb} ${JSON.stringify([p, s])}`).toBeGreaterThan(0);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(9000);
  });
});

describe('obeysPorts', () => {
  const a = bar('a', 0, 100, 60);
  const b = bar('b', 1, 260, 60);
  const pred = portFor(a.end(a.finish), 'V')!;
  const succH = portFor(b.end(b.start), 'H')!;

  it('rejects a bend inside the predecessor disc: today’s 4–12 px elbow', () => {
    const line = [a.finish, { x: 168, y: 30 }, { x: 168, y: 90 }, b.start];
    expect(obeysPorts(line, portFor(a.end(a.finish), 'H')!, succH)).toBe(false);
  });

  it('rejects an arrival from the wrong side of a start node', () => {
    const line = [a.finish, { x: 160, y: 90 }, { x: 300, y: 90 }, { x: 260, y: 90 }];
    expect(obeysPorts(line, pred, succH)).toBe(false);
  });

  it('accepts a straight line whatever its length', () => {
    expect(obeysPorts([a.finish, { x: 165, y: 30 }], portFor(a.end(a.finish), 'H')!, succH)).toBe(
      true,
    );
  });
});
