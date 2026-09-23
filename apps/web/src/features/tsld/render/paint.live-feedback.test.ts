import { describe, expect, it } from 'vitest';

import { paintInteractionLayer, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Rect, Viewport } from './render-model';
import { mockCtx } from './test-support/recording-ctx';

/**
 * Canvas **live feedback** painter tests (ADR-0054 §1, `VITE_CANVAS_LIVE_FEEDBACK`) — the ghost
 * carrying the dragged bar's own detail, and the source bar receding while it does.
 *
 * The parity assertions matter as much as the feature ones: with `ghost`/`gestureSourceId` absent
 * (the flag-off path never writes either) every draw call must be exactly what ADR-0052 produced,
 * which is the epic's rollback contract.
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  laneRule: '#9c9c9c',
  linkMinor: '#80848b',
  linkDriving: '#3b6fbf',
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
  barStroke: '#5a5a5a',
  hoverRing: '#9a9a9a',
  handleHalo: '#0b0b0b',
  monthBand: '#111111',
};

const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
const SIZE = { width: 800, height: 400 };
const DATA_DATE = '2026-01-01';
const GHOST: Rect = { x: 100, y: 50, w: 160, h: 18 };

/** All the pre-existing view layers on, matching the painter's defaults. */
const ALL_ON = {
  dayGrid: true,
  monthGrid: true,
  yearGrid: true,
  today: true,
  nonWorking: true,
  labels: true,
  lateOverlay: false,
} as const;

