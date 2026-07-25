import type { ActivityType, DependencyType } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  activityRect,
  arrowhead,
  barGlyphKind,
  classifyHit,
  clampPxPerDay,
  computeEdgeFanOut,
  cull,
  edgeTouches,
  elbowRadius,
  labelPlacement,
  lagAnchorDay,
  lagAnchorPoints,
  lagFromAnchorDay,
  lagRunSegment,
  linkHighlightIds,
  loeBracketRects,
  makeWorkingDayWalk,
  progressGeometry,
  routeOrthogonal,
  summaryTabRects,
  truncateToWidth,
  ELAPSED_DAY_WALK,
  FAN_OUT_MAX_PX,
  FAN_OUT_STEP_PX,
  LAG_ANCHOR_PX,
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
  isResizeEligibleType,
  LANE_HEIGHT,
  MAX_PX_PER_DAY,
  MIN_PX_PER_DAY,
  GLYPH_CAP_OVERHANG,
  GLYPH_CAP_W,
  PROGRESS_BAND_H,
  PROGRESS_INSET_PX,
  PROGRESS_MIN_BAR_PX,
  SUMMARY_TAB_H,
  SUMMARY_TAB_W,
  pan,
  panToDate,
  rectsIntersect,
  screenXOfDay,
  screenYOfLane,
  zoomAt,
  type RenderActivity,
  type RenderEdge,
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

describe('classifyHit — resize handles (ADR-0052 M2)', () => {
  const RESIZE = { resizeHandles: true } as const;

  it('classifies the end zones as resizeStart / resizeFinish, body between them', () => {
    const acts = [activity()];
    expect(classifyHit(acts, { x: 104, y: 60 }, VIEW, DATA_DATE, RESIZE)).toEqual({
      kind: 'resizeStart',
      id: 'a1',
    });
    expect(classifyHit(acts, { x: 146, y: 60 }, VIEW, DATA_DATE, RESIZE)).toEqual({
      kind: 'resizeFinish',
      id: 'a1',
    });
    // Zones keep their priority over the body, and empty space is untouched.
    expect(classifyHit(acts, { x: 120, y: 60 }, VIEW, DATA_DATE, RESIZE)).toEqual({
      kind: 'body',
      id: 'a1',
    });
    expect(classifyHit(acts, { x: 250, y: 60 }, VIEW, DATA_DATE, RESIZE)).toEqual({
      kind: 'empty',
    });
  });

  it('offers NO end zones on a duration-derived bar — the whole rect is body', () => {
    // Milestones, Level of Effort and WBS summaries have no user-entered duration to resize
    // (`isResizeEligibleType`), so a bar-end press falls through to reposition/select.
    for (const type of ['LEVEL_OF_EFFORT', 'WBS_SUMMARY'] as const) {
      const acts = [activity({ type })];
      expect(classifyHit(acts, { x: 104, y: 60 }, VIEW, DATA_DATE, RESIZE)).toEqual({
        kind: 'body',
        id: 'a1',
      });
      expect(classifyHit(acts, { x: 146, y: 60 }, VIEW, DATA_DATE, RESIZE)).toEqual({
        kind: 'body',
        id: 'a1',
      });
    }
    // A milestone's diamond bounding box likewise classifies wholly as body.
    const milestone = [activity({ type: 'START_MILESTONE', earlyFinish: '2026-01-01' })];
    const rect = activityRect(milestone[0]!, VIEW, DATA_DATE)!;
    expect(
      classifyHit(milestone, { x: rect.x + 1, y: rect.y + rect.h / 2 }, VIEW, DATA_DATE, RESIZE),
    ).toEqual({ kind: 'body', id: 'a1' });
  });

  it('flag-off parity: without the option the zones keep their link-draw kinds', () => {
    const acts = [activity()];
    expect(classifyHit(acts, { x: 104, y: 60 }, VIEW, DATA_DATE)).toEqual({
      kind: 'startHandle',
      id: 'a1',
    });
    expect(classifyHit(acts, { x: 146, y: 60 }, VIEW, DATA_DATE)).toEqual({
      kind: 'finishHandle',
      id: 'a1',
    });
  });

  it('isResizeEligibleType mirrors the duration-derived rule', () => {
    expect(isResizeEligibleType('TASK')).toBe(true);
    expect(isResizeEligibleType('RESOURCE_DEPENDENT')).toBe(true);
    expect(isResizeEligibleType('START_MILESTONE')).toBe(false);
    expect(isResizeEligibleType('FINISH_MILESTONE')).toBe(false);
    expect(isResizeEligibleType('LEVEL_OF_EFFORT')).toBe(false);
    expect(isResizeEligibleType('WBS_SUMMARY')).toBe(false);
  });
});

