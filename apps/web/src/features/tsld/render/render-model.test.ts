import type { ActivityType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  activityRect,
  clampPxPerDay,
  cull,
  dayAtScreenX,
  daysBetween,
  dependencyPolyline,
  hitTest,
  isMilestone,
  LANE_HEIGHT,
  MAX_PX_PER_DAY,
  MIN_PX_PER_DAY,
  pan,
  rectsIntersect,
  screenXOfDay,
  screenYOfLane,
  zoomAt,
  type RenderActivity,
  type Viewport,
} from './render-model';

const DATA_DATE = '2026-01-01';
const VIEW: Viewport = { pxPerDay: 10, originX: 100, originY: 50 };

function activity(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

describe('daysBetween', () => {
  it('counts whole calendar days, signed, UTC-exact across a month/leap boundary', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-01-06')).toBe(5);
    expect(daysBetween('2026-01-06', '2026-01-01')).toBe(-5);
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // 2028 is a leap year
  });
});

describe('screen transforms', () => {
  it('screenXOfDay and dayAtScreenX are inverses', () => {
    expect(screenXOfDay(0, VIEW)).toBe(100);
    expect(screenXOfDay(5, VIEW)).toBe(150);
    expect(dayAtScreenX(150, VIEW)).toBe(5);
    expect(dayAtScreenX(screenXOfDay(12.5, VIEW), VIEW)).toBeCloseTo(12.5);
  });

  it('screenYOfLane steps by the lane height', () => {
    expect(screenYOfLane(0, VIEW)).toBe(50);
    expect(screenYOfLane(3, VIEW)).toBe(50 + 3 * LANE_HEIGHT);
  });
});

describe('isMilestone', () => {
  it('is true only for the two milestone types', () => {
    const types: ActivityType[] = [
      'TASK',
      'START_MILESTONE',
      'FINISH_MILESTONE',
      'HAMMOCK',
      'LEVEL_OF_EFFORT',
    ];
    expect(types.filter(isMilestone)).toEqual(['START_MILESTONE', 'FINISH_MILESTONE']);
  });
});

describe('activityRect', () => {
  it('spans start..finish+1 day so a 1-day task is one column wide', () => {
    const oneDay = activityRect(activity({ earlyFinish: '2026-01-01' }), VIEW, DATA_DATE)!;
    expect(oneDay.x).toBe(100);
    expect(oneDay.w).toBe(10); // exactly one day column at pxPerDay=10
    const fiveDay = activityRect(activity(), VIEW, DATA_DATE)!;
    expect(fiveDay.w).toBe(50); // days 0..4 inclusive → 5 columns
  });

  it('returns null when the activity has no computed start', () => {
    expect(activityRect(activity({ earlyStart: null }), VIEW, DATA_DATE)).toBeNull();
  });

  it('places a milestone as a diamond bounding box centred on its day', () => {
    const rect = activityRect(
      activity({ type: 'FINISH_MILESTONE', earlyStart: '2026-01-03', earlyFinish: '2026-01-03' }),
      VIEW,
      DATA_DATE,
    )!;
    // Centre x = day 2 → screen 120; the box straddles it.
    expect(rect.x + rect.w / 2).toBeCloseTo(120);
    expect(rect.w).toBe(rect.h); // square bounding box
  });
});

describe('cull', () => {
  const size = { width: 300, height: 200 };
  it('keeps on-screen activities and drops off-screen ones', () => {
    const onScreen = activity({ id: 'on', earlyStart: '2026-01-02', earlyFinish: '2026-01-03' });
    const offRight = activity({ id: 'off', earlyStart: '2026-06-01', earlyFinish: '2026-06-02' });
    const noDates = activity({ id: 'none', earlyStart: null, earlyFinish: null });
    const visible = cull([onScreen, offRight, noDates], VIEW, size, DATA_DATE);
    expect(visible).toEqual(['on']);
  });
});

describe('dependencyPolyline', () => {
  it('routes a straight line between activities on the same lane', () => {
    const pred = activity({
      id: 'p',
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-02',
      laneIndex: 0,
    });
    const succ = activity({
      id: 's',
      earlyStart: '2026-01-05',
      earlyFinish: '2026-01-06',
      laneIndex: 0,
    });
    const line = dependencyPolyline(pred, succ, VIEW, DATA_DATE)!;
    expect(line).toHaveLength(2);
    expect(line[0]!.y).toBe(line[1]!.y); // same y → horizontal
  });

  it('routes an orthogonal L between different lanes', () => {
    const pred = activity({ id: 'p', laneIndex: 0 });
    const succ = activity({
      id: 's',
      earlyStart: '2026-01-10',
      earlyFinish: '2026-01-11',
      laneIndex: 2,
    });
    const line = dependencyPolyline(pred, succ, VIEW, DATA_DATE)!;
    expect(line).toHaveLength(4); // start, elbow-down, elbow-across, end
    expect(line[1]!.x).toBe(line[2]!.x); // the vertical elbow segment
  });

  it('returns null when an endpoint has no geometry', () => {
    const pred = activity({ id: 'p', earlyStart: null });
    expect(dependencyPolyline(pred, activity(), VIEW, DATA_DATE)).toBeNull();
  });
});

describe('hitTest', () => {
  it('returns the activity under the point, topmost first, or null', () => {
    const a = activity({ id: 'a', laneIndex: 0 });
    const b = activity({ id: 'b', laneIndex: 0 }); // same place, drawn later → on top
    const rect = activityRect(b, VIEW, DATA_DATE)!;
    const mid = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    expect(hitTest([a, b], mid, VIEW, DATA_DATE)).toBe('b');
    expect(hitTest([a, b], { x: 5, y: 5 }, VIEW, DATA_DATE)).toBeNull();
  });
});

describe('rectsIntersect', () => {
  it('detects overlap and separation', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

describe('zoomAt', () => {
  it('keeps the world day under the anchor fixed (cursor-anchored)', () => {
    const anchorX = 200;
    const dayBefore = dayAtScreenX(anchorX, VIEW);
    const zoomed = zoomAt(VIEW, anchorX, 2);
    expect(zoomed.pxPerDay).toBe(20);
    expect(dayAtScreenX(anchorX, zoomed)).toBeCloseTo(dayBefore);
  });

  it('clamps to the zoom bounds', () => {
    expect(clampPxPerDay(0.01)).toBe(MIN_PX_PER_DAY);
    expect(clampPxPerDay(9999)).toBe(MAX_PX_PER_DAY);
    expect(zoomAt(VIEW, 0, 1000).pxPerDay).toBe(MAX_PX_PER_DAY);
  });
});

describe('pan', () => {
  it('shifts the origin by the screen delta', () => {
    const panned = pan(VIEW, 15, -8);
    expect(panned.originX).toBe(115);
    expect(panned.originY).toBe(42);
    expect(panned.pxPerDay).toBe(VIEW.pxPerDay);
  });
});
