import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import {
  activityRect,
  formatCanvasDate,
  LABEL_GAP_PX,
  rowSlots,
  screenYOfLane,
  type RenderActivity,
  type Viewport,
} from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **The centre item under a bar** (NetPoint-layout M1, spec §4.6): `5d · 3d float left`, or `5d`
 * where only that fits, or nothing — and never outside its own bar.
 *
 * The recording context measures ~6 px a glyph, so every width below is arithmetic on the string:
 * a date such as `5 Jan` is 30 px, `5d` is 12 and `5d · 3d float left` is 108.
 */
const PALETTE = {
  canvas: '#fff',
  gridLine: '#ccc',
  todayLine: '#f00',
  barFill: '#08f',
  barStroke: '#06c',
  criticalFill: '#c00',
  nearCriticalFill: '#c80',
  selection: '#000',
  labelInside: '#fff',
  labelBeside: '#333',
  outline: '#000',
} as unknown as TsldPalette;

const DATA_DATE = '2026-01-01';

function bar(over: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: 0,
    label: 'A100 Excavate',
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-24',
    isCritical: false,
    isNearCritical: false,
    durationDays: 5,
    remainingFloat: 3,
    ...over,
  };
}

/** The centre items drawn: `fillText` calls on the below row whose text is not a date. */
function centreItems(scene: TsldScene, view: Viewport): { text: string; x: number; y: number }[] {
  const { ctx, log } = recordingCtx();
  paintScene(ctx, scene, view, { width: 1600, height: 400 }, PALETTE);
  const below = rowSlots(screenYOfLane(0, view)).belowY;
  return log
    .filter((line) => line.startsWith('fillText('))
    .map((line) => JSON.parse(line.slice('fillText('.length, -1)) as [string, number, number])
    .filter(([text, , y]) => y === below && /d\b/.test(text) && !/Jan|Feb/.test(text))
    .map(([text, x, y]) => ({ text, x, y }));
}

const VIEW: Viewport = { pxPerDay: 20, originX: 0, originY: 40 };
const withToggles = (activities: RenderActivity[], toggles: object): TsldScene => ({
  activities,
  edges: [],
  dataDate: DATA_DATE,
  view: { ...DEFAULT_VIEW_TOGGLES, ...toggles },
});

