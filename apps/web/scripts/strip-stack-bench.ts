/**
 * The bench body, bundled and evaluated inside a real Chromium page by `measure-strip-stack.mjs`.
 *
 * It calls the REAL `paintResourceStrip` against a REAL 2D context. Nothing here re-implements the
 * painter, and nothing here is a counting stub: the number reported is wall-clock inside that one
 * function, which is the thing the committed condition is about.
 */
import { paintResourceStrip, type ResourceStripPalette } from '@/features/tsld/render/paint';
import type { ResourceStripSnapshot } from '@/features/tsld/render/resource-strip';

/**
 * **Skewed, not even.** A real programme has a dominant trade and a tail — the UX review's point
 * that "eight segments averaging 8 px each" describes an even split nobody has. This generator
 * gives the first segment roughly half the load and decays from there, so the thin bands the
 * legibility criterion is about actually exist in the fixture.
 */
/**
 * The two experiment hooks, kept rather than deleted: they are how the sub-pixel-band and
 * distinct-fill-colour hypotheses were FALSIFIED (`docs/TECH_DEBT.md` #226), and whoever attributes
 * that cliff will want to re-run them rather than rediscover them.
 */
interface BenchProbe {
  even?: boolean;
  distinct?: number;
}
function probe(): BenchProbe {
  return (globalThis as unknown as { __stripProbe__?: BenchProbe }).__stripProbe__ ?? {};
}

function skewedSegments(count: number, buckets: number, fills: string[]) {
  const segments = [];
  for (let s = 0; s < count; s += 1) {
    const weight = probe().even === true ? 1 / count : 1 / 2 ** s;
    const values: number[] = [];
    for (let b = 0; b < buckets; b += 1) {
      // A bell over the programme, so buckets differ in height the way a real profile does.
      const t = (b / Math.max(1, buckets - 1)) * 2 - 1;
      values.push(Math.max(0, 100 * weight * (1 - t * t)));
    }
    segments.push({ values, fill: fills[s % fills.length]! });
  }
  return segments;
}

export interface BenchResult {
  segmentCount: number;
  bucketCount: number;
  visibleBuckets: number;
  p50: number;
  p95: number;
  samples: number;
}

export function runStripBench(opts: {
  segments: number;
  buckets: number;
  pxPerDay: number;
  width: number;
  height: number;
  dpr: number;
  frames: number;
}): BenchResult {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(opts.width * opts.dpr);
  canvas.height = Math.round(opts.height * opts.dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context');

  const all = [
    '#4d43a8',
    '#5f9a3f',
    '#8e3a86',
    '#3f9c6a',
    '#a83550',
    '#3f9a95',
    '#6c3ea3',
    '#529a45',
    '#7a8090',
  ];
  const distinct = probe().distinct ?? all.length;
  const fills = all.slice(0, Math.max(1, distinct));
  const segments = skewedSegments(opts.segments, opts.buckets, fills);

  // One bucket per week over the plan, projected as day offsets — the shape the panel publishes.
  const dayOffsets = Array.from({ length: opts.buckets }, (_, i) => ({
    start: i * 7,
    end: (i + 1) * 7,
  }));

  const max = Math.max(
    ...Array.from({ length: opts.buckets }, (_, b) =>
      segments.reduce((acc, s) => acc + (s.values[b] ?? 0), 0),
    ),
  );

  const snapshot: ResourceStripSnapshot = {
    segments,
    dayOffsets,
    dataDate: '2026-01-01',
    max,
  };

  const palette: ResourceStripPalette = {
    bar: '#3b6fbf',
    axis: '#2a2f3a',
    tick: '#7a8090',
    ground: '#f4f6f8',
  };

  const view = { originX: 0, originY: 0, pxPerDay: opts.pxPerDay, zoom: 1 };
  const band = { width: opts.width, height: opts.height };

  // Warm the JIT before sampling — otherwise the first frames measure compilation.
  for (let i = 0; i < 20; i += 1) paintResourceStrip(ctx, snapshot, view, band, palette, opts.dpr);

  const times: number[] = [];
  for (let i = 0; i < opts.frames; i += 1) {
    // Pan by a pixel each frame so nothing can be cached across samples.
    const panned = { ...view, originX: -i };
    const t0 = performance.now();
    paintResourceStrip(ctx, snapshot, panned, band, palette, opts.dpr);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);

  // How many buckets actually survived the cull, so a "fast" number cannot be fast because nothing
  // was drawn — the ADR-0066 scale-generator failure and #75's empty-plan 0.5 ms reading.
  const visibleBuckets = dayOffsets.filter((o) => {
    const x1 = o.start * opts.pxPerDay;
    const x2 = o.end * opts.pxPerDay;
    return x2 > 0 && x1 < opts.width;
  }).length;

  return {
    segmentCount: opts.segments,
    bucketCount: opts.buckets,
    visibleBuckets,
    p50: times[Math.floor(times.length * 0.5)] ?? 0,
    p95: times[Math.floor(times.length * 0.95)] ?? 0,
    samples: times.length,
  };
}

(window as unknown as { runStripBench: typeof runStripBench }).runStripBench = runStripBench;
