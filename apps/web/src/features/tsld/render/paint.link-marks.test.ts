import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import { NODE_REACH_PX, type RenderActivity, type RenderEdge, type Viewport } from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **The link language, as the painter emits it** (NetPoint-layout M2, spec §4.7, ADR-0154).
 *
 * The pure rules are pinned in `link-marks.test.ts`. This suite pins that the painter applies
 * them: which ink a link is stroked in, that a waiting link carries a gap label in working days and
 * no dash (NetPoint grammar M3-T3), that chevrons fill in the mark shade, and that a lag gets a
 * plate. Each ink below
 * is distinct, so a log line can only mean one thing.
 */
const PALETTE = {
  canvasGround: '#000001',
  gridLine: '#000002',
  laneRule: '#000003',
  edge: '#000004',
  bar: '#000005',
  nodeRim: '#000005',
  nodeRimNear: '#000009',
  nodeRimCritical: '#000008',
  linkMinor: '#000006',
  linkDriving: '#000007',
  linkMark: '#3d2070',
  attachDot: '#3d2071',
  critical: '#000008',
  nearCritical: '#000009',
  selection: '#00000a',
  outline: '#00000b',
  labelBeside: '#00000c',
  labelInside: '#00000d',
  labelInsideCritical: '#00000d',
  labelInsideNearCritical: '#00000d',
  barStroke: '#00000e',
  hoverRing: '#00000f',
  handleHalo: '#000010',
} as unknown as TsldPalette;

const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
const SIZE = { width: 1200, height: 400 };
const DATA_DATE = '2026-01-01';

function act(id: string, lane: number, start: string, finish: string, crit = 0): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex: lane,
    label: id,
    earlyStart: start,
    earlyFinish: finish,
    isCritical: crit === 2,
    isNearCritical: crit === 1,
  };
}

function edge(
  over: Partial<RenderEdge> & { predecessorId: string; successorId: string },
): RenderEdge {
  return { id: `${over.predecessorId}-${over.successorId}`, type: 'FS', isDriving: false, ...over };
}

function paint(activities: RenderActivity[], edges: RenderEdge[], extra: Partial<TsldScene> = {}) {
  const { ctx, log } = recordingCtx();
  const scene: TsldScene = {
    activities,
    edges,
    dataDate: DATA_DATE,
    view: { ...DEFAULT_VIEW_TOGGLES, labels: true, dates: false },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
    ...extra,
  };
  paintScene(ctx, scene, VIEW, SIZE, PALETTE);
  return log;
}

/** The strokeStyle in force at each `stroke()` call, in order. */
function strokeInks(log: readonly string[]): string[] {
  let ink = '';
  const out: string[] = [];
  for (const line of log) {
    if (line.startsWith('strokeStyle=')) ink = line.slice('strokeStyle='.length);
    if (line.startsWith('stroke(')) out.push(ink);
  }
  return out;
}

// A → B waits: B starts a week after A finishes, in another lane.
const A = act('A', 0, '2026-01-02', '2026-01-05');
const B = act('B', 2, '2026-01-12', '2026-01-16');

