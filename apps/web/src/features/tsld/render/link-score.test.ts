import { describe, expect, it } from 'vitest';

import {
  chooseRoutesByCrossing,
  glyphIndex,
  isLaneCentre,
  obstructions,
  ownSpanOf,
  routeNodeToNode,
  toScored,
  type FrameLink,
  type LinkRouteInput,
} from './link-score';
import {
  activityRect,
  LANE_HEIGHT,
  NODE_REACH_PX,
  type Point,
  type RenderActivity,
  type Viewport,
} from './render-model';

/**
 * **Choosing a shape** (node-to-node links spec §4.3–§4.4). The two brief cases are the acceptance
 * cases: each must come out attached, i.e. leave and enter its nodes through an allowed side with a
 * visible bend.
 */
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const DATA_DATE = '2026-01-01';

function task(id: string, lane: number, start: string, finish: string): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex: lane,
    label: id,
    earlyStart: start,
    earlyFinish: finish,
    isCritical: false,
    isNearCritical: false,
  };
}

function fs(from: RenderActivity, to: RenderActivity): LinkRouteInput {
  const fromRect = activityRect(from, VIEW, DATA_DATE)!;
  const toRect = activityRect(to, VIEW, DATA_DATE)!;
  return {
    from,
    to,
    fromRect,
    toRect,
    fromAnchor: { x: fromRect.x + fromRect.w, y: fromRect.y + fromRect.h / 2 },
    toAnchor: { x: toRect.x, y: toRect.y + toRect.h / 2 },
  };
}

const centre = (lane: number): number => lane * LANE_HEIGHT + LANE_HEIGHT / 2;

describe('obstructions', () => {
  const blocker = task('x', 0, '2026-01-11', '2026-01-15');
  const glyphs = glyphIndex([blocker], VIEW, DATA_DATE);
  const rect = activityRect(blocker, VIEW, DATA_DATE)!;

  it('counts a horizontal through a foreign bar on its lane centre', () => {
    expect(
      obstructions(
        [
          { x: 0, y: centre(0) },
          { x: 400, y: centre(0) },
        ],
        glyphs,
        [],
        VIEW,
      ),
    ).toBe(1);
  });

  it('counts a node as part of its bar', () => {
    const justPast = rect.x + rect.w + NODE_REACH_PX - 2;
    const line = [
      { x: justPast, y: centre(0) },
      { x: 400, y: centre(0) },
    ];
    expect(obstructions(line, glyphs, [], VIEW)).toBe(1);
  });

  it('does not count the link’s own glyph', () => {
    const own = [ownSpanOf(blocker, rect)];
    expect(
      obstructions(
        [
          { x: 0, y: centre(0) },
          { x: 400, y: centre(0) },
        ],
        glyphs,
        own,
        VIEW,
      ),
    ).toBe(0);
  });

  it('counts a vertical that crosses a lane centre inside a glyph, and not a gutter run', () => {
    const x = rect.x + 5;
    expect(
      obstructions(
        [
          { x, y: centre(0) - 60 },
          { x, y: centre(0) + 60 },
        ],
        glyphs,
        [],
        VIEW,
      ),
    ).toBe(1);
    expect(
      obstructions(
        [
          { x: 0, y: 60 },
          { x: 400, y: 60 },
        ],
        glyphs,
        [],
        VIEW,
      ),
    ).toBe(0);
    // Ending exactly on the centre-line is an arrival, not a crossing.
    expect(
      obstructions(
        [
          { x, y: 0 },
          { x, y: centre(0) },
        ],
        glyphs,
        [],
        VIEW,
      ),
    ).toBe(0);
  });
});

