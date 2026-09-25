import { describe, expect, it } from 'vitest';

import {
  chooseRoutesByCrossing,
  glyphIndex,
  isLaneCentre,
  routeNodeToNode,
  routeNodeToNodeParts,
  textCrossings,
  toScored,
  type FrameLink,
  type LinkRouteInput,
  type Phase1Score,
} from './link-score';
import type { PlateRoom } from './plate-room';
import {
  activityRect,
  LANE_HEIGHT,
  type Point,
  type RenderActivity,
  type Viewport,
} from './render-model';
import type { PlacedText } from './row-text-layout';
import { textIndexOf, type TextIndex } from './text-index';

/**
 * **The text term and the plate sub-term** (links-and-labels M2, spec D-1 and D-5): where they rank,
 * and what they may never be bought with. Every case names the rule it pins.
 */
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const DATA_DATE = '2026-01-01';
const laneCentre = (y: number): boolean => isLaneCentre(y, VIEW);
const centre = (lane: number): number => lane * LANE_HEIGHT + LANE_HEIGHT / 2;

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

/** A name in `lane`, its ink box `[x, x + w]` wide, a few px above the lane centre. */
function name(lane: number, x: number, w: number): PlacedText {
  const y = centre(lane) - 12;
  return {
    activityId: `${lane}:${x}`,
    lane,
    kind: 'name',
    text: 'x',
    x,
    y,
    align: 'left',
    font: '11px sans-serif',
    width: w,
    ink: { x, y: y - 5.5, w, h: 11 },
    line: { x, y: y - 8, w, h: 16 },
  };
}

/** A link from literal lines with literal phase-1 scores; the first is phase 1's pick. */
const link = (
  lines: { line: Point[]; score?: Partial<Phase1Score>; escape?: true }[],
): FrameLink => ({
  candidates: lines.map((l, order) => {
    const scored = toScored(
      { shape: 'VHV', line: l.line, order },
      { obstructions: 0, length: 100 + order, bends: 1, order, ...l.score },
    );
    return l.escape ? { ...scored, escape: true as const } : scored;
  }),
  ends: [lines[0]!.line[0]!, lines[0]!.line.at(-1)!],
});

describe('phase 1: text breaks the ties the terms above it leave', () => {
  it('moves a link off a name when an equally clear shape exists', () => {
    const a = task('a', 0, '2026-01-01', '2026-01-04');
    const b = task('b', 2, '2026-01-12', '2026-01-16');
    const glyphs = glyphIndex([a, b], VIEW, DATA_DATE);
    const blind = routeNodeToNode(fs(a, b), glyphs, VIEW, null);
    // Put a name across the text-blind pick's crossing of lane 1, wherever that pick is.
    const pick = blind[0]!.line;
    const vertical = pick.findIndex(
      (p, i) =>
        i > 0 &&
        p.x === pick[i - 1]!.x &&
        Math.min(p.y, pick[i - 1]!.y) < centre(1) &&
        Math.max(p.y, pick[i - 1]!.y) > centre(1),
    );
    expect(vertical).toBeGreaterThan(0);
    const text: TextIndex = textIndexOf([name(1, pick[vertical]!.x - 10, 20)]);
    expect(textCrossings(pick, text, VIEW)).toBe(1);

    const got = routeNodeToNode(fs(a, b), glyphs, VIEW, text);
    expect(got[0]!.phase1.text).toBe(0);
    expect(got[0]!.phase1.obstructions).toBe(blind[0]!.phase1.obstructions);
    expect(got[0]!.line).not.toEqual(pick);
  });

  /**
   * The reading that found it: on Unit 300 the text term swapped a vertical through a bar for a run
   * hidden behind one, because `obstructions` counts both as one. A hidden run ranks above text.
   */
  it('never buys a name with a run hidden behind a bar', () => {
    // `a` ends where `c` begins in lane 2, so a line leaving `a` east along its lane runs behind
    // `c`. `d` and `e` in lane 1 put a bar under both verticals a clear shape needs, so every shape
    // through the fewest bars either hides a run behind `c` or crosses lane 1 where a name sits.
    const a = task('a', 2, '2026-01-01', '2026-01-04');
    const c = task('c', 2, '2026-01-06', '2026-01-10');
    const d = task('d', 1, '2026-01-03', '2026-01-07');
    const e = task('e', 1, '2026-01-12', '2026-01-15');
    const b = task('b', 0, '2026-01-14', '2026-01-18');
    const glyphs = glyphIndex([a, b, c, d, e], VIEW, DATA_DATE);
    const text = textIndexOf([name(1, 30, 20), name(1, 120, 20)]);
    const all = routeNodeToNode(fs(a, b), glyphs, VIEW, text);
    const fewest = Math.min(...all.map((cand) => cand.phase1.obstructions));
    const best = all.filter((cand) => cand.phase1.obstructions === fewest && !cand.escape);
    // Not vacuous: at the fewest bars, every shape with no hidden run crosses a name, and a shape
    // with a hidden run crosses none — so text alone would pick the hidden run.
    const clear = best.filter((cand) => (cand.phase1.hiddenLegs ?? 0) === 0);
    const hidden = best.filter((cand) => (cand.phase1.hiddenLegs ?? 0) > 0);
    expect(clear.length).toBeGreaterThan(0);
    expect(clear.every((cand) => (cand.phase1.text ?? 0) > 0)).toBe(true);
    expect(hidden.some((cand) => (cand.phase1.text ?? 0) === 0)).toBe(true);

    expect(all[0]!.phase1.obstructions).toBe(fewest);
    expect(all[0]!.phase1.hiddenLegs ?? 0).toBe(0);
  });
});

