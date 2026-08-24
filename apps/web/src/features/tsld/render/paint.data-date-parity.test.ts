import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, Viewport } from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **The flag-off parity gate for the data-date line** (`VITE_CANVAS_DATA_DATE`, canvas status &
 * feedback M1) — the rollback contract, kept rather than weakened after any future default flip
 * (the ADR-0053 M6 rule).
 *
 * The claim is structural: `TsldScene.dataDateLine` absent ⇒ `dataDateX` stays null ⇒ the layer
 * adds not one call and the Today branch is byte-for-byte the pre-change painter. This suite
 * pins it over a fixture corpus by recording every draw call AND property assignment in order
 * (the `paint.test.ts` recording-proxy convention) and asserting three things:
 *
 * 1. absent · explicitly-undefined · explicitly-false paint **byte-identically** — so a stale
 *    persisted preference arriving after a rollback changes nothing;
 * 2. the flag-off log never touches the data-date palette entries or labels — the layer's
 *    fingerprint is absent, not merely rearranged;
 * 3. the same scene with the field **true** records a *different* log — which is what makes the
 *    equality assertions above meaningful rather than vacuously green. (Also verified by
 *    temporarily forcing the field true in case 1 during development: the suite went red.)
 */
const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  today: '#f00',
  todayInk: '#fff',
  // Distinct fixture values so the "fingerprint absent" assertion can pin them exactly.
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

/** The corpus: enough scene shapes that the layer's insertion point is crossed in every state. */
const CORPUS: ReadonlyArray<[string, TsldScene]> = [
  ['empty scene', { activities: [], edges: [], dataDate: DATA_DATE }],
  [
    'bars + edge + today',
    {
      activities: [
        task({ id: 'a', isCritical: true }),
        task({ id: 'b', earlyStart: '2026-01-06', earlyFinish: '2026-01-08', laneIndex: 1 }),
      ],
      edges: [{ predecessorId: 'a', successorId: 'b', type: 'FS', isDriving: true }],
      dataDate: DATA_DATE,
      todayOffset: 5,
    },
  ],
  [
    'fractional today (pill on) + coincident day 0',
    {
      activities: [task()],
      edges: [],
      dataDate: DATA_DATE,
      todayOffset: 0,
      todayFraction: 0.25,
    },
  ],
  [
    'month bands + grid tiers on',
    {
      activities: [task()],
      edges: [],
      dataDate: DATA_DATE,
      todayOffset: 3,
      monthBands: true,
      gridTiers: true,
    },
  ],
];

describe('data-date line — flag-off parity over a fixture corpus (the rollback contract)', () => {
  // The label-width memo is module-scope and keyed by text (see `paint.dates-budget.test.ts`):
  // warm it for the whole corpus first, so a first-paint memo fill cannot masquerade as a
  // between-scene difference in the byte-for-byte comparisons below.
  for (const [, scene] of CORPUS) {
    const { ctx } = recordingCtx();
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
  }

  for (const [name, scene] of CORPUS) {
    it(`paints byte-for-byte with the field absent, undefined or false — ${name}`, () => {
      const absent = recordingCtx();
      paintScene(absent.ctx, scene, VIEW, SIZE, PALETTE);
      const explicitUndefined = recordingCtx();
      paintScene(explicitUndefined.ctx, { ...scene, dataDateLine: undefined }, VIEW, SIZE, PALETTE);
      const explicitFalse = recordingCtx();
      paintScene(explicitFalse.ctx, { ...scene, dataDateLine: false }, VIEW, SIZE, PALETTE);
      expect(explicitUndefined.log).toEqual(absent.log);
      expect(explicitFalse.log).toEqual(absent.log);
    });

    it(`leaves no data-date fingerprint in the flag-off log — ${name}`, () => {
      const { ctx, log } = recordingCtx();
      paintScene(ctx, scene, VIEW, SIZE, PALETTE);
      expect(log.some((entry) => entry.includes(PALETTE.dataDate))).toBe(false);
      expect(log.some((entry) => entry.includes(PALETTE.dataDateInk))).toBe(false);
      expect(log.some((entry) => entry.includes('Data date'))).toBe(false);
    });

    it(`records a DIFFERENT log with the field true — the equality above is not vacuous — ${name}`, () => {
      const off = recordingCtx();
      paintScene(off.ctx, scene, VIEW, SIZE, PALETTE);
      const on = recordingCtx();
      paintScene(on.ctx, { ...scene, dataDateLine: true }, VIEW, SIZE, PALETTE);
      expect(on.log).not.toEqual(off.log);
      expect(on.log.some((entry) => entry.includes(PALETTE.dataDate))).toBe(true);
    });
  }
});
