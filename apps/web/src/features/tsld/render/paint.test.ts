import { describe, expect, it, vi } from 'vitest';

import {
  edgeFanOutFor,
  paintInteractionLayer,
  paintScene,
  type TsldPalette,
  type TsldScene,
} from './paint';
import {
  lagAnchorPoints,
  makeWorkingDayWalk,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';

const PALETTE: TsldPalette = {
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  today: '#f00',
  conflict: '#fa0',
  laneOverlap: '#fa0',
  labelInside: '#fff',
  labelInsideCritical: '#fff',
  labelInsideNearCritical: '#000',
  labelBeside: '#eee',
  // M4 refresh entries — distinct from every other fixture colour so assertions can pin them.
  barStroke: '#5a5a5a',
  hoverRing: '#9a9a9a',
  handleHalo: '#0b0b0b',
  monthBand: '#111111',
};

/** All view layers on, matching the default scene. */
const ALL_ON = {
  dayGrid: true,
  monthGrid: true,
  yearGrid: true,
  today: true,
  nonWorking: true,
  labels: true,
  lateOverlay: false,
} as const;
const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
const SIZE = { width: 800, height: 400 };
const DATA_DATE = '2026-01-01';

function mockCtx() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    // Deterministic width so truncation/placement tests are stable: ~6px per glyph.
    measureText: vi.fn((s: string) => ({ width: s.length * 6 }) as TextMetrics),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
}

