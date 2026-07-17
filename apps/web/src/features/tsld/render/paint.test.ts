import { describe, expect, it, vi } from 'vitest';

import { paintInteractionLayer, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';

const PALETTE: TsldPalette = {
  gridLine: '#111',
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
