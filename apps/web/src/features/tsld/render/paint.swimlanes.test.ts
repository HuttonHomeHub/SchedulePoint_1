import { describe, expect, it } from 'vitest';

import { LANE_HEIGHT } from './geometry';
import { paintScene, type SwimlaneMarks, type TsldPalette, type TsldScene } from './paint';
import type { Viewport } from './render-model';

/**
 * **The swimlane rule and ground gate** (swimlanes M2-T2, ui-architecture C5), in the counting-stub
 * tradition of `paint.lane-rule-budget.test.ts`: it asserts the SHAPE of the per-frame cost. The
 * layers are O(swimlanes in view): a thousand swimlanes cost what three do at the same viewport.
 * The off path is the other half: a scene with no marks paints exactly the calls it painted before
 * the layer existed (SC-3).
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  laneRule: '#9c9c9c',
  swimlaneRule: '#5a5a5a',
  linkMinor: '#80848b',
  linkDriving: '#3b6fbf',
  linkMark: '#3d2070',
  attachDot: '#3d2070',
  edge: '#333',
  bar: '#44f',
  nodeRim: '#44f',
  nodeRimNear: '#fa0',
  nodeRimCritical: '#f00',
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
  monthBand: '#f4f1ea',
};

const SIZE = { width: 800, height: 400 };
const VIEW: Viewport = { pxPerDay: 12, originX: 0, originY: 0 };

const QUIET = {
  dayGrid: false,
  monthGrid: false,
  yearGrid: false,
  today: false,
  nonWorking: false,
  labels: false,
  lateOverlay: false,
} as const;

/** One log line per drawing call, with the style in force, so a test can count by colour. */
function recordingCtx() {
  const log: string[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  const ctx = {
    log,
    clearRect: () => {},
    fillRect: (_x: number, y: number, _w: number, h: number) =>
      log.push(`fill ${fillStyle} ${y} ${h}`),
    strokeRect: () => {},
    beginPath: () => log.push('begin'),
    moveTo: (_x: number, y: number) => log.push(`move ${strokeStyle} ${y}`),
    lineTo: () => log.push('line'),
    stroke: () => log.push(`stroke ${strokeStyle}`),
    fill: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    get strokeStyle(): string {
      return strokeStyle;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
    },
    get fillStyle(): string {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    lineWidth: 1,
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    globalAlpha: 1,
    save: () => {},
    restore: () => {},
    createPattern: () => null,
  };
  return ctx;
}

function stack(count: number, lanesEach = 2): SwimlaneMarks['extents'] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Swimlane ${String(i + 1)}`,
    firstLane: i * lanesEach,
    laneCount: lanesEach,
  }));
}

function paint(
  swimlaneMarks: SwimlaneMarks | undefined,
  extra: Partial<TsldScene> = {},
  view: Viewport = VIEW,
) {
  const ctx = recordingCtx();
  const scene: TsldScene = {
    activities: [],
    edges: [],
    dataDate: '2026-03-02',
    view: QUIET,
    ...(swimlaneMarks ? { swimlaneMarks } : {}),
    ...extra,
  };
  paintScene(ctx, scene, view, SIZE, PALETTE, 1);
  return ctx.log;
}

const RULE_MOVES = (log: string[]) =>
  log.filter(
    (l) => l === `move ${PALETTE.swimlaneRule}` || l.startsWith(`move ${PALETTE.swimlaneRule} `),
  );
const GROUND_FILLS = (log: string[]) =>
  log.filter((l) => l.startsWith(`fill ${PALETTE.monthBand} `));

describe('swimlane marks — paint gate (swimlanes M2-T2)', () => {
  it('rules each boundary between two swimlanes, in the rule ink, and not the diagram edge', () => {
    // Two lanes each, 400 px / LANE_HEIGHT: the boundaries are at lane 2, 4, 6 …
    const log = paint({ extents: stack(3), ground: false });
    const ys = RULE_MOVES(log).map((l) => Number(l.split(' ').pop()));
    expect(ys).toEqual([2, 4].map((lane) => Math.round(lane * LANE_HEIGHT) + 0.5));
  });

  it('draws the rule in one batched stroke', () => {
    const log = paint({ extents: stack(3), ground: false });
    expect(log.filter((l) => l === `stroke ${PALETTE.swimlaneRule}`)).toHaveLength(1);
  });

  it('is O(swimlanes in view): a thousand swimlanes cost what the visible ones do', () => {
    const few = paint({ extents: stack(30), ground: true });
    const many = paint({ extents: stack(1000), ground: true });
    expect(RULE_MOVES(many)).toEqual(RULE_MOVES(few));
    expect(GROUND_FILLS(many)).toEqual(GROUND_FILLS(few));
    expect(RULE_MOVES(few).length).toBeGreaterThan(0);
  });

  it('is O(swimlanes in view) when scrolled far down a long stack', () => {
    // Scrolled to lane 1,000: the cost is the viewport's, whatever lies above it.
    const view = { ...VIEW, originY: -1000 * LANE_HEIGHT };
    const deep = paint({ extents: stack(1000), ground: true }, {}, view);
    // The viewport spans at most ceil(height / swimlane height) + 1 swimlanes.
    const bound = Math.ceil(SIZE.height / (2 * LANE_HEIGHT)) + 1;
    expect(RULE_MOVES(deep).length).toBeGreaterThan(0);
    expect(RULE_MOVES(deep).length).toBeLessThanOrEqual(bound);
    expect(GROUND_FILLS(deep).length).toBeLessThanOrEqual(bound);
  });

  it('tints every second swimlane with the band ground, and the first stays plain', () => {
    const log = paint({ extents: stack(4), ground: true });
    const heights = GROUND_FILLS(log).map((l) => l.split(' ').slice(2).map(Number));
    expect(heights).toEqual([
      [2 * LANE_HEIGHT, 2 * LANE_HEIGHT],
      [6 * LANE_HEIGHT, 2 * LANE_HEIGHT],
    ]);
  });

  it('draws no ground when it is off, but still draws the rule', () => {
    const log = paint({ extents: stack(4), ground: false });
    expect(GROUND_FILLS(log)).toEqual([]);
    expect(RULE_MOVES(log).length).toBeGreaterThan(0);
  });

  it('hides the month bands while the ground shows, and keeps them when it does not', () => {
    // Month bands are full-height fills at y = 0; the ground fills start at a swimlane's top.
    const bandFills = (log: string[]) => GROUND_FILLS(log).filter((l) => l.split(' ')[2] === '0');
    const asOf = { monthBands: true };
    expect(bandFills(paint({ extents: stack(4), ground: true }, asOf))).toEqual([]);
    expect(bandFills(paint({ extents: stack(4), ground: false }, asOf)).length).toBeGreaterThan(0);
    expect(bandFills(paint(undefined, asOf)).length).toBeGreaterThan(0);
  });

  it('draws nothing in the rule ink without marks', () => {
    // The byte-identical claim (SC-3) is held by `paint.golden.test.ts`, whose recorded log has no
    // swimlane key in its scene; comparing a log with itself here would prove nothing. What this pins
    // is the half the golden cannot name: the rule's ink never appears when there are no marks.
    const log = paint(undefined, { monthBands: true });
    expect(log.some((l) => l.includes(PALETTE.swimlaneRule))).toBe(false);
    expect(log.some((l) => l.startsWith('fill'))).toBe(true);
  });
});