describe('routeNodeToNode', () => {
  it('routes the brief’s Foundations → Frame case out of the finish node and into the start node', () => {
    const foundations = task('Foundations', 0, '2026-01-01', '2026-01-05');
    const frame = task('Frame', 1, '2026-01-09', '2026-01-15');
    const glyphs = glyphIndex([foundations, frame], VIEW, DATA_DATE);
    const best = routeNodeToNode(fs(foundations, frame), glyphs, VIEW)[0]!;
    expect(best.shape).toBe('VH');
    expect(best.phase1.obstructions).toBe(0);
  });

  it('steps round a bar in the successor’s lane rather than through it', () => {
    const a = task('a', 0, '2026-01-01', '2026-01-05');
    const inTheWay = task('way', 1, '2026-01-07', '2026-01-10');
    const b = task('b', 1, '2026-01-16', '2026-01-20');
    const glyphs = glyphIndex([a, inTheWay, b], VIEW, DATA_DATE);
    const scored = routeNodeToNode(fs(a, b), glyphs, VIEW);
    expect(scored[0]!.phase1.obstructions).toBe(0);
    expect(scored[0]!.shape).not.toBe('VH'); // the VH runs along lane 1 through `way`
    expect(scored.find((c) => c.shape === 'VH')!.phase1.obstructions).toBe(1);
  });

  it('falls back to the straight line only when the two anchors are one point', () => {
    const a = task('a', 0, '2026-01-01', '2026-01-05');
    const b = task('b', 0, '2026-01-06', '2026-01-10');
    const input = fs(a, b);
    expect(input.fromAnchor).toEqual(input.toAnchor);
    const got = routeNodeToNode(input, glyphIndex([a, b], VIEW, DATA_DATE), VIEW);
    expect(got).toHaveLength(1);
    expect(got[0]!.shape).toBe('fallback');
  });
});