function task(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 't',
    type: 'TASK',
    laneIndex: 0,
    label: 't',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

describe('paintScene', () => {
  it('clears, applies the DPR transform, and draws a task bar with a fillRect', () => {
    const ctx = mockCtx();
    const scene: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    const visible = paintScene(ctx, scene, VIEW, SIZE, PALETTE, 2);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(visible).toEqual(['t']);
  });

  it('draws a milestone as a filled diamond path, not a rect', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ type: 'FINISH_MILESTONE', earlyFinish: '2026-01-02' })],
      edges: [],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('strokes dependency edges when an endpoint is visible', () => {
    const ctx = mockCtx();
    const pred = task({
      id: 'p',
      earlyStart: '2026-01-02',
      earlyFinish: '2026-01-03',
      laneIndex: 0,
    });
    const succ = task({
      id: 's',
      earlyStart: '2026-01-08',
      earlyFinish: '2026-01-09',
      laneIndex: 1,
    });
    const scene: TsldScene = {
      activities: [pred, succ],
      edges: [{ predecessorId: 'p', successorId: 's', type: 'FS', isDriving: true }],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    // The edge layer moves/lines to route the polyline and strokes it.
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('encodes driving vs non-driving links without colour: heavier solid vs thin dashed (M3)', () => {
    const ctx = mockCtx();
    const pred = task({
      id: 'p',
      earlyStart: '2026-01-02',
      earlyFinish: '2026-01-03',
      laneIndex: 0,
    });
    const succ = task({
      id: 's',
      earlyStart: '2026-01-08',
      earlyFinish: '2026-01-09',
      laneIndex: 1,
    });
    const scene: TsldScene = {
      activities: [pred, succ],
      edges: [{ predecessorId: 'p', successorId: 's', type: 'FS', isDriving: false }],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    // The non-driving pass sets a dash pattern; the driving pass would set a solid ([]).
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
  });

  it('outlines a critical bar with a non-colour cue (solid dash pattern)', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ isCritical: true })],
      edges: [],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    // The bar is filled and then outlined, and the dash is reset afterwards.
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]); // solid for critical
  });

  it('outlines a near-critical bar with a dashed pattern', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ isNearCritical: true })],
      edges: [],
      dataDate: DATA_DATE,
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    expect(ctx.setLineDash).toHaveBeenCalledWith([3, 2]);
  });

  it('does not outline a non-critical bar', () => {
    const ctx = mockCtx();
    const scene: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(ctx.setLineDash).not.toHaveBeenCalled();
  });

  it('draws a selection ring on the selected activity', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ id: 't' })],
      edges: [],
      dataDate: DATA_DATE,
      selectedId: 't',
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('marks the selected bar edges when edge handles are enabled, and not otherwise', () => {
    const scene = (showEdgeHandles: boolean): TsldScene => ({
      activities: [task({ id: 't' })],
      edges: [],
      dataDate: DATA_DATE,
      selectedId: 't',
      showEdgeHandles,
    });
    // Off (read-only surface): only the bar fill, no edge marks.
    const plain = mockCtx();
    paintScene(plain, scene(false), VIEW, SIZE, PALETTE);
    expect(plain.fillRect).toHaveBeenCalledTimes(1);
    // On: the bar fill plus two edge-handle marks (start + finish).
    const editing = mockCtx();
    paintScene(editing, scene(true), VIEW, SIZE, PALETTE);
    expect(editing.fillRect).toHaveBeenCalledTimes(3);
    // The selection ring is still a single strokeRect either way.
    expect(editing.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('suppresses the edge marks for a resize-ineligible bar under direct manipulation (ADR-0052 M2)', () => {
    const scene = (type: RenderActivity['type'], timeTrueLinks: boolean): TsldScene => ({
      activities: [task({ id: 't', type })],
      edges: [],
      dataDate: DATA_DATE,
      selectedId: 't',
      showEdgeHandles: true,
      timeTrueLinks,
    });
    // Flag on: the marks advertise RESIZE, and an LOE/WBS-summary duration isn't resizable —
    // no marks (bar fill only). A plain task keeps its two marks.
    const loe = mockCtx();
    paintScene(loe, scene('LEVEL_OF_EFFORT', true), VIEW, SIZE, PALETTE);
    expect(loe.fillRect).toHaveBeenCalledTimes(1);
    const summary = mockCtx();
    paintScene(summary, scene('WBS_SUMMARY', true), VIEW, SIZE, PALETTE);
    expect(summary.fillRect).toHaveBeenCalledTimes(1);
    const taskCtx = mockCtx();
    paintScene(taskCtx, scene('TASK', true), VIEW, SIZE, PALETTE);
    expect(taskCtx.fillRect).toHaveBeenCalledTimes(3);
    // Flag off: today's link-draw affordance is untouched — an LOE still shows both marks.
    const legacy = mockCtx();
    paintScene(legacy, scene('LEVEL_OF_EFFORT', false), VIEW, SIZE, PALETTE);
    expect(legacy.fillRect).toHaveBeenCalledTimes(3);
  });

  // The pin is a triangle whose tip (the last lineTo) sits on the constrained edge.
  const pinTipX = (ctx: ReturnType<typeof mockCtx>): number => {
    const calls = ctx.lineTo.mock.calls;
    return calls[calls.length - 1]![0] as number;
  };

  it('draws a constraint pin on the START edge for a start-anchored constraint', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      { activities: [task({ constraint: 'start' })], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.fill).toHaveBeenCalledTimes(1); // the pin (a plain bar body is a fillRect)
    // A 4-day task starting 2 Jan at pxPerDay 12, originX 60: start edge left of the finish edge.
    expect(pinTipX(ctx)).toBeCloseTo(72); // rect.x = originX + 1 day * 12
  });

  it('draws the pin on the FINISH edge for a finish-anchored constraint (a different edge)', () => {
    const start = mockCtx();
    paintScene(
      start,
      { activities: [task({ constraint: 'start' })], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    const finish = mockCtx();
    paintScene(
      finish,
      { activities: [task({ constraint: 'finish' })], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    // The finish pin sits to the right of the start pin — the branch really uses the anchor.
    expect(pinTipX(finish)).toBeGreaterThan(pinTipX(start));
  });

  it('marks a constrained milestone at its centre (an extra fill beyond the diamond)', () => {
    const plain = mockCtx();
    paintScene(
      plain,
      {
        activities: [task({ type: 'FINISH_MILESTONE', earlyFinish: '2026-01-02' })],
        edges: [],
        dataDate: DATA_DATE,
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(plain.fill).toHaveBeenCalledTimes(1); // just the diamond
    const pinned = mockCtx();
    paintScene(
      pinned,
      {
        activities: [
          task({ type: 'FINISH_MILESTONE', earlyFinish: '2026-01-02', constraint: 'finish' }),
        ],
        edges: [],
        dataDate: DATA_DATE,
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(pinned.fill).toHaveBeenCalledTimes(2); // diamond + pin
  });

  it('leaves an unconstrained bar plain (no pin, so no path fill)', () => {
    const plain = mockCtx();
    paintScene(
      plain,
      { activities: [task()], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(plain.fill).not.toHaveBeenCalled();
  });

  it('washes non-working columns only when a calendar is present, the toggle is on, and zoomed in', () => {
    const scene = (over: Partial<TsldScene>): TsldScene => ({
      activities: [],
      edges: [],
      dataDate: DATA_DATE,
      view: ALL_ON,
      ...over,
    });
    const isWorkingDay = (d: number): boolean => ((d % 7) + 7) % 7 < 5; // 5 worked / 2 not
    // On: a fill per visible non-working column (no bars here, so all fillRects are the wash).
    const on = mockCtx();
    paintScene(on, scene({ isWorkingDay }), VIEW, SIZE, PALETTE);
    expect(on.fillRect).toHaveBeenCalled();
    // No calendar → nothing to shade.
    const noCal = mockCtx();
    paintScene(noCal, scene({}), VIEW, SIZE, PALETTE);
    expect(noCal.fillRect).not.toHaveBeenCalled();
    // Toggle off → nothing.
    const off = mockCtx();
    paintScene(
      off,
      scene({ isWorkingDay, view: { ...ALL_ON, nonWorking: false } }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(off.fillRect).not.toHaveBeenCalled();
    // Coarse zoom (sub-pixel columns) → culled.
    const coarse = mockCtx();
    paintScene(coarse, scene({ isWorkingDay }), { ...VIEW, pxPerDay: 1 }, SIZE, PALETTE);
    expect(coarse.fillRect).not.toHaveBeenCalled();
  });

  it('draws the TODAY marker (dashed) only when on, mapped, and on-screen', () => {
    const base: TsldScene = { activities: [], edges: [], dataDate: DATA_DATE, view: ALL_ON };
    // On-screen today → a dashed vertical (the only [4,3] dash in an edge-less scene).
    const shown = mockCtx();
    paintScene(shown, { ...base, todayOffset: 5 }, VIEW, SIZE, PALETTE);
    expect(shown.setLineDash).toHaveBeenCalledWith([4, 3]);
    expect(shown.stroke).toHaveBeenCalled();
    // Toggle off → no today dash.
    const off = mockCtx();
    paintScene(
      off,
      { ...base, todayOffset: 5, view: { ...ALL_ON, today: false } },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(off.setLineDash).not.toHaveBeenCalledWith([4, 3]);
    // Off-screen (far future) → not drawn.
    const far = mockCtx();
    paintScene(far, { ...base, todayOffset: 100000 }, VIEW, SIZE, PALETTE);
    expect(far.setLineDash).not.toHaveBeenCalledWith([4, 3]);
    // No today offset → not drawn.
    const none = mockCtx();
    paintScene(none, base, VIEW, SIZE, PALETTE);
    expect(none.setLineDash).not.toHaveBeenCalledWith([4, 3]);
  });

  it('culls per-day gridlines at coarse zoom but keeps month/year lines', () => {
    // At 1px/day the day grid is culled; month + year boundary lines still stroke.
    const ctx = mockCtx();
    paintScene(
      ctx,
      { activities: [], edges: [], dataDate: DATA_DATE, view: ALL_ON },
      { ...VIEW, pxPerDay: 1 },
      SIZE,
      PALETTE,
    );
    // Month/year boundaries over a ~800-day span still produce gridline moveTo calls.
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('culls off-screen activities (no fillRect, not in the visible set)', () => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task({ id: 'far', earlyStart: '2027-06-01', earlyFinish: '2027-06-02' })],
      edges: [],
      dataDate: DATA_DATE,
    };
    const visible = paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    expect(visible).toEqual([]);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

describe('paintInteractionLayer', () => {
  const GHOST = { x: 10, y: 10, w: 40, h: 18 };

  it('clears and draws a live ghost with a fill + solid outline', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { live: GHOST }, SIZE, PALETTE, 2);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('draws a pending ghost as a dashed outline with no fill', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { pending: GHOST }, SIZE, PALETTE);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('draws a link rubber-band line, and rings the drop target when present', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { link: { from: { x: 5, y: 5 }, to: { x: 90, y: 60 }, targetRect: GHOST } },
      SIZE,
      PALETTE,
    );
    // A dashed line from anchor to pointer…
    expect(ctx.moveTo).toHaveBeenCalledWith(5, 5);
    expect(ctx.lineTo).toHaveBeenCalledWith(90, 60);
    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 3]);
    expect(ctx.stroke).toHaveBeenCalled();
    // …and a highlight ring around the valid target.
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('draws the link line but no target ring when over empty space', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { link: { from: { x: 5, y: 5 }, to: { x: 90, y: 60 }, targetRect: null } },
      SIZE,
      PALETTE,
    );
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('rings an ILLEGAL drop target with the "can’t drop" dash (D5 legality pre-check)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      {
        link: { from: { x: 5, y: 5 }, to: { x: 90, y: 60 }, targetRect: GHOST, targetLegal: false },
      },
      SIZE,
      PALETTE,
    );
    // The illegal ring uses a distinct [3,3] dash — not colour alone (WCAG 1.4.1).
    expect(ctx.setLineDash).toHaveBeenCalledWith([3, 3]);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it('rings a LEGAL drop target solid (no "can’t drop" dash)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      {
        link: { from: { x: 5, y: 5 }, to: { x: 90, y: 60 }, targetRect: GHOST, targetLegal: true },
      },
      SIZE,
      PALETTE,
    );
    // A ring IS drawn for a legal target (guards against the branch being dropped)…
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    // …and it is solid, never the illegal [3,3] dash.
    expect(ctx.setLineDash).not.toHaveBeenCalledWith([3, 3]);
  });

  it('clears to nothing when idle (empty overlay)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, {}, SIZE, PALETTE);
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('draws the resize ghost like a live ghost PLUS its duration label (ADR-0052 M2)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { resize: { rect: GHOST, label: '7d' } }, SIZE, PALETTE);
    // The tentative bar: solid fill + solid outline, matching the reposition/create ghost.
    expect(ctx.fillRect).toHaveBeenCalledWith(GHOST.x, GHOST.y, GHOST.w, GHOST.h);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    // The live duration readout sits just above the ghost's left edge.
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const [text, , y] = ctx.fillText.mock.calls[0]! as [string, number, number];
    expect(text).toBe('7d');
    expect(y).toBeLessThan(GHOST.y);
  });

  it('draws no resize ghost (and no label) when the overlay carries none', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { live: GHOST }, SIZE, PALETTE);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('draws the lag readout chip above the dragged anchor (ADR-0052 M3)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { lag: { x: 140, y: 120, label: 'SS + 3d' } }, SIZE, PALETTE);
    // A filled, outlined chip sized to the measured text, centred on the anchor x…
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    const [chipX, chipY, chipW] = ctx.fillRect.mock.calls[0]! as [number, number, number];
    expect(chipX + chipW / 2).toBeCloseTo(140);
    // …drawn above the anchor point (never over the bar the anchor sits on).
    expect(chipY).toBeLessThan(120);
    // …speaking the tentative lag the planner is choosing.
    const [text] = ctx.fillText.mock.calls[0]! as [string];
    expect(text).toBe('SS + 3d');
  });

  it('draws no lag chip when the overlay carries none', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { resize: { rect: GHOST, label: '7d' } }, SIZE, PALETTE);
    // Only the resize readout painted text; no chip rect beyond the resize ghost's fill.
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1); // the resize ghost bar only
  });
});

describe('paintScene — activity labels (Layer 3.6)', () => {
  const wide = () => task({ id: 'w', label: 'A1020 Erect steel · 4d' });

  it('draws an inside label on a wide task bar, setting the label font once', () => {
    const ctx = mockCtx();
    paintScene(ctx, { activities: [wide()], edges: [], dataDate: DATA_DATE }, VIEW, SIZE, PALETTE);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    // A non-empty label font (the fixed LABEL_FONT) is set before any glyph is drawn.
    expect(ctx.font).not.toBe('');
    // The drawn text is the label (or a truncation of it) starting with the code.
    const drawn = ctx.fillText.mock.calls[0]![0] as string;
    expect(drawn.startsWith('A1020')).toBe(true);
  });

  it('draws nothing when the labels toggle is off', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      { activities: [wide()], edges: [], dataDate: DATA_DATE, view: { ...ALL_ON, labels: false } },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('suppresses labels below the legibility zoom threshold', () => {
    const ctx = mockCtx();
    // pxPerDay 1 is below LABEL_MIN_PX_PER_DAY (4) — no labels drawn.
    const zoomedOut: Viewport = { ...VIEW, pxPerDay: 1 };
    paintScene(
      ctx,
      { activities: [wide()], edges: [], dataDate: DATA_DATE },
      zoomedOut,
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('truncates an inside label that does not fit the bar (ends with an ellipsis)', () => {
    const ctx = mockCtx();
    // A 3-day bar is 36px wide — wide enough to place the label inside, but far narrower than the
    // full label (22 glyphs × 6px), so it must truncate with an ellipsis.
    const narrow = task({ id: 'n', label: 'A1020 Erect steel · 3d', earlyFinish: '2026-01-04' });
    paintScene(ctx, { activities: [narrow], edges: [], dataDate: DATA_DATE }, VIEW, SIZE, PALETTE);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const drawn = ctx.fillText.mock.calls[0]![0] as string;
    expect(drawn.endsWith('…')).toBe(true);
  });

  // A zero-width milestone (a diamond, not a bar) can never hold text inside, so its label — when
  // drawn — sits BESIDE the diamond, to the right, using the beside palette colour.
  const milestone = (over: Partial<RenderActivity> = {}): RenderActivity =>
    task({
      type: 'FINISH_MILESTONE',
      label: 'M1 Handover',
      earlyStart: '2026-01-02',
      earlyFinish: '2026-01-02',
      ...over,
    });

  it('draws a milestone label BESIDE the diamond (to its right) with the beside colour', () => {
    const ctx = mockCtx();
    // Alone in its lane → unbounded room to the right → the full label is placed beside, untruncated.
    paintScene(
      ctx,
      { activities: [milestone()], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const [text, x] = ctx.fillText.mock.calls[0]!;
    expect(text).toBe('M1 Handover');
    // The diamond is centred on day-offset 1 (cx=72, radius 7): its bounding box is x 65–79. The
    // label sits to the right of that edge (beside, never inside/over it), in the beside colour.
    expect(x as number).toBeGreaterThan(79);
    expect(ctx.fillStyle).toBe(PALETTE.labelBeside);
  });

  it('suppresses a label whose same-lane neighbour leaves too little room (placement "none")', () => {
    const ctx = mockCtx();
    // Two same-lane milestones two days apart: the LEFT one has < LABEL_BESIDE_MIN_PX of clear
    // room before the right diamond, so its label is suppressed; only the right (unbounded room)
    // draws. One fillText, not two — proving the "none" branch fired for the crowded bar.
    const left = milestone({ id: 'l' });
    const right = milestone({
      id: 'r',
      label: 'M2 Done',
      earlyStart: '2026-01-04',
      earlyFinish: '2026-01-04',
    });
    paintScene(
      ctx,
      { activities: [left, right], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    // Only the right diamond's label drew — the left ('M1 Handover') was suppressed by its neighbour.
    expect(ctx.fillText.mock.calls[0]![0]).toBe('M2 Done');
  });

  it('truncates a beside label when the neighbour leaves only partial room', () => {
    const ctx = mockCtx();
    // Neighbour four days right (x=120): ~32px of clear room beside the left diamond — enough to
    // place a beside label (≥ LABEL_BESIDE_MIN_PX) but far too narrow for the 66px label, so it
    // truncates with an ellipsis; the right diamond (unbounded room) draws its label in full.
    const left = milestone({ id: 'l' });
    const right = milestone({ id: 'r', earlyStart: '2026-01-06', earlyFinish: '2026-01-06' });
    paintScene(
      ctx,
      { activities: [left, right], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    // Lane rows are x-sorted, so the crowded left diamond is drawn first — and truncated.
    expect((ctx.fillText.mock.calls[0]![0] as string).endsWith('…')).toBe(true);
  });
});

// ── Insight lenses (spec `docs/specs/canvas-lenses/`) ──────────────────────────────────────
// A recording ctx that logs method calls AND property assignments in order, so two paints can be
// compared byte-for-byte (the flag-off / no-lens parity gate).
function recordingCtx(base: Record<string, unknown> = mockCtx()): {
  ctx: Parameters<typeof paintScene>[0];
  log: string[];
} {
  const target: Record<string | symbol, unknown> = base;
  const log: string[] = [];
  const proxy = new Proxy(target, {
    get(t, prop) {
      const value = t[prop];
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          log.push(`${String(prop)}(${JSON.stringify(args)})`);
          return (value as (...a: unknown[]) => unknown)(...args);
        };
      }
      return value;
    },
    set(t, prop, value) {
      log.push(`${String(prop)}=${String(value)}`);
      t[prop] = value;
      return true;
    },
  });
  return { ctx: proxy as unknown as Parameters<typeof paintScene>[0], log };
}

describe('paintScene — insight lenses', () => {
  const lensScene: TsldScene = {
    activities: [
      task({ id: 'a', isCritical: true }),
      task({ id: 'b', earlyStart: '2026-01-06', earlyFinish: '2026-01-08' }),
    ],
    edges: [],
    dataDate: DATA_DATE,
  };

  it('is byte-for-byte identical whether the lens fields are absent or explicitly undefined (parity)', () => {
    const a = recordingCtx();
    paintScene(a.ctx, lensScene, VIEW, SIZE, PALETTE);
    const b = recordingCtx();
    paintScene(
      b.ctx,
      {
        ...lensScene,
        dimmedIds: undefined,
        barFill: undefined,
        barInk: undefined,
        baselineGhosts: undefined,
        flaggedIds: undefined,
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(b.log).toEqual(a.log);
  });

  it('dims a filtered-out bar via reduced alpha but restores full alpha for the outline/badges', () => {
    const { ctx, log } = recordingCtx();
    paintScene(ctx, { ...lensScene, dimmedIds: new Set(['b']) }, VIEW, SIZE, PALETTE);
    // The dimmed bar drops alpha; the loop restores it to 1 before drawing outlines/cues.
    expect(log).toContain('globalAlpha=0.3');
    expect(log).toContain('globalAlpha=1');
  });

  it('never reduces alpha when no bar is dimmed', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(r.ctx, lensScene, VIEW, SIZE, PALETTE);
      return r;
    })();
    expect(log.some((entry) => entry.startsWith('globalAlpha=') && entry !== 'globalAlpha=1')).toBe(
      false,
    );
  });

  it('honours a Colour-by barFill override, falling back to today for absent ids', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(
        r.ctx,
        { ...lensScene, barFill: new Map([['a', '#override']]) },
        VIEW,
        SIZE,
        PALETTE,
      );
      return r;
    })();
    // The overridden id paints with the map colour; the other bar falls back to today's fill.
    expect(log).toContain('fillStyle=#override');
    expect(log).toContain(`fillStyle=${PALETTE.bar}`);
  });

  it('draws a culled dashed ghost layer for the baseline overlay, beneath the bars', () => {
    const ctx = mockCtx();
    const withGhost: TsldScene = {
      ...lensScene,
      baselineGhosts: [
        {
          id: 'a',
          baselineStart: '2026-01-02',
          baselineFinish: '2026-01-04',
          laneIndex: 0,
          isMilestone: false,
        },
      ],
    };
    const strokeRectsWithout = ((): number => {
      const c = mockCtx();
      paintScene(c, lensScene, VIEW, SIZE, PALETTE);
      return c.strokeRect.mock.calls.length;
    })();
    paintScene(ctx, withGhost, VIEW, SIZE, PALETTE);
    // The ghost adds an outline stroke rect (the critical bar 'a' already strokes its outline).
    expect(ctx.strokeRect.mock.calls.length).toBeGreaterThan(strokeRectsWithout);
    expect(ctx.setLineDash).toHaveBeenCalledWith([2, 2]);
  });

  it('culls an off-screen ghost (no stroke for a ghost far outside the viewport)', () => {
    const ctx = mockCtx();
    const before = ((): number => {
      const c = mockCtx();
      paintScene(c, lensScene, VIEW, SIZE, PALETTE);
      return c.strokeRect.mock.calls.length;
    })();
    paintScene(
      ctx,
      {
        ...lensScene,
        // A ghost 10 years out is far to the right of the 800px viewport.
        baselineGhosts: [
          {
            id: 'a',
            baselineStart: '2036-01-02',
            baselineFinish: '2036-01-04',
            laneIndex: 0,
            isMilestone: false,
          },
        ],
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.strokeRect.mock.calls.length).toBe(before);
  });

  it('culls a ghost BY COUNT when its live bar is off-screen, before any geometry (P1)', () => {
    const ctx = mockCtx();
    // The live activity is far off-screen (culled — not in `visibleIds`), so even though the ghost's
    // OWN baseline span is on-screen, the ghost must not stroke: the id-in-visibleIds check runs first.
    paintScene(
      ctx,
      {
        activities: [task({ id: 'far', earlyStart: '2027-06-01', earlyFinish: '2027-06-02' })],
        edges: [],
        dataDate: DATA_DATE,
        baselineGhosts: [
          {
            id: 'far',
            baselineStart: '2026-01-02', // on-screen dates
            baselineFinish: '2026-01-04',
            laneIndex: 0,
            isMilestone: false,
          },
        ],
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    // The far bar is culled (no fill) and its ghost is culled by count (no stroke).
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('ghosts a milestone as a diamond OUTLINE (a stroked path), not a rect', () => {
    const ctx = mockCtx();
    const strokeRectsWithout = ((): number => {
      const c = mockCtx();
      paintScene(c, lensScene, VIEW, SIZE, PALETTE);
      return c.strokeRect.mock.calls.length;
    })();
    paintScene(
      ctx,
      {
        ...lensScene,
        baselineGhosts: [
          {
            id: 'a',
            baselineStart: '2026-01-03',
            baselineFinish: '2026-01-03', // a point (milestone)
            laneIndex: 0,
            isMilestone: true,
          },
        ],
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    // The milestone ghost adds NO strokeRect (it's a diamond path) but does open + stroke a path with
    // the ghost dash — lensScene's bars are rects, so `beginPath` here comes from the diamond.
    expect(ctx.strokeRect.mock.calls.length).toBe(strokeRectsWithout);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([2, 2]);
  });

  it('dims a ghost whose id is filtered out (reduced alpha), matching its dimmed live bar', () => {
    const { ctx, log } = recordingCtx();
    paintScene(
      ctx,
      {
        ...lensScene,
        dimmedIds: new Set(['b']),
        baselineGhosts: [
          {
            id: 'b',
            baselineStart: '2026-01-06',
            baselineFinish: '2026-01-08',
            laneIndex: 0,
            isMilestone: false,
          },
        ],
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    // The ghost layer runs before the bars, so the FIRST strokeRect is the ghost; the most recent
    // globalAlpha set before it must be the dim (0.3) — the ghost recedes with its dimmed live bar.
    const firstStroke = log.findIndex((e) => e.startsWith('strokeRect('));
    const priorAlpha = log
      .slice(0, firstStroke)
      .filter((e) => e.startsWith('globalAlpha='))
      .at(-1);
    expect(priorAlpha).toBe('globalAlpha=0.3');
  });

  it('honours a Colour-by barInk override for the inside-bar label ink', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(
        r.ctx,
        {
          activities: [task({ id: 'w', label: 'A1020 Erect steel · 4d' })],
          edges: [],
          dataDate: DATA_DATE,
          barFill: new Map([['w', '#fill']]),
          barInk: new Map([['w', '#ink']]),
        },
        VIEW,
        SIZE,
        PALETTE,
      );
      return r;
    })();
    // The bar paints the override fill and its inside label paints the paired override ink.
    expect(log).toContain('fillStyle=#fill');
    expect(log).toContain('fillStyle=#ink');
  });
});

// ── Over-allocation highlight (Stage E M2, spec `docs/specs/canvas-resource-view/`) ─────────
describe('paintScene — over-allocation highlight', () => {
  const flagScene: TsldScene = {
    activities: [
      task({ id: 'a' }),
      task({ id: 'b', earlyStart: '2026-01-06', earlyFinish: '2026-01-08' }),
    ],
    edges: [],
    dataDate: DATA_DATE,
  };

  it('is byte-for-byte identical whether `flaggedIds` is absent or explicitly undefined (parity)', () => {
    const a = recordingCtx();
    paintScene(a.ctx, flagScene, VIEW, SIZE, PALETTE);
    const b = recordingCtx();
    paintScene(b.ctx, { ...flagScene, flaggedIds: undefined }, VIEW, SIZE, PALETTE);
    expect(b.log).toEqual(a.log);
  });

  it('is byte-for-byte identical to no-field when the flagged set is empty (mode-off parity)', () => {
    const a = recordingCtx();
    paintScene(a.ctx, flagScene, VIEW, SIZE, PALETTE);
    const b = recordingCtx();
    paintScene(b.ctx, { ...flagScene, flaggedIds: new Set() }, VIEW, SIZE, PALETTE);
    expect(b.log).toEqual(a.log);
  });

  it('draws the mini-histogram badge (extra fillRects + outline strokeRects) for a flagged bar', () => {
    const base = mockCtx();
    paintScene(base, flagScene, VIEW, SIZE, PALETTE);
    const flagged = mockCtx();
    paintScene(flagged, { ...flagScene, flaggedIds: new Set(['a']) }, VIEW, SIZE, PALETTE);
    // One flagged bar ⇒ three ascending mini-bars, each a fillRect + a foreground-outline strokeRect.
    expect(flagged.fillRect.mock.calls.length).toBe(base.fillRect.mock.calls.length + 3);
    expect(flagged.strokeRect.mock.calls.length).toBe(base.strokeRect.mock.calls.length + 3);
  });

  it('marks the badge in the warning hue (non-colour-only shape carries a foreground outline)', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(r.ctx, { ...flagScene, flaggedIds: new Set(['a']) }, VIEW, SIZE, PALETTE);
      return r;
    })();
    // The mini-bars fill in the WARNING hue (not the critical red — N2), each carrying the foreground
    // outline stroke (WCAG 1.4.11). PALETTE.conflict differs from PALETTE.critical, so this pins the hue.
    expect(log).toContain(`fillStyle=${PALETTE.conflict}`);
    expect(log).toContain(`strokeStyle=${PALETTE.outline}`);
  });

  it('only badges the flagged ids, not every bar (set-membership per bar)', () => {
    const one = mockCtx();
    paintScene(one, { ...flagScene, flaggedIds: new Set(['a']) }, VIEW, SIZE, PALETTE);
    const both = mockCtx();
    paintScene(both, { ...flagScene, flaggedIds: new Set(['a', 'b']) }, VIEW, SIZE, PALETTE);
    // Flagging the second bar adds exactly one more badge (three more mini-bars).
    expect(both.fillRect.mock.calls.length).toBe(one.fillRect.mock.calls.length + 3);
  });

  it('does not badge a culled (off-screen) flagged bar', () => {
    const offScreen = task({ id: 'z', earlyStart: '2035-01-01', earlyFinish: '2035-01-05' });
    const base = mockCtx();
    paintScene(
      base,
      { activities: [offScreen], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    const flagged = mockCtx();
    paintScene(
      flagged,
      { activities: [offScreen], edges: [], dataDate: DATA_DATE, flaggedIds: new Set(['z']) },
      VIEW,
      SIZE,
      PALETTE,
    );
    // The bar is culled, so no badge is drawn — the flagged paint equals the base paint.
    expect(flagged.fillRect.mock.calls.length).toBe(base.fillRect.mock.calls.length);
    expect(flagged.strokeRect.mock.calls.length).toBe(base.strokeRect.mock.calls.length);
  });
});

// ── Time-true anchors + arrowheads (ADR-0052 M1, behind `VITE_CANVAS_DIRECT_MANIPULATION`) ──
describe('paintScene — time-true links', () => {
  // A synthetic week keyed by day offset (0–4 working, 5–6 not), matching the render-model tests.
  const isWorkingDay = (d: number): boolean => ((d % 7) + 7) % 7 < 5;
  const pred = task({ id: 'p', earlyStart: '2026-01-02', earlyFinish: '2026-01-04', laneIndex: 0 });
  const succ = task({ id: 's', earlyStart: '2026-01-02', earlyFinish: '2026-01-14', laneIndex: 1 });
  const linkScene = (over: Partial<TsldScene> = {}): TsldScene => ({
    activities: [pred, succ],
    edges: [
      {
        predecessorId: 'p',
        successorId: 's',
        type: 'FS',
        isDriving: true,
        lagDays: 2,
        lagCalendar: 'PROJECT_DEFAULT',
      },
    ],
    dataDate: DATA_DATE,
    isWorkingDay,
    ...over,
  });

  it('is byte-for-byte today’s paint when the flag is off, absent, or explicitly undefined (parity)', () => {
    const base = recordingCtx();
    paintScene(base.ctx, linkScene(), VIEW, SIZE, PALETTE);
    const off = recordingCtx();
    paintScene(off.ctx, linkScene({ timeTrueLinks: false }), VIEW, SIZE, PALETTE);
    const explicit = recordingCtx();
    paintScene(explicit.ctx, linkScene({ timeTrueLinks: undefined }), VIEW, SIZE, PALETTE);
    expect(off.log).toEqual(base.log);
    expect(explicit.log).toEqual(base.log);
  });

  it('draws a batched arrowhead fill at the successor end when the flag is on', () => {
    const off = mockCtx();
    paintScene(off, linkScene(), VIEW, SIZE, PALETTE);
    expect(off.fill).not.toHaveBeenCalled(); // plain task bars: no path fill without arrowheads
    const on = mockCtx();
    paintScene(on, linkScene({ timeTrueLinks: true }), VIEW, SIZE, PALETTE);
    expect(on.fill).toHaveBeenCalledTimes(1); // one batched arrowhead pass for the driving edge
    expect(on.fillStyle).not.toBe(''); // set — the head shares the edge colour (checked below)
  });

  it('paints the arrowheads in the edge colour — no new one-off colour', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(r.ctx, linkScene({ timeTrueLinks: true }), VIEW, SIZE, PALETTE);
      return r;
    })();
    expect(log).toContain(`fillStyle=${PALETTE.edge}`);
  });

  it('retains the driving weight/dash emphasis (non-colour cue) with the flag on', () => {
    const ctx = mockCtx();
    const scene = linkScene({
      timeTrueLinks: true,
      edges: [
        {
          predecessorId: 'p',
          successorId: 's',
          type: 'FS',
          isDriving: false,
          lagDays: 2,
          lagCalendar: 'PROJECT_DEFAULT',
        },
      ],
    });
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
    // The non-driving pass still strokes thin + dashed; the solid reset still happens.
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
  });

  it('shifts the anchor by the walked lag (an SS lag departs INTO the predecessor bar)', () => {
    // Same-lane pair → the edge is a single straight segment, so its moveTo is the pred anchor.
    // All decorative layers are toggled off so the only moveTos are the edge + its arrowhead tip.
    const quiet = {
      dayGrid: false,
      monthGrid: false,
      yearGrid: false,
      today: false,
      nonWorking: false,
      labels: false,
      lateOverlay: false,
    };
    const sameLane = task({ ...succ, laneIndex: 0, id: 's2' });
    const sceneWith = (lagDays: number): TsldScene =>
      linkScene({
        timeTrueLinks: true,
        view: quiet,
        activities: [pred, sameLane],
        edges: [
          {
            predecessorId: 'p',
            successorId: 's2',
            type: 'SS',
            isDriving: true,
            lagDays,
            lagCalendar: 'PROJECT_DEFAULT',
          },
        ],
      });
    const zero = mockCtx();
    paintScene(zero, sceneWith(0), VIEW, SIZE, PALETTE);
    const lagged = mockCtx();
    paintScene(lagged, sceneWith(3), VIEW, SIZE, PALETTE);
    // Pred starts day 1 (x=72 at 12px/day, originX 60); three working days embed → x=108.
    expect(zero.moveTo.mock.calls[0]![0]).toBeCloseTo(72);
    expect(lagged.moveTo.mock.calls[0]![0]).toBeCloseTo(108);
  });

  it('walks a TWENTY_FOUR_HOUR lag in elapsed days, not working days', () => {
    // Pred finishes day 3 (edge day 4 = x 108); days 5/6 are the synthetic weekend. A +3 lag:
    // elapsed lands day 7 (x 144); the working-day walk skips the weekend and lands day 9.
    const quiet = {
      dayGrid: false,
      monthGrid: false,
      yearGrid: false,
      today: false,
      nonWorking: false,
      labels: false,
      lateOverlay: false,
    };
    const sameLane = task({ ...succ, laneIndex: 0, id: 's2' });
    const sceneFor = (lagCalendar: 'PROJECT_DEFAULT' | 'TWENTY_FOUR_HOUR'): TsldScene =>
      linkScene({
        timeTrueLinks: true,
        view: quiet,
        activities: [pred, sameLane],
        edges: [
          {
            predecessorId: 'p',
            successorId: 's2',
            type: 'FS',
            isDriving: true,
            lagDays: 3,
            lagCalendar,
          },
        ],
      });
    const elapsed = mockCtx();
    paintScene(elapsed, sceneFor('TWENTY_FOUR_HOUR'), VIEW, SIZE, PALETTE);
    const workingWalked = mockCtx();
    paintScene(workingWalked, sceneFor('PROJECT_DEFAULT'), VIEW, SIZE, PALETTE);
    // The straight edge's lineTo is the successor anchor (the constrained point).
    expect(elapsed.lineTo.mock.calls[0]![0]).toBeCloseTo(144); // day 7
    expect(workingWalked.lineTo.mock.calls[0]![0]).toBeCloseTo(168); // day 9 (weekend skipped)
  });

  it('falls back to the extreme-end routing when dates are absent (no crash, no anchor math)', () => {
    const ctx = mockCtx();
    const unscheduled = task({ id: 'u', earlyStart: null, earlyFinish: null, laneIndex: 1 });
    paintScene(
      ctx,
      linkScene({
        timeTrueLinks: true,
        activities: [pred, unscheduled],
        edges: [
          {
            predecessorId: 'p',
            successorId: 'u',
            type: 'FS',
            isDriving: false,
            lagDays: 2,
            lagCalendar: 'PROJECT_DEFAULT',
          },
        ],
      }),
      VIEW,
      SIZE,
      PALETTE,
    );
    // The unscheduled endpoint has no geometry, so no edge line and no arrowhead — like today.
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});

// ── Bar visual refresh (ADR-0052 M4, behind the SAME `VITE_CANVAS_DIRECT_MANIPULATION`) ─────
describe('paintScene — bar visual refresh (ADR-0052 M4)', () => {
  /** All decorative layers off so the recorded calls are the bars alone. */
  const quiet = {
    dayGrid: false,
    monthGrid: false,
    yearGrid: false,
    today: false,
    nonWorking: false,
    labels: false,
    lateOverlay: false,
  } as const;
  const refreshScene = (over: Partial<TsldScene> = {}): TsldScene => ({
    activities: [task()],
    edges: [],
    dataDate: DATA_DATE,
    view: quiet,
    visualRefresh: true,
    ...over,
  });
  /** A ctx whose roundRect is real enough to record (the modern-browser path). */
  const roundedCtx = () => ({ ...mockCtx(), roundRect: vi.fn() });

  it('is byte-for-byte today’s paint when the flag is off, absent, or explicitly undefined (parity)', () => {
    // A scene exercising every refreshed branch: critical + progress, near-critical, LOE,
    // summary, milestone, constraint pin, selection ring, labels on — all must paint byte-for-
    // byte today's when `visualRefresh` is off/absent/undefined.
    const rich = (visualRefresh?: boolean): TsldScene => ({
      activities: [
        task({ id: 'a', isCritical: true, percentComplete: 50, constraint: 'start' }),
        task({ id: 'b', isNearCritical: true, laneIndex: 1, percentComplete: 100 }),
        task({ id: 'c', type: 'LEVEL_OF_EFFORT', laneIndex: 2 }),
        task({ id: 'd', type: 'WBS_SUMMARY', laneIndex: 3 }),
        task({ id: 'e', type: 'FINISH_MILESTONE', earlyFinish: '2026-01-02', laneIndex: 4 }),
      ],
      edges: [],
      dataDate: DATA_DATE,
      selectedId: 'a',
      ...(visualRefresh === undefined ? {} : { visualRefresh }),
    });
    const base = recordingCtx();
    paintScene(base.ctx, rich(), VIEW, SIZE, PALETTE);
    const off = recordingCtx();
    paintScene(off.ctx, rich(false), VIEW, SIZE, PALETTE);
    const explicit = recordingCtx();
    paintScene(explicit.ctx, { ...rich(), visualRefresh: undefined }, VIEW, SIZE, PALETTE);
    expect(off.log).toEqual(base.log);
    expect(explicit.log).toEqual(base.log);
  });

  it('rounds the bar with roundRect when available, and falls back to fillRect when not', () => {
    const rounded = roundedCtx();
    paintScene(rounded, refreshScene(), VIEW, SIZE, PALETTE);
    // Bar body fills through the rounded path (no square fillRect for the body)…
    expect(rounded.roundRect).toHaveBeenCalled();
    expect(rounded.fill).toHaveBeenCalled();
    expect(rounded.fillRect).not.toHaveBeenCalled();
    // The task() bar rect: day 1..4 at 12px/day, originX 60 → x 72, w 48; lane 0 → y 45, h 18.
    expect(rounded.roundRect.mock.calls[0]).toEqual([72, 45, 48, 18, 3]);
    // …while a minimal context (no roundRect) degrades to the square fill, never throwing.
    const square = mockCtx();
    paintScene(square, refreshScene(), VIEW, SIZE, PALETTE);
    expect(square.fillRect).toHaveBeenCalledWith(72, 45, 48, 18);
  });

  it('strokes a calm hairline (barStroke, 1px) around a non-critical bar', () => {
    const { ctx, log } = recordingCtx();
    paintScene(ctx, refreshScene(), VIEW, SIZE, PALETTE);
    expect(log).toContain(`strokeStyle=${PALETTE.barStroke}`);
    expect(log).toContain('lineWidth=1');
    // Legacy left a non-critical bar strokeless; the refresh gives it the definition stroke.
    expect(log.some((e) => e.startsWith('strokeRect('))).toBe(true);
  });

  it('emphasises critical/near-critical (2px outline) while retaining the solid/dashed cue', () => {
    const critical = recordingCtx();
    paintScene(
      critical.ctx,
      refreshScene({ activities: [task({ isCritical: true })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(critical.log).toContain('lineWidth=2');
    expect(critical.log).toContain(`strokeStyle=${PALETTE.outline}`);
    expect(critical.log).toContain('setLineDash([[]])');
    // The critical bar never gets the calm hairline — emphasis replaces it, so it pops.
    expect(critical.log).not.toContain(`strokeStyle=${PALETTE.barStroke}`);
    const near = recordingCtx();
    paintScene(
      near.ctx,
      refreshScene({ activities: [task({ isNearCritical: true })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(near.log).toContain('setLineDash([[3,2]])');
    expect(near.log).toContain('lineWidth=2');
  });

  it('draws the in-bar progress band + hairline front divider in the bar’s paired ink', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      refreshScene({ activities: [task({ percentComplete: 50 })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    // Square-fallback ctx: bar body + band + divider = 3 fillRects.
    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
    // Band: inset 2 inside the 72..120 × 45..63 bar, along the bottom → x 74, y 57, w 22, h 4.
    expect(ctx.fillRect).toHaveBeenCalledWith(74, 57, 22, 4);
    // Divider: a 1px hairline at the progress front (x 96), clamped to the band's own vertical
    // extent (y 57..61) so it never slices through the centred inside label (ux review).
    expect(ctx.fillRect).toHaveBeenCalledWith(95.5, 57, 1, 4);
  });

  it('draws no divider at 100% and no band at 0%/absent', () => {
    const done = mockCtx();
    paintScene(
      done,
      refreshScene({ activities: [task({ percentComplete: 100 })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(done.fillRect).toHaveBeenCalledTimes(2); // body + full band, no divider
    expect(done.fillRect).toHaveBeenCalledWith(74, 57, 44, 4);
    const zero = mockCtx();
    paintScene(
      zero,
      refreshScene({ activities: [task({ percentComplete: 0 })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(zero.fillRect).toHaveBeenCalledTimes(1); // body only
    const absent = mockCtx();
    paintScene(absent, refreshScene(), VIEW, SIZE, PALETTE);
    expect(absent.fillRect).toHaveBeenCalledTimes(1);
  });

  it('culls the progress detail below the zoom LOD threshold (like labels)', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      refreshScene({ activities: [task({ percentComplete: 50 })] }),
      { ...VIEW, pxPerDay: 3 }, // below PROGRESS_MIN_PX_PER_DAY (4)
      SIZE,
      PALETTE,
    );
    expect(ctx.fillRect).toHaveBeenCalledTimes(1); // body only — no sub-pixel smear
  });

  it('progress ink follows the criticality pairing and the lens barInk override', () => {
    const normal = recordingCtx();
    paintScene(
      normal.ctx,
      refreshScene({ activities: [task({ percentComplete: 50 })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(normal.log).toContain(`fillStyle=${PALETTE.labelInside}`);
    const critical = recordingCtx();
    paintScene(
      critical.ctx,
      refreshScene({ activities: [task({ percentComplete: 50, isCritical: true })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(critical.log).toContain(`fillStyle=${PALETTE.labelInsideCritical}`);
    // Under a Colour-by lens the paired barInk override carries the band, so contrast holds on
    // the recoloured fill (the lens owns colour; the refresh only adds shape).
    const lensed = recordingCtx();
    paintScene(
      lensed.ctx,
      refreshScene({
        activities: [task({ percentComplete: 50 })],
        barFill: new Map([['t', '#fill']]),
        barInk: new Map([['t', '#ink']]),
      }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(lensed.log).toContain('fillStyle=#fill');
    expect(lensed.log).toContain('fillStyle=#ink');
  });

  it('dims the progress detail with a filter-dimmed bar, restoring full alpha for the outline', () => {
    const { ctx, log } = recordingCtx();
    paintScene(
      ctx,
      refreshScene({
        activities: [task({ percentComplete: 50 })],
        dimmedIds: new Set(['t']),
      }),
      VIEW,
      SIZE,
      PALETTE,
    );
    // The band paints between the dim and the restore — it recedes with its bar.
    const dimAt = log.indexOf('globalAlpha=0.3');
    const restoreAt = log.indexOf('globalAlpha=1');
    const bandAt = log.findIndex((e) => e === 'fillRect([74,57,22,4])');
    expect(dimAt).toBeGreaterThanOrEqual(0);
    expect(bandAt).toBeGreaterThan(dimAt);
    expect(restoreAt).toBeGreaterThan(bandAt);
  });

  it('draws the LOE/hammock bracketed span: end caps in the bar’s own fill', () => {
    for (const type of ['LEVEL_OF_EFFORT', 'HAMMOCK'] as const) {
      const ctx = mockCtx();
      paintScene(ctx, refreshScene({ activities: [task({ type })] }), VIEW, SIZE, PALETTE);
      // Body + two bracket caps (overhanging the bar by 3px top and bottom).
      expect(ctx.fillRect).toHaveBeenCalledTimes(3);
      expect(ctx.fillRect).toHaveBeenCalledWith(72, 42, 2, 24);
      expect(ctx.fillRect).toHaveBeenCalledWith(118, 42, 2, 24);
    }
  });

  it('draws the WBS-summary bracket: downward end tabs in the bar’s own fill', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      refreshScene({ activities: [task({ type: 'WBS_SUMMARY' })] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
    expect(ctx.fillRect).toHaveBeenCalledWith(72, 63, 3, 4);
    expect(ctx.fillRect).toHaveBeenCalledWith(117, 63, 3, 4);
  });

  it('gives a non-critical milestone the hairline diamond outline (consistent glyph language)', () => {
    const { ctx, log } = recordingCtx();
    paintScene(
      ctx,
      refreshScene({
        activities: [task({ type: 'FINISH_MILESTONE', earlyFinish: '2026-01-02' })],
      }),
      VIEW,
      SIZE,
      PALETTE,
    );
    // The diamond fills, then strokes the same path with the calm definition stroke — the
    // stroke lands AFTER the barStroke style is set (the grid layer's stroke precedes it).
    const styleAt = log.indexOf(`strokeStyle=${PALETTE.barStroke}`);
    expect(styleAt).toBeGreaterThanOrEqual(0);
    expect(log.slice(styleAt).some((e) => e === 'stroke([])')).toBe(true);
    // A critical milestone keeps the emphasised outline + solid dash instead.
    const critical = recordingCtx();
    paintScene(
      critical.ctx,
      refreshScene({
        activities: [
          task({ type: 'FINISH_MILESTONE', earlyFinish: '2026-01-02', isCritical: true }),
        ],
      }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(critical.log).toContain(`strokeStyle=${PALETTE.outline}`);
    expect(critical.log).toContain('lineWidth=2');
    expect(critical.log).toContain('setLineDash([[]])');
  });

  it('composes with a Colour-by barFill override — the lens still decides the base colour', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(
        r.ctx,
        refreshScene({ activities: [task()], barFill: new Map([['t', '#override']]) }),
        VIEW,
        SIZE,
        PALETTE,
      );
      return r;
    })();
    expect(log).toContain('fillStyle=#override');
  });

  it('outlines the constraint pin (badge-family consistency) under the refresh only', () => {
    const scene = (visualRefresh: boolean): TsldScene => ({
      activities: [task({ constraint: 'start' })],
      edges: [],
      dataDate: DATA_DATE,
      view: quiet,
      visualRefresh,
    });
    const legacy = mockCtx();
    paintScene(legacy, scene(false), VIEW, SIZE, PALETTE);
    const refreshed = mockCtx();
    paintScene(refreshed, scene(true), VIEW, SIZE, PALETTE);
    // Same pin shape (one path fill beyond the bar), plus one traced outline stroke under M4.
    expect(legacy.fill).toHaveBeenCalledTimes(1);
    expect(refreshed.fill).toHaveBeenCalledTimes(1);
    expect(refreshed.stroke.mock.calls.length).toBe(legacy.stroke.mock.calls.length + 1);
  });

  it('preserves the conflict / lane-overlap / over-allocation badges byte-for-byte in shape count', () => {
    // The three warning badges are restyle-exempt (already outlined, one family): the refresh
    // must not change their draw-call counts relative to a legacy paint of the same scene.
    const scene = (visualRefresh: boolean): TsldScene => ({
      activities: [task({ visualConflict: true, laneOverlap: true })],
      edges: [],
      dataDate: DATA_DATE,
      view: quiet,
      flaggedIds: new Set(['t']),
      visualRefresh,
    });
    const legacy = mockCtx();
    paintScene(legacy, scene(false), VIEW, SIZE, PALETTE);
    const refreshed = mockCtx();
    paintScene(refreshed, scene(true), VIEW, SIZE, PALETTE);
    // Badge fills: conflict triangle path (fill) is unchanged; the squares + histogram fillRects
    // are unchanged; the refreshed bar adds exactly one hairline strokeRect over the legacy count
    // (the legacy non-critical bar had none) and no extra path fills.
    expect(refreshed.fill.mock.calls.length).toBe(legacy.fill.mock.calls.length);
    expect(refreshed.fillRect.mock.calls.length).toBe(legacy.fillRect.mock.calls.length);
    expect(refreshed.strokeRect.mock.calls.length).toBe(legacy.strokeRect.mock.calls.length + 1);
  });

  it('rounds the selection ring with the bar (roundRect path) and keeps the square fallback', () => {
    const scene = refreshScene({ selectedId: 't' });
    const rounded = roundedCtx();
    paintScene(rounded, scene, VIEW, SIZE, PALETTE);
    // The ring is the outermost rounded path: rect ± 2 with radius BAR_RADIUS + 2.
    expect(rounded.roundRect).toHaveBeenCalledWith(70, 43, 52, 22, 5);
    const square = mockCtx();
    paintScene(square, scene, VIEW, SIZE, PALETTE);
    expect(square.strokeRect).toHaveBeenCalledWith(70, 43, 52, 22);
  });

  it('nudges an inside label clear of the rounded corner (pad +2) under the refresh', () => {
    const label = 'A1020 Erect steel · 4d';
    const legacy = mockCtx();
    paintScene(
      legacy,
      { activities: [task({ label })], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    const refreshed = mockCtx();
    paintScene(
      refreshed,
      { activities: [task({ label })], edges: [], dataDate: DATA_DATE, visualRefresh: true },
      VIEW,
      SIZE,
      PALETTE,
    );
    const legacyX = legacy.fillText.mock.calls[0]![1] as number;
    const refreshedX = refreshed.fillText.mock.calls[0]![1] as number;
    expect(legacyX).toBe(72 + 3); // LABEL_PAD_PX
    expect(refreshedX).toBe(72 + 5); // LABEL_PAD_PX + 2
  });

  it('leaves beside labels (milestones) at their legacy position — only inside pad changes', () => {
    const milestone = task({
      type: 'FINISH_MILESTONE',
      label: 'M1 Handover',
      earlyStart: '2026-01-02',
      earlyFinish: '2026-01-02',
    });
    const legacy = mockCtx();
    paintScene(
      legacy,
      { activities: [milestone], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    const refreshed = mockCtx();
    paintScene(
      refreshed,
      { activities: [milestone], edges: [], dataDate: DATA_DATE, visualRefresh: true },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(refreshed.fillText.mock.calls[0]).toEqual(legacy.fillText.mock.calls[0]);
  });

  it('keeps the overlap-badge lift clear of the (now outlined) constraint pin under the refresh', () => {
    // A bar carrying BOTH the pin and the lane-overlap squares: the refresh must keep the
    // existing stacking (lift) — same squares, same counts — while only adding the pin outline.
    const both = (visualRefresh: boolean): TsldScene => ({
      activities: [task({ constraint: 'start', laneOverlap: true })],
      edges: [],
      dataDate: DATA_DATE,
      view: quiet,
      visualRefresh,
    });
    const legacy = mockCtx();
    paintScene(legacy, both(false), VIEW, SIZE, PALETTE);
    const refreshed = mockCtx();
    paintScene(refreshed, both(true), VIEW, SIZE, PALETTE);
    // The two lifted squares are unchanged in count and position (their fillRects match, after
    // the differing bar-body draws are accounted: legacy body 1 fillRect, refresh body 1 fillRect).
    const squares = (ctx: ReturnType<typeof mockCtx>) =>
      ctx.fillRect.mock.calls.filter((c) => c[2] === 5 && c[3] === 5); // OVERLAP_BADGE_S sides
    expect(squares(refreshed)).toEqual(squares(legacy));
    // The pin gains exactly one outline stroke; the squares keep their outlines.
    expect(refreshed.stroke.mock.calls.length).toBe(legacy.stroke.mock.calls.length + 1);
  });
});

describe('paintInteractionLayer — visual refresh + hover (ADR-0052 M4)', () => {
  const GHOST = { x: 10, y: 10, w: 40, h: 18 };
  const roundedCtx = () => ({ ...mockCtx(), roundRect: vi.fn() });

  it('is byte-for-byte the legacy overlay when the refresh fields are absent/off (parity)', () => {
    const base = recordingCtx();
    paintInteractionLayer(base.ctx, { live: GHOST }, SIZE, PALETTE);
    const off = recordingCtx();
    paintInteractionLayer(
      off.ctx,
      { live: GHOST, visualRefresh: false, hover: null },
      SIZE,
      PALETTE,
    );
    expect(off.log).toEqual(base.log);
  });

  it('draws the hover ring (hoverRing hue, 1.5px) under the refresh, below any ghost', () => {
    const { ctx, log } = recordingCtx();
    paintInteractionLayer(ctx, { visualRefresh: true, hover: GHOST }, SIZE, PALETTE);
    expect(log).toContain(`strokeStyle=${PALETTE.hoverRing}`);
    expect(log).toContain('lineWidth=1.5');
    // Square fallback (mock has no roundRect): the ring is a strokeRect at rect ± 1.5.
    expect(log).toContain('strokeRect([8.5,8.5,43,21])');
  });

  it('ignores a hover rect when the refresh is off (never a stray ring)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { hover: GHOST }, SIZE, PALETTE);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('restyles the live ghost with rounded elevation-by-stroke (outer selection + inner inset)', () => {
    const rounded = roundedCtx();
    paintInteractionLayer(rounded, { live: GHOST, visualRefresh: true }, SIZE, PALETTE);
    // Rounded fill + two rounded strokes (outer selection ring, inner barStroke inset).
    expect(rounded.roundRect).toHaveBeenCalledTimes(3);
    expect(rounded.fill).toHaveBeenCalledTimes(1);
    expect(rounded.stroke).toHaveBeenCalledTimes(2);
    expect(rounded.strokeStyle).toBe(PALETTE.barStroke); // the last (inner) stroke
    // The square-fallback context degrades to rects, never throwing.
    const square = mockCtx();
    paintInteractionLayer(square, { live: GHOST, visualRefresh: true }, SIZE, PALETTE);
    expect(square.fillRect).toHaveBeenCalledTimes(1);
    expect(square.strokeRect).toHaveBeenCalledTimes(2);
  });

  it('restyles the resize ghost the same way, keeping its duration readout', () => {
    const rounded = roundedCtx();
    paintInteractionLayer(
      rounded,
      { resize: { rect: GHOST, label: '7d' }, visualRefresh: true },
      SIZE,
      PALETTE,
    );
    expect(rounded.roundRect).toHaveBeenCalledTimes(3);
    expect(rounded.fillText).toHaveBeenCalledTimes(1);
    expect(rounded.fillText.mock.calls[0]![0]).toBe('7d');
  });
});

// ── Link visual refresh (ADR-0052 M5, behind the SAME `VITE_CANVAS_DIRECT_MANIPULATION`) ─────
describe('paintScene — link visual refresh (ADR-0052 M5)', () => {
  // The synthetic week the time-true tests use: offsets 0–4 working, 5–6 not.
  const isWorkingDay = (d: number): boolean => ((d % 7) + 7) % 7 < 5;
  /** All decorative layers off so the recorded calls are the edges + bars alone. */
  const quiet = {
    dayGrid: false,
    monthGrid: false,
    yearGrid: false,
    today: false,
    nonWorking: false,
    labels: false,
    lateOverlay: false,
  } as const;
  const p = task({ id: 'p', laneIndex: 0 });
  const s1 = task({ id: 's1', laneIndex: 1 });
  const s2 = task({ id: 's2', laneIndex: 2 });
  const s3 = task({ id: 's3', laneIndex: 3 });
  const fs = (id: string, successorId: string, isDriving = false) =>
    ({
      id,
      predecessorId: 'p',
      successorId,
      type: 'FS',
      isDriving,
      lagDays: 0,
      lagCalendar: 'PROJECT_DEFAULT',
    }) as const;
  /** A crowded fan: three FS ties springing from p's finish edge, plus a lagged SS tie. */
  const crowded = (over: Partial<TsldScene> = {}): TsldScene => ({
    activities: [p, s1, s2, s3],
    edges: [
      fs('e1', 's1'),
      fs('e2', 's2', true),
      fs('e3', 's3'),
      {
        id: 'e4',
        predecessorId: 'p',
        successorId: 's2',
        type: 'SS',
        isDriving: false,
        lagDays: 3,
        lagCalendar: 'PROJECT_DEFAULT',
      },
    ],
    dataDate: DATA_DATE,
    view: quiet,
    isWorkingDay,
    ...over,
  });
  const refreshOn = (over: Partial<TsldScene> = {}): TsldScene =>
    crowded({ timeTrueLinks: true, visualRefresh: true, ...over });

  it('is byte-for-byte today’s paint on a CROWDED scene when the flag is off/absent/undefined', () => {
    const base = recordingCtx();
    paintScene(base.ctx, crowded({ selectedId: 'p' }), VIEW, SIZE, PALETTE);
    const off = recordingCtx();
    paintScene(
      off.ctx,
      crowded({ selectedId: 'p', timeTrueLinks: false, visualRefresh: false, hoverId: null }),
      VIEW,
      SIZE,
      PALETTE,
    );
    const explicit = recordingCtx();
    paintScene(
      explicit.ctx,
      crowded({
        selectedId: 'p',
        timeTrueLinks: undefined,
        visualRefresh: undefined,
        hoverId: undefined,
      }),
      VIEW,
      SIZE,
      PALETTE,
    );
    // A hover id must be inert while the refresh is off — no highlight without the flag.
    const hoverWhileOff = recordingCtx();
    paintScene(
      hoverWhileOff.ctx,
      crowded({ selectedId: 'p', visualRefresh: false, hoverId: 's1' }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(off.log).toEqual(base.log);
    expect(explicit.log).toEqual(base.log);
    expect(hoverWhileOff.log).toEqual(base.log);
  });

  it('rounds the elbows with arcTo when available, and degrades to hard corners when not', () => {
    const rounded = { ...mockCtx(), arcTo: vi.fn() };
    paintScene(rounded, refreshOn(), VIEW, SIZE, PALETTE);
    expect(rounded.arcTo).toHaveBeenCalled();
    // Every arc radius is small and positive (clamped by the pure elbowRadius helper).
    for (const call of rounded.arcTo.mock.calls) {
      expect(call[4] as number).toBeGreaterThan(0);
      expect(call[4] as number).toBeLessThanOrEqual(5);
    }
    // A minimal context (no arcTo) falls back to lineTo corners — never throws.
    const square = mockCtx();
    expect(() => paintScene(square, refreshOn(), VIEW, SIZE, PALETTE)).not.toThrow();
    expect(square.lineTo).toHaveBeenCalled();
  });

  it('fans out crowded finish-edge anchors symmetrically and deterministically', () => {
    // p's bar: x 72..120, lane-0 centre y 54. Three FS ends share the finish edge → the edge
    // starts draw at 54 − 3 / 54 / 54 + 3 in edge-id order.
    const startsAtFinishEdge = (scene: TsldScene): number[] => {
      const ctx = mockCtx();
      paintScene(ctx, scene, VIEW, SIZE, PALETTE);
      return ctx.moveTo.mock.calls
        .filter((c) => c[0] === 120)
        .map((c) => c[1] as number)
        .sort((a, b) => a - b);
    };
    const ys = startsAtFinishEdge(refreshOn());
    expect(ys).toEqual([51, 54, 57]);
    // Deterministic across an input-order permutation: the same three anchors, regardless.
    const permuted = refreshOn({
      edges: [fs('e3', 's3'), fs('e1', 's1'), crowded().edges[3]!, fs('e2', 's2', true)],
    });
    expect(startsAtFinishEdge(permuted)).toEqual([51, 54, 57]);
  });

  it('leaves an uncrowded zero-lag FS tie exactly on the bar centreline (clean chains)', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      refreshOn({ edges: [fs('e1', 's1')], activities: [p, s1] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.moveTo.mock.calls.filter((c) => c[0] === 120)[0]![1]).toBe(54);
  });

  it('draws the lag run as a dashed hairline OVER the bars (the waiting-time depiction)', () => {
    const { ctx, log } = recordingCtx();
    // A single lagged SS tie: pred starts day 1 (x 72); +3 working days embed → day 4 (x 108).
    paintScene(
      ctx,
      refreshOn({ edges: [crowded().edges[3]!], activities: [p, s2] }),
      VIEW,
      SIZE,
      PALETTE,
    );
    const dashAt = log.indexOf('setLineDash([[2,2]])');
    expect(dashAt).toBeGreaterThan(-1);
    expect(log.indexOf('moveTo([72,54])')).toBeGreaterThan(dashAt);
    expect(log.indexOf('lineTo([108,54])')).toBeGreaterThan(dashAt);
    // Painted after the bar bodies, so the run reads on the bar, not under it.
    const lastBarFill = log.reduce((acc, e, i) => (e.startsWith('fillRect(') ? i : acc), -1);
    expect(dashAt).toBeGreaterThan(lastBarFill);
    // No new colour: the run strokes in the edge colour.
    expect(log.lastIndexOf(`strokeStyle=${PALETTE.edge}`)).toBeGreaterThan(-1);
  });

  it('draws no lag runs on a zero-lag scene (nothing to depict, no stray dash state)', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(
        r.ctx,
        refreshOn({ edges: [fs('e1', 's1')], activities: [p, s1] }),
        VIEW,
        SIZE,
        PALETTE,
      );
      return r;
    })();
    expect(log).not.toContain('setLineDash([[2,2]])');
  });

  it('highlights the selected bar’s incident links persistently — heavier AND recoloured', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(r.ctx, refreshOn({ selectedId: 's1' }), VIEW, SIZE, PALETTE);
      return r;
    })();
    // The incident non-driving tie re-draws in the selection colour at the next weight up,
    // keeping its dash — a weight change with the colour, never colour alone (WCAG 1.4.1).
    expect(log).toContain(`strokeStyle=${PALETTE.selection}`);
    expect(log.filter((e) => e === 'setLineDash([[4,3]])').length).toBe(2); // base + highlight
    // Non-incident ties still stroke in the base edge colour.
    expect(log).toContain(`strokeStyle=${PALETTE.edge}`);
  });

  it('weights a highlighted DRIVING tie to 3px solid and tips it in the selection colour', () => {
    const { log } = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(r.ctx, refreshOn({ selectedId: 's2' }), VIEW, SIZE, PALETTE);
      return r;
    })();
    expect(log).toContain('lineWidth=3');
    // The highlighted driving tie's arrowhead fills in the selection colour, batched like M1.
    expect(log).toContain(`fillStyle=${PALETTE.selection}`);
  });

  it('memoises the fan-out on the edges array identity (same array ⇒ === map; new array ⇒ recompute)', () => {
    // The painter calls `edgeFanOutFor(scene.edges)` every frame; `scene.edges` is reference-
    // stable across pan/zoom frames, so the SAME array must return the IDENTICAL map (no per-
    // frame recompute — the ADR-0026 draw-budget fix), while a rebuilt array (a data change)
    // must recompute to equivalent offsets.
    const edges = crowded().edges;
    const first = edgeFanOutFor(edges);
    expect(edgeFanOutFor(edges)).toBe(first);
    const rebuilt = [...edges]; // same edge objects, new array identity
    const second = edgeFanOutFor(rebuilt);
    expect(second).not.toBe(first);
    expect(second.size).toBe(first.size);
    for (const edge of rebuilt) expect(second.get(edge)).toEqual(first.get(edge));
  });

  it('highlights transiently from the hovered bar id (the pointer twin of selection)', () => {
    const hover = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(r.ctx, refreshOn({ hoverId: 's1' }), VIEW, SIZE, PALETTE);
      return r;
    })();
    expect(hover.log).toContain(`strokeStyle=${PALETTE.selection}`);
    // No selection, no hover ⇒ no highlight pass at all (the selection colour never appears —
    // there is no ring either, since nothing is selected).
    const idle = ((): { log: string[] } => {
      const r = recordingCtx();
      paintScene(r.ctx, refreshOn(), VIEW, SIZE, PALETTE);
      return r;
    })();
    expect(idle.log.some((e) => e === `strokeStyle=${PALETTE.selection}`)).toBe(false);
  });
});

// ── Draggable lag handles (ADR-0052 M3 discoverability fix, the SAME env flag) ────────────────
// The M3 lag drag shipped with a grab zone but nothing painted at it: the user had to guess an
// invisible target. These pin the affordance — drawn exactly where `classifyHit` accepts the
// press, only where the drag is armed, and never on the flag-off path.
describe('paintScene — draggable lag handles (ADR-0052 M3)', () => {
  const isWorkingDay = (d: number): boolean => ((d % 7) + 7) % 7 < 5;
  const walk = makeWorkingDayWalk(isWorkingDay);
  /** All decorative layers off so the recorded calls are the edges + bars + handles alone. */
  const quiet = {
    dayGrid: false,
    monthGrid: false,
    yearGrid: false,
    today: false,
    nonWorking: false,
    labels: false,
    lateOverlay: false,
  } as const;
  // A short predecessor (days 1–4) and a long successor (days 1–19) so a walked anchor lands on
  // the bar rather than clamping — the geometry the M1/M5 anchor tests use.
  const pred = task({ id: 'p', laneIndex: 0 });
  const succ = task({ id: 's', laneIndex: 1, earlyStart: '2026-01-02', earlyFinish: '2026-01-20' });
  const edge = (over: Partial<RenderEdge> = {}): RenderEdge => ({
    id: 'd1',
    predecessorId: 'p',
    successorId: 's',
    type: 'FS',
    isDriving: true,
    lagDays: 2,
    lagCalendar: 'PROJECT_DEFAULT',
    ...over,
  });
  const scene = (over: Partial<TsldScene> = {}): TsldScene => ({
    activities: [pred, succ],
    edges: [edge()],
    dataDate: DATA_DATE,
    view: quiet,
    isWorkingDay,
    timeTrueLinks: true,
    visualRefresh: true,
    lagHandles: true,
    ...over,
  });
  /** A ctx whose roundRect records (the modern-browser path the disc is traced with). */
  const roundedCtx = () => ({ ...mockCtx(), roundRect: vi.fn() });
  /**
   * The recorded handle discs (square boxes whose corner radius is half the side), de-duplicated
   * in first-drawn order — each disc is traced twice, once for the core fill and once for the
   * halo stroke (two batched paths, one per colour).
   */
  const handles = (ctx: ReturnType<typeof roundedCtx>): number[][] => {
    const seen = new Set<string>();
    return ctx.roundRect.mock.calls
      .map((c) => c.map(Number))
      .filter(([, , w, h, r]) => w === h && w === (r ?? 0) * 2)
      .filter((box) => {
        const key = JSON.stringify(box);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  it('draws a handle centred on the walked anchor for every dependency type', () => {
    for (const type of ['FS', 'FF', 'SS', 'SF'] as const) {
      const ctx = roundedCtx();
      paintScene(ctx, scene({ edges: [edge({ type })] }), VIEW, SIZE, PALETTE);
      // FS/FF walk the successor end, SS/SF the predecessor end — the same end `classifyHit`
      // makes draggable, so the ink and the target can never disagree.
      const anchors = lagAnchorPoints(pred, succ, type, 2, VIEW, DATA_DATE, walk)!;
      const at = type === 'FS' || type === 'FF' ? anchors.succ : anchors.pred;
      expect(handles(ctx)).toEqual([[at.x - 3.5, at.y - 3.5, 7, 7, 3.5]]);
    }
  });

  it('pins the SS embed handle to its known screen point (guards a helper-wide drift)', () => {
    const ctx = roundedCtx();
    // p starts day 1 (x 72); +3 working days embeds at day 4 (x 108), on its lane-0 centre (54).
    paintScene(ctx, scene({ edges: [edge({ type: 'SS', lagDays: 3 })] }), VIEW, SIZE, PALETTE);
    expect(handles(ctx)).toEqual([[104.5, 50.5, 7, 7, 3.5]]);
  });

  it('draws the core in the outline colour ringed by the contrasting halo, above the bars', () => {
    // A recording ctx WITH roundRect, so the discs trace as roundRect and every `fillRect` in the
    // log is a bar body — which is what makes the layering assertion below meaningful.
    const { ctx, log } = recordingCtx({ ...mockCtx(), roundRect: vi.fn() });
    paintScene(ctx, scene(), VIEW, SIZE, PALETTE);
    // The two-tone construction: a foreground core, then the ground-coloured halo over its edge.
    const core = log.lastIndexOf(`fillStyle=${PALETTE.outline}`);
    const halo = log.lastIndexOf(`strokeStyle=${PALETTE.handleHalo}`);
    expect(core).toBeGreaterThan(-1);
    expect(halo).toBeGreaterThan(core);
    // Painted after every bar body (the refreshed bars trace at BAR_RADIUS 3) — an on-bar
    // affordance drawn under the bars would be exactly as invisible as no affordance at all.
    const lastBar = log.reduce(
      (acc, e, i) => (e.startsWith('roundRect(') && e.endsWith(',3])') ? i : acc),
      -1,
    );
    expect(lastBar).toBeGreaterThan(-1);
    expect(core).toBeGreaterThan(lastBar);
  });

  it('draws NO handle when the drag is not armed (no affordance a viewer cannot honour)', () => {
    const armed = recordingCtx();
    paintScene(armed.ctx, scene(), VIEW, SIZE, PALETTE);
    const off = recordingCtx();
    paintScene(off.ctx, scene({ lagHandles: false }), VIEW, SIZE, PALETTE);
    const absent = recordingCtx();
    paintScene(absent.ctx, scene({ lagHandles: undefined }), VIEW, SIZE, PALETTE);
    expect(armed.log).not.toEqual(off.log); // the armed paint really does add something…
    expect(absent.log).toEqual(off.log); // …and absent is exactly not-armed (parity)
    expect(off.log).not.toContain(`strokeStyle=${PALETTE.handleHalo}`);
  });

  it('is byte-for-byte the no-handle paint when the refresh flag is off, even if armed (parity)', () => {
    const base = recordingCtx();
    paintScene(
      base.ctx,
      scene({ timeTrueLinks: false, visualRefresh: false, lagHandles: false, activeLagId: null }),
      VIEW,
      SIZE,
      PALETTE,
    );
    // A scene that still carries the handle fields while the render flag is off must not paint
    // them — one env flag drives all three, so this is the flag-off gate.
    const flagOff = recordingCtx();
    paintScene(
      flagOff.ctx,
      scene({ timeTrueLinks: false, visualRefresh: false, activeLagId: 'd1' }),
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(flagOff.log).toEqual(base.log);
  });

  it('draws no handle for a zero-lag tie (its anchor is the resize handle, not a lag grab)', () => {
    const ctx = roundedCtx();
    paintScene(ctx, scene({ edges: [edge({ lagDays: 0 })] }), VIEW, SIZE, PALETTE);
    expect(handles(ctx)).toEqual([]);
  });

  it('emphasises the hovered / dragged handle with a bigger disc and a heavier halo, drawn last', () => {
    const ctx = roundedCtx();
    paintScene(
      ctx,
      scene({
        edges: [edge(), edge({ id: 'd2', type: 'SS', lagDays: 3 })],
        activeLagId: 'd2',
      }),
      VIEW,
      SIZE,
      PALETTE,
    );
    const drawn = handles(ctx);
    expect(drawn).toHaveLength(2);
    // The active one grew (radius 5, not 3.5) and — drawn last — sits over its neighbours.
    expect(drawn.at(-1)![4]).toBe(5);
    expect(drawn[0]![4]).toBe(3.5);
    // Never colour alone (WCAG 1.4.1): the halo weight steps up with the size.
    const { ctx: rec, log } = recordingCtx();
    paintScene(rec, scene({ activeLagId: 'd1' }), VIEW, SIZE, PALETTE);
    const restLog = ((): string[] => {
      const r = recordingCtx();
      paintScene(r.ctx, scene(), VIEW, SIZE, PALETTE);
      return r.log;
    })();
    expect(log.filter((e) => e === 'lineWidth=2').length).toBeGreaterThan(
      restLog.filter((e) => e === 'lineWidth=2').length,
    );
  });

  it('degrades to a square handle on a context without roundRect (never throws)', () => {
    const square = mockCtx();
    expect(() => paintScene(square, scene(), VIEW, SIZE, PALETTE)).not.toThrow();
    const anchors = lagAnchorPoints(pred, succ, 'FS', 2, VIEW, DATA_DATE, walk)!;
    expect(square.fillRect.mock.calls).toContainEqual([
      anchors.succ.x - 3.5,
      anchors.succ.y - 3.5,
      7,
      7,
    ]);
  });
});
