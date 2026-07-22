import type { ActivityType, DependencyType } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  activityRect,
  arrowhead,
  classifyHit,
  clampPxPerDay,
  cull,
  labelPlacement,
  lagAnchorPoints,
  makeWorkingDayWalk,
  truncateToWidth,
  ELAPSED_DAY_WALK,
  LABEL_INSIDE_MIN_PX,
  LABEL_BESIDE_MIN_PX,
  dayAtScreenX,
  dayCellRect,
  dayColumnAt,
  daysBetween,
  DEFAULT_VIEWPORT,
  dependencyPolyline,
  dependencyPolylineTimeTrue,
  fitToContent,
  hitTest,
  laneRowAt,
  isMilestone,
  LANE_HEIGHT,
  MAX_PX_PER_DAY,
  MIN_PX_PER_DAY,
  pan,
  panToDate,
  rectsIntersect,
  screenXOfDay,
  screenYOfLane,
  zoomAt,
  type RenderActivity,
  type Size,
  type Viewport,
} from './render-model';

const DATA_DATE = '2026-01-01';
const VIEW: Viewport = { pxPerDay: 10, originX: 100, originY: 50 };

function activity(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'a1',
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

describe('panToDate (Go to date view command)', () => {
  it('pans so the target day lands `inset` px from the left, scale + vertical pan untouched', () => {
    const v = panToDate(VIEW, DATA_DATE, '2026-01-06', 12); // day 5
    expect(v.pxPerDay).toBe(VIEW.pxPerDay); // no zoom
    expect(v.originY).toBe(VIEW.originY); // no vertical pan
    expect(screenXOfDay(daysBetween(DATA_DATE, '2026-01-06'), v)).toBeCloseTo(12);
  });

  it('places the data date itself (day 0) at the inset', () => {
    const v = panToDate(VIEW, DATA_DATE, DATA_DATE, 8);
    expect(screenXOfDay(0, v)).toBeCloseTo(8);
  });

  it('is a pure transform — returns a new viewport, leaves the input unchanged', () => {
    const before = { ...VIEW };
    const v = panToDate(VIEW, DATA_DATE, '2026-02-01', 12);
    expect(VIEW).toEqual(before);
    expect(v).not.toBe(VIEW);
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
  // Different lanes so the routing keeps its endpoints (a same-lane pair collapses to a straight
  // line). The anchor assertions compare against each bar's own rect, so they're independent of the
  // exact bar width.
  const predBar = activity({
    id: 'p',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    laneIndex: 0,
  });
  const succBar = activity({
    id: 's',
    earlyStart: '2026-01-10',
    earlyFinish: '2026-01-12',
    laneIndex: 2,
  });
  const pRect = activityRect(predBar, VIEW, DATA_DATE)!;
  const sRect = activityRect(succBar, VIEW, DATA_DATE)!;
  const ends = (type: Parameters<typeof dependencyPolyline>[2]): [number, number] => {
    const line = dependencyPolyline(predBar, succBar, type, VIEW, DATA_DATE)!;
    return [line[0]!.x, line.at(-1)!.x];
  };

  it('FS anchors predecessor finish → successor start', () => {
    const [from, to] = ends('FS');
    expect(from).toBeCloseTo(pRect.x + pRect.w); // predecessor finish (right edge)
    expect(to).toBeCloseTo(sRect.x); // successor start (left edge)
  });

  it('SS anchors predecessor start → successor start', () => {
    const [from, to] = ends('SS');
    expect(from).toBeCloseTo(pRect.x); // predecessor start
    expect(to).toBeCloseTo(sRect.x); // successor start
  });

  it('FF anchors predecessor finish → successor finish', () => {
    const [from, to] = ends('FF');
    expect(from).toBeCloseTo(pRect.x + pRect.w); // predecessor finish
    expect(to).toBeCloseTo(sRect.x + sRect.w); // successor finish
  });

  it('SF anchors predecessor start → successor finish', () => {
    const [from, to] = ends('SF');
    expect(from).toBeCloseTo(pRect.x); // predecessor start
    expect(to).toBeCloseTo(sRect.x + sRect.w); // successor finish
  });

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
    const line = dependencyPolyline(pred, succ, 'FS', VIEW, DATA_DATE)!;
    expect(line).toHaveLength(2);
    expect(line[0]!.y).toBe(line[1]!.y); // same y → horizontal
  });

  it('routes an orthogonal L with a vertical elbow between different lanes', () => {
    const line = dependencyPolyline(predBar, succBar, 'FS', VIEW, DATA_DATE)!;
    expect(line).toHaveLength(4); // start, elbow-down, elbow-across, end
    expect(line[1]!.x).toBe(line[2]!.x); // the vertical elbow segment
  });

  it('returns null when an endpoint has no geometry', () => {
    const pred = activity({ id: 'p', earlyStart: null });
    expect(dependencyPolyline(pred, activity(), 'FS', VIEW, DATA_DATE)).toBeNull();
  });
});

// ── Time-true lag anchoring (ADR-0052 M1) ─────────────────────────────────────────────────────────

// A synthetic week keyed by day offset: 0–4 working, 5–6 not (repeating) — independent of the real
// weekday of the data date, so the expected walks are readable straight off the offsets.
const working = (d: number): boolean => ((d % 7) + 7) % 7 < 5;

describe('makeWorkingDayWalk / ELAPSED_DAY_WALK', () => {
  const walk = makeWorkingDayWalk(working);

  it('lands on the nth working day forward, skipping non-working days', () => {
    expect(walk(0, 3)).toBe(3); // three all-working lag days consumed → day 3
    expect(walk(3, 2)).toBe(7); // days 3+4 consumed; 5/6 skipped → lands day 7
    expect(walk(5, 0)).toBe(7); // zero from a non-working day snaps to the next working day
  });

  it('walks a lead (negative) leftward over working days only', () => {
    expect(walk(3, -1)).toBe(2);
    expect(walk(0, -2)).toBe(-4); // -1/-2 are the weekend → -3, -4 are the two working days
  });

  it('memoises: a repeated walk re-reads nothing from the predicate', () => {
    const spy = vi.fn(working);
    const memoised = makeWorkingDayWalk(spy);
    memoised(3, 2);
    const calls = spy.mock.calls.length;
    expect(memoised(3, 2)).toBe(7);
    expect(spy.mock.calls.length).toBe(calls);
  });

  it('is bounded: an all-non-working calendar falls back to the elapsed result, never hanging', () => {
    expect(makeWorkingDayWalk(() => false, 10)(0, 3)).toBe(3);
    expect(makeWorkingDayWalk(() => false, 10)(4, -2)).toBe(2);
  });

  it('ELAPSED_DAY_WALK is plain day addition (the TWENTY_FOUR_HOUR lag base)', () => {
    expect(ELAPSED_DAY_WALK(3, 2)).toBe(5);
    expect(ELAPSED_DAY_WALK(3, -1)).toBe(2);
    expect(ELAPSED_DAY_WALK(3, 0)).toBe(3);
  });
});

describe('lagAnchorPoints', () => {
  // Predecessor days 0–2 (right edge x=130) in lane 0; a wide successor days 0–14 (x 100–250) in
  // lane 2, so walked anchors land ON the successor without the clamp biting (asserted separately).
  const pred = activity({ id: 'p', earlyFinish: '2026-01-03', laneIndex: 0 });
  const succ = activity({
    id: 's',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-15',
    laneIndex: 2,
  });
  const plan = makeWorkingDayWalk(working);
  const anchors = (
    type: DependencyType,
    lagDays: number,
    walk: typeof plan,
  ): { predX: number; succX: number } => {
    const a = lagAnchorPoints(pred, succ, type, lagDays, VIEW, DATA_DATE, walk)!;
    return { predX: a.pred.x, succX: a.succ.x };
  };

  it('places every type × {lag, zero, lead} × {working-day, elapsed} anchor time-proportionally', () => {
    // [type, lagDays, walk, expected predX, expected succX]. Pred edges: start 100, finish 130.
    // Succ edges: start 100, finish 250. FS/FF shift the successor anchor from the predecessor's
    // finish; SS/SF embed the predecessor anchor from its start; zero-lag = the plain edges.
    const cases: [DependencyType, number, typeof plan, number, number][] = [
      ['FS', 1, plan, 130, 140], // one working day right of the finish edge
      ['FS', 0, plan, 130, 100],
      ['FS', -1, plan, 130, 120], // a lead sits left of the constrained edge
      ['FS', 2, ELAPSED_DAY_WALK, 130, 150],
      ['FS', 0, ELAPSED_DAY_WALK, 130, 100],
      ['FS', -1, ELAPSED_DAY_WALK, 130, 120],
      ['SS', 2, plan, 120, 100], // two working days INTO the predecessor bar
      ['SS', 0, plan, 100, 100],
      ['SS', -2, plan, 100, 100], // lead walks left of the bar → clamped to its start
      ['SS', 2, ELAPSED_DAY_WALK, 120, 100],
      ['SS', 0, ELAPSED_DAY_WALK, 100, 100],
      ['SS', -2, ELAPSED_DAY_WALK, 100, 100],
      ['FF', 4, plan, 130, 190], // 4 working days past finish day 2 skips the 5/6 weekend → day 8+1
      ['FF', 0, plan, 130, 250],
      ['FF', -1, plan, 130, 120],
      ['FF', 4, ELAPSED_DAY_WALK, 130, 170], // elapsed: no weekend skip → day 6+1
      ['FF', 0, ELAPSED_DAY_WALK, 130, 250],
      ['FF', -1, ELAPSED_DAY_WALK, 130, 120],
      ['SF', 2, plan, 120, 250],
      ['SF', 0, plan, 100, 250],
      ['SF', -1, plan, 100, 250], // pred-side lead clamps to the bar start
      ['SF', 2, ELAPSED_DAY_WALK, 120, 250],
      ['SF', 0, ELAPSED_DAY_WALK, 100, 250],
      ['SF', -1, ELAPSED_DAY_WALK, 100, 250],
    ];
    for (const [type, lag, walk, predX, succX] of cases) {
      expect({ type, lag, ...anchors(type, lag, walk) }).toEqual({ type, lag, predX, succX });
    }
  });

  it('anchors at each bar’s vertical centre (the polyline y-coordinates are unchanged)', () => {
    const a = lagAnchorPoints(pred, succ, 'FS', 2, VIEW, DATA_DATE, plan)!;
    expect(a.pred.y).toBe(screenYOfLane(0, VIEW) + LANE_HEIGHT / 2);
    expect(a.succ.y).toBe(screenYOfLane(2, VIEW) + LANE_HEIGHT / 2);
  });

  it('clamps an anchor past the bar’s extent to the bar span (large lag)', () => {
    expect(anchors('FS', 40, plan).succX).toBe(250); // succ right edge
  });

  it('returns null (the extreme-end fallback) when either end has no computed dates', () => {
    const unscheduled = activity({ id: 'u', earlyStart: null, earlyFinish: null });
    expect(lagAnchorPoints(unscheduled, succ, 'FS', 2, VIEW, DATA_DATE, plan)).toBeNull();
    expect(lagAnchorPoints(pred, unscheduled, 'FS', 2, VIEW, DATA_DATE, plan)).toBeNull();
  });
});

describe('dependencyPolylineTimeTrue', () => {
  const pred = activity({ id: 'p', earlyFinish: '2026-01-03', laneIndex: 0 });
  const succ = activity({
    id: 's',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-15',
    laneIndex: 2,
  });
  const plan = makeWorkingDayWalk(working);

  it('routes orthogonally THROUGH the time-true anchors', () => {
    const line = dependencyPolylineTimeTrue(pred, succ, 'FS', 1, VIEW, DATA_DATE, plan)!;
    const a = lagAnchorPoints(pred, succ, 'FS', 1, VIEW, DATA_DATE, plan)!;
    expect(line).toHaveLength(4);
    expect(line[0]).toEqual(a.pred);
    expect(line.at(-1)).toEqual(a.succ);
    expect(line[1]!.x).toBe(line[2]!.x); // still a vertical elbow
  });

  it('matches the legacy routing exactly for a zero-lag tie (the FS+0 no-visible-change case)', () => {
    for (const type of ['FS', 'SS', 'FF', 'SF'] as const) {
      expect(dependencyPolylineTimeTrue(pred, succ, type, 0, VIEW, DATA_DATE, plan)).toEqual(
        dependencyPolyline(pred, succ, type, VIEW, DATA_DATE),
      );
    }
  });

  it('returns null when an endpoint has no geometry (the caller’s fallback contract)', () => {
    const unscheduled = activity({ id: 'u', earlyStart: null });
    expect(
      dependencyPolylineTimeTrue(unscheduled, succ, 'FS', 2, VIEW, DATA_DATE, plan),
    ).toBeNull();
  });

  it('collapses to a straight line between same-lane anchors', () => {
    const sameLane = activity({ ...succ, laneIndex: 0, id: 's2' });
    const line = dependencyPolylineTimeTrue(pred, sameLane, 'FS', 1, VIEW, DATA_DATE, plan)!;
    expect(line).toHaveLength(2);
    expect(line[0]!.y).toBe(line[1]!.y);
  });
});

describe('arrowhead', () => {
  it('computes the tip + two barbs from a rightward final segment', () => {
    expect(
      arrowhead([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toEqual([
      { x: 10, y: 0 },
      { x: 5, y: 2.5 },
      { x: 5, y: -2.5 },
    ]);
  });

  it('rotates with the segment direction (a downward arrival points down)', () => {
    expect(
      arrowhead([
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 10 },
      { x: -2.5, y: 5 },
      { x: 2.5, y: 5 },
    ]);
  });

  it('skips a zero-length final segment and keeps the tip at the last point', () => {
    expect(
      arrowhead([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toEqual([
      { x: 10, y: 0 },
      { x: 5, y: 2.5 },
      { x: 5, y: -2.5 },
    ]);
  });

  it('returns null for a degenerate line (no direction to point)', () => {
    expect(arrowhead([])).toBeNull();
    expect(arrowhead([{ x: 1, y: 1 }])).toBeNull();
    expect(
      arrowhead([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
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

describe('classifyHit', () => {
  // Default activity: day 0..4 at lane 0 → rect { x:100, y:55, w:50, h:18 } under VIEW.
  it('routes the bar body, end grab-zones, and empty space (topmost first)', () => {
    const acts = [activity()];
    expect(classifyHit(acts, { x: 104, y: 60 }, VIEW, DATA_DATE)).toEqual({
      kind: 'startHandle',
      id: 'a1',
    });
    expect(classifyHit(acts, { x: 146, y: 60 }, VIEW, DATA_DATE)).toEqual({
      kind: 'finishHandle',
      id: 'a1',
    });
    expect(classifyHit(acts, { x: 120, y: 60 }, VIEW, DATA_DATE)).toEqual({
      kind: 'body',
      id: 'a1',
    });
    expect(classifyHit(acts, { x: 250, y: 60 }, VIEW, DATA_DATE)).toEqual({ kind: 'empty' });
    expect(classifyHit(acts, { x: 120, y: 200 }, VIEW, DATA_DATE)).toEqual({ kind: 'empty' });
  });

  it('ignores activities without computed dates', () => {
    const acts = [activity({ earlyStart: null, earlyFinish: null })];
    expect(classifyHit(acts, { x: 120, y: 60 }, VIEW, DATA_DATE)).toEqual({ kind: 'empty' });
  });
});

describe('dayCellRect / dayColumnAt / laneRowAt (ghost + snap geometry)', () => {
  it('dayCellRect spans [leftDay, rightDay] inclusive with a +1-day right edge', () => {
    expect(dayCellRect(2, 4, 1, VIEW)).toEqual({ x: 120, y: 83, w: 30, h: 18 });
  });

  it('dayColumnAt floors to the whole day column', () => {
    expect(dayColumnAt(127, VIEW)).toBe(2);
    expect(dayColumnAt(100, VIEW)).toBe(0);
  });

  it('laneRowAt floors to the lane and clamps at zero', () => {
    expect(laneRowAt(90, VIEW)).toBe(1);
    expect(laneRowAt(40, VIEW)).toBe(0); // above lane 0 clamps to 0
  });
});

describe('DEFAULT_VIEWPORT', () => {
  it('is a valid in-range viewport', () => {
    expect(DEFAULT_VIEWPORT.pxPerDay).toBeGreaterThanOrEqual(MIN_PX_PER_DAY);
    expect(DEFAULT_VIEWPORT.pxPerDay).toBeLessThanOrEqual(MAX_PX_PER_DAY);
  });
});

describe('fitToContent', () => {
  const SIZE: Size = { width: 832, height: 400 };

  it('returns the default viewport when nothing is computed', () => {
    const uncomputed = activity({ earlyStart: null, earlyFinish: null });
    expect(fitToContent([uncomputed], SIZE, DATA_DATE)).toEqual(DEFAULT_VIEWPORT);
    expect(fitToContent([], SIZE, DATA_DATE)).toEqual(DEFAULT_VIEWPORT);
  });

  it('frames content within the padding, clamping pxPerDay to the max zoom', () => {
    // The default activity spans days 0–5; a generous surface would exceed the max zoom,
    // so pxPerDay clamps and the earliest day (0) pins to the left padding.
    const view = fitToContent([activity()], SIZE, DATA_DATE, 32);
    expect(view.originY).toBe(32);
    expect(view.pxPerDay).toBeLessThanOrEqual(MAX_PX_PER_DAY);
    expect(view.originX).toBeCloseTo(32);
  });

  it('offsets originX so a later start day sits at the left padding', () => {
    const view = fitToContent(
      [activity({ earlyStart: '2026-01-11', earlyFinish: '2026-01-15' })],
      SIZE,
      DATA_DATE,
      32,
    );
    // 2026-01-11 is day 10 from the data date, so the origin shifts left by 10 days.
    expect(view.originX).toBeCloseTo(32 - 10 * view.pxPerDay);
  });

  it('clamps pxPerDay to the minimum when content is far wider than the surface', () => {
    const narrow: Size = { width: 65, height: 400 };
    const view = fitToContent([activity()], narrow, DATA_DATE, 32);
    expect(view.pxPerDay).toBe(MIN_PX_PER_DAY);
  });
});

describe('labelPlacement', () => {
  it('places inside a wide-enough task bar', () => {
    expect(
      labelPlacement({ barWidth: LABEL_INSIDE_MIN_PX, isMilestone: false, besideRoomPx: 0 }),
    ).toBe('inside');
  });

  it('falls back to beside when the bar is too narrow but the neighbour leaves room', () => {
    expect(
      labelPlacement({
        barWidth: LABEL_INSIDE_MIN_PX - 1,
        isMilestone: false,
        besideRoomPx: LABEL_BESIDE_MIN_PX,
      }),
    ).toBe('beside');
  });

  it('never places a label inside a milestone (no width) — beside when there is room, else none', () => {
    expect(labelPlacement({ barWidth: 14, isMilestone: true, besideRoomPx: 100 })).toBe('beside');
    expect(labelPlacement({ barWidth: 14, isMilestone: true, besideRoomPx: 4 })).toBe('none');
  });

  it('suppresses when the bar is narrow and the neighbour is too close', () => {
    expect(
      labelPlacement({ barWidth: 10, isMilestone: false, besideRoomPx: LABEL_BESIDE_MIN_PX - 1 }),
    ).toBe('none');
  });
});

describe('truncateToWidth', () => {
  // Deterministic stub: 5px per glyph, so widths are text length × 5.
  const measure = (s: string): number => s.length * 5;

  it('returns the full text when it fits', () => {
    expect(truncateToWidth('Erect steel', 200, measure)).toBe('Erect steel');
  });

  it('returns an empty string when not even the ellipsis fits', () => {
    expect(truncateToWidth('Erect steel', 3, measure)).toBe('');
  });

  it('trims to the longest prefix + ellipsis and drops a trailing space', () => {
    // '…' is 5px; budget 40px fits 8 glyphs total → 7 chars + ellipsis. 'Erect s' → trim → 'Erect'.
    const out = truncateToWidth('Erect steel', 40, measure);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThan('Erect steel'.length);
    expect(measure(out)).toBeLessThanOrEqual(40);
    expect(out).not.toContain(' …'); // trailing space trimmed before the ellipsis
  });

  it('handles empty text and non-positive width', () => {
    expect(truncateToWidth('', 100, measure)).toBe('');
    expect(truncateToWidth('x', 0, measure)).toBe('');
  });
});
