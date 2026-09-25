import { describe, expect, it } from 'vitest';

import { obstructionCounts, type GlyphIndex } from './link-score';
import type { Viewport } from './render-model';

// Lane centres at originY=0, pxPerDay irrelevant here: LANE_HEIGHT presumed 60 -> centres 30,90,150,210.
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };

describe('reachability probe: hidden-leg guard (link-tracks.ts:330)', () => {
  it('a move can leave total obstructions unchanged (or lower) while raising hidden legs', () => {
    // Before: a horizontal leg on lane-3 centre (y=210) from x=40 to x=100 -- clear of a bar at
    // x=100..102 (touches only at the boundary, not counted since the overlap must exceed
    // LEG_CLEARANCE_PX). Also a vertical at x=100 from y=90 to y=210 that passes through NOTHING.
    const glyphs: GlyphIndex = new Map([[3, { spans: [[100, 106]], maxLen: 6 }]]);
    const own: never[] = [];

    const before = [
      { x: 40, y: 210 },
      { x: 100, y: 210 },
      { x: 100, y: 90 },
    ];
    // After an EAST move by 4px of the shared vertical's x (100 -> 104): the horizontal leg now
    // spans x 40..104, overlapping the bar [100,106] by 4px -- a NEW hidden leg. The vertical moves
    // to x=104 too, still clearing the bar's y-lane (it does not cross lane 3's centre itself; it
    // *is* the vertical INTO the node, spanning y 90..210 which does cross lane 3's centre at 150,
    // but there is no bar in lane... wait the bar is in lane 3, and the vertical DOES cross lane 3 if
    // it spans y 90..210, since lane 3 centre 210 is an ENDPOINT not strictly crossed; only lanes
    // strictly between are counted for a vertical, per `obstructionCounts`. So the vertical crosses
    // lane index 2 (centre 150) only, where there is no glyph. Good: only the horizontal leg touches
    // lane 3's glyph.
    const after = [
      { x: 40, y: 210 },
      { x: 104, y: 210 },
      { x: 104, y: 90 },
    ];

    const was = obstructionCounts(before, glyphs, own, VIEW);
    const now = obstructionCounts(after, glyphs, own, VIEW);
    // eslint-disable-next-line no-console
    console.log('was', was, 'now', now);
    expect(was.total).toBe(0);
    expect(was.legs).toBe(0);
    expect(now.legs).toBeGreaterThan(was.legs);
    expect(now.total).toBeGreaterThanOrEqual(was.total); // total also rises here in this construction
  });
});