describe('paintScene — the centre item (NetPoint-layout M1)', () => {
  it('sits in full between the two dates when the dates are drawn inside the bar', () => {
    const a = bar({ id: 'a' });
    const rect = activityRect(a, VIEW, DATA_DATE)!;
    const items = centreItems(withToggles([a], { dates: true, labels: true }), VIEW);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe('5d · 3d float left');
    // Centred in the gap the two dates leave, not in the whole bar.
    const startW = formatCanvasDate(a.earlyStart!).length * 6;
    const finishW = formatCanvasDate(a.earlyFinish!).length * 6;
    expect(items[0]!.x).toBe(
      rect.x + (startW + LABEL_GAP_PX + (rect.w - finishW - LABEL_GAP_PX)) / 2,
    );
  });

  it('never leaves its own bar, and never reaches the dates beside it', () => {
    for (const days of [4, 6, 9, 14, 20, 30]) {
      const finish = new Date(Date.parse('2026-01-05T00:00:00Z') + (days - 1) * 86_400_000);
      const a = bar({ id: `a${days}`, earlyFinish: finish.toISOString().slice(0, 10) });
      const rect = activityRect(a, VIEW, DATA_DATE)!;
      for (const toggles of [{ dates: true }, { dates: false }]) {
        for (const item of centreItems(withToggles([a], { ...toggles, labels: true }), VIEW)) {
          const half = (item.text.length * 6) / 2;
          expect(item.x - half).toBeGreaterThanOrEqual(rect.x);
          expect(item.x + half).toBeLessThanOrEqual(rect.x + rect.w);
          // …and clear of the dates, wherever they were drawn inside the same bar.
          const startW = formatCanvasDate(a.earlyStart!).length * 6;
          const finishW = formatCanvasDate(a.earlyFinish!).length * 6;
          if (toggles.dates && startW + finishW + LABEL_GAP_PX <= rect.w) {
            expect(item.x - half).toBeGreaterThanOrEqual(rect.x + startW);
            expect(item.x + half).toBeLessThanOrEqual(rect.x + rect.w - finishW);
          }
        }
      }
    }
  });

  it('draws nothing under a WBS summary, whose stored duration is not its span (#375)', () => {
    // An imported summary: stored duration 0, dates rolled up across a wide span. Before #375 the
    // painter printed "0d · 0d float left" here. The TASK beside it is the control — the same scene
    // must still produce ITS item, so an empty result cannot mean the layer drew nothing at all.
    const summary = bar({
      id: 's',
      type: 'WBS_SUMMARY',
      label: 'EDF - Hynamics Proposal',
      durationDays: 0,
      remainingFloat: 0,
      earlyFinish: '2026-01-30',
    });
    const task = bar({
      id: 't',
      laneIndex: 0,
      earlyStart: '2026-02-09',
      earlyFinish: '2026-02-20',
    });
    const texts = centreItems(
      withToggles([summary, task], { dates: true, labels: true }),
      VIEW,
    ).map((item) => item.text);
    expect(texts).not.toContain('0d · 0d float left');
    expect(texts).not.toContain('0d');
    expect(texts).toContain('5d · 3d float left');
  });

  it('falls back to the duration alone where the full form does not fit', () => {
    // A 4-day bar is 80 px: the full form (108) does not fit, `5d` (12) does.
    const a = bar({ id: 'a', earlyFinish: '2026-01-08' });
    expect(centreItems(withToggles([a], { dates: false, labels: true }), VIEW)).toEqual([
      expect.objectContaining({ text: '5d' }),
    ]);
  });

  it('draws nothing on a bar too narrow for either form', () => {
    const a = bar({ id: 'a', earlyFinish: '2026-01-05' }); // one day: 20 px, and dates are off
    const narrow: Viewport = { ...VIEW, pxPerDay: 8 };
    expect(centreItems(withToggles([a], { dates: false, labels: true }), narrow)).toEqual([]);
  });

  it('omits the float clause when the engine has not computed one', () => {
    const a = bar({ id: 'a', remainingFloat: null });
    expect(centreItems(withToggles([a], { dates: true, labels: true }), VIEW)[0]!.text).toBe('5d');
  });

  it('rides `Labels`: off, it draws nothing', () => {
    expect(
      centreItems(withToggles([bar({ id: 'a' })], { dates: true, labels: false }), VIEW),
    ).toEqual([]);
  });

  it('draws nothing for a milestone, which has no bar to hold it', () => {
    const m = bar({
      id: 'm',
      type: 'FINISH_MILESTONE',
      earlyStart: '2026-01-10',
      earlyFinish: '2026-01-10',
      durationDays: 0,
      remainingFloat: 4,
    });
    expect(centreItems(withToggles([m], { dates: true, labels: true }), VIEW)).toEqual([]);
  });

  it('draws a milestone’s single date once, centred under the diamond', () => {
    const m = bar({
      id: 'm',
      type: 'FINISH_MILESTONE',
      earlyStart: '2026-01-10',
      earlyFinish: '2026-01-10',
      durationDays: 0,
    });
    const rect = activityRect(m, VIEW, DATA_DATE)!;
    const { ctx, log } = recordingCtx();
    paintScene(
      ctx,
      withToggles([m], { dates: true, labels: true }),
      VIEW,
      { width: 1600, height: 400 },
      PALETTE,
    );
    const dates = log.filter((l) => l.startsWith('fillText(["10 Jan"'));
    expect(dates).toEqual([
      `fillText(["10 Jan",${rect.x + rect.w / 2},${rowSlots(screenYOfLane(0, VIEW)).belowY}])`,
    ]);
  });

  it('costs a frame with nothing to print no context write at all', () => {
    // A scene built before `durationDays` existed: the layer runs its gate and must not style the
    // context for text it never draws (the golden log caught three such writes on its first run).
    const { durationDays: _omit, ...legacy } = bar({ id: 'a' });
    const scene = withToggles([legacy], { dates: false, labels: false });
    const off = recordingCtx();
    paintScene(off.ctx, scene, VIEW, { width: 1600, height: 400 }, PALETTE);
    const on = recordingCtx();
    paintScene(
      on.ctx,
      { ...scene, view: { ...scene.view!, labels: true } },
      VIEW,
      { width: 1600, height: 400 },
      PALETTE,
    );
    // With labels on, the only font write added is the NAME layer's one; the centre layer, which has
    // nothing to print, adds none. Verified red against the eager first draft (two writes).
    const fonts = (log: readonly string[]): number =>
      log.filter((l) => l.startsWith('font=')).length;
    expect(fonts(on.log)).toBe(fonts(off.log) + 1);
  });
});

describe('paintScene — names beside an overlapping milestone (FC-N6a)', () => {
  it('never prints two names over each other when a milestone’s glyph overlaps its neighbour', () => {
    // At 4 px/day the diamond (~14 px) is wider than its day, so its rect overlaps the next bar's
    // although their spans do not. M0-T5 counted 9 such collisions on Unit 300; the half-gap was
    // clamped at zero, which left both names their whole rect width.
    const view: Viewport = { pxPerDay: 4, originX: 0, originY: 40 };
    const scene = withToggles(
      [
        bar({
          id: 'm',
          type: 'FINISH_MILESTONE',
          label: 'M100 Handover to client',
          earlyStart: '2026-01-10',
          earlyFinish: '2026-01-10',
          durationDays: 0,
        }),
        bar({
          id: 'b',
          label: 'A200 Commissioning and testing',
          earlyStart: '2026-01-11',
          earlyFinish: '2026-01-30',
        }),
      ],
      { dates: false, labels: true },
    );
    const { ctx, log } = recordingCtx();
    paintScene(ctx, scene, view, { width: 1600, height: 400 }, PALETTE);
    const nameY = rowSlots(screenYOfLane(0, view)).nameY;
    const names = log
      .filter((l) => l.startsWith('fillText('))
      .map((l) => JSON.parse(l.slice('fillText('.length, -1)) as [string, number, number])
      .filter(([, , y]) => y === nameY)
      .map(([text, x]) => ({ lo: x - (text.length * 6) / 2, hi: x + (text.length * 6) / 2 }))
      .sort((p, q) => p.lo - q.lo);
    for (let i = 1; i < names.length; i += 1) {
      expect(names[i]!.lo).toBeGreaterThanOrEqual(names[i - 1]!.hi);
    }
  });
});
