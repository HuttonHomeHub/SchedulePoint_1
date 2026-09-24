import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, RenderEdge, Viewport } from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **NetPoint grammar M4 — text on the canvas, and the tiers that withhold it** (spec §4.2 G7, G11).
 *
 * The canvas prints a name without its code unless `Activity codes` is on; a milestone's name is
 * bold; the dates are withheld at the overview tier; the lag plate is drawn at the detail tier
 * only. And every one of those tier gates reads the one `lodTier` function, never a copy of its
 * thresholds (the structural case at the end).
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

const SIZE = { width: 1600, height: 400 };
const DATA_DATE = '2026-01-01';

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

function paint(
  activities: RenderActivity[],
  pxPerDay: number,
  toggles: Partial<TsldScene['view']> = {},
  edges: RenderEdge[] = [],
): string[] {
  const { ctx, log } = recordingCtx();
  const scene: TsldScene = {
    activities,
    edges,
    dataDate: DATA_DATE,
    view: { ...DEFAULT_VIEW_TOGGLES, labels: true, ...toggles },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
  const view: Viewport = { pxPerDay, originX: 40, originY: 40 };
  paintScene(ctx, scene, view, SIZE, PALETTE);
  return log;
}

const texts = (log: readonly string[]): string[] =>
  log
    .filter((l) => l.startsWith('fillText('))
    .map((l) => (JSON.parse(l.slice('fillText('.length, -1)) as [string])[0]);

describe('the canvas label (M4-T1)', () => {
  it('prints the name alone, and the code before it only while codes are on', () => {
    const a = act({ id: 'a', label: 'Pour slab', code: 'A1020' });
    expect(texts(paint([a], 12))).toContain('Pour slab');
    expect(texts(paint([a], 12))).not.toContain('A1020 Pour slab');
    expect(texts(paint([a], 12, { activityCodes: true }))).toContain('A1020 Pour slab');
  });

  it('sets a milestone’s name bold, and restores the regular face after it', () => {
    const m = act({
      id: 'm',
      type: 'FINISH_MILESTONE',
      label: 'Handover',
      earlyStart: '2026-01-10',
      earlyFinish: '2026-01-10',
    });
    const log = paint([m], 12);
    const at = log.findIndex((l) => l.startsWith('fillText(["Handover"'));
    expect(at).toBeGreaterThan(-1);
    const fontBefore = log
      .slice(0, at)
      .reverse()
      .find((l) => l.startsWith('font='));
    expect(fontBefore).toMatch(/^font=600 11px/);
    const fontAfter = log.slice(at).find((l) => l.startsWith('font='));
    expect(fontAfter).toMatch(/^font=11px/);
  });
});

describe('the tiers (M4-T4, spec §4.2 G11)', () => {
  it('withholds dates at the overview tier and draws them from the working tier', () => {
    const a = act({ id: 'a', label: 'Frame', earlyFinish: '2026-12-30' });
    const dated = (log: string[]): boolean =>
      texts(log).some((t) => /\d{1,2} [A-Z][a-z]{2}/.test(t));
    expect(dated(paint([a], 2, { dates: true }))).toBe(false);
    expect(dated(paint([a], 5, { dates: true }))).toBe(true);
  });

  it('draws the lag plate at the detail tier only', () => {
    const a = act({ id: 'a', label: 'A', earlyStart: '2026-01-05', earlyFinish: '2026-01-20' });
    const b = act({
      id: 'b',
      label: 'B',
      laneIndex: 2,
      earlyStart: '2026-03-01',
      earlyFinish: '2026-03-20',
    });
    const lagged: RenderEdge[] = [
      { id: 'e', predecessorId: 'a', successorId: 'b', type: 'FS', isDriving: true, lagDays: 2 },
    ];
    const plate = (log: string[]): boolean => texts(log).some((t) => t.startsWith('+2d'));
    expect(plate(paint([a, b], 5, {}, lagged))).toBe(false);
    expect(plate(paint([a, b], 8, {}, lagged))).toBe(true);
  });

  it('every tier gate in the painter reads lodTier, never a copy of its thresholds', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const painter = readFileSync(join(here, 'paint.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Gap labels, lag plates, attachment dots, dates and the centre item: five gates.
    expect((painter.match(/lodTier\(view\.pxPerDay\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(painter).not.toMatch(/LOD_(WORKING|DETAIL)_MIN_PX_PER_DAY/);
  });
});