describe('chooseRoutesByCrossing', () => {
  const laneCentre = (y: number): boolean => isLaneCentre(y, VIEW);

  function scene(): { links: FrameLink[]; ids: string[] } {
    // A fan and a crossing pair: enough that phase 1's picks cross and phase 2 has moves to find.
    const acts = [
      task('a', 0, '2026-01-01', '2026-01-04'),
      task('b', 2, '2026-01-02', '2026-01-06'),
      task('c', 1, '2026-01-12', '2026-01-16'),
      task('d', 3, '2026-01-14', '2026-01-18'),
      task('e', 4, '2026-01-20', '2026-01-24'),
      task('f', 0, '2026-01-22', '2026-01-26'),
    ];
    const byId = new Map(acts.map((a) => [a.id, a]));
    const pairs = [
      ['a', 'd'],
      ['b', 'c'],
      ['a', 'c'],
      ['b', 'e'],
      ['c', 'f'],
      ['d', 'f'],
      ['c', 'e'],
    ];
    const glyphs = glyphIndex(acts, VIEW, DATA_DATE);
    const links = pairs.map(([p, s]) => {
      const input = fs(byId.get(p!)!, byId.get(s!)!);
      return {
        candidates: routeNodeToNode(input, glyphs, VIEW),
        ends: [input.fromAnchor, input.toAnchor] as const,
      };
    });
    return { links, ids: pairs.map((p) => p.join('>')) };
  }

  /** A link from literal lines, phase 1 already ranked (index 0 is the pick). */
  const mk = (points: Point[][]): FrameLink => ({
    candidates: points.map((line, order) =>
      toScored(
        { shape: order === 0 ? 'VH' : 'HV', line, order },
        { obstructions: 0, length: 100, bends: 1, order },
      ),
    ),
    ends: [points[0]![0]!, points[0]!.at(-1)!],
  });

  /** Two links whose VH picks cross; each has an HV of the same length that does not. */
  function crossingPair(): [FrameLink, FrameLink] {
    const one = mk([
      [
        { x: 0, y: 30 },
        { x: 0, y: 150 },
        { x: 100, y: 150 },
      ],
      [
        { x: 0, y: 30 },
        { x: 100, y: 30 },
        { x: 100, y: 150 },
      ],
    ]);
    const two = mk([
      [
        { x: 50, y: 90 },
        { x: 50, y: 210 },
        { x: 70, y: 210 },
      ],
      [
        { x: 50, y: 90 },
        { x: 70, y: 90 },
        { x: 70, y: 210 },
      ],
    ]);
    return [one, two];
  }

  it('moves a link off its phase-1 pick only to strictly reduce crossings or overlaps', () => {
    const { links } = scene();
    const chosen = chooseRoutesByCrossing(links, laneCentre);
    expect(chosen).toHaveLength(links.length);
    chosen.forEach((line, i) => {
      const pick = links[i]!.candidates.find((c) => c.line === line)!;
      expect(pick).toBeDefined();
      expect(pick.phase1.obstructions).toBe(links[i]!.candidates[0]!.phase1.obstructions);
    });
  });

  it('leaves a lone link on its phase-1 pick', () => {
    const { links } = scene();
    expect(chooseRoutesByCrossing([links[0]!], laneCentre)).toEqual([
      links[0]!.candidates[0]!.line,
    ]);
  });

  it('removes a crossing that an equally short alternative avoids', () => {
    const [one, two] = crossingPair();
    // one's VH horizontal (y 150) crosses two's VH vertical (x 50, y 90..210).
    const chosen = chooseRoutesByCrossing([one, two], laneCentre);
    const crosses = (a: Point[], b: Point[]): boolean =>
      a.some(
        (p, i) =>
          i > 0 &&
          p.y === a[i - 1]!.y &&
          b.some(
            (q, j) =>
              j > 0 &&
              q.x === b[j - 1]!.x &&
              q.x > Math.min(p.x, a[i - 1]!.x) &&
              q.x < Math.max(p.x, a[i - 1]!.x) &&
              p.y > Math.min(q.y, b[j - 1]!.y) &&
              p.y < Math.max(q.y, b[j - 1]!.y),
          ),
      );
    expect(crosses(one.candidates[0]!.line, two.candidates[0]!.line)).toBe(true);
    expect(crosses(chosen[0]!, chosen[1]!) || crosses(chosen[1]!, chosen[0]!)).toBe(false);
  });

  it('gives every link the same line whatever order the links arrive in (FC-T5)', () => {
    const { links, ids } = scene();
    // Not vacuous: phase 2 moves at least one link in this scene, so order could matter.
    const moved = chooseRoutesByCrossing(links, laneCentre).filter(
      (line, i) => line !== links[i]!.candidates[0]!.line,
    );
    expect(moved.length).toBeGreaterThan(0);
    const reference = new Map(
      ids.map((id, i) => [id, chooseRoutesByCrossing(links, laneCentre)[i]]),
    );
    let seed = 11;
    for (let run = 0; run < 200; run += 1) {
      const order = ids.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i -= 1) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const j = seed % (i + 1);
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const chosen = chooseRoutesByCrossing(
        order.map((i) => links[i]!),
        laneCentre,
      );
      order.forEach((i, k) => expect(chosen[k]).toEqual(reference.get(ids[i]!)));
    }
    // The case a snapshot updated as it goes gets wrong: two links that cross, each with an
    // alternative that avoids the other's pick. Frozen, both move whichever comes first; updated as
    // it goes, whichever comes first moves and the second no longer has a reason to. (The frozen
    // pass's price is that the two alternatives cross each other: it never measures its own output.)
    const a = mk([
      [
        { x: 0, y: 30 },
        { x: 0, y: 150 },
        { x: 100, y: 150 },
      ],
      [
        { x: 0, y: 30 },
        { x: 100, y: 30 },
        { x: 100, y: 150 },
      ],
    ]);
    const b = mk([
      [
        { x: 50, y: 120 },
        { x: 50, y: 200 },
        { x: 80, y: 200 },
      ],
      [
        { x: 50, y: 120 },
        { x: 120, y: 120 },
        { x: 120, y: 200 },
        { x: 80, y: 200 },
      ],
    ]);
    const forward = chooseRoutesByCrossing([a, b], laneCentre);
    const backward = chooseRoutesByCrossing([b, a], laneCentre);
    expect(forward).toEqual([a.candidates[1]!.line, b.candidates[1]!.line]);
    expect(backward).toEqual([forward[1], forward[0]]);
  });
});
