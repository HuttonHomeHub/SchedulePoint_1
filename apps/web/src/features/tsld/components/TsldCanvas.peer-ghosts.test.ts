import { describe, expect, it } from 'vitest';

import type { GestureState } from '../interaction/gesture-machine';
import { activityRect, LANE_HEIGHT, type RenderActivity } from '../render/render-model';
import type { Viewport } from '../render/render-model';

import { livePeerGhostRects } from './TsldCanvas';

/**
 * **`livePeerGhostRects` — the plural drag's preview half** (`docs/TECH_DEBT.md` #108).
 *
 * The write path has moved every selected activity by the grabbed bar's delta since the #108
 * narrowing; the PREVIEW still showed one ghost, so the other bars jumped on release. These pin
 * the pure derivation: each peer's own rect shifted by the live day/lane delta in pixels — the
 * same per-activity delta `bulkMoveSnapshots` writes — and null in every state where the painter
 * must add not one call (the parity/draw-budget contract).
 *
 * **Verified red** against the pre-#108 tree trivially — the function did not exist — so the
 * meaningful red check is the painter's (`paint.test.ts`, the peers case, verified red against
 * the peers-less painter).
 */
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const DATA_DATE = '2026-01-05';

const act = (id: string, laneIndex: number, startIso: string, finishIso: string): RenderActivity =>
  ({
    id,
    name: id,
    label: id,
    laneIndex,
    earlyStart: startIso,
    earlyFinish: finishIso,
    type: 'TASK',
  }) as never;

const A = act('a', 0, '2026-01-05', '2026-01-09');
const B = act('b', 2, '2026-01-07', '2026-01-12');
const C = act('c', 5, '2026-01-05', '2026-01-06');
const byId = new Map([A, B, C].map((a) => [a.id, a]));
const lookup = (id: string) => byId.get(id);

const dragging = (
  over: Partial<Extract<GestureState, { kind: 'repositioning' }>>,
): GestureState => ({
  kind: 'repositioning',
  activityId: 'a',
  grabDay: 0,
  grabX: 0,
  grabY: 0,
  movedPastThreshold: true,
  originStartDay: 0,
  spanDays: 4,
  laneIndex: 0,
  currentStartDay: 3,
  currentLaneIndex: 1,
  ...over,
});

describe('livePeerGhostRects', () => {
  it('is null outside a plural reposition — idle, single selection, or a drag of an unselected bar', () => {
    expect(livePeerGhostRects({ kind: 'idle' }, ['a', 'b'], lookup, VIEW, DATA_DATE)).toBeNull();
    expect(livePeerGhostRects(dragging({}), ['a'], lookup, VIEW, DATA_DATE)).toBeNull();
    // The dragged bar is not part of the selection: a plain drag beside a selection moves one
    // bar, so previewing the selection would promise a move the release will not make.
    expect(livePeerGhostRects(dragging({}), ['b', 'c'], lookup, VIEW, DATA_DATE)).toBeNull();
  });

  it('shifts each peer by the live day/lane delta and excludes the grabbed bar', () => {
    const rects = livePeerGhostRects(dragging({}), ['a', 'b', 'c'], lookup, VIEW, DATA_DATE);
    expect(rects).toHaveLength(2);
    const [b, c] = [activityRect(B, VIEW, DATA_DATE)!, activityRect(C, VIEW, DATA_DATE)!];
    // +3 days at 10 px/day, +1 lane.
    expect(rects![0]).toEqual({ x: b.x + 30, y: b.y + LANE_HEIGHT, w: b.w, h: b.h });
    expect(rects![1]).toEqual({ x: c.x + 30, y: c.y + LANE_HEIGHT, w: c.w, h: c.h });
  });

  it('skips a selected id with no drawn activity rather than inventing a rect', () => {
    const rects = livePeerGhostRects(dragging({}), ['a', 'b', 'gone'], lookup, VIEW, DATA_DATE);
    expect(rects).toHaveLength(1);
  });
});
