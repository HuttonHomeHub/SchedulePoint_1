import { describe, expect, it } from 'vitest';

import { CHEVRON_HALF_W_PX } from './link-marks';
import { predecessorStub, type LinkDir, type LinkEnd, type LinkEndKind } from './link-ports';
import { ARROWHEAD_HALF_W_PX } from './link-routing';
import type { GlyphIndex } from './link-score';
import {
  PORT_OFFSET_PX,
  portOffsetBounds,
  splitResidueTracks,
  WIDEST_LINK_STROKE_PX,
  type TrackLink,
  type TrackNode,
} from './link-tracks';
import {
  NODE_RADIUS,
  NODE_REACH_PX,
  NODE_RIM_MAX_W,
  type Point,
  type Viewport,
} from './render-model';
import { textIndexOf } from './text-index';

/**
 * **Two-way tracks** (links-and-labels M3, `docs/TECH_DEBT.md` #394, spec §4.7). Lanes are 60 px
 * with the origin at 0, so lane centres sit at y 30, 90, 150 and 210. Every scene joins nodes at x
 * 100 (and 200), and every case names the rule it pins.
 */
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const NO_GLYPHS: GlyphIndex = new Map();

const ALLOWED: Record<LinkEndKind, LinkDir[]> = {
  'start-node': ['W', 'N', 'S'],
  'finish-node': ['E', 'N', 'S'],
  embed: ['N', 'S'],
  milestone: ['N', 'S', 'E', 'W'],
  'span-start': ['W'],
  'span-finish': ['E'],
};

function end(kind: LinkEndKind, point: Point): LinkEnd {
  return { kind, ports: [{ point, allowed: new Set(ALLOWED[kind]), reach: NODE_REACH_PX }] };
}

let seq = 0;
/** A link along `line`, joining a node of `predKind` at its first point to `succKind` at its last. */
function link(
  line: Point[],
  predKind: LinkEndKind = 'finish-node',
  succKind: LinkEndKind = 'start-node',
): TrackLink {
  seq += 1;
  return {
    line,
    pred: end(predKind, line[0]!),
    succ: end(succKind, line.at(-1)!),
    own: [],
    endIds: [`p${seq}`, `s${seq}`],
  };
}

const nodesOf = (links: readonly TrackLink[]): TrackNode[] =>
  links.flatMap((l) => [
    { id: l.endIds[0], point: l.line[0]! },
    { id: l.endIds[1], point: l.line.at(-1)! },
  ]);

const xs = (line: readonly Point[]): number[] => line.map((p) => p.x);

/** Two straight links on one vertical, one each way, joining nodes at y 90 and y 210. */
const straightPair = (): [TrackLink, TrackLink] => [
  link([
    { x: 100, y: 210 },
    { x: 100, y: 90 },
  ]),
  link([
    { x: 100, y: 90 },
    { x: 100, y: 210 },
  ]),
];

describe('the port offset', () => {
  it('sits inside the window its bounds derive from the constants they are about', () => {
    const { lower, upper } = portOffsetBounds();
    expect(lower).toBe((ARROWHEAD_HALF_W_PX + CHEVRON_HALF_W_PX + 1) / 2);
    expect(upper).toBe(NODE_RADIUS - NODE_RIM_MAX_W / 2 - WIDEST_LINK_STROKE_PX / 2);
    // Not vacuous: the window is open, and the offset is a whole pixel inside it.
    expect(lower).toBeLessThan(upper);
    expect(PORT_OFFSET_PX).toBeGreaterThanOrEqual(lower);
    expect(PORT_OFFSET_PX).toBeLessThanOrEqual(upper);
    expect(Number.isInteger(PORT_OFFSET_PX)).toBe(true);
  });
});