describe('lagAnchorDay / lagFromAnchorDay (ADR-0052 M3 — the shared mapping + its inverse)', () => {
  const walk = makeWorkingDayWalk(working);
  const START = 0;
  const FINISH = 2;
  const TYPES: DependencyType[] = ['FS', 'SS', 'FF', 'SF'];

  it('round-trips every type × signed lag × calendar: inverse(forward(n)) === n', () => {
    for (const type of TYPES) {
      for (const dayWalk of [walk, ELAPSED_DAY_WALK]) {
        for (let n = -6; n <= 8; n += 1) {
          const day = lagAnchorDay(START, FINISH, type, n, dayWalk);
          expect(
            lagFromAnchorDay(START, FINISH, type, day, dayWalk),
            `${type} lag ${n} (${dayWalk === walk ? 'working' : 'elapsed'})`,
          ).toBe(n);
        }
      }
    }
  });

  it('snap is idempotent: forward(inverse(x)) is a fixed point for arbitrary pointer days', () => {
    for (const type of TYPES) {
      for (let day = -12; day <= 20; day += 1) {
        const n = lagFromAnchorDay(START, FINISH, type, day, walk);
        const snapped = lagAnchorDay(START, FINISH, type, n, walk);
        expect(lagFromAnchorDay(START, FINISH, type, snapped, walk), `${type} day ${day}`).toBe(n);
      }
    }
  });

  it('a pointer over a non-working day snaps toward zero (working calendar)', () => {
    // FS from finish day 2: lag 0 → day 3, lag 1 → day 4, lag 2 → day 7 (5/6 non-working) — so
    // days 5 and 6 have no exact lag; they read as the nearer-zero lag 1.
    expect(lagFromAnchorDay(START, FINISH, 'FS', 5, walk)).toBe(1);
    expect(lagFromAnchorDay(START, FINISH, 'FS', 6, walk)).toBe(1);
    expect(lagFromAnchorDay(START, FINISH, 'FS', 7, walk)).toBe(2);
  });

  it('matches the drawn anchor: lagAnchorPoints places the anchor at lagAnchorDay', () => {
    // The forward mapping IS the render mapping — same fn, so assert the wiring stayed shared.
    const pred = activity({ id: 'p', earlyFinish: '2026-01-03' });
    const succ = activity({
      id: 's',
      earlyStart: '2026-01-01',
      earlyFinish: '2026-01-15',
      laneIndex: 2,
    });
    const anchors = lagAnchorPoints(pred, succ, 'FS', 2, VIEW, DATA_DATE, walk)!;
    expect(anchors.succ.x).toBe(screenXOfDay(lagAnchorDay(0, 2, 'FS', 2, walk), VIEW));
  });

  it('falls back to the elapsed difference when the horizon is exhausted (pathological calendar)', () => {
    const allNonWorking = makeWorkingDayWalk(() => false, 5);
    // The bounded walk degrades to elapsed addition, so the inverse degrades to elapsed diff.
    expect(lagFromAnchorDay(START, FINISH, 'FS', 8, allNonWorking, 5)).toBe(5);
  });
});