describe('phase 2: text is never bought with a crossing, an overlap or a hidden run', () => {
  // `one`'s pick crosses `two`'s vertical (x 50, y 90..210); its alternative does not.
  const onePick = [
    { x: 0, y: 30 },
    { x: 0, y: 150 },
    { x: 100, y: 150 },
  ];
  const oneAlt = [
    { x: 0, y: 30 },
    { x: 100, y: 30 },
    { x: 100, y: 150 },
  ];
  const twoPick = [
    { x: 50, y: 90 },
    { x: 50, y: 210 },
    { x: 70, y: 210 },
  ];

  it('still removes a crossing when the only shape that does so runs through a name', () => {
    const one = link([{ line: onePick }, { line: oneAlt, score: { text: 2 } }]);
    const two = link([{ line: twoPick }]);
    expect(chooseRoutesByCrossing([one, two], laneCentre)[0]).toEqual(oneAlt);
  });

  it('does not move a link onto a run hidden behind a bar to remove a crossing', () => {
    const one = link([{ line: onePick }, { line: oneAlt, score: { hiddenLegs: 1 } }]);
    const two = link([{ line: twoPick }]);
    expect(chooseRoutesByCrossing([one, two], laneCentre)[0]).toEqual(onePick);
  });

  it('returns a pick with no crossing and no overlap unexamined, whatever the escapes carry', () => {
    // Phase 1 already made this pick the best on text among the ordinary shapes; the escapes are
    // not consulted by the early exit, before this epic or after it.
    const one = link([
      { line: oneAlt, score: { text: 1 } },
      { line: onePick, score: { text: 0 }, escape: true },
    ]);
    expect(chooseRoutesByCrossing([one], laneCentre)[0]).toEqual(oneAlt);
  });
});

describe('phase 3: an opposed pair is never kept to spare a name', () => {
  // A node at (100, 90). `into` arrives up its vertical from below; `out` leaves down it.
  const NODE = { x: 100, y: 90 };
  const intoFromBelow = [{ x: 0, y: 150 }, { x: 100, y: 150 }, NODE];
  const intoFromEast = [{ x: 0, y: 150 }, { x: 120, y: 150 }, { x: 120, y: 90 }, NODE];
  const outDown = [NODE, { x: 100, y: 210 }, { x: 110, y: 210 }];

  it('moves the arrival off the opposed track even through a name', () => {
    const into = link([
      { line: intoFromBelow },
      { line: intoFromEast, score: { text: 3 }, escape: true },
    ]);
    const out = link([{ line: outDown }]);
    expect(chooseRoutesByCrossing([into, out], laneCentre)).toEqual([intoFromEast, outDown]);
  });
});

describe('the plate sub-term (spec D-5)', () => {
  it('prefers the shape that leaves its lag plate room', () => {
    const a = task('a', 0, '2026-01-01', '2026-01-04');
    const b = task('b', 2, '2026-01-12', '2026-01-16');
    const glyphs = glyphIndex([a, b], VIEW, DATA_DATE);
    const blind = routeNodeToNode(fs(a, b), glyphs, VIEW, null);
    // A room with space on every line but the text-blind pick's. `routeNodeToNodeParts` builds
    // fresh lines, so lines are compared by their points.
    const refuse = blind[0]!.line;
    const same = (p: readonly Point[], q: readonly Point[]): boolean =>
      p.length === q.length && p.every((pt, i) => pt.x === q[i]!.x && pt.y === q[i]!.y);
    const room: PlateRoom = { hasRoom: (line) => !same(line, refuse) };
    const got = routeNodeToNodeParts(fs(a, b), glyphs, VIEW, null, { room, width: 30 }).candidates;
    expect(got[0]!.phase1.plateBlocked).toBe(0);
    expect(same(got[0]!.line, refuse)).toBe(false);
    expect(got[0]!.phase1.obstructions).toBe(blind[0]!.phase1.obstructions);
    // A link with no lag is not scored at all: the pick is the text-blind one.
    expect(same(routeNodeToNode(fs(a, b), glyphs, VIEW, null)[0]!.line, refuse)).toBe(true);
  });
});
