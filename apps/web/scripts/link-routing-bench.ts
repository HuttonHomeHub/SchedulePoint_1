/**
 * The **browser-side** draw measurement for obstacle-aware link routing (ADR-0065 / ADR-0064 T21).
 *
 * This is not a test and does not run in CI. It exists because the ADR-0026 §9 budget — ≤ 4 ms p95
 * at 2,000 activities — is about a **real** 2D context, and the jsdom counting stubs the unit gates
 * use cannot measure rasterisation at all. `docs/TECH_DEBT.md` #59 records that the budget has never
 * been measured on the hardware envelope it names; this narrows that gap for one change rather than
 * closing it, and reports what it actually measured rather than what it wishes it had.
 *
 * Bundled by `scripts/measure-link-routing.mjs` and driven in Chromium. It paints the SAME scene
 * twice — routing off, routing on — against the same canvas, and reports the per-frame distribution
 * of each.
 */
import { paintScene, type TsldPalette, type TsldScene } from '../src/features/tsld/render/paint';
import type {
  RenderActivity,
  RenderEdge,
  Viewport,
} from '../src/features/tsld/render/render-model';

import { scaleScene } from './scale-scene';

const PALETTE: TsldPalette = {
  gridLine: '#e5e7eb',
  gridLineDay: '#eef0f3',
  gridLineMonth: '#d7dbe0',
  gridLineYear: '#b9bfc7',
  edge: '#64748b',
  bar: '#3b82f6',
  critical: '#dc2626',
  nearCritical: '#f59e0b',
  outline: '#ffffff',
  selection: '#0ea5e9',
  nonWorking: '#f3f4f6',
  nonWorkingHatch: '#e5e7eb',
  today: '#dc2626',
  todayInk: '#ffffff',
  conflict: '#f59e0b',
  laneOverlap: '#f59e0b',
  labelInside: '#ffffff',
  labelInsideCritical: '#ffffff',
  labelInsideNearCritical: '#111827',
  labelBeside: '#374151',
  barStroke: '#94a3b8',
  hoverRing: '#94a3b8',
  handleHalo: '#0f172a',
  monthBand: '#f8fafc',
};

const COUNT = 2000;
const LANES = 50;
/** Not a multiple of `LANES` — a same-lane edge crosses nothing, and would measure no routing. */
const EDGE_SPAN = LANES * 10 + 7;

function iso(day: number): string {
  return new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
}

function plan(): RenderActivity[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    id: `a${i}`,
    type: 'TASK' as const,
    laneIndex: i % LANES,
    label: `A${i} Activity ${i} · 5d`,
    earlyStart: iso(Math.floor(i / LANES) * 6),
    earlyFinish: iso(Math.floor(i / LANES) * 6 + 4),
    isCritical: i % 7 === 0,
    isNearCritical: false,
  }));
}

function edges(): RenderEdge[] {
  return Array.from({ length: COUNT - EDGE_SPAN }, (_, i) => ({
    predecessorId: `a${i}`,
    successorId: `a${i + EDGE_SPAN}`,
    type: 'FS' as const,
    isDriving: i % 3 === 0,
  }));
}

export interface BenchResult {
  frames: number;
  p50: number;
  p95: number;
  max: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx] ?? 0;
}

/**
 * The two pictures, and why both are kept.
 *
 * `grid` is the original synthetic scene — 2,000 identical five-day bars in a regular lattice. It is
 * **retained deliberately**: ADR-0065's published numbers were measured on it, and replacing it
 * would silently make this run incomparable with the one already quoted in the ADR.
 *
 * `scale` is the ADR-0066 scale generator's plan (see `scale-scene.ts`) — the same activity count in
 * a shape a planner would recognise. It is the honest answer to "what does the painter cost", and
 * the difference between the two is itself a finding.
 */
const SCENES = {
  grid: (): { activities: RenderActivity[]; edges: RenderEdge[]; summary: string } => ({
    activities: plan(),
    edges: edges(),
    summary: `${String(COUNT)} uniform bars, ${String(COUNT - EDGE_SPAN)} fixed-span links`,
  }),
  scale: () => scaleScene(COUNT),
} as const;
export type SceneName = keyof typeof SCENES;

function run(
  canvas: HTMLCanvasElement,
  linkRouting: boolean,
  frames: number,
  pxPerDay: number,
  source: { activities: RenderActivity[]; edges: RenderEdge[] },
): BenchResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const scene: TsldScene = {
    activities: source.activities,
    edges: source.edges,
    dataDate: '2026-01-01',
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting,
  };
  const size = { width: canvas.width, height: canvas.height };
  const samples: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    // Pan by one pixel per frame: a static viewport would let the browser's own caching flatter the
    // measurement, and panning is the case the budget is actually about.
    const view: Viewport = { pxPerDay, originX: -i * pxPerDay, originY: 0 };
    const started = performance.now();
    paintScene(ctx, scene, view, size, PALETTE, 1);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    frames,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: samples[samples.length - 1] ?? 0,
  };
}

/**
 * Two zooms, because one would mislead in whichever direction it was chosen.
 *
 * `whole` (2 px/day) fits the entire 2,000-activity plan on screen, so **nothing is culled** — every
 * bar and every edge is drawn on every frame. It is the worst case the budget is stated against, and
 * it is also a real thing a planner does (zoom out to see the programme).
 *
 * `week` (12 px/day) shows a working window, so the cull does its job. It is what the surface costs
 * in the state it is used in most of the time.
 */
const ZOOMS = { whole: 2, week: 12 } as const;
type Zoom = keyof typeof ZOOMS;

declare global {
  interface Window {
    __benchLinkRouting: (
      frames: number,
      scene: SceneName,
    ) => {
      edges: number;
      scene: string;
      results: { zoom: Zoom; pxPerDay: number; off: BenchResult; on: BenchResult }[];
    };
  }
}

window.__benchLinkRouting = (frames: number, sceneName: SceneName) => {
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('no canvas');
  // Built ONCE, outside the timed loop: generating the plan is not what is being measured, and
  // rebuilding it per frame would fold the generator's cost into the painter's number.
  const source = SCENES[sceneName]();
  const results = (Object.keys(ZOOMS) as Zoom[]).map((zoom) => {
    const pxPerDay = ZOOMS[zoom];
    // Warm-up, discarded: the first paint pays for font resolution and the label width memo.
    run(canvas, false, 20, pxPerDay, source);
    run(canvas, true, 20, pxPerDay, source);
    return {
      zoom,
      pxPerDay,
      off: run(canvas, false, frames, pxPerDay, source),
      on: run(canvas, true, frames, pxPerDay, source),
    };
  });
  return { edges: source.edges.length, scene: source.summary, results };
};
