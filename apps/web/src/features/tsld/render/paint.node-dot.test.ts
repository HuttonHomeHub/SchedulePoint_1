import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import { NEAR_CRITICAL_DOT_R, type RenderActivity, type Viewport } from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **The near-critical node carries a centre dot** (NetPoint grammar, product owner 2026-09-24).
 *
 * The three rungs differ by rim weight alone (1 / 2 / 3 px), and the step from on-schedule to
 * near-critical is the weak one without colour. The dot is the second cue, so what matters is
 * WHICH nodes carry it: every near-critical node, and no other. A test asserting only that some
 * dot is drawn would pass against a painter that dotted every node.
 */
const PALETTE = {
  canvasGround: '#000001',
  gridLine: '#000002',
  laneRule: '#000003',
  edge: '#000004',
  bar: '#000005',
  nodeRim: '#0000a1',
  nodeRimNear: '#0000a2',
  nodeRimCritical: '#0000a3',
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

function act(over: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: 0,
    label: over.id,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-02-27',
    isCritical: false,
    isNearCritical: false,
    ...over,
  };
}

/** The dots the frame drew, as the `fillStyle` in force when each was filled. */
function dotInks(activities: RenderActivity[]): string[] {
  const { ctx, log } = recordingCtx();
  const scene: TsldScene = {
    activities,
    edges: [],
    dataDate: '2026-01-01',
    view: { ...DEFAULT_VIEW_TOGGLES },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
  const view: Viewport = { pxPerDay: 12, originX: 40, originY: 40 };
  paintScene(ctx, scene, view, { width: 1600, height: 400 }, PALETTE);
  const side = NEAR_CRITICAL_DOT_R * 2;
  const inks: string[] = [];
  let fill = '';
  for (let i = 0; i < log.length; i += 1) {
    const line = log[i]!;
    if (line.startsWith('fillStyle=')) fill = line.slice('fillStyle='.length);
    // Either form the painter can take: a `roundRect` then `fill()` where the context has one, or the
    // square `fillRect` fallback where it does not (the recording context is the second).
    if (line.startsWith('roundRect(')) {
      const [, , w, h, r] = JSON.parse(line.slice('roundRect('.length, -1)) as number[];
      if (w === side && h === side && r === NEAR_CRITICAL_DOT_R && log[i + 1] === 'fill([])') {
        inks.push(fill);
      }
    } else if (line.startsWith('fillRect(')) {
      const [, , w, h] = JSON.parse(line.slice('fillRect('.length, -1)) as number[];
      if (w === side && h === side) inks.push(fill);
    }
  }
  return inks;
}

describe('the near-critical node dot', () => {
  it('dots both nodes of a near-critical task, in the near rim’s ink', () => {
    expect(dotInks([act({ id: 'n', isNearCritical: true })])).toEqual(['#0000a2', '#0000a2']);
  });

  it('dots no node of an on-schedule or a critical task', () => {
    expect(dotInks([act({ id: 'o' })])).toEqual([]);
    expect(dotInks([act({ id: 'c', isCritical: true })])).toEqual([]);
  });
});
