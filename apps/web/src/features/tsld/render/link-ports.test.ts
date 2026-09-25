import { describe, expect, it } from 'vitest';

import {
  EMBED_REACH_PX,
  linkEndOf,
  OPPOSITE_DIR,
  portFor,
  predecessorStub,
  successorStub,
  type LinkDir,
} from './link-ports';
import { ATTACH_DOT_R } from './paint';
import {
  ARROWHEAD_ROUTED_PX,
  LINK_ELBOW_RADIUS,
  MILESTONE_RADIUS,
  NODE_REACH_PX,
  type Rect,
  type RenderActivity,
} from './render-model';

/**
 * **The port table** (node-to-node links spec §4.1). Every row of the table in `link-ports.ts`'s
 * docblock has a case here, so the table and the code cannot disagree without a failure.
 */
function activity(type: RenderActivity['type']): RenderActivity {
  return {
    id: type,
    type,
    laneIndex: 0,
    label: type,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
  };
}

const RECT: Rect = { x: 100, y: 27, w: 50, h: 6 };
const LEFT = { x: 100, y: 30 };
const RIGHT = { x: 150, y: 30 };
const MID = { x: 120, y: 30 };

const dirs = (set: ReadonlySet<LinkDir>): LinkDir[] => [...set].sort();

describe('linkEndOf', () => {
  it('a task bar has a start node leaving W, N or S and a finish node leaving E, N or S', () => {
    const start = linkEndOf(activity('TASK'), LEFT, RECT);
    expect(start.kind).toBe('start-node');
    expect(dirs(start.ports[0]!.allowed)).toEqual(['N', 'S', 'W']);
    expect(start.ports[0]!.reach).toBe(NODE_REACH_PX);
    const finish = linkEndOf(activity('TASK'), RIGHT, RECT);
    expect(finish.kind).toBe('finish-node');
    expect(dirs(finish.ports[0]!.allowed)).toEqual(['E', 'N', 'S']);
    expect(finish.ports[0]!.reach).toBe(NODE_REACH_PX);
  });

  it('an anchor strictly inside a bar is an embed, which only a vertical may use', () => {
    const embed = linkEndOf(activity('TASK'), MID, RECT);
    expect(embed.kind).toBe('embed');
    expect(dirs(embed.ports[0]!.allowed)).toEqual(['N', 'S']);
    expect(embed.ports[0]!.reach).toBe(EMBED_REACH_PX);
  });

  it('a milestone offers its side anchor to a horizontal and its centre to a vertical', () => {
    const rect: Rect = { x: 93, y: 23, w: 14, h: 14 };
    const end = linkEndOf(activity('FINISH_MILESTONE'), { x: 107, y: 30 }, rect);
    expect(end.kind).toBe('milestone');
    const [side, centre] = end.ports;
    expect(dirs(side!.allowed)).toEqual(['E']);
    expect(side!.reach).toBe(0);
    expect(centre!.point).toEqual({ x: 100, y: 30 });
    expect(dirs(centre!.allowed)).toEqual(['N', 'S']);
    expect(centre!.reach).toBe(MILESTONE_RADIUS);
    const west = linkEndOf(activity('START_MILESTONE'), { x: 93, y: 30 }, rect);
    expect(dirs(west.ports[0]!.allowed)).toEqual(['W']);
    expect(portFor(end, 'H')).toBe(side);
    expect(portFor(end, 'V')).toBe(centre);
  });

  it('a span glyph (LOE, hammock, WBS summary) has node directions and no reach', () => {
    for (const type of ['LEVEL_OF_EFFORT', 'HAMMOCK', 'WBS_SUMMARY'] as const) {
      const start = linkEndOf(activity(type), LEFT, RECT);
      expect(start.kind).toBe('span-start');
      expect(dirs(start.ports[0]!.allowed)).toEqual(['N', 'S', 'W']);
      expect(start.ports[0]!.reach).toBe(0);
      const finish = linkEndOf(activity(type), RIGHT, RECT);
      expect(finish.kind).toBe('span-finish');
      expect(dirs(finish.ports[0]!.allowed)).toEqual(['E', 'N', 'S']);
      expect(linkEndOf(activity(type), MID, RECT).kind).toBe('embed');
    }
  });

  it('a node takes both orientations and an embed only the vertical', () => {
    const start = linkEndOf(activity('TASK'), LEFT, RECT);
    expect(portFor(start, 'H')).not.toBeNull();
    expect(portFor(start, 'V')).not.toBeNull();
    const embed = linkEndOf(activity('TASK'), MID, RECT);
    expect(portFor(embed, 'H')).toBeNull();
    expect(portFor(embed, 'V')).not.toBeNull();
  });
});

describe('the stub rule', () => {
  it('is derived from the elbow radius and the arrowhead, never tuned', () => {
    expect(predecessorStub(NODE_REACH_PX)).toBe(NODE_REACH_PX + LINK_ELBOW_RADIUS);
    expect(successorStub(NODE_REACH_PX)).toBe(NODE_REACH_PX + ARROWHEAD_ROUTED_PX);
    expect(predecessorStub(NODE_REACH_PX)).toBe(14);
    expect(successorStub(NODE_REACH_PX)).toBe(17);
  });

  it('OPPOSITE_DIR is an involution', () => {
    for (const d of ['E', 'W', 'N', 'S'] as const) expect(OPPOSITE_DIR[OPPOSITE_DIR[d]]).toBe(d);
  });
});

it('an embed covers exactly the dot the painter draws for it', () => {
  // `link-ports.ts` cannot import `paint.ts` (paint imports the router), so the two are pinned here.
  expect(EMBED_REACH_PX).toBe(ATTACH_DOT_R);
});
