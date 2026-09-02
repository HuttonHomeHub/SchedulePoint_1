/**
 * The bench body, bundled and evaluated inside a real Chromium page by `measure-strip-stack.mjs`.
 *
 * It calls the REAL `paintResourceStrip` against a REAL 2D context. Nothing here re-implements the
 * painter, and nothing here is a counting stub: the number reported is wall-clock inside that one
 * function, which is the thing the committed condition is about.
 */
import { paintResourceStrip, type ResourceStripPalette } from '@/features/tsld/render/paint';
import {
  categoricalCycleResolved,
  resolveResourceStripPalette,
} from '@/features/tsld/render/palette';
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

/**
 * A frame above this is in the periodic band rather than the painter's own cost. Chosen well above
 * the measured p50 (0.2-0.9 ms across every segment count tried) and well below the band (~10-17 ms),
 * so it separates the two populations rather than slicing either.
 */
const SLOW_FRAME_MS = 5;

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
  /** Frames costing more than {@link BenchResult.slowFrameMs}; see the note in the loop. */
  slowFrames: number;
  slowFrameMs: number;
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
    bucketTotals: Array.from({ length: opts.buckets }, (_, b) =>
      segments.reduce((acc, s) => acc + (s.values[b] ?? 0), 0),
    ),
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
  // **The share of frames in the periodic slow band, and it is why `p95` alone lied**
  // (`docs/TECH_DEBT.md` #226). A handful of frames in every run cost ~10-17 ms while the median
  // stays under a millisecond, and they arrive on a REGULAR period (measured: every ~19-21 frames
  // at both eight and nine segments) — a compositor flush absorbed by whichever paint call it lands
  // on, not the painter's own work. Their COUNT rises smoothly with segment count; nothing about it
  // is discontinuous. `p95` over 300 frames reads `times[285]`, which is a slow frame exactly when
  // fifteen or more are slow — so the estimator flips from ~1 ms to ~16 ms between eight slow-frame
  // counts of 14 and 15, and reports a 20x "cliff" that does not exist in the code.
  const slowFrames = times.filter((t) => t > SLOW_FRAME_MS).length;
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
    slowFrames,
    slowFrameMs: SLOW_FRAME_MS,
  };
}

(window as unknown as { runStripBench: typeof runStripBench }).runStripBench = runStripBench;

/**
 * **Condition 2 — legibility at 72 px.** One frame, at true size, with the REAL resolvers reading
 * the REAL token values (the harness injects `globals.css`), so what the screenshot shows is what
 * a planner's browser paints and not a fixture of hex literals.
 *
 * It also reports the pixel height of every segment in the peak bucket and in the median bucket,
 * because the condition's concrete half — "no shown segment renders at 0 px" — is arithmetic, and
 * only its other half ("can a person tell them apart?") is a judgement against the image.
 */
export interface LegibilitySample {
  segmentCount: number;
  visibleBuckets: number;
  fills: string[];
  peakBucket: number;
  medianBucket: number;
  peakHeights: number[];
  medianHeights: number[];
  barArea: number;
}

export function renderStripSample(opts: {
  canvas: HTMLCanvasElement;
  segments: number;
  buckets: number;
  pxPerDay: number;
  width: number;
  height: number;
  dpr: number;
}): LegibilitySample {
  const ctx = opts.canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context');

  // The REAL ramp resolver, against the REAL tokens — not the bench's hex list.
  const cycle = categoricalCycleResolved(document.documentElement);
  const palette = resolveResourceStripPalette(document.documentElement);

  // The shipped shape: `cap` named bands ranked by total, plus one neutral aggregate.
  const named = opts.segments - 1;
  const fills = [...cycle.slice(0, named).map((m) => m.fill), palette.tick];
  const segments = skewedSegments(opts.segments, opts.buckets, fills);

  const dayOffsets = Array.from({ length: opts.buckets }, (_, i) => ({
    start: i * 7,
    end: (i + 1) * 7,
  }));
  const totals = Array.from({ length: opts.buckets }, (_, b) =>
    segments.reduce((acc, s) => acc + (s.values[b] ?? 0), 0),
  );
  const max = Math.max(...totals);

  const snapshot: ResourceStripSnapshot = {
    segments,
    bucketTotals: totals,
    dayOffsets,
    dataDate: '2026-01-01',
    max,
  };

  // **Panned so the programme's peak is on screen, and that is a deliberate choice.** At the Week
  // preset only ~14 of 104 buckets fit, and the scale is the WHOLE plan's peak (what the panel
  // publishes as `max`), so framing from day zero grades the quietest fortnight of the programme
  // against a scale set by its busiest — a window in which every band is thin for a reason that has
  // nothing to do with legibility. A planner reading resource load pans to the busy part; that is
  // the window the condition's "peak column and a median column" is about.
  const tallest = totals.indexOf(max);
  const centreDay = tallest * 7 + 3.5;
  const view = {
    originX: opts.width / 2 - centreDay * opts.pxPerDay,
    originY: 0,
    pxPerDay: opts.pxPerDay,
  };
  paintResourceStrip(
    ctx,
    snapshot,
    view,
    { width: opts.width, height: opts.height },
    palette,
    opts.dpr,
  );

  // Which buckets are actually on screen — the peak and median are taken from those, not from the
  // whole programme, because the condition is about what the reviewer can see.
  const visible: number[] = [];
  for (let b = 0; b < opts.buckets; b += 1) {
    const x1 = dayOffsets[b]!.start * opts.pxPerDay + view.originX;
    const x2 = dayOffsets[b]!.end * opts.pxPerDay + view.originX;
    if (x2 > 0 && x1 < opts.width) visible.push(b);
  }
  const byHeight = [...visible].sort((a, b) => totals[a]! - totals[b]!);
  const peakBucket = byHeight[byHeight.length - 1] ?? 0;
  const medianBucket = byHeight[Math.floor(byHeight.length / 2)] ?? 0;

  // `STRIP_BAR_TOP_PAD` is 6 in the painter; the bar area is the band less that pad.
  const barArea = Math.max(0, opts.height - 6);
  const heights = (b: number): number[] =>
    segments.map((s) => ((s.values[b] ?? 0) / max) * barArea);

  return {
    segmentCount: opts.segments,
    visibleBuckets: visible.length,
    fills,
    peakBucket,
    medianBucket,
    peakHeights: heights(peakBucket),
    medianHeights: heights(medianBucket),
    barArea,
  };
}

(window as unknown as { renderStripSample: typeof renderStripSample }).renderStripSample =
  renderStripSample;
