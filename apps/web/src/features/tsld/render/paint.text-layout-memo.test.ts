import { beforeEach, describe, expect, it } from 'vitest';

import { labelWidths } from './layers/text-measure';
import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **A cold width memo draws the same text as a warm one** (links-and-labels M1-T2).
 *
 * M1 moved every text measurement to one layout step before the edge layer. On a warm memo that
 * step makes no context call, which is why the golden log is byte-identical. On a COLD memo it now
 * measures earlier in the frame and has to set the font to do it, so the risk is a later layer
 * drawing in a font it inherited from the layout step. This asserts, for each `fillText`, the text,
 * position and the font in force at that moment are the same cold and warm.
 */
const PALETTE = new Proxy({}, { get: (_t, p) => `#${String(p)}` }) as unknown as TsldPalette;
const VIEW: Viewport = { pxPerDay: 12, originX: 40, originY: 40 };
const SIZE = { width: 1600, height: 400 };

function act(over: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: 0,
    label: over.id,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-20',
    isCritical: false,
    isNearCritical: false,
    durationDays: 12,
    remainingFloat: 3,
    ...over,
  };
}

const SCENE: TsldScene = {
  activities: [
    act({ id: 'a', label: 'Install analyser room services and commission' }),
    act({ id: 'b', label: 'Pour', earlyStart: '2026-01-21', earlyFinish: '2026-01-30' }),
    act({
      id: 'm',
      type: 'FINISH_MILESTONE',
      label: 'Handover to operations',
      laneIndex: 1,
      earlyStart: '2026-01-30',
      earlyFinish: '2026-01-30',
    }),
    act({ id: 'c', laneIndex: 2, label: 'Cladding', earlyStart: '2026-01-08' }),
  ],
  edges: [
    { predecessorId: 'a', successorId: 'b', type: 'FS', isDriving: true },
    { predecessorId: 'b', successorId: 'm', type: 'FS', isDriving: true },
    {
      predecessorId: 'c',
      successorId: 'm',
      type: 'FS',
      isDriving: false,
      lagDays: 2,
    },
  ],
  dataDate: '2026-01-01',
  visualRefresh: true,
  timeTrueLinks: true,
  view: { ...DEFAULT_VIEW_TOGGLES, dates: true, centreItem: true },
};

/** Each fillText with the font the context held when it ran. */
function texts(): string[] {
  const { ctx, log } = recordingCtx();
  paintScene(ctx, SCENE, VIEW, SIZE, PALETTE);
  const out: string[] = [];
  let font = '';
  for (const entry of log) {
    if (entry.startsWith('font=')) font = entry.slice(5);
    else if (entry.startsWith('fillText(')) out.push(`${font} :: ${entry}`);
  }
  return out;
}

describe('the text layout step on a cold width memo', () => {
  beforeEach(() => labelWidths.clear());

  it('draws the same text, in the same place and font, cold and warm', () => {
    const cold = texts();
    const warm = texts();
    expect(cold.length).toBeGreaterThan(4); // the scene draws names, dates and centre items
    expect(cold).toEqual(warm);
  });

  it('the cold paint really was cold: it measured, and the warm one did not', () => {
    const count = (): number => {
      const { ctx, log } = recordingCtx();
      paintScene(ctx, SCENE, VIEW, SIZE, PALETTE);
      return log.filter((e) => e.startsWith('measureText(')).length;
    };
    const cold = count();
    const warm = count();
    expect(cold).toBeGreaterThan(warm);
  });
});