describe('classifyHit — lag-anchor zones (ADR-0052 M3)', () => {
  const walk = makeWorkingDayWalk(working);
  // Predecessor days 0..2 in lane 0; a wide successor days 0..14 in lane 2 (the M1 anchor
  // fixture). An FS+1 anchor walks to day 4 → x=140, on the successor's centre line (y=120).
  const pred = activity({ id: 'p', earlyFinish: '2026-01-03' });
  const succ = activity({
    id: 's',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-15',
    laneIndex: 2,
  });
  const acts = [pred, succ];
  const edge = (overrides: Partial<RenderEdge> = {}): RenderEdge => ({
    id: 'd1',
    predecessorId: 'p',
    successorId: 's',
    type: 'FS' as const,
    isDriving: false,
    lagDays: 1,
    ...overrides,
  });
  const options = (edges: RenderEdge[]) => ({ lagAnchors: { edges, walk } });
  const ANCHOR = { x: 140, y: 120 };

  it('classifies a point near an offset anchor as lagAnchor, carrying the dependency id', () => {
    expect(classifyHit(acts, ANCHOR, VIEW, DATA_DATE, options([edge()]))).toEqual({
      kind: 'lagAnchor',
      id: 's', // the bar the anchor sits on (FS/FF → the successor)
      dependencyId: 'd1',
    });
  });

  it('wins over the bar body it overlaps (topmost/smallest target), body elsewhere', () => {
    // The anchor sits ON the successor bar — without the zones that point is plain body.
    expect(classifyHit(acts, ANCHOR, VIEW, DATA_DATE)).toEqual({ kind: 'body', id: 's' });
    // Away from the anchor (outside LAG_ANCHOR_PX) the bar body still wins.
    expect(classifyHit(acts, { x: 170, y: 120 }, VIEW, DATA_DATE, options([edge()]))).toEqual({
      kind: 'body',
      id: 's',
    });
  });

  it('offers NO zone for a zero-lag edge (its anchor is the constrained edge itself)', () => {
    // Zero-lag FS anchors at the successor's start edge — exactly where resizeStart lives; with
    // both vocabularies on, the resize handle keeps the edge (the dialog sets a first lag).
    const zeroLag = [edge({ lagDays: 0 })];
    expect(
      classifyHit(acts, { x: 104, y: 120 }, VIEW, DATA_DATE, {
        resizeHandles: true,
        ...options(zeroLag),
      }),
    ).toEqual({ kind: 'resizeStart', id: 's' });
  });

  it('resolves overlapping anchors on a crowded bar by stable edge-id order', () => {
    // Two same-shape edges anchoring at the same point: the lexically-first id wins, regardless
    // of the array order handed in (stable across frames/refetches).
    const twin = edge({ id: 'd0' });
    expect(classifyHit(acts, ANCHOR, VIEW, DATA_DATE, options([edge(), twin])).dependencyId).toBe(
      'd0',
    );
    expect(classifyHit(acts, ANCHOR, VIEW, DATA_DATE, options([twin, edge()])).dependencyId).toBe(
      'd0',
    );
  });

  it('anchors the SS/SF zone on the predecessor bar', () => {
    // SS+2 embeds two working days into the predecessor: walk(0, 2) = day 2 → x=120, pred lane 0
    // centre y = 50 + 5 + 9 = 64.
    const ss = [edge({ type: 'SS', lagDays: 2 })];
    expect(classifyHit(acts, { x: 120, y: 64 }, VIEW, DATA_DATE, options(ss))).toEqual({
      kind: 'lagAnchor',
      id: 'p',
      dependencyId: 'd1',
    });
  });

  it('walks a TWENTY_FOUR_HOUR edge on the elapsed calendar', () => {
    // FS+3 elapsed from finish day 2 → day 3+3 = 6 (a non-working day the working walk would
    // skip) → x=160.
    const elapsed = [edge({ lagDays: 3, lagCalendar: 'TWENTY_FOUR_HOUR' })];
    expect(classifyHit(acts, { x: 160, y: 120 }, VIEW, DATA_DATE, options(elapsed))).toEqual({
      kind: 'lagAnchor',
      id: 's',
      dependencyId: 'd1',
    });
  });

  it('accepts a press up to LAG_ANCHOR_PX either side — a 24px target (WCAG 2.5.8)', () => {
    const zones = options([edge()]);
    for (const dx of [-LAG_ANCHOR_PX, LAG_ANCHOR_PX]) {
      expect(classifyHit(acts, { x: ANCHOR.x + dx, y: ANCHOR.y }, VIEW, DATA_DATE, zones)).toEqual({
        kind: 'lagAnchor',
        id: 's',
        dependencyId: 'd1',
      });
    }
    // A pixel beyond falls through to the bar body — the zone is bounded, not greedy.
    for (const dx of [-LAG_ANCHOR_PX - 1, LAG_ANCHOR_PX + 1]) {
      expect(
        classifyHit(acts, { x: ANCHOR.x + dx, y: ANCHOR.y }, VIEW, DATA_DATE, zones).kind,
      ).toBe('body');
    }
    expect(LAG_ANCHOR_PX * 2).toBeGreaterThanOrEqual(24);
  });

  it('keeps the y tolerance to the bar the anchor sits on (covers the M5 fan-out spread)', () => {
    const zones = options([edge()]);
    // Half a bar above/below the anchor still grabs it; beyond the bar it is empty canvas.
    expect(classifyHit(acts, { x: ANCHOR.x, y: ANCHOR.y - 9 }, VIEW, DATA_DATE, zones).kind).toBe(
      'lagAnchor',
    );
    expect(FAN_OUT_MAX_PX).toBeLessThanOrEqual(9);
    expect(classifyHit(acts, { x: ANCHOR.x, y: ANCHOR.y - 12 }, VIEW, DATA_DATE, zones).kind).toBe(
      'empty',
    );
  });

  it('flag-off parity: without the option no lagAnchor kind ever appears', () => {
    expect(classifyHit(acts, ANCHOR, VIEW, DATA_DATE).kind).toBe('body');
    expect(classifyHit(acts, ANCHOR, VIEW, DATA_DATE, { resizeHandles: true }).kind).toBe('body');
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

// ── Bar visual refresh geometry (ADR-0052 M4) ────────────────────────────────────────────
describe('progressGeometry', () => {
  const rect = { x: 100, y: 45, w: 60, h: 18 };

  it('returns null for no progress (0, negative, NaN) and for a too-narrow bar', () => {
    expect(progressGeometry(rect, 0)).toBeNull();
    expect(progressGeometry(rect, -5)).toBeNull();
    expect(progressGeometry(rect, Number.NaN)).toBeNull();
    expect(progressGeometry({ ...rect, w: PROGRESS_MIN_BAR_PX - 1 }, 50)).toBeNull();
  });

  it('bands the completed fraction along the bar bottom, inset and shape-bounded', () => {
    const g = progressGeometry(rect, 50)!;
    expect(g.band).toEqual({
      x: rect.x + PROGRESS_INSET_PX,
      y: rect.y + rect.h - PROGRESS_INSET_PX - PROGRESS_BAND_H,
      w: (rect.w - PROGRESS_INSET_PX * 2) / 2,
      h: PROGRESS_BAND_H,
    });
    // The front divider sits at the band's end — the non-colour boundary cue.
    expect(g.frontX).toBe(g.band.x + g.band.w);
  });

  it('drops the front divider at 100% (the front coincides with the bar end)', () => {
    const g = progressGeometry(rect, 100)!;
    expect(g.band.w).toBe(rect.w - PROGRESS_INSET_PX * 2);
    expect(g.frontX).toBeNull();
  });

  it('clamps over-100 to a full band (defensive — the API bounds the field)', () => {
    expect(progressGeometry(rect, 150)!.band.w).toBe(rect.w - PROGRESS_INSET_PX * 2);
  });

  it('never escapes the bar rect (band stays inside for every percent)', () => {
    for (const pct of [1, 25, 50, 99, 100]) {
      const g = progressGeometry(rect, pct)!;
      expect(g.band.x).toBeGreaterThanOrEqual(rect.x);
      expect(g.band.x + g.band.w).toBeLessThanOrEqual(rect.x + rect.w);
      expect(g.band.y + g.band.h).toBeLessThanOrEqual(rect.y + rect.h);
    }
  });
});

describe('loeBracketRects / summaryTabRects (M4 glyph vertices)', () => {
  const rect = { x: 100, y: 45, w: 60, h: 18 };

  it('places the LOE bracket caps at the span ends, overhanging top and bottom', () => {
    const [left, right] = loeBracketRects(rect);
    expect(left).toEqual({
      x: rect.x,
      y: rect.y - GLYPH_CAP_OVERHANG,
      w: GLYPH_CAP_W,
      h: rect.h + GLYPH_CAP_OVERHANG * 2,
    });
    expect(right.x).toBe(rect.x + rect.w - GLYPH_CAP_W);
    expect(right.y).toBe(left.y);
    expect(right.h).toBe(left.h);
  });

  it('places the summary tabs directly below the bar at each end', () => {
    const [left, right] = summaryTabRects(rect);
    expect(left).toEqual({ x: rect.x, y: rect.y + rect.h, w: SUMMARY_TAB_W, h: SUMMARY_TAB_H });
    expect(right).toEqual({
      x: rect.x + rect.w - SUMMARY_TAB_W,
      y: rect.y + rect.h,
      w: SUMMARY_TAB_W,
      h: SUMMARY_TAB_H,
    });
  });
});

describe('barGlyphKind', () => {
  it('maps every activity type to its refreshed glyph family', () => {
    expect(barGlyphKind('TASK')).toBe('bar');
    expect(barGlyphKind('RESOURCE_DEPENDENT')).toBe('bar');
    expect(barGlyphKind('START_MILESTONE')).toBe('milestone');
    expect(barGlyphKind('FINISH_MILESTONE')).toBe('milestone');
    expect(barGlyphKind('LEVEL_OF_EFFORT')).toBe('loe');
    expect(barGlyphKind('HAMMOCK')).toBe('loe');
    expect(barGlyphKind('WBS_SUMMARY')).toBe('summary');
  });
});

// ── Link visual refresh (ADR-0052 M5) ─────────────────────────────────────────────────────────────

describe('elbowRadius (rounded link corners)', () => {
  it('returns the target radius when both segments are long enough', () => {
    expect(elbowRadius({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 })).toBe(5);
  });

  it('clamps to half the shorter adjoining segment so adjacent arcs never overlap', () => {
    expect(elbowRadius({ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 40 })).toBe(3);
    expect(elbowRadius({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 4 })).toBe(2);
  });

  it('returns 0 (a hard corner) for collinear segments — nothing to round', () => {
    expect(elbowRadius({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBe(0);
  });

  it('returns 0 for a degenerate (zero-length) segment', () => {
    expect(elbowRadius({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(elbowRadius({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });

  it('honours a custom maximum', () => {
    expect(elbowRadius({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, 2)).toBe(2);
  });
});

describe('routeOrthogonal — elbow shift (fan-out de-crowding)', () => {
  // pxPerDay 10 → gap = min(12, max(4, 10)) = 10. Different y so the L-route keeps its elbow.
  const from = { x: 200, y: 60 };
  const to = { x: 300, y: 120 };

  it('keeps the legacy elbow byte-for-byte at the default shift of 0', () => {
    expect(routeOrthogonal(from, to, 'FS', VIEW)).toEqual(routeOrthogonal(from, to, 'FS', VIEW, 0));
    expect(routeOrthogonal(from, to, 'FS', VIEW)[1]!.x).toBe(210);
  });

  it('nudges the vertical elbow by the shift, away from the anchored edge', () => {
    expect(routeOrthogonal(from, to, 'FS', VIEW, 3)[1]!.x).toBe(213);
    expect(routeOrthogonal(from, to, 'SS', VIEW, 3)[1]!.x).toBe(200 - 10 - 3);
    expect(routeOrthogonal(from, to, 'FF', VIEW, 3)[1]!.x).toBe(300 + 10 + 3);
    expect(routeOrthogonal(from, to, 'SF', VIEW, 3)[1]!.x).toBe(250 + 3);
  });

  it('clamps the shift inside the gap so the elbow never cuts back across the bar edge', () => {
    // gap 10 → the shift clamps to ±9: the FS elbow stays strictly right of the finish edge.
    expect(routeOrthogonal(from, to, 'FS', VIEW, -20)[1]!.x).toBe(201);
    expect(routeOrthogonal(from, to, 'FS', VIEW, 20)[1]!.x).toBe(219);
  });
});

describe('computeEdgeFanOut (deterministic de-crowding)', () => {
  const edge = (
    id: string,
    predecessorId: string,
    successorId: string,
    type: DependencyType = 'FS',
  ): RenderEdge => ({ id, predecessorId, successorId, type, isDriving: false });

  it('leaves an uncrowded zero-lag FS chain untouched (every group is a singleton)', () => {
    const chain = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'd')];
    expect(computeEdgeFanOut(chain).size).toBe(0);
  });

  it('spreads a crowded bar edge symmetrically about the centreline, in edge-id order', () => {
    const edges = [edge('e1', 'p', 's1'), edge('e2', 'p', 's2'), edge('e3', 'p', 's3')];
    const out = computeEdgeFanOut(edges);
    // Three FS ends share p's finish edge → −step / 0 / +step by id order; the middle edge (and
    // every singleton successor end) carries no offset, so it is omitted from the map entirely.
    expect(out.get(edges[0]!)).toEqual({ pred: -FAN_OUT_STEP_PX, succ: 0 });
    expect(out.get(edges[1]!)).toBeUndefined();
    expect(out.get(edges[2]!)).toEqual({ pred: FAN_OUT_STEP_PX, succ: 0 });
  });

  it('is stable across input-array permutations (same offset per edge id — no jitter)', () => {
    const build = (ids: string[]): Map<string, { pred: number; succ: number }> => {
      const edges = ids.map((id) => edge(id, 'p', `s-${id}`));
      const out = computeEdgeFanOut(edges);
      const byId = new Map<string, { pred: number; succ: number }>();
      for (const e of edges) byId.set(e.id!, out.get(e) ?? { pred: 0, succ: 0 });
      return byId;
    };
    const a = build(['e1', 'e2', 'e3', 'e4']);
    const b = build(['e4', 'e2', 'e1', 'e3']);
    const c = build(['e3', 'e4', 'e2', 'e1']);
    expect(Object.fromEntries(b)).toEqual(Object.fromEntries(a));
    expect(Object.fromEntries(c)).toEqual(Object.fromEntries(a));
  });

  it('caps the spread so a very crowded edge saturates instead of leaving the bar', () => {
    const edges = Array.from({ length: 9 }, (_, i) => edge(`e${i}`, 'p', `s${i}`));
    const out = computeEdgeFanOut(edges);
    for (const e of edges) {
      const off = out.get(e);
      if (!off) continue;
      expect(Math.abs(off.pred)).toBeLessThanOrEqual(FAN_OUT_MAX_PX);
    }
    // The extremes are clamped to exactly the cap.
    expect(out.get(edges[0]!)!.pred).toBe(-FAN_OUT_MAX_PX);
    expect(out.get(edges[8]!)!.pred).toBe(FAN_OUT_MAX_PX);
  });

  it('groups by the bar edge the type anchors to, mixing pred and succ ends', () => {
    // X→B (FS) lands on B's START; B→Y (SS) departs B's START — the same bar edge, so both
    // spread; B→Z (FS) departs B's FINISH — a different edge, so it stays centred.
    const inbound = edge('a', 'x', 'b', 'FS');
    const outboundSS = edge('b', 'b', 'y', 'SS');
    const outboundFS = edge('c', 'b', 'z', 'FS');
    const out = computeEdgeFanOut([inbound, outboundSS, outboundFS]);
    expect(out.get(inbound)).toEqual({ pred: 0, succ: -FAN_OUT_STEP_PX / 2 });
    expect(out.get(outboundSS)).toEqual({ pred: FAN_OUT_STEP_PX / 2, succ: 0 });
    expect(out.get(outboundFS)).toBeUndefined();
  });

  it('orders id-less edges by their (pred, succ, type) triple — still deterministic', () => {
    const e1: RenderEdge = { predecessorId: 'p', successorId: 's1', type: 'FS', isDriving: false };
    const e2: RenderEdge = { predecessorId: 'p', successorId: 's2', type: 'FS', isDriving: false };
    const a = computeEdgeFanOut([e1, e2]);
    const b = computeEdgeFanOut([e2, e1]);
    expect(a.get(e1)).toEqual(b.get(e1));
    expect(a.get(e2)).toEqual(b.get(e2));
    expect(a.get(e1)!.pred).toBeLessThan(a.get(e2)!.pred);
  });
});

describe('lagRunSegment (the on-bar waiting-time depiction)', () => {
  const walk = makeWorkingDayWalk(working);
  // Pred days 0–2 (x 100–130) lane 0; a wide successor days 0–14 (x 100–250) lane 2.
  const pred = activity({ id: 'p', earlyFinish: '2026-01-03', laneIndex: 0 });
  const succ = activity({
    id: 's',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-15',
    laneIndex: 2,
  });

  it('runs an SS lag from the predecessor start edge to its embedded anchor', () => {
    const run = lagRunSegment(pred, succ, 'SS', 2, VIEW, DATA_DATE, walk)!;
    const y = screenYOfLane(0, VIEW) + LANE_HEIGHT / 2;
    expect(run).toEqual({ from: { x: 100, y }, to: { x: 120, y } });
  });

  it('runs an FS lag from the successor start edge to the constrained anchor on the bar', () => {
    // Pred finishes day 2 → the lag departs day 3; +1 working day lands day 4 → x 140.
    const run = lagRunSegment(pred, succ, 'FS', 1, VIEW, DATA_DATE, walk)!;
    const y = screenYOfLane(2, VIEW) + LANE_HEIGHT / 2;
    expect(run).toEqual({ from: { x: 100, y }, to: { x: 140, y } });
  });

  it('matches the drawn anchor exactly (shares the ONE forward mapping)', () => {
    const anchors = lagAnchorPoints(pred, succ, 'SS', 3, VIEW, DATA_DATE, walk)!;
    const run = lagRunSegment(pred, succ, 'SS', 3, VIEW, DATA_DATE, walk)!;
    expect(run.to).toEqual(anchors.pred);
  });

  it('returns null when there is nothing to depict', () => {
    // Zero lag: the anchor IS the edge.
    expect(lagRunSegment(pred, succ, 'FS', 0, VIEW, DATA_DATE, walk)).toBeNull();
    // The anchor clamps onto the edge: a successor starting after the constrained point.
    const late = activity({
      id: 'l',
      earlyStart: '2026-01-11',
      earlyFinish: '2026-01-15',
      laneIndex: 2,
    });
    expect(lagRunSegment(pred, late, 'FS', 1, VIEW, DATA_DATE, walk)).toBeNull();
    // Missing geometry.
    const unscheduled = activity({ id: 'u', earlyStart: null, earlyFinish: null });
    expect(lagRunSegment(unscheduled, succ, 'SS', 2, VIEW, DATA_DATE, walk)).toBeNull();
    expect(lagRunSegment(pred, unscheduled, 'FS', 2, VIEW, DATA_DATE, walk)).toBeNull();
  });
});

describe('linkHighlightIds / edgeTouches (incident-link highlight selection)', () => {
  const e: RenderEdge = { predecessorId: 'p', successorId: 's', type: 'FS', isDriving: false };

  it('returns null when neither selection nor hover is set (no highlight passes)', () => {
    expect(linkHighlightIds(null, null)).toBeNull();
    expect(linkHighlightIds(undefined, undefined)).toBeNull();
  });

  it('collects the selection (persistent) and the hover (transient) ids', () => {
    expect([...linkHighlightIds('a', null)!]).toEqual(['a']);
    expect([...linkHighlightIds(null, 'b')!]).toEqual(['b']);
    expect([...linkHighlightIds('a', 'b')!].sort()).toEqual(['a', 'b']);
    expect([...linkHighlightIds('a', 'a')!]).toEqual(['a']);
  });

  it('matches an edge touching either endpoint, and only those', () => {
    expect(edgeTouches(e, new Set(['p']))).toBe(true);
    expect(edgeTouches(e, new Set(['s']))).toBe(true);
    expect(edgeTouches(e, new Set(['x']))).toBe(false);
  });
});