function task(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 't',
    type: 'TASK',
    laneIndex: 0,
    label: 'A100 Excavate · 4d',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

/** The alphas the bar layer set, in call order — `globalAlpha` is mutated, so record it live. */
function recordAlphas(ctx: ReturnType<typeof mockCtx>): number[] {
  const seen: number[] = [];
  let value = 1;
  Object.defineProperty(ctx, 'globalAlpha', {
    get: () => value,
    set: (next: number) => {
      value = next;
      seen.push(next);
    },
  });
  return seen;
}

describe('gesture source dimming (ADR-0054 §1)', () => {
  it('paints the dragged bar at a lower alpha than an undragged one', () => {
    const plain = mockCtx();
    const plainAlphas = recordAlphas(plain);
    const scene: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    paintScene(plain, scene, VIEW, SIZE, PALETTE, 1);

    const dragged = mockCtx();
    const draggedAlphas = recordAlphas(dragged);
    paintScene(dragged, { ...scene, gestureSourceId: 't' }, VIEW, SIZE, PALETTE, 1);

    const lowest = (xs: number[]): number => Math.min(...xs);
    expect(lowest(draggedAlphas)).toBeLessThan(lowest(plainAlphas));
  });

  it('leaves every other bar untouched — only the dragged id recedes', () => {
    const ctx = mockCtx();
    const alphas = recordAlphas(ctx);
    const scene: TsldScene = {
      activities: [task({ id: 'a' }), task({ id: 'b', laneIndex: 1 })],
      edges: [],
      dataDate: DATA_DATE,
      gestureSourceId: 'a',
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE, 1);
    // Exactly one bar received the gesture-source alpha; the other stayed at full strength.
    const reduced = alphas.filter((a) => a < 1 && a !== 0.3);
    expect(reduced.length).toBeGreaterThan(0);
    expect(new Set(reduced).size).toBe(1);
  });

  it('is a no-op without a gestureSourceId — the flag-off parity contract', () => {
    const withField = mockCtx();
    const withoutField = mockCtx();
    const base: TsldScene = { activities: [task()], edges: [], dataDate: DATA_DATE };
    paintScene(withField, { ...base, gestureSourceId: null }, VIEW, SIZE, PALETTE, 1);
    paintScene(withoutField, base, VIEW, SIZE, PALETTE, 1);
    expect(withField.fillRect.mock.calls).toEqual(withoutField.fillRect.mock.calls);
    expect(withField.strokeRect.mock.calls).toEqual(withoutField.strokeRect.mock.calls);
  });
});

describe('ghost fidelity (ADR-0054 §1)', () => {
  it('draws the dragged bar’s label inside the ghost', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { live: GHOST, visualRefresh: true, ghost: { label: 'A100 Excavate · 4d' } },
      SIZE,
      PALETTE,
    );
    expect(ctx.fillText).toHaveBeenCalledWith(
      'A100 Excavate · 4d',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('draws a progress band when the dragged bar has progress', () => {
    const bare = mockCtx();
    paintInteractionLayer(
      bare,
      { live: GHOST, visualRefresh: true, ghost: { label: 'x' } },
      SIZE,
      PALETTE,
    );
    const withProgress = mockCtx();
    paintInteractionLayer(
      withProgress,
      { live: GHOST, visualRefresh: true, ghost: { label: 'x', percentComplete: 50 } },
      SIZE,
      PALETTE,
    );
    expect(withProgress.fillRect.mock.calls.length).toBeGreaterThan(
      bare.fillRect.mock.calls.length,
    );
  });

  it('ghosts a milestone as a diamond path, never a rounded bar', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      { live: GHOST, visualRefresh: true, ghost: { label: 'M1', milestone: true } },
      SIZE,
      PALETTE,
    );
    // The diamond is 4 lineTo segments from a moveTo; a bar ghost strokes rects instead.
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    // A milestone has no room for an inside label, so none is drawn.
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('is a no-op without ghost detail — the flag-off parity contract', () => {
    const withField = mockCtx();
    const withoutField = mockCtx();
    paintInteractionLayer(
      withField,
      { live: GHOST, visualRefresh: true, ghost: null },
      SIZE,
      PALETTE,
    );
    paintInteractionLayer(withoutField, { live: GHOST, visualRefresh: true }, SIZE, PALETTE);
    expect(withField.fillRect.mock.calls).toEqual(withoutField.fillRect.mock.calls);
    expect(withField.strokeRect.mock.calls).toEqual(withoutField.strokeRect.mock.calls);
    expect(withField.fillText).not.toHaveBeenCalled();
  });

  it('applies the same detail to a resize ghost, so both gestures read alike', () => {
    const ctx = mockCtx();
    paintInteractionLayer(
      ctx,
      {
        resize: { rect: GHOST, label: '7d' },
        visualRefresh: true,
        ghost: { label: 'A100 Excavate · 4d' },
      },
      SIZE,
      PALETTE,
    );
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain('A100 Excavate · 4d'); // the ghost's own identity
    expect(texts).toContain('7d'); // the ADR-0052 duration readout, unchanged
  });
});

describe('cursor date readout (ADR-0054 §2)', () => {
  it('draws a full-height guideline at the chosen day, and NO chip (#148 M3)', () => {
    const ctx = mockCtx();
    paintInteractionLayer(ctx, { cursor: { x: 240, label: 'Fri 2 Jan' } }, SIZE, PALETTE);
    // The guideline spans the surface at the day boundary — a full-height vertical IS a scene mark,
    // meaning something at every lane, so it stays on the canvas.
    expect(ctx.moveTo).toHaveBeenCalledWith(240.5, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(240.5, SIZE.height);
    // The chip that used to state the date is DOM in the ruler's transient marker row now. That it
    // states the label lives in `TsldCanvas.axis-markers.test.tsx`; that it never covers a bar is
    // `e2e-axis-markers`, which is the assertion no test here could ever make.
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.measureText).not.toHaveBeenCalled();
  });

  it('needs no text support at all, so the whole overlay is shapes (#148 M3)', () => {
    // What replaces the old edge-clamping case. Clamping did not disappear — it moved to
    // `clampMarkLeft` in `render/axis-markers.ts`, where ONE rule now serves the canvas rules, the
    // persistent marks and this readout, and `axis-markers.test.ts` asserts it at both edges. What
    // this asserts instead is the property that made the move safe: the interaction layer reaches
    // for no text API, so a context without one cannot throw and a per-move `measureText` cannot
    // creep back in.
    const ctx = mockCtx();
    // @ts-expect-error — simulate an environment without text support.
    ctx.fillText = undefined;
    // @ts-expect-error — simulate an environment without text support.
    ctx.measureText = undefined;
    paintInteractionLayer(ctx, { cursor: { x: 0, label: 'Thu 1 Jan' } }, SIZE, PALETTE);
    paintInteractionLayer(ctx, { cursor: { x: SIZE.width, label: 'Thu 1 Jan' } }, SIZE, PALETTE);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('is a no-op without a cursor — the flag-off parity contract', () => {
    const withField = mockCtx();
    const withoutField = mockCtx();
    paintInteractionLayer(withField, { live: GHOST, cursor: null }, SIZE, PALETTE);
    paintInteractionLayer(withoutField, { live: GHOST }, SIZE, PALETTE);
    expect(withField.fillRect.mock.calls).toEqual(withoutField.fillRect.mock.calls);
    expect(withField.moveTo.mock.calls).toEqual(withoutField.moveTo.mock.calls);
    expect(withField.fillText).not.toHaveBeenCalled();
  });
});

describe("the feasible window (one-planning-surface M-E, replacing ADR-0054 §4's tails)", () => {
  const withWindow = (activity: Partial<RenderActivity>) => {
    const ctx = mockCtx();
    const scene: TsldScene = {
      activities: [task(activity)],
      edges: [],
      dataDate: DATA_DATE,
      view: { ...ALL_ON, floatTails: true },
    };
    paintScene(ctx, scene, VIEW, SIZE, PALETTE, 1);
    return ctx;
  };

  // The window is ONE batched path, so every assertion here counts `moveTo` rather than
  // `strokeRect`. That is the change of treatment, not a change of instrument: two stroked rects
  // became one bracket, which is the whole point of the window replacing the tails.
  const marks = (activity: Partial<RenderActivity>) =>
    withWindow(activity).moveTo.mock.calls.length;

  it('widens with the float it is derived from', () => {
    expect(marks({ remainingFloat: 5 })).toBeGreaterThan(marks({ remainingFloat: 0 }));
  });

  it('is derived from remainingFloat, NEVER from totalFloat', () => {
    // The #348 fix, pinned. The shipped tail drew `totalFloat` from the PLACED finish, so it
    // overshot the late finish by exactly the drift on every plan with a placement. A window built
    // from `totalFloat` would be indistinguishable from this one wherever nothing is placed — so
    // the fixture places something, which is what makes the two quantities differ.
    const correct = marks({ remainingFloat: 2, visualDriftDays: 8, totalFloat: 10 });
    const overshooting = marks({ remainingFloat: 10, visualDriftDays: 8, totalFloat: 10 });
    expect(correct).not.toBe(overshooting);
  });

  it("draws a window for a critical, unplaced bar — the estate's COMMON case", () => {
    // The old tails returned null for non-positive float and drew NOTHING, which is how a planner
    // learns a control does nothing. FC-1 predicts no placements anywhere on the deployed estate,
    // so a zero-float unplaced bar is not an edge case — it is what most bars look like.
    //
    // Measured against the UNCALCULATED scene rather than against zero: `moveTo` is used by the
    // grid, the lane hairlines and the edge layer too, so an absolute count is an instrument that
    // measures the whole frame. The first version of this case asserted `> 0` and passed for that
    // reason; its sibling below asserted `=== 0` and failed, which is what exposed it.
    expect(marks({ remainingFloat: 0, visualDriftDays: null })).toBeGreaterThan(
      marks({ remainingFloat: null }),
    );
  });

  it('draws nothing at all when the plan has never been calculated', () => {
    // The ONE state with no honest answer: no remaining float means no late finish to bracket.
    // Distinct from zero, which is a real and common answer — the case above is that one.
    const uncalculated = marks({ remainingFloat: null });
    expect(marks({})).toBe(uncalculated);
    // …and it matches the toggle-off frame exactly, which is what "nothing" means here.
    const off = mockCtx();
    paintScene(
      off,
      {
        activities: [task({ remainingFloat: null })],
        edges: [],
        dataDate: DATA_DATE,
        view: { ...ALL_ON, floatTails: false },
      },
      VIEW,
      SIZE,
      PALETTE,
      1,
    );
    expect(uncalculated).toBe(off.moveTo.mock.calls.length);
  });

  it('draws the two states the shipped tails could not: negative float, and negative drift', () => {
    // Both returned `null` from their rect helpers and drew nothing, so each becomes visible here
    // for the first time. Negative drift is ADR-0033's stay-and-flag — a placement EARLIER than
    // logic allows is kept, not clamped.
    expect(marks({ remainingFloat: -4 })).toBeGreaterThan(0);
    expect(marks({ remainingFloat: 3, visualDriftDays: -4 })).toBeGreaterThan(0);
  });

  it('hatches the span, so the cue is never colour alone (WCAG 1.4.1)', () => {
    const ctx = withWindow({ remainingFloat: 10 });
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('is a no-op without the toggle — the flag-off parity contract', () => {
    const off = mockCtx();
    const absent = mockCtx();
    const activities = [task({ remainingFloat: 8, visualDriftDays: 2 })];
    paintScene(
      off,
      { activities, edges: [], dataDate: DATA_DATE, view: { ...ALL_ON, floatTails: false } },
      VIEW,
      SIZE,
      PALETTE,
      1,
    );
    paintScene(
      absent,
      { activities, edges: [], dataDate: DATA_DATE, view: ALL_ON },
      VIEW,
      SIZE,
      PALETTE,
      1,
    );
    expect(off.strokeRect.mock.calls).toEqual(absent.strokeRect.mock.calls);
    expect(off.moveTo.mock.calls).toEqual(absent.moveTo.mock.calls);
  });
});

describe('relationship slack on the selection (ADR-0054 §5)', () => {
  const pred = task({ id: 'p', earlyStart: '2026-01-02', earlyFinish: '2026-01-05' });
  // Starts 5 days after the predecessor finishes, so this FS tie carries 5 days of slack.
  const succ = task({
    id: 's',
    laneIndex: 1,
    earlyStart: '2026-01-11',
    earlyFinish: '2026-01-14',
  });
  const edges = [
    { predecessorId: 'p', successorId: 's', type: 'FS' as const, isDriving: false, lagDays: 0 },
  ];
  const paintWith = (selectedId: string | null, linkSlack = true) => {
    const ctx = mockCtx();
    paintScene(
      ctx,
      {
        activities: [pred, succ],
        edges,
        dataDate: DATA_DATE,
        selectedId,
        view: { ...ALL_ON, linkSlack },
      },
      VIEW,
      SIZE,
      PALETTE,
      1,
    );
    return ctx.fillText.mock.calls.map((c) => c[0]);
  };

  it('annotates the gap on the selected activity’s own tie', () => {
    expect(paintWith('p')).toContain('5d');
  });

  it('annotates it from either end of the tie', () => {
    expect(paintWith('s')).toContain('5d');
  });

  it('annotates nothing without a selection — it is an inspection affordance', () => {
    expect(paintWith(null)).not.toContain('5d');
  });

  it('is a no-op without the toggle — the flag-off parity contract', () => {
    expect(paintWith('p', false)).not.toContain('5d');
  });
});
