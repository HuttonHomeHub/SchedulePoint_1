import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, RenderEdge, Viewport } from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **The link language, as the painter emits it** (NetPoint-layout M2, spec §4.7, ADR-0154).
 *
 * The pure rules are pinned in `link-marks.test.ts`. This suite pins that the painter applies
 * them: which ink a link is stroked in, that the dash appears only on waiting time and never on a
 * driving link, that chevrons fill in the link's ink, and that a lag gets a plate. Each ink below
 * is distinct, so a log line can only mean one thing.
 */
const PALETTE = {
  canvasGround: '#000001',
  gridLine: '#000002',
  laneRule: '#000003',
  edge: '#000004',
  bar: '#000005',
  linkMinor: '#000006',
  linkDriving: '#000007',
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
  it('strokes a non-driving link SOLID in its own ink, and dashes only its waiting time', () => {
    const log = paint([A, B], [edge({ predecessorId: 'A', successorId: 'B' })]);
    expect(strokeInks(log)).toContain(PALETTE.linkMinor);
    expect(strokeInks(log)).not.toContain(PALETTE.edge);
    // The retired non-driving dash never appears; the waiting dash does, and is not the default.
    expect(log).not.toContain('setLineDash([[4,3]])');
    expect(log).toContain('setLineDash([[3,3]])');
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

  it('fills chevrons along a long link in the link’s own ink', () => {
    const far = act('B', 2, '2026-02-20', '2026-02-24');
    const log = paint([A, far], [edge({ predecessorId: 'A', successorId: 'B' })]);
    let fillInk = '';
    const fills: string[] = [];
    for (const line of log) {
      if (line.startsWith('fillStyle=')) fillInk = line.slice('fillStyle='.length);
      if (line.startsWith('fill(')) fills.push(fillInk);
    }
    expect(fills).toContain(PALETTE.linkMinor);
    // More than the one terminal head: a link this long carries chevrons too.
    const minorFill = log.lastIndexOf(`fillStyle=${PALETTE.linkMinor}`);
    const triangles = log
      .slice(minorFill, log.indexOf('fill([])', minorFill))
      .filter((l) => l.startsWith('moveTo('));
    expect(triangles.length).toBeGreaterThan(1);
  });

  it('puts a lag on a plate, and only while labels are on', () => {
    const lagged = [edge({ predecessorId: 'A', successorId: 'B', lagDays: 2 })];
    expect(paint([A, B], lagged).some((l) => l.includes('fillText(["+2d"'))).toBe(true);
    const off = paint([A, B], lagged, {
      view: { ...DEFAULT_VIEW_TOGGLES, labels: false, dates: false },
    });
    expect(off.some((l) => l.includes('fillText(["+2d"'))).toBe(false);
  });

  it('keeps the legacy dashed non-driving pass when the refresh is off (the rollback)', () => {
    const log = paint([A, B], [edge({ predecessorId: 'A', successorId: 'B' })], {
      visualRefresh: false,
    });
    expect(log).toContain('setLineDash([[4,3]])');
    expect(strokeInks(log)).toContain(PALETTE.edge);
  });
});