describe('splitResidueTracks', () => {
  it('draws a two-way track as two lines, taking the side that crosses nothing', () => {
    // `into` arrives from the west along y 150 and up into the node; `out` leaves it downwards.
    // Moving `out` west would put its vertical across `into`'s horizontal, so the track goes east.
    const into = link([
      { x: 0, y: 150 },
      { x: 100, y: 150 },
      { x: 100, y: 90 },
    ]);
    const out = link([
      { x: 100, y: 90 },
      { x: 100, y: 210 },
      { x: 160, y: 210 },
    ]);
    const got = splitResidueTracks([into, out], NO_GLYPHS, null, VIEW, nodesOf([into, out]));
    expect(got.split).toBe(1);
    expect(got.segments).toBe(2);
    expect(xs(got.lines[0]!)).toEqual([0, 96, 96]);
    expect(xs(got.lines[1]!)).toEqual([104, 104, 160]);
    // Both still end at the node, PORT_OFFSET_PX from its centre (CQ-2).
    expect(Math.hypot(got.lines[0]!.at(-1)!.x - 100, got.lines[0]!.at(-1)!.y - 90)).toBe(
      PORT_OFFSET_PX,
    );
    // The input is not mutated.
    expect(xs(into.line)).toEqual([0, 100, 100]);
  });

  it('breaks a tie by moving the down-travelling line west, whatever order the links arrive in', () => {
    const [up, down] = straightPair();
    const nodes = nodesOf([up, down]);
    const got = splitResidueTracks([up, down], NO_GLYPHS, null, VIEW, nodes);
    expect(xs(got.lines[0]!)).toEqual([104, 104]);
    expect(xs(got.lines[1]!)).toEqual([96, 96]);
    const reversed = splitResidueTracks([down, up], NO_GLYPHS, null, VIEW, nodes);
    expect(reversed.lines).toEqual([got.lines[1], got.lines[0]]);
  });

  it('keeps a V link on one side at both ends', () => {
    // `v` leaves the node at (100, 90) downwards and arrives at (200, 210) downwards; `p` and `q`
    // travel up each of those verticals. Both tracks tie, so both move `v` west: one side, both ends.
    const v = link([
      { x: 100, y: 90 },
      { x: 100, y: 150 },
      { x: 200, y: 150 },
      { x: 200, y: 210 },
    ]);
    const p = link([
      { x: 100, y: 150 },
      { x: 100, y: 90 },
    ]);
    const q = link([
      { x: 200, y: 210 },
      { x: 200, y: 150 },
    ]);
    const got = splitResidueTracks([v, p, q], NO_GLYPHS, null, VIEW, nodesOf([v, p, q]));
    expect(got.split).toBe(2);
    expect(xs(got.lines[0]!)).toEqual([96, 96, 196, 196]);
    expect(xs(got.lines[1]!)).toEqual([104, 104]);
    expect(xs(got.lines[2]!)).toEqual([204, 204]);
  });

  it('returns every line untouched, by identity, where no track carries an opposed pair', () => {
    // A same-direction bus: both links travel down the one vertical, so it stays one stroke.
    const a = link([
      { x: 100, y: 90 },
      { x: 100, y: 210 },
    ]);
    const b = link([
      { x: 100, y: 90 },
      { x: 100, y: 150 },
      { x: 160, y: 150 },
    ]);
    const got = splitResidueTracks([a, b], NO_GLYPHS, null, VIEW, nodesOf([a, b]));
    expect(got.split).toBe(0);
    expect(got.refused).toEqual({});
    expect(got.lines[0]).toBe(a.line);
    expect(got.lines[1]).toBe(b.line);
  });

  it('leaves a track alone where an end is not a task node, whose disc absorbs the offset', () => {
    const [up, down] = straightPair();
    const embedded: TrackLink = { ...up, succ: end('embed', up.line.at(-1)!) };
    const got = splitResidueTracks([embedded, down], NO_GLYPHS, null, VIEW, nodesOf([up, down]));
    expect(got.split).toBe(0);
    expect(got.refused).toEqual({ 'not-absorbable': 1 });
    expect(got.lines[0]).toBe(embedded.line);
  });

  describe('each guard refuses the move it exists for', () => {
    it('ports: a stub the move would shorten below the stub rule', () => {
      // `into`'s first segment is exactly the predecessor stub, so the east side (which moves it
      // west) fails the stub rule; `out`'s last segment likewise fails the west side.
      const stub = predecessorStub(NODE_REACH_PX);
      const into = link([
        { x: 100 - stub, y: 150 },
        { x: 100, y: 150 },
        { x: 100, y: 90 },
      ]);
      const out = link(
        [
          { x: 100, y: 90 },
          { x: 100, y: 210 },
          { x: 100 - stub, y: 210 },
        ],
        'finish-node',
        'finish-node',
      );
      const got = splitResidueTracks([into, out], NO_GLYPHS, null, VIEW, nodesOf([into, out]));
      expect(got.split).toBe(0);
      expect(got.refused).toEqual({ ports: 1 });
    });

    it('obstruction: a side that would put a vertical through a bar', () => {
      // A bar in lane 2 (centre y 150) whose ends sit just clear of x 100 on both sides: either
      // offset puts one of the two verticals through it.
      const glyphs: GlyphIndex = new Map([
        [
          2,
          {
            spans: [
              [40, 97],
              [103, 200],
            ],
            maxLen: 97,
          },
        ],
      ]);
      const [up, down] = straightPair();
      const got = splitResidueTracks([up, down], glyphs, null, VIEW, nodesOf([up, down]));
      expect(got.split).toBe(0);
      expect(got.refused).toEqual({ obstruction: 1 });
    });

    it('node: a side that would bring a line within reach of a neighbour’s node', () => {
      const [up, down] = straightPair();
      const clear = NODE_REACH_PX + 1;
      const nodes = [
        ...nodesOf([up, down]),
        { id: 'west', point: { x: 100 - clear, y: 150 } },
        { id: 'east', point: { x: 100 + clear, y: 150 } },
      ];
      const got = splitResidueTracks([up, down], NO_GLYPHS, null, VIEW, nodes);
      expect(got.split).toBe(0);
      expect(got.refused).toEqual({ node: 1 });
    });

    it('text: a side that would put a line through a name', () => {
      const [up, down] = straightPair();
      const box = (x: number) => ({
        activityId: `t${x}`,
        lane: 2,
        kind: 'name' as const,
        text: 'x',
        x,
        y: 150,
        align: 'left' as const,
        font: '11px sans-serif',
        width: 4,
        ink: { x, y: 140, w: 4, h: 20 },
        line: { x, y: 140, w: 4, h: 20 },
      });
      const text = textIndexOf([box(94), box(102)]);
      const got = splitResidueTracks([up, down], NO_GLYPHS, text, VIEW, nodesOf([up, down]));
      expect(got.split).toBe(0);
      expect(got.refused).toEqual({ text: 1 });
    });

    it('crossing: a side that would cross a line the track did not', () => {
      const [up, down] = straightPair();
      // Horizontals either side of x 100 that stop 1 px short of it.
      const west = link([
        { x: 20, y: 150 },
        { x: 99, y: 150 },
      ]);
      const east = link([
        { x: 101, y: 150 },
        { x: 180, y: 150 },
      ]);
      const all = [up, down, west, east];
      const got = splitResidueTracks(all, NO_GLYPHS, null, VIEW, nodesOf([up, down]));
      expect(got.split).toBe(0);
      expect(got.refused).toEqual({ crossing: 1 });
    });

    it('occupied: a side that would land a line on another line’s vertical', () => {
      const [up, down] = straightPair();
      const west = link([
        { x: 96, y: 30 },
        { x: 96, y: 270 },
      ]);
      const east = link([
        { x: 104, y: 30 },
        { x: 104, y: 270 },
      ]);
      const got = splitResidueTracks([up, down, west, east], NO_GLYPHS, null, VIEW, []);
      expect(got.split).toBe(0);
      expect(got.refused).toEqual({ occupied: 1 });
    });
  });
});