describe('paintScene — the link language (NetPoint-layout M2)', () => {
  it('strokes a non-driving link SOLID in its own ink, and labels its waiting time (M3-T3)', () => {
    const log = paint([A, B], [edge({ predecessorId: 'A', successorId: 'B' })]);
    expect(strokeInks(log)).toContain(PALETTE.linkMinor);
    expect(strokeInks(log)).not.toContain(PALETTE.edge);
    // Neither the retired non-driving dash nor the M2 waiting dash: the link layer sets no dash.
    expect(log).not.toContain('setLineDash([[4,3]])');
    expect(log).not.toContain('setLineDash([[3,3]])');
    // A finishes 5 Jan (right edge 6 Jan), B starts 12 Jan: six days, every day working here.
    const at = log.findIndex((l) => l.includes('fillText(["6d"'));
    expect(at).toBeGreaterThan(-1);
    // In the mark shade, the ink that clears 4.5:1 on the ground.
    expect(
      log
        .slice(0, at)
        .reverse()
        .find((l) => l.startsWith('fillStyle=')),
    ).toBe(`fillStyle=${PALETTE.linkMark}`);
    // Its ground chip sits inside the waiting interval less a node's reach at each end, so the
    // label never lands on either disc (FC-G5). A's right edge is day 5 (x 120), B's start day 11
    // (x 192), at 12 px a day from x 60.
    const chip = log
      .slice(0, at)
      .reverse()
      .find((l) => l.startsWith('fillRect('))!;
    const [x = NaN, , w = NaN] = JSON.parse(chip.slice('fillRect('.length, -1)) as number[];
    expect(x).toBeGreaterThanOrEqual(120 + NODE_REACH_PX);
    expect(x + w).toBeLessThanOrEqual(192 - NODE_REACH_PX);
  });

  it('counts the gap in working days on the plan calendar, and withholds it at the overview tier', () => {
    const weekdays = (d: number): boolean => ((d % 7) + 7) % 7 < 5;
    const log = paint([A, B], [edge({ predecessorId: 'A', successorId: 'B' })], {
      isWorkingDay: weekdays,
    });
    expect(log.some((l) => /fillText\(\["\d+d"/.test(l) && !l.includes('"6d"'))).toBe(true);
    expect(log.some((l) => l.includes('fillText(["6d"'))).toBe(false);
    // At the overview tier, on a gap long enough in PIXELS to hold the label (300 days at 1 px a
    // day): withheld by the tier, not by room, which is what makes this case discriminate.
    const late = act('B', 2, '2026-11-01', '2026-11-05');
    const { ctx, log: far } = recordingCtx();
    paintScene(
      ctx,
      {
        activities: [A, late],
        edges: [edge({ predecessorId: 'A', successorId: 'B' })],
        dataDate: DATA_DATE,
        view: { ...DEFAULT_VIEW_TOGGLES, labels: true, dates: false },
        visualRefresh: true,
        timeTrueLinks: true,
        linkRouting: true,
        isWorkingDay: () => true,
      },
      { ...VIEW, pxPerDay: 1 },
      SIZE,
      PALETTE,
    );
    expect(far.some((l) => /fillText\(\["\d+d"/.test(l))).toBe(false);
  });

  it('draws a gap label only where it meets no text already placed (NetPoint grammar M4)', () => {
    // Two links with the same geometry put two identical chips in one place. Scene order decides
    // and the second is withheld: gap labels are placed last, each against every name, date, plate
    // and earlier label (FC-G5's text-on-text limb, which found 5–6 collisions on Unit 300 per zoom
    // before this).
    const twice = [
      edge({ id: 'e1', predecessorId: 'A', successorId: 'B' }),
      edge({ id: 'e2', predecessorId: 'A', successorId: 'B' }),
    ];
    const log = paint([A, B], twice);
    expect(log.filter((l) => l.includes('fillText(["6d"'))).toHaveLength(1);
    // The control: each alone draws its label.
    expect(paint([A, B], [twice[0]!]).filter((l) => l.includes('fillText(["6d"'))).toHaveLength(1);
  });

  it('withholds a gap too short to clear both end nodes, rather than print it on a disc', () => {
    // Same lane, two days apart at 12 px a day: a straight 24 px run from A's node to B's. "2d" on
    // its chip is 18 px, which fits the run (≥ label + 4) but not the run less a node's reach at
    // each end, so without the inset it would be printed over the discs (FC-G5).
    const near = act('B', 0, '2026-01-08', '2026-01-10');
    const log = paint([A, near], [edge({ predecessorId: 'A', successorId: 'B' })]);
    expect(log.some((l) => l.includes('fillText(["2d"'))).toBe(false);
  });

  it('is withheld when the Link gaps switch is off', () => {
    const log = paint([A, B], [edge({ predecessorId: 'A', successorId: 'B' })], {
      view: { ...DEFAULT_VIEW_TOGGLES, labels: true, dates: false, linkSlack: false },
    });
    expect(log.some((l) => l.includes('fillText(["6d"'))).toBe(false);
  });

  it('never dashes a driving link, even where days separate its ends', () => {
    const log = paint([A, B], [edge({ predecessorId: 'A', successorId: 'B', isDriving: true })]);
    expect(log).not.toContain('setLineDash([[3,3]])');
    expect(strokeInks(log)).toContain(PALETTE.linkDriving);
  });

  it('draws a driving link in its rung: critical only when both ends are critical', () => {
    const critA = act('A', 0, '2026-01-02', '2026-01-05', 2);
    const critB = act('B', 2, '2026-01-06', '2026-01-09', 2);
    const nearB = act('B', 2, '2026-01-06', '2026-01-09', 1);
    const plainB = act('B', 2, '2026-01-06', '2026-01-09', 0);
    const driving = [edge({ predecessorId: 'A', successorId: 'B', isDriving: true })];
    expect(strokeInks(paint([critA, critB], driving))).toContain(PALETTE.critical);
    expect(strokeInks(paint([critA, nearB], driving))).toContain(PALETTE.nearCritical);
    const mixed = strokeInks(paint([critA, plainB], driving));
    expect(mixed).toContain(PALETTE.linkDriving);
    expect(mixed).not.toContain(PALETTE.critical);
  });

  it('weights a driving link at 2 px and a non-driving one at 1 px', () => {
    const both = paint(
      [A, B, act('C', 4, '2026-01-06', '2026-01-09')],
      [
        edge({ predecessorId: 'A', successorId: 'B' }),
        edge({ predecessorId: 'A', successorId: 'C', isDriving: true }),
      ],
    );
    const widthAt = (ink: string): string | undefined => {
      let width: string | undefined;
      let current = '';
      for (const line of both) {
        if (line.startsWith('lineWidth=')) width = line.slice('lineWidth='.length);
        if (line.startsWith('strokeStyle=')) current = line.slice('strokeStyle='.length);
        if (line.startsWith('stroke(') && current === ink) return width;
      }
      return undefined;
    };
    expect(widthAt(PALETTE.linkMinor)).toBe('1');
    expect(widthAt(PALETTE.linkDriving)).toBe('2');
  });

  it('fills a violet link’s chevrons in the darker mark shade, never the line’s own ink (M3)', () => {
    const far = act('B', 2, '2026-02-20', '2026-02-24');
    const log = paint([A, far], [edge({ predecessorId: 'A', successorId: 'B' })]);
    let fillInk = '';
    const fills: string[] = [];
    for (const line of log) {
      if (line.startsWith('fillStyle=')) fillInk = line.slice('fillStyle='.length);
      if (line.startsWith('fill(')) fills.push(fillInk);
    }
    // NetPoint grammar M3 (spec §4.2 G5): the marks are the mark shade, which clears 3:1 on the
    // line; filled in the line's own ink a mark disappears into the line it sits on.
    expect(fills).toContain(PALETTE.linkMark);
    expect(fills).not.toContain(PALETTE.linkMinor);
    // More than the one terminal head: a link this long carries chevrons too.
    // The first mark-shade fill is the chevrons; a later one is the gap label's text (M3-T3).
    const minorFill = log.indexOf(`fillStyle=${PALETTE.linkMark}`);
    const triangles = log
      .slice(minorFill, log.indexOf('fill([])', minorFill))
      .filter((l) => l.startsWith('moveTo('));
    expect(triangles.length).toBeGreaterThan(1);
  });

  it('puts a lag on a plate, and only while labels are on', () => {
    const lagged = [edge({ predecessorId: 'A', successorId: 'B', lagDays: 2 })];
    // One plate carries both figures where a link has a lag and a gap (spec §4.13 U2).
    expect(paint([A, B], lagged).some((l) => l.includes('fillText(["+2d · 4d"'))).toBe(true);
    const off = paint([A, B], lagged, {
      view: { ...DEFAULT_VIEW_TOGGLES, labels: false, dates: false },
    });
    expect(off.some((l) => l.includes('fillText(["+2d'))).toBe(false);
  });

  /**
   * The dots drawn, as boxes: every rect traced under the dot's own key. The recording context has
   * no `roundRect`, so the painter takes its square fallback (`fillRect`); a real one traces
   * `roundRect`, and either is read here.
   */
  function dots(log: readonly string[]): number[][] {
    const at = log.indexOf(`fillStyle=${PALETTE.attachDot}`);
    if (at === -1) return [];
    const next = log.findIndex((l, i) => i > at && l.startsWith('fillStyle='));
    return log
      .slice(at, next === -1 ? undefined : next)
      .filter((l) => l.startsWith('roundRect(') || l.startsWith('fillRect('))
      .map((l) => JSON.parse(l.slice(l.indexOf('(') + 1, -1)) as number[]);
  }

  it('dots an anchor partway along a bar, and only there (NetPoint grammar M3-T5, G12)', () => {
    // SS + 2 days: the link leaves A two days after A starts, partway along its bar. B's end is at
    // B's start, where a node already sits, so it gets no dot.
    const ss = [edge({ predecessorId: 'A', successorId: 'B', type: 'SS', lagDays: 2 })];
    const got = dots(paint([A, B], ss));
    expect(got).toHaveLength(1);
    const [x = NaN, y = NaN, w = NaN, h = NaN] = got[0]!;
    // A starts day 1 (x 72); two days on is x 96; 4 px across, on A's centre-line in lane 0.
    expect(x + w / 2).toBe(96);
    expect([w, h]).toEqual([4, 4]);
    expect(y + h / 2).toBeGreaterThan(VIEW.originY);
    expect(y + h / 2).toBeLessThan(VIEW.originY + 60);
    // An FS zero-lag link joins at the nodes, so nothing is dotted.
    expect(dots(paint([A, B], [edge({ predecessorId: 'A', successorId: 'B' })]))).toEqual([]);
  });

  it('draws no dot at the overview tier', () => {
    const ss = [edge({ predecessorId: 'A', successorId: 'B', type: 'SS', lagDays: 2 })];
    const { ctx, log } = recordingCtx();
    paintScene(
      ctx,
      {
        activities: [A, B],
        edges: ss,
        dataDate: DATA_DATE,
        view: { ...DEFAULT_VIEW_TOGGLES, labels: true, dates: false },
        visualRefresh: true,
        timeTrueLinks: true,
        linkRouting: true,
        isWorkingDay: () => true,
      },
      { ...VIEW, pxPerDay: 3 },
      SIZE,
      PALETTE,
    );
    expect(dots(log)).toEqual([]);
  });

  it('keeps the legacy dashed non-driving pass when the refresh is off (the rollback)', () => {
    const log = paint([A, B], [edge({ predecessorId: 'A', successorId: 'B' })], {
      visualRefresh: false,
    });
    expect(log).toContain('setLineDash([[4,3]])');
    expect(strokeInks(log)).toContain(PALETTE.edge);
  });
});
