import { describe, expect, it } from 'vitest';

import {
  ATTACH_DOT_R,
  DEFAULT_VIEW_TOGGLES,
  paintScene,
  type TsldPalette,
  type TsldScene,
} from './paint';
import { NODE_RADIUS, type RenderActivity, type RenderEdge, type Viewport } from './render-model';

/**
 * **The node and attachment-dot draw budgets** (`docs/TECH_DEBT.md` #391 item 6).
 *
 * Both were true by inspection and unmeasured. A counting stub, so the assertions are about the
 * SHAPE of the cost (the ADR-0054 convention), at 2,000 activities:
 *
 * 1. **Node style writes follow the distinct rims on screen, never the node count.** The discs of a
 *    frame are painted in one run, so the `strokeStyle` and `lineWidth` writes inside that run are
 *    bounded by the three rungs, while the discs themselves number in the hundreds or more.
 * 2. **Attachment dots share one path and one `fill()`**, whatever their count.
 */
const PALETTE = {
  canvasGround: '#111',
  gridLine: '#222',
  laneRule: '#333',
  edge: '#444',
  bar: '#555',
  nodeRim: '#555',
  nodeRimNear: '#999',
  nodeRimCritical: '#888',
  linkMinor: '#666',
  linkDriving: '#777',
  linkMark: '#3d2070',
  attachDot: '#3d2071',
  critical: '#888',
  nearCritical: '#999',
  selection: '#aaa',
  outline: '#bbb',
  labelBeside: '#ccc',
  labelInside: '#ddd',
} as unknown as TsldPalette;

const SIZE = { width: 1920, height: 1080 };
const COUNT = 2000;
const LANES = 50;

/** One entry per call that matters, in order: a node disc, a dot, a fill, or a stroke-style write. */
function countingCtx() {
  const events: string[] = [];
  const styled = (name: string) => {
    let value: unknown = name === 'lineWidth' ? 1 : '';
    return {
      get: () => value,
      set: (next: unknown) => {
        value = next;
        events.push(`write:${name}`);
      },
    };
  };
  const ctx = {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fill: () => {
      events.push('fill');
    },
    // A real context has `roundRect`; with it the painter takes the path the budget is about.
    roundRect: (_x: number, _y: number, w: number) => {
      if (w === NODE_RADIUS * 2) events.push('node');
      // The near-critical node dot is also 4 px across, so the dot's own ink is what tells them apart.
      else if (w === ATTACH_DOT_R * 2 && ctx.fillStyle === PALETTE.attachDot) events.push('dot');
    },
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
  for (const name of ['strokeStyle', 'lineWidth']) {
    Object.defineProperty(ctx, name, styled(name));
  }
  return { ctx, events };
}

function plan(): { activities: RenderActivity[]; edges: RenderEdge[] } {
  const day = (d: number): string => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  const activities = Array.from({ length: COUNT }, (_, i): RenderActivity => {
    const startDay = Math.floor(i / LANES) * 12;
    return {
      id: `a${i}`,
      type: 'TASK',
      laneIndex: i % LANES,
      label: `A${i}`,
      earlyStart: day(startDay),
      earlyFinish: day(startDay + 4),
      isCritical: i % 5 === 0,
      isNearCritical: i % 5 === 1,
    };
  });
  // SS with a lag leaves the predecessor partway along its bar: that is where a dot is drawn.
  const edges: RenderEdge[] = [];
  for (let i = 0; i + LANES < COUNT; i += 1) {
    edges.push({
      id: `e${i}`,
      predecessorId: `a${i}`,
      successorId: `a${i + LANES}`,
      type: 'SS',
      isDriving: false,
      lagDays: 2,
    });
  }
  return { activities, edges };
}

function paint(): string[] {
  const { ctx, events } = countingCtx();
  const { activities, edges } = plan();
  const view: Viewport = { pxPerDay: 12, originX: 0, originY: 0 };
  const scene: TsldScene = {
    activities,
    edges,
    dataDate: '2026-01-01',
    view: {
      ...DEFAULT_VIEW_TOGGLES,
      labels: false,
      dates: false,
      dayGrid: false,
      monthGrid: false,
    },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
  paintScene(ctx as never, scene, view, SIZE, PALETTE, 1);
  return events;
}

describe('node styles and attachment dots — draw budget at 2,000 activities', () => {
  it('writes node styles per distinct rim, never per node', () => {
    const events = paint();
    const discs = events.filter((e) => e === 'node').length;
    expect(discs).toBeGreaterThan(100);
    const run = events.slice(events.indexOf('node'), events.lastIndexOf('node') + 1);
    // Three rungs, each one strokeStyle and one lineWidth write; a per-node painter writes both
    // for every disc.
    expect(run.filter((e) => e.startsWith('write:')).length).toBeLessThanOrEqual(3 * 2);
  });

  it('fills every attachment dot in one path', () => {
    const events = paint();
    const dots = events.filter((e) => e === 'dot').length;
    expect(dots).toBeGreaterThan(100);
    const run = events.slice(events.indexOf('dot'), events.lastIndexOf('dot') + 1);
    expect(run).not.toContain('fill');
    expect(events[events.lastIndexOf('dot') + 1]).toBe('fill');
  });
});
