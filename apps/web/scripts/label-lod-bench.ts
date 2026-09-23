/**
 * The **browser-side** cost of lifting the label zoom gate (`docs/TECH_DEBT.md` #378).
 *
 * Below 4 px/day the painter used to draw no names, dates or centre items. That is exactly what it
 * draws today with `labels` and `dates` switched off, so the cost of the change is the same scene
 * painted with text on minus text off, at zooms the gate used to cover. Driven by
 * `scripts/measure-label-lod.mjs`; not a test (absolute timings on a CI runner are noise — see
 * `paint.dates-budget.test.ts`, which holds the CI-safe half: the work is bounded per bar).
 */
import { scaleScene } from '../src/features/perf-probe/scenes/scale-scene';
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import type { Viewport } from '../src/features/tsld/render/render-model';
import { DEFAULT_VIEW_TOGGLES } from '../src/features/tsld/render/view-toggles';

import { PALETTE } from './link-routing-bench';

interface BenchResult {
  p50: number;
  p95: number;
  max: number;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

const COUNT = 2000;
/** The zooms the old gate withheld text at (1 and 3), and one above it for reference. */
const ZOOMS = [1, 3, 6] as const;

function run(
  canvas: HTMLCanvasElement,
  text: boolean,
  frames: number,
  pxPerDay: number,
  source: ReturnType<typeof scaleScene>,
): BenchResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const scene: TsldScene = {
    activities: source.activities,
    edges: source.edges,
    dataDate: '2026-01-01',
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    view: { ...DEFAULT_VIEW_TOGGLES, labels: text, dates: text },
  };
  const size = { width: canvas.width, height: canvas.height };
  const samples: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    const view: Viewport = { pxPerDay, originX: -i, originY: 0 };
    const started = performance.now();
    paintScene(ctx, scene, view, size, PALETTE, 1);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: samples.at(-1) ?? 0,
  };
}

declare global {
  interface Window {
    __benchLabelLod: (frames: number) => {
      scene: string;
      results: { pxPerDay: number; off: BenchResult; on: BenchResult }[];
    };
  }
}

window.__benchLabelLod = (frames: number) => {
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('no canvas');
  const source = scaleScene(COUNT);
  const results = ZOOMS.map((pxPerDay) => {
    run(canvas, false, 20, pxPerDay, source);
    run(canvas, true, 20, pxPerDay, source);
    return {
      pxPerDay,
      off: run(canvas, false, frames, pxPerDay, source),
      on: run(canvas, true, frames, pxPerDay, source),
    };
  });
  return { scene: source.summary, results };
};
