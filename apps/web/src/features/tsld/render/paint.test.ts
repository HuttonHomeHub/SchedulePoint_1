import { describe, expect, it, vi } from 'vitest';

import {
  activityIndexFor,
  paintInteractionLayer,
  paintScene,
  type TsldPalette,
  type TsldScene,
} from './paint';
import {
  BAR_HEIGHT,
  BAR_PAD,
  BAR_RADIUS,
  EMPHASIS_STROKE_W,
  LABEL_GAP_PX,
  GLYPH_CAP_OVERHANG,
  GLYPH_CAP_W,
  lagAnchorPoints,
  makeWorkingDayWalk,
  NODE_RADIUS,
  PROGRESS_FRONT_PROUD_PX,
  rowSlots,
  screenYOfLane,
  SUMMARY_TAB_H,
  SUMMARY_TAB_W,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';
import { mockCtx, recordingCtx } from './test-support/recording-ctx';

const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  laneRule: '#9c9c9c',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  today: '#f00',
  todayInk: '#fff',
  // The data-date pair (VITE_CANVAS_DATA_DATE) — distinct fixture values so assertions can pin them.
  dataDate: '#dd1',
  dataDateInk: '#dd2',
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

/**
 * The `task()` bar's drawn rect under {@link VIEW} — day 1..4 at 12 px/day from `originX` 60, in
 * lane 0.
 *
 * Derived, because these characterisations used to state its four numbers inline and the row
 * treatment (M3-T3) changed two of them. A suite that writes `45` and `18` asserts where the bar
 * WAS; one that writes `BAR_Y` and `BAR_HEIGHT` asserts the shape the painter draws.
 */
const BAR_X = 72;
const BAR_W = 48;
const BAR_Y = screenYOfLane(0, VIEW) + BAR_PAD;
const SIZE = { width: 800, height: 400 };
const DATA_DATE = '2026-01-01';

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

/**
 * The x of the first **vertical** line the painter drew.
 *
 * These cases used to read `moveTo.mock.calls[0]` and mean "the Today rule", which was true only
 * because every gridline toggle was off and nothing else drew a line. The lane hairlines
 * (workspace redesign M4-T2) have no toggle — they are the surface's structure, not one of its
 * lenses — so index 0 is now a lane rule and the assertion would silently be about the wrong line.
 *
 * A vertical line starts at `y = 0` and a lane rule starts at `x = 0` with a non-zero y, so the
 * discriminator is geometric rather than positional: it keeps meaning the Today rule whatever else
 * the painter gains above it.
 */
function sceneMoveCalls(ctx: { moveTo: unknown }): [number, number][] {
  return (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
}

/**
 * The x of the first move that is **not** a lane hairline.
 *
 * A lane rule spans the full width, so it always starts at `x = 0` (workspace redesign M4-T2).
 * These cases used to say "all decorative layers are toggled off so the only moveTos are the edge
 * and its arrowhead" — true until a layer arrived that has no toggle. Skipping by geometry keeps
 * them about the edge rather than about how many layers happen to draw first.
 */
function firstEdgeMoveX(ctx: { moveTo: unknown }): number {
  const call = sceneMoveCalls(ctx).find(([x]) => x !== 0);
  if (!call) throw new Error('no edge line was drawn');
  return call[0];
}

/**
 * The x of the `lineTo` belonging to the first non-lane move.
 *
 * Paired by INDEX rather than by value: every line is one `moveTo` then one `lineTo`, so the nth
 * move and the nth line-to are the same segment. Picking the first `lineTo` outright would find a
 * lane hairline's, whose x is the canvas width — a plausible-looking number that is not the
 * successor anchor this case is about.
 */
function firstEdgeLineToX(ctx: { moveTo: unknown; lineTo: unknown }): number {
  const index = sceneMoveCalls(ctx).findIndex(([x]) => x !== 0);
  if (index === -1) throw new Error('no edge line was drawn');
  const lineTos = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
  const call = lineTos[index];
  if (!call) throw new Error('the edge move has no matching lineTo');
  return call[0];
}

function firstVerticalMoveX(ctx: { moveTo: unknown }): number {
  const calls = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
  const vertical = calls.find((call) => call[1] === 0);
  if (!vertical) throw new Error('no vertical line was drawn');
  return vertical[0];
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

    // **The export's override paints below the screen floor, as merged runs** (#166). A
    // whole-plan export frames any span at any scale and paper has no zoom, so the deliverable
    // was losing weekends ENTIRELY on long programmes — the wash is the only weekend channel on
    // paper since the hatch went (ADR-0109 D4). Each 2-day weekend is ONE fill (the run), never
    // two sub-pixel fills. Verified red against the pre-#166 painter, which ignored the option.
    const exportCoarse = mockCtx();
    paintScene(exportCoarse, scene({ isWorkingDay }), { ...VIEW, pxPerDay: 1 }, SIZE, PALETTE, 1, {
      minNonWorkingPx: 0,
    });
    const washFills = exportCoarse.fillRect.mock.calls;
    expect(washFills.length).toBeGreaterThan(0);
    // Runs, not days: an interior weekend is ONE two-day fill (2 × 1 px here). A weekend cut in
    // half by the paint window's edge legitimately fills one day — the first version of this
    // assertion demanded 2 everywhere and failed against a correct painter.
    expect(washFills.some((call) => Math.abs((call[2] as number) - 2) < 1e-5)).toBe(true);
    for (const call of washFills) expect(call[2] as number).toBeGreaterThanOrEqual(1 - 1e-5);
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

  // Isolates the TODAY marker from the grid layers (which also draw vertical moveTo/lineTo
  // strokes at 12px/day), so its own moveTo x can be read back unambiguously.
  const TODAY_ONLY = {
    dayGrid: false,
    monthGrid: false,
    yearGrid: false,
    today: true,
    nonWorking: false,
    labels: false,
    lateOverlay: false,
  } as const;

  it('interpolates the TODAY line by todayFraction (F6a) — a fractional day shifts x by that fraction of a day-column', () => {
    const base: TsldScene = { activities: [], edges: [], dataDate: DATA_DATE, view: TODAY_ONLY };
    const integer = mockCtx();
    paintScene(integer, { ...base, todayOffset: 5 }, VIEW, SIZE, PALETTE);
    const half = mockCtx();
    paintScene(half, { ...base, todayOffset: 5, todayFraction: 0.5 }, VIEW, SIZE, PALETTE);
    const integerX = firstVerticalMoveX(integer);
    const halfX = firstVerticalMoveX(half);
    // Half a day at 12px/day (VIEW.pxPerDay) is a 6px shift.
    expect(halfX - integerX).toBeCloseTo(6, 0);
  });

  it('draws the Today RULE with or without todayFraction — only its x moves (#148)', () => {
    // This case used to be about the Today PILL, which was gated on `todayFraction` because that
    // was ADR-0056 F6b's own flag composition. The pill is gone (#148 M2) and the label is DOM in
    // the ruler now, so what remains here is the rule — which was never gated on the fraction, only
    // positioned by it.
    const base: TsldScene = { activities: [], edges: [], dataDate: DATA_DATE, view: TODAY_ONLY };
    const withoutFraction = mockCtx();
    paintScene(withoutFraction, { ...base, todayOffset: 5 }, VIEW, SIZE, PALETTE);
    const withFraction = mockCtx();
    paintScene(withFraction, { ...base, todayOffset: 5, todayFraction: 0.25 }, VIEW, SIZE, PALETTE);

    for (const ctx of [withoutFraction, withFraction]) {
      expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
      // The layer draws no label of any kind any more, on either path.
      expect(ctx.fillText).not.toHaveBeenCalled();
      expect(ctx.fillRect).not.toHaveBeenCalled();
    }
    const plainX = firstVerticalMoveX(withoutFraction);
    const fracX = firstVerticalMoveX(withFraction);
    expect(fracX - plainX).toBeCloseTo(3, 0); // 0.25 day at 12 px/day
  });

  it('needs no text support at all — the status layer is rules only (#148)', () => {
    // The pills used to be guarded by `typeof ctx.fillText === 'function'` so a text-less context
    // never threw. With the labels in the DOM the guard has nothing to guard, and this asserts the
    // stronger property that replaces it: the layer never reaches for a text API in the first place.
    const base: TsldScene = { activities: [], edges: [], dataDate: DATA_DATE, view: TODAY_ONLY };
    const ctx = mockCtx();
    // @ts-expect-error — simulate an environment without text support.
    ctx.fillText = undefined;
    // @ts-expect-error — simulate an environment without text support.
    ctx.measureText = undefined;
    paintScene(
      ctx,
      { ...base, dataDateLine: true, todayOffset: 5, todayFraction: 0.25 },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  // ── The DATA-DATE line + the coincidence rule (`VITE_CANVAS_DATA_DATE`, status & feedback M1).
  // The rule table from the implementation plan: data date only · both lines · coincident (one
  // line, one merged pill) · toggle off · todayOffset null · off-screen (culled). The merge test
  // is `Math.round(x) === Math.round(x)` on the already-computed screen x values, asserted BOTH
  // ways (a sub-pixel difference merges; a whole-pixel difference draws both).
  describe('the data-date line + the coincidence rule (scene.dataDateLine)', () => {
    // Isolated from the grid layers exactly like TODAY_ONLY, so strokes/pills are unambiguous.
    const base: TsldScene = { activities: [], edges: [], dataDate: DATA_DATE, view: TODAY_ONLY };
    // At VIEW (originX 60), day 0 — the data date — lands at x = 60.5.

    it('draws the rule SOLID at lineWidth 2 in palette.dataDate, with its pill on the derived row (data date only)', () => {
      const ctx = mockCtx();
      // No todayOffset ⇒ the Today branch (and therefore the coincidence test) never runs.
      paintScene(ctx, { ...base, dataDateLine: true }, VIEW, SIZE, PALETTE);
      expect(ctx.moveTo).toHaveBeenCalledWith(60.5, 0);
      // Two strokes: the flag-off grid pass always strokes its (here empty) path once, plus the
      // data-date rule — and no third.
      // +1 since M4-T2: the lane hairlines stroke one batched pass of their own, and these
      // counters are scene-wide rather than layer-scoped. Re-baselined explicitly rather than
      // loosened to `toBeLessThanOrEqual`, so the gate still notices the NEXT layer to arrive.
      expect(ctx.stroke).toHaveBeenCalledTimes(3);
      expect(ctx.setLineDash).not.toHaveBeenCalledWith([4, 3]); // no dashed line anywhere
      expect(ctx.lineWidth).toBe(2);
      expect(ctx.strokeStyle).toBe(PALETTE.dataDate);
      // No label: it is DOM in the ruler now (#148 M2). What it SAYS is `axis-markers.test.ts`'s;
      // where it SITS relative to a bar is the browser gate's, because it is a question about two
      // elements rather than about two constants.
      expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it('draws BOTH lines when they round to different pixels (the merge test, direction 1)', () => {
      const ctx = mockCtx();
      // todayOffset 5 ⇒ today at x = 120.5, a whole 60px from the data date's 60.5.
      paintScene(
        ctx,
        { ...base, dataDateLine: true, todayOffset: 5, todayFraction: 0.25 },
        VIEW,
        SIZE,
        PALETTE,
      );
      // Both verticals: the solid data-date rule AND the dashed Today rule.
      expect(ctx.moveTo).toHaveBeenCalledWith(60.5, 0);
      expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
      // That the two carry SEPARATE labels here is asserted in `axis-markers.test.ts`
      // ('never renders the same word for both'), verified red before this pair was deleted.
    });

    it('coincident ⇒ ONE line in the data-date treatment and ONE merged pill (the merge test, direction 2)', () => {
      const ctx = mockCtx();
      // todayOffset 0 ⇒ both compute x = 60.5 exactly.
      paintScene(
        ctx,
        { ...base, dataDateLine: true, todayOffset: 0, todayFraction: null },
        VIEW,
        SIZE,
        PALETTE,
      );
      // One vertical: no dashed Today rule, and exactly ONE marker stroke on top of the grid
      // pass's always-present empty-path stroke (two would be the un-merged case's three).
      expect(ctx.setLineDash).not.toHaveBeenCalledWith([4, 3]);
      expect(ctx.stroke).toHaveBeenCalledTimes(3);
      // The merged LABEL is `axis-markers.test.ts`'s ('states both facts in one word').
    });

    it('merges a sub-pixel difference too — they merge exactly when they would overdraw', () => {
      const ctx = mockCtx();
      // todayFraction 0.03 at 12px/day shifts today by 0.36px: not zero, but rounds to the same
      // pixel — the only case where two lines are a rendering artefact rather than two facts.
      paintScene(
        ctx,
        { ...base, dataDateLine: true, todayOffset: 0, todayFraction: 0.03 },
        VIEW,
        SIZE,
        PALETTE,
      );
      expect(ctx.setLineDash).not.toHaveBeenCalledWith([4, 3]);
      // One stroke for the grid pass's always-empty path, one for the single merged rule.
      expect(ctx.stroke).toHaveBeenCalledTimes(3);
    });

    it('draws nothing of its own when the scene field is absent or false (the toggle-off path)', () => {
      for (const scene of [base, { ...base, dataDateLine: false }]) {
        const ctx = mockCtx();
        paintScene(ctx, scene, VIEW, SIZE, PALETTE);
        // No todayOffset either, so the whole status layer is silent: only the grid pass's
        // always-present empty-path stroke remains.
        expect(ctx.stroke).toHaveBeenCalledTimes(2);
      }
    });

    it('culls the line off-screen with the same test the Today line uses — Today then draws normally', () => {
      const ctx = mockCtx();
      // originX -500 puts day 0 at x = -500 (off-screen left); today (offset 50) is at 100.5.
      paintScene(
        ctx,
        { ...base, dataDateLine: true, todayOffset: 50 },
        { ...VIEW, originX: -500 },
        SIZE,
        PALETTE,
      );
      // Exactly one marker rule strokes (plus the grid pass's empty path): the data-date rule is
      // culled and Today's is not. That the culled mark produces no LABEL either is
      // `axis-markers.test.ts`'s ('drops Today alone …', 'runs cull BEFORE clamp …').
      expect(ctx.stroke).toHaveBeenCalledTimes(3);
      expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]); // the Today rule is unaffected
    });

    it('never draws a label of its own, at any scene (#148 M2)', () => {
      // The replacement for the two derived-row guards this block used to end with. **Both of those
      // asked whether the pills collided with EACH OTHER** — carefully, correctly, and about the
      // wrong subject; nothing asked what was underneath them, and a bar occupies y 5–23 of a lane
      // starting wherever the planner last panned to. The guards that replace them look outward:
      // this one (the layer emits no text at all), the row-inside-`RULER_HEIGHT` unit case, and the
      // browser assertion that no marker rect intersects the scene canvas's.
      for (const scene of [
        { ...base, dataDateLine: true },
        { ...base, dataDateLine: true, todayOffset: 5, todayFraction: 0.25 },
        { ...base, dataDateLine: true, todayOffset: 0, todayFraction: 0.03 },
      ]) {
        const ctx = mockCtx();
        paintScene(ctx, scene, VIEW, SIZE, PALETTE);
        expect(ctx.fillText).not.toHaveBeenCalled();
        expect(ctx.measureText).not.toHaveBeenCalled();
      }
    });
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

  /**
   * **Peer ghosts during a plural drag** (`docs/TECH_DEBT.md` #108's preview half). One faint
   * fill + one solid outline PER peer, and — the parity pin — an overlay without `peers` adds
   * not one call, which is the draw-budget contract the field's docblock states. **Verified
   * red** against the pre-#108 painter: `peers` was not a field, so the count assertions failed
   * on 1 fill (the live ghost alone).
   */
  it('draws one faint fill + outline per peer ghost, and none absent the field (#108)', () => {
    const ctx = mockCtx();
    const peers = [
      { x: 60, y: 40, w: 30, h: 18 },
      { x: 60, y: 70, w: 22, h: 18 },
    ];
    paintInteractionLayer(ctx, { live: GHOST, peers }, SIZE, PALETTE);
    // Live (1 fill + 1 stroke) + two peers (1 fill + 1 stroke each).
    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(3);
    // Peers are faint, and the alpha is put back — a leaked alpha would fade every later shape.
    expect(ctx.globalAlpha).toBe(1);

    const bare = mockCtx();
    paintInteractionLayer(bare, { live: GHOST }, SIZE, PALETTE);
    expect(bare.fillRect).toHaveBeenCalledTimes(1);
    expect(bare.strokeRect).toHaveBeenCalledTimes(1);
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

  /**
   * **The name sits ABOVE its bar** (M3-T3) — the reference's own placement, and what the shipped
   * row geometry always produces, since `rowReservesTextRows()` is true at the shipped pitch.
   *
   * It is truncated to the bar's width plus the room its same-lane neighbour leaves, because the
   * name row carries no other bar's ink and the next name is the only thing it can meet.
   */
  it('truncates a name above a bar whose neighbour leaves too little room', () => {
    const ctx = mockCtx();
    const narrow = task({ id: 'n', label: 'A1020 Erect steel · 3d', earlyFinish: '2026-01-04' });
    const neighbour = task({
      id: 'x',
      label: 'B',
      earlyStart: '2026-01-06',
      earlyFinish: '2026-01-08',
    });
    paintScene(
      ctx,
      { activities: [narrow, neighbour], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    const drawn = ctx.fillText.mock.calls.map((c) => c[0] as string);
    expect(drawn.some((t) => t.endsWith('…'))).toBe(true);
  });

  /**
   * **Every name in a row sits on the same line, whatever glyph it names.**
   *
   * Verified red against the first version of the row painter, which recovered the lane's top as
   * `rect.y - BAR_PAD`. That is right for a task bar, which is padded into its lane, and wrong for
   * a **milestone**, whose rect is centred on the lane — so a milestone's name drew 4.5 px above
   * its neighbours' and the text row was ragged. Nothing but a rendered picture would have shown
   * it, which is why the painter reads the lane rather than inferring it from a rect.
   */
  it('puts every name on one line, whatever glyph it names', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      {
        activities: [
          task({ id: 'bar', earlyStart: '2026-01-02', earlyFinish: '2026-01-05' }),
          milestone({ id: 'ms', earlyStart: '2026-01-08', earlyFinish: '2026-01-08' }),
        ],
        edges: [],
        dataDate: DATA_DATE,
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    const ys = ctx.fillText.mock.calls.map((c) => c[2]);
    expect(ys).toHaveLength(2);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(rowSlots(screenYOfLane(0, VIEW)).nameY);
  });

  it('centres the name in the row above the bar, never inside it', () => {
    const ctx = mockCtx();
    paintScene(ctx, { activities: [wide()], edges: [], dataDate: DATA_DATE }, VIEW, SIZE, PALETTE);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const [, x, y] = ctx.fillText.mock.calls[0]!;
    expect(y).toBe(rowSlots(screenYOfLane(0, VIEW)).nameY);
    expect(y as number).toBeLessThan(BAR_Y);
    // Centred on the bar, so the pair reads as one object.
    expect(x).toBe(BAR_X + BAR_W / 2);
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

  /**
   * A milestone's name goes above it like every other, **untruncated in a clear lane** — which is
   * the case that removed an arbitrary overhang cap from the painter. The first version bounded a
   * centred name at 48 px either side; a milestone's box is 14 px wide, so every milestone in the
   * product truncated its name in a row that was otherwise empty.
   */
  it('draws a milestone name ABOVE the diamond, in full when the lane is clear', () => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      { activities: [milestone()], edges: [], dataDate: DATA_DATE },
      VIEW,
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const [text, , y] = ctx.fillText.mock.calls[0]!;
    expect(text).toBe('M1 Handover');
    expect(y).toBe(rowSlots(screenYOfLane(0, VIEW)).nameY);
    expect(ctx.fillStyle).toBe(PALETTE.labelBeside);
  });

  /**
   * **Crowding truncates a name; it no longer suppresses one.** The `none` branch existed because
   * a beside label had nowhere to go — it would have been drawn over its neighbour's bar. A name
   * above the bar always has its own row, so the honest degradation is a shorter name rather than
   * no name, and a planner never loses an activity's identity to density.
   */
  it('truncates rather than suppresses a name whose same-lane neighbour crowds it', () => {
    const ctx = mockCtx();
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
    const drawn = ctx.fillText.mock.calls.map((c) => c[0] as string);
    expect(drawn).toHaveLength(2);
    // **One character shorter than it was**, and that is M6's half-gap rule showing its price: the
    // crowded name used to claim the WHOLE 10 px between the two boxes and now claims half, so it
    // keeps `M…` where it kept `M1…`. Still a name rather than a suppression, which is the claim
    // this case exists to pin; the assertion said `M1` and was pinning the arithmetic by accident.
    expect(drawn.some((t) => t.startsWith('M') && t.endsWith('…'))).toBe(true);
    expect(drawn).toContain('M2 Done');
  });

  /**
   * **…and a lone ellipsis is not a shorter name.** The case above is the claim the milestone
   * above it makes; this is the branch that claim did not cover. `truncateToWidth` returns a bare
   * `LABEL_ELLIPSIS` when not even one character fits (`geometry.ts:824`), so a hard-crowded name
   * drew one glyph that names nothing and reads as content — found in the M3-T4 picture, where a
   * milestone beside a close neighbour was labelled `…` and nothing else.
   *
   * The 6 px-per-glyph stub cannot reach it (a milestone's box is 14 px, wider than `'M…'` at
   * 12), which is why the width function is widened here rather than the fixture crowded further:
   * the real canvas font is what makes the branch reachable in the product, and a test that can
   * only be written by pretending otherwise is testing the stub. At 14 px per glyph the ellipsis
   * fits and one character does not — exactly the branch.
   */
  it('draws no name at all when the room fits nothing but the ellipsis', () => {
    const ctx = mockCtx();
    ctx.measureText = vi.fn((s: string) => ({ width: s.length * 14 }) as TextMetrics);
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
    const drawn = ctx.fillText.mock.calls.map((c) => c[0] as string);
    expect(drawn).toContain('M2 Done');
    expect(drawn).not.toContain('…');
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
// The recording ctx these use — method calls AND property assignments logged in order, so two
// paints can be compared byte-for-byte (the flag-off / no-lens parity gate) — now lives in
// `./test-support/recording-ctx`, shared with the other painter suites (ADR-0078 S0).

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

  it('draws the levelled ghosts on a THIRD dash, distinct from both neighbours', () => {
    // `GHOST_DASH` is [2,2] and `COMPARE_DASH` is [6,3] — and that constant's docblock records the
    // two having been pixel-identical once, found by a ux review. A long-short rhythm is a third
    // shape class rather than a third length of the same one.
    const ctx = mockCtx();
    paintScene(
      ctx,
      {
        ...lensScene,
        levelledGhosts: [
          {
            id: 'a',
            leveledStart: '2026-01-06',
            leveledFinish: '2026-01-08',
            laneIndex: 0,
            isMilestone: false,
          },
        ],
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    const dashes = ctx.setLineDash.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(dashes).toContain(JSON.stringify([5, 2, 1, 2]));
    expect(JSON.stringify([5, 2, 1, 2])).not.toBe(JSON.stringify([2, 2]));
    expect(JSON.stringify([5, 2, 1, 2])).not.toBe(JSON.stringify([6, 3]));
  });

  it('is a no-op with no levelled ghosts — the parity contract', () => {
    // Absent means the lens is off, levelling never ran, or nothing moved. FC-1 predicts the third
    // of those is what most plans look like, so this is the COMMON path, not an edge case.
    const withNone = mockCtx();
    const withEmpty = mockCtx();
    paintScene(withNone, lensScene, VIEW, SIZE, PALETTE);
    paintScene(withEmpty, { ...lensScene, levelledGhosts: [] }, VIEW, SIZE, PALETTE);
    expect(withEmpty.strokeRect.mock.calls).toEqual(withNone.strokeRect.mock.calls);
    expect(withEmpty.setLineDash.mock.calls).toEqual(withNone.setLineDash.mock.calls);
  });

  it('culls a levelled ghost whose live bar is off-screen, like its baseline neighbour', () => {
    // Cull by `visibleIds` FIRST — correct here and WRONG for the comparison layer between them,
    // where removed work has no live activity at all. Copying the wrong neighbour is a defect that
    // looks right on every plan where nothing was deleted.
    const ctx = mockCtx();
    paintScene(
      ctx,
      {
        ...lensScene,
        levelledGhosts: [
          {
            id: 'not-in-the-scene',
            leveledStart: '2026-01-06',
            leveledFinish: '2026-01-08',
            laneIndex: 0,
            isMilestone: false,
          },
        ],
      },
      VIEW,
      SIZE,
      PALETTE,
    );
    // Measured on `strokeRect`, not on `setLineDash`: the dash is set ONCE outside the loop, so it
    // fires whenever the array is non-empty whether or not any ghost survives the cull. The first
    // version of this case asserted on the dash and failed against a correctly-culling painter —
    // the instrument was measuring "the block ran", not "a ghost drew".
    const baseline = mockCtx();
    paintScene(baseline, lensScene, VIEW, SIZE, PALETTE);
    expect(ctx.strokeRect.mock.calls.length).toBe(baseline.strokeRect.mock.calls.length);
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
          activities: [task({ id: 'w', label: 'A1020 Erect steel · 4d', percentComplete: 50 })],
          edges: [],
          dataDate: DATA_DATE,
          barFill: new Map([['w', '#fill']]),
          barInk: new Map([['w', '#ink']]),
          // The refresh is what draws progress, and progress is now the only thing `barInk`
          // governs — see below.
          visualRefresh: true,
        },
        VIEW,
        SIZE,
        PALETTE,
      );
      return r;
    })();
    // The bar paints the override fill, and the paired ink still governs what is drawn ON the
    // bar — the progress band. **It no longer governs the NAME**, and that is a consequence of
    // the row treatment rather than a regression: the pairing existed so a label stayed legible
    // over a lens-recoloured bar, and the name is now above the bar on the canvas ground, where
    // `labelBeside` is the right token. Stated here so the narrowing is recorded, not discovered.
    expect(log).toContain('fillStyle=#fill');
    expect(log).toContain('fillStyle=#ink');
    expect(log).toContain(`fillStyle=${PALETTE.labelBeside}`);
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
    expect(firstEdgeMoveX(zero)).toBeCloseTo(72);
    expect(firstEdgeMoveX(lagged)).toBeCloseTo(108);
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
    expect(firstEdgeLineToX(elapsed)).toBeCloseTo(144); // day 7
    expect(firstEdgeLineToX(workingWalked)).toBeCloseTo(168); // day 9 (weekend skipped)
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
    expect(rounded.roundRect.mock.calls[0]).toEqual([BAR_X, BAR_Y, BAR_W, BAR_HEIGHT, BAR_RADIUS]);
    // …while a minimal context (no roundRect) degrades to the square fill, never throwing.
    const square = mockCtx();
    paintScene(square, refreshScene(), VIEW, SIZE, PALETTE);
    expect(square.fillRect).toHaveBeenCalledWith(BAR_X, BAR_Y, BAR_W, BAR_HEIGHT);
  });

  /**
   * **The bar's own outline is gone; the NODE carries the definition** (M3-T3).
   *
   * This case used to assert that a non-critical bar gained a 1 px inset hairline, and it asked
   * the question as _"was any `strokeRect` emitted?"_ — which the node satisfies. So it kept
   * passing after the bar's outline was removed, describing something the painter had stopped
   * doing. It now asks about the bar's own extent, which is the thing that changed.
   */
  it('strokes the nodes in the calm hairline, and no longer outlines the bar itself', () => {
    const ctx = mockCtx();
    paintScene(ctx, refreshScene(), VIEW, SIZE, PALETTE);
    const rects = ctx.strokeRect.mock.calls;
    // Two nodes, each a square of `NODE_RADIUS * 2` centred on the bar's own ends.
    expect(rects).toHaveLength(2);
    for (const [, , w, h] of rects) {
      expect(w).toBe(NODE_RADIUS * 2);
      expect(h).toBe(NODE_RADIUS * 2);
    }
    // Nothing is stroked on the bar's own extent any more.
    expect(rects.some(([, , w]) => w === BAR_W || w === BAR_W - 1)).toBe(false);
  });

  /**
   * **Criticality's non-colour channel moved from a dashed bar outline to the NODE — and it keeps
   * all THREE of its states** (M3-T3, CQ-6's default; the three-rung repair is M6's).
   *
   * A dash on a 5 px outline is not a channel a reader can use — the dash period is wider than the
   * shape being dashed — so the shape difference goes where there is room for one. What M3-T3 then
   * got wrong, and the accessibility gate caught, is the COUNT: it shipped `isCritical ||
   * isNearCritical`, so critical and near-critical became distinguishable by **hue alone**, on the
   * most important distinction in the product, against a cue that had carried three states for a
   * year. This case asserts the new channel exists, that the old one is gone, and — the part the
   * boolean version could not — that **no two rungs paint the same picture**.
   */
  it('separates critical, near-critical and neither by SHAPE, not only by hue', () => {
    // On a context WITH `roundRect` — the branch that ships. A minimal mock takes the documented
    // square fallback, which is a real path but not the one a browser draws (ADR-0103).
    const paintWith = (activity: RenderActivity): string[] => {
      const r = recordingCtx({ ...mockCtx(), roundRect: vi.fn() });
      paintScene(r.ctx, refreshScene({ activities: [activity] }), VIEW, SIZE, PALETTE);
      return r.log;
    };
    const fills = (log: string[]): number => log.filter((e) => e === 'fill([])').length;

    // **Critical — the node is FILLED.** Bar body + two filled nodes = three `fill()`s.
    const critical = paintWith(task({ isCritical: true }));
    expect(critical).toContain(`strokeStyle=${PALETTE.outline}`);
    expect(fills(critical)).toBe(3);

    // **Near-critical — a heavy RING.** Emphasised like critical and hollow like neither, which is
    // what makes it a third shape rather than a second colour.
    const near = paintWith(task({ isNearCritical: true }));
    expect(near).toContain(`strokeStyle=${PALETTE.outline}`);
    expect(near).toContain(`lineWidth=${EMPHASIS_STROKE_W}`);
    expect(fills(near)).toBe(1);

    // **Neither — the calm hairline, hollow.**
    const plain = paintWith(task());
    expect(plain).toContain(`strokeStyle=${PALETTE.barStroke}`);
    expect(plain).not.toContain(`strokeStyle=${PALETTE.outline}`);
    expect(fills(plain)).toBe(1);

    // The retired cue: no dashed emphasis outline on the BAR, at any rung.
    for (const log of [critical, near, plain]) expect(log).not.toContain('setLineDash([[3,2]])');

    // **The property the boolean could not have**: all three pictures differ from each other.
    const pictures = [critical.join('|'), near.join('|'), plain.join('|')];
    expect(new Set(pictures).size).toBe(3);
  });

  /**
   * **A milestone has no nodes, so its own outline carries the rung** — and the dash comes back,
   * because the reason it was retired is about the 5 px bar and not about the cue: a 14 px
   * diamond's perimeter has room for a `[3, 2]` period and a 5 px outline has none.
   */
  it('separates the three rungs on a milestone by outline weight and dash', () => {
    const paintWith = (activity: RenderActivity): string[] => {
      const r = recordingCtx({ ...mockCtx(), roundRect: vi.fn() });
      paintScene(r.ctx, refreshScene({ activities: [activity] }), VIEW, SIZE, PALETTE);
      return r.log;
    };
    const ms = { type: 'START_MILESTONE' as const };

    const critical = paintWith(task({ ...ms, isCritical: true }));
    expect(critical).toContain(`lineWidth=${EMPHASIS_STROKE_W}`);
    expect(critical).not.toContain('setLineDash([[3,2]])');

    const near = paintWith(task({ ...ms, isNearCritical: true }));
    expect(near).toContain(`lineWidth=${EMPHASIS_STROKE_W}`);
    expect(near).toContain('setLineDash([[3,2]])');

    const plain = paintWith(task({ ...ms }));
    expect(plain).toContain(`strokeStyle=${PALETTE.barStroke}`);
    expect(plain).not.toContain('setLineDash([[3,2]])');

    expect(new Set([critical.join('|'), near.join('|'), plain.join('|')]).size).toBe(3);
  });

  /**
   * **A bracketed span draws no node** — the M6 component review found the milestone branch's own
   * rule ("the diamond is already a terminal glyph") written for one glyph family and not its two
   * neighbours. An LOE cap is 2 px wide and a summary tab 3 px, both at the bar's ends; a node is
   * a 10 px disc centred on that same end, so it paints the identity glyph out entirely.
   */
  it('draws no node on a bracketed span — the cap or tab IS its terminal glyph', () => {
    const nodes = (activity: RenderActivity): number => {
      const r = recordingCtx();
      paintScene(r.ctx, refreshScene({ activities: [activity] }), VIEW, SIZE, PALETTE);
      // The documented square fallback: a node is a `NODE_RADIUS * 2` box at each bar end.
      const box = new RegExp(
        `^strokeRect\\(\\[[-\\d.]+,[-\\d.]+,${NODE_RADIUS * 2},${NODE_RADIUS * 2}\\]\\)$`,
      );
      return r.log.filter((e) => box.test(e)).length;
    };
    expect(nodes(task())).toBe(2);
    expect(nodes(task({ type: 'LEVEL_OF_EFFORT' }))).toBe(0);
    expect(nodes(task({ type: 'WBS_SUMMARY' }))).toBe(0);
  });

  /**
   * **Two centred names in one lane never touch** — the M6 UX review found the residual this
   * layer's own comment had left for review, and judged it against a rendered picture: two
   * adjacent labels read as one garbled string. A gap is shared, so each bar claims half of it.
   */
  it('keeps adjacent above-bar names apart, sharing the gap between the bars', () => {
    const ALL_OFF = {
      dayGrid: false,
      monthGrid: false,
      yearGrid: false,
      today: false,
      nonWorking: false,
      labels: false,
      lateOverlay: false,
    } as const;
    // Centred text: the log carries the CENTRE x; the stub measures 6 px per glyph.
    const separation = (secondStart: string): number => {
      const r = recordingCtx();
      paintScene(
        r.ctx,
        refreshScene({
          view: { ...ALL_OFF, labels: true },
          activities: [
            task({ id: 'a', label: 'AAAAAAAAAAAAAAAA', earlyFinish: '2026-01-05' }),
            task({
              id: 'b',
              label: 'BBBBBBBBBBBBBBBB',
              earlyStart: secondStart,
              earlyFinish: '2026-01-14',
            }),
          ],
        }),
        VIEW,
        SIZE,
        PALETTE,
      );
      const drawn = r.log
        .map((e) => /^fillText\(\["([^"]*)",([-\d.]+),([-\d.]+)\]\)$/.exec(e))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => ({ cx: Number(m[2]), w: m[1]!.length * 6 }));
      expect(drawn.length).toBe(2);
      const [left, right] = [...drawn].sort((x, y) => x.cx - y.cx);
      return right!.cx - right!.w / 2 - (left!.cx + left!.w / 2);
    };
    // A real gap between the bars is SHARED: each name takes half, so the two keep `LABEL_GAP_PX`.
    expect(separation('2026-01-09')).toBeGreaterThanOrEqual(LABEL_GAP_PX);
    // Bars that touch leave nothing to share, so each name is confined to its own bar — which is
    // the honest floor: they abut rather than overlapping, where the old rule let them cross.
    expect(separation('2026-01-06')).toBeGreaterThanOrEqual(0);
  });

  /**
   * **The date ladder: inside the bar's own ends, else flanking them, else nothing.** The M6 UX
   * review reproduced the defect against the real painter — this branch measured nothing, so on a
   * bar narrower than its two dates the start (left-aligned at the bar's left edge) and the finish
   * (right-aligned at its right edge) overprinted each other and spilled past both ends into the
   * neighbours' gaps, under a comment promising "both its dates at every density".
   *
   * The first fix suppressed outright and `paint.dates-budget.test.ts` refused it: at the LOD
   * threshold every date in that fixture vanished and the budget gate measured nothing. So the
   * bottom rung is kept and a flanking rung sits above it.
   */
  it('draws the dates inside a bar that holds them, and nothing on one crowded from both sides', () => {
    const datesOn = {
      dayGrid: false,
      monthGrid: false,
      yearGrid: false,
      today: false,
      nonWorking: false,
      labels: false,
      lateOverlay: false,
      dates: true,
    } as const;
    const drawnBelow = (activities: RenderActivity[], view: Viewport): number[] => {
      const r = recordingCtx();
      paintScene(r.ctx, refreshScene({ view: { ...datesOn }, activities }), view, SIZE, PALETTE);
      const below = rowSlots(screenYOfLane(0, view)).belowY;
      return r.log
        .map((e) => /^fillText\(\["[^"]*",([-\d.]+),([-\d.]+)\]\)$/.exec(e))
        .filter((m): m is RegExpExecArray => m !== null && Number(m[2]) === below)
        .map((m) => Number(m[1]));
    };
    // **Wide enough**: both dates sit on the bar's own ends, reaching nothing.
    const wide = { ...VIEW, pxPerDay: 60 };
    const inside = drawnBelow([task()], wide);
    expect(inside).toHaveLength(2);
    const rect = { x: 60 + 1 * wide.pxPerDay, w: 4 * wide.pxPerDay };
    expect(Math.min(...inside)).toBe(rect.x);
    expect(Math.max(...inside)).toBe(rect.x + rect.w);
    // **Crowded from both sides**: nothing fits inside and there is no room beside, so the row
    // shows the bar alone rather than two dates printed over each other. Asserted on the MIDDLE
    // bar, because the last bar in a lane always has the rest of the canvas to its right and
    // legitimately flanks into it — a count over the whole row would be a test of that instead.
    const crowded = drawnBelow(
      [
        task({ id: 'p', earlyStart: '2026-01-01', earlyFinish: '2026-01-01' }),
        task({ id: 'c', earlyStart: '2026-01-02', earlyFinish: '2026-01-02' }),
        task({ id: 'n', earlyStart: '2026-01-03', earlyFinish: '2026-01-03' }),
      ],
      VIEW,
    );
    const middle = { x: 60 + 1 * VIEW.pxPerDay, w: Math.max(2, VIEW.pxPerDay) };
    for (const x of [
      middle.x - LABEL_GAP_PX,
      middle.x,
      middle.x + middle.w,
      middle.x + middle.w + LABEL_GAP_PX,
    ]) {
      expect(crowded).not.toContain(x);
    }
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
    // Square-fallback ctx: bar body + band + divider = 3 fillRects. The two HOLLOW nodes take the
    // fallback's `strokeRect`, not a fill — only a critical bar's filled nodes add fills here.
    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
    // **The band is the bar's WHOLE height** under the row treatment (M3-T3): the inset shape
    // exists to sit below a centred inside label, and a 5 px bar holds neither.
    expect(ctx.fillRect).toHaveBeenCalledWith(BAR_X, BAR_Y, BAR_W / 2, BAR_HEIGHT);
    // The divider stands PROUD of the bar, because a 1 px mark confined to 5 px of height is not
    // a shape a reader can see — the cue's whole purpose (WCAG 1.4.1).
    expect(ctx.fillRect).toHaveBeenCalledWith(
      BAR_X + BAR_W / 2 - 0.5,
      BAR_Y - PROGRESS_FRONT_PROUD_PX,
      1,
      BAR_HEIGHT + PROGRESS_FRONT_PROUD_PX * 2,
    );
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
    expect(done.fillRect).toHaveBeenCalledWith(BAR_X, BAR_Y, BAR_W, BAR_HEIGHT);
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
    const bandAt = log.findIndex(
      (e) => e === `fillRect([${BAR_X},${BAR_Y},${BAR_W / 2},${BAR_HEIGHT}])`,
    );
    expect(dimAt).toBeGreaterThanOrEqual(0);
    expect(bandAt).toBeGreaterThan(dimAt);
    expect(restoreAt).toBeGreaterThan(bandAt);
  });

  it('draws the LOE/hammock bracketed span: end caps in the bar’s own fill', () => {
    for (const type of ['LEVEL_OF_EFFORT', 'HAMMOCK'] as const) {
      const ctx = mockCtx();
      paintScene(ctx, refreshScene({ activities: [task({ type })] }), VIEW, SIZE, PALETTE);
      // Body + two bracket caps, overhanging the bar by `GLYPH_CAP_OVERHANG` top and bottom —
      // derived from the bar since M3-T2, so this states the shape rather than four numbers.
      expect(ctx.fillRect).toHaveBeenCalledTimes(3);
      const capY = BAR_Y - GLYPH_CAP_OVERHANG;
      const capH = BAR_HEIGHT + GLYPH_CAP_OVERHANG * 2;
      expect(ctx.fillRect).toHaveBeenCalledWith(BAR_X, capY, GLYPH_CAP_W, capH);
      expect(ctx.fillRect).toHaveBeenCalledWith(
        BAR_X + BAR_W - GLYPH_CAP_W,
        capY,
        GLYPH_CAP_W,
        capH,
      );
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
    const tabY = BAR_Y + BAR_HEIGHT;
    expect(ctx.fillRect).toHaveBeenCalledWith(BAR_X, tabY, SUMMARY_TAB_W, SUMMARY_TAB_H);
    expect(ctx.fillRect).toHaveBeenCalledWith(
      BAR_X + BAR_W - SUMMARY_TAB_W,
      tabY,
      SUMMARY_TAB_W,
      SUMMARY_TAB_H,
    );
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
    // No dash: a milestone's criticality outline stopped being dashed with the bar's at M3-T3,
    // for the same reason — the cue moved to the node/outline weight where there is room for it.
    expect(critical.log).not.toContain('setLineDash([[3,2]])');
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
    //
    // **The refresh now draws two NODE glyphs the legacy path does not** (M3-T3), so the counts
    // differ by exactly that and the assertion says so rather than being relaxed to an
    // inequality. A hollow node is one `strokeRect` on the fallback context this case uses.
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
    // Badge fills: the conflict triangle path (fill) is unchanged, and so are the squares and the
    // histogram fillRects — the badges themselves are untouched by the row treatment.
    expect(refreshed.fill.mock.calls.length).toBe(legacy.fill.mock.calls.length);
    expect(refreshed.fillRect.mock.calls.length).toBe(legacy.fillRect.mock.calls.length);
    // The refreshed bar adds exactly TWO hollow node glyphs, each one `strokeRect` on this
    // fallback context. It adds no bar outline: M3-T3 removed that in favour of the node.
    expect(refreshed.strokeRect.mock.calls.length).toBe(legacy.strokeRect.mock.calls.length + 2);
  });

  it('marks the BREACHED edge: a start conflict at the start, an overrun bound at the finish', () => {
    /**
     * **The badge was drawn at `rect.x` for both reasons until the M-J gate pass**, under a docblock
     * that said "start edge" and described only `EARLIER_THAN_LOGIC` — correct while that was the
     * one reason the flag had. M-D added `LATER_THAN_BOUND`, whose engine test is
     * `placedFinish > constraintCeiling`, so the breach is at the FINISH; marking the start pointed
     * a planner at the end of the bar nothing is wrong with, typically with the pin for the bound
     * that was overrun sitting at the other end.
     *
     * The bar here is `rect.x = 72`, `rect.w = 48` (the same geometry the selection-ring case below
     * pins), so the triangle's base-left lands at 73 for a start mark and at 113 for a finish one.
     *
     * Verified red against the pre-fix unconditional `rect.x`, which put both at 73.
     */
    const badgeBaseX = (reason: 'EARLIER_THAN_LOGIC' | 'LATER_THAN_BOUND'): number => {
      const ctx = mockCtx();
      paintScene(
        ctx,
        refreshScene({
          activities: [task({ visualConflict: true, visualConflictReason: reason })],
        }),
        VIEW,
        SIZE,
        PALETTE,
      );
      const move = sceneMoveCalls(ctx).find(([x]) => x !== 0);
      if (!move) throw new Error('no conflict badge was drawn');
      return move[0];
    };
    expect(badgeBaseX('EARLIER_THAN_LOGIC')).toBe(73);
    expect(badgeBaseX('LATER_THAN_BOUND')).toBe(113);
  });

  it('keeps an overrun bound’s badge ON a bar narrower than the badge itself', () => {
    /**
     * **The clamp, and the case it is for is NOT the one the first draft asserted.** That draft used
     * a milestone, reasoning that a diamond is narrow — and `MILESTONE_RADIUS * 2 = 14`, comfortably
     * wider than the badge, so the clamp never fired and the test passed against a build with no
     * clamp at all. A vacuous assertion dressed as a boundary case.
     *
     * The real case is a zoomed-out task bar: `activityRect` floors width at 2 px, so at a
     * whole-plan framing a short activity is narrower than the 6 px badge and the finish-edge
     * arithmetic lands to the LEFT of the bar it marks. Here `pxPerDay: 1` gives `rect.x = 61,
     * rect.w = 2`, so unclamped the triangle's base-left would be 56 — five pixels outside the
     * shape, over whatever the neighbouring lane happens to be drawing.
     *
     * Verified red against the unclamped expression.
     */
    const ctx = mockCtx();
    paintScene(
      ctx,
      refreshScene({
        activities: [
          task({
            earlyFinish: '2026-01-02',
            visualConflict: true,
            visualConflictReason: 'LATER_THAN_BOUND',
          }),
        ],
      }),
      { pxPerDay: 1, originX: 60, originY: 40 },
      SIZE,
      PALETTE,
    );
    const move = sceneMoveCalls(ctx).find(([x]) => x !== 0);
    if (!move) throw new Error('no conflict badge was drawn');
    expect(move[0]).toBe(62);
  });

  it('rounds the selection ring with the bar (roundRect path) and keeps the square fallback', () => {
    const scene = refreshScene({ selectedId: 't' });
    const rounded = roundedCtx();
    paintScene(rounded, scene, VIEW, SIZE, PALETTE);
    // The ring is the bar's rect ± 2, with a radius that tracks the bar's.
    const ring = [BAR_X - 2, BAR_Y - 2, BAR_W + 4, BAR_HEIGHT + 4] as const;
    expect(rounded.roundRect).toHaveBeenCalledWith(...ring, BAR_RADIUS + 2);
    const square = mockCtx();
    paintScene(square, scene, VIEW, SIZE, PALETTE);
    expect(square.strokeRect).toHaveBeenCalledWith(...ring);
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

  /**
   * **Crowded ends CONVERGE on the node now; they do not fan out** (M3-T3, spec D10).
   *
   * Fan-out spread several ends along a bar edge by `FAN_OUT_STEP_PX`, which needs the bar's
   * half-height to spread within — 2.5 px at the row treatment's bar, which the step alone
   * exceeded. The reference solves the same crowding the other way, and the node glyph at each
   * bar end is what a reader's eye lands on instead.
   *
   * The case is kept and inverted rather than deleted, because "every end leaves from the same
   * point" is the property that replaced the one it used to assert — and its permutation limb
   * still guards determinism, which is the half fan-out was really for.
   */
  it('converges crowded finish-edge ends on ONE point, deterministically', () => {
    const startsAtFinishEdge = (scene: TsldScene): number[] => {
      const ctx = mockCtx();
      paintScene(ctx, scene, VIEW, SIZE, PALETTE);
      return ctx.moveTo.mock.calls
        .filter((c) => c[0] === BAR_X + BAR_W)
        .map((c) => c[1] as number)
        .sort((a, b) => a - b);
    };
    const centre = BAR_Y + BAR_HEIGHT / 2;
    const ys = startsAtFinishEdge(refreshOn());
    expect(ys.length).toBeGreaterThan(1);
    expect(new Set(ys)).toEqual(new Set([centre]));
    // Deterministic across an input-order permutation.
    const permuted = refreshOn({
      edges: [fs('e3', 's3'), fs('e1', 's1'), crowded().edges[3]!, fs('e2', 's2', true)],
    });
    expect(startsAtFinishEdge(permuted)).toEqual(ys);
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
    expect(ctx.moveTo.mock.calls.filter((c) => c[0] === BAR_X + BAR_W)[0]![1]).toBe(
      BAR_Y + BAR_HEIGHT / 2,
    );
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
    const runY = BAR_Y + BAR_HEIGHT / 2;
    expect(log.indexOf(`moveTo([${BAR_X},${runY}])`)).toBeGreaterThan(dashAt);
    expect(log.indexOf(`lineTo([108,${runY}])`)).toBeGreaterThan(dashAt);
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

  it('memoises the activity index on the activities array identity (same array ⇒ === map)', () => {
    // The id→activity index the painter reads nine times per frame rides the same array-identity
    // contract as the fan-out memo above: identity is the call-count proxy — `===` across calls
    // proves the Map constructor ran once, with no spy hook needed.
    const activities = crowded().activities;
    const first = activityIndexFor(activities);
    expect(activityIndexFor(activities)).toBe(first);
    const rebuilt = [...activities]; // same activity objects, new array identity
    const second = activityIndexFor(rebuilt);
    expect(second).not.toBe(first);
    expect(second.size).toBe(first.size);
    for (const a of rebuilt) expect(second.get(a.id)).toBe(a);
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
   *
   * **Separating a handle from a bar's NODE glyph is the part that needed thought** (M3-T3). A
   * node is traced exactly the same way — a square box with a half-side radius, which is how a
   * circle is drawn without widening the `Ctx2D` surface — so the shape alone cannot tell them
   * apart. Nor can the radius: `NODE_RADIUS` derives to 5 and the ACTIVE handle's radius is also
   * 5, so excluding by size silently dropped the one disc two of these cases are about.
   *
   * The discriminator is a **positive property of a handle**: it is traced TWICE, once for the
   * core fill and once for the halo stroke, while a node is traced once and then filled and/or
   * stroked on the same path. So a box that appears twice is a handle, whatever its size or where
   * it sits — and that stays true if either radius changes.
   */
  const handles = (ctx: ReturnType<typeof roundedCtx>): number[][] => {
    const boxes = ctx.roundRect.mock.calls
      .map((c) => c.map(Number))
      .filter(([, , w, h, r]) => w === h && w === (r ?? 0) * 2);
    const counts = new Map<string, number>();
    for (const box of boxes) {
      const key = JSON.stringify(box);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const seen = new Set<string>();
    return boxes
      .filter((box) => (counts.get(JSON.stringify(box)) ?? 0) >= 2)
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
    // p starts day 1 (x 72); +3 working days embeds at day 4 (x 108), on its own lane centre.
    paintScene(ctx, scene({ edges: [edge({ type: 'SS', lagDays: 3 })] }), VIEW, SIZE, PALETTE);
    const cy = BAR_Y + BAR_HEIGHT / 2;
    expect(handles(ctx)).toEqual([[104.5, cy - 3.5, 7, 7, 3.5]]);
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
    // Painted after every bar body — an on-bar affordance drawn under the bars would be exactly
    // as invisible as no affordance at all. The bar traces at `BAR_RADIUS`, read from the module
    // rather than written, since M3-T2 derives it from the bar's height.
    const lastBar = log.reduce(
      (acc, e, i) => (e.startsWith('roundRect(') && e.endsWith(`,${BAR_RADIUS}])`) ? i : acc),
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
