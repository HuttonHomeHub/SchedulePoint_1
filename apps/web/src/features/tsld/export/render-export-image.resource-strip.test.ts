import { describe, expect, it, vi } from 'vitest';

import type { ResourceStripPalette, TsldScene } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';
import type { ResourceStripSnapshot, StripCaption } from '../render/resource-strip';

import { EXPORT_STRIP_CAPTION_ROW } from './export-image';
import {
  renderExportImage,
  stripCaptionHeadline,
  type RenderExportImageInput,
} from './render-export-image';

import { RESOURCE_LOAD_BASIS_NOTE } from '@/features/resources/components/ResourceHistogram';

/**
 * The **resource strip in the exported picture** (ADR-0199, `docs/TECH_DEBT.md` #223).
 *
 * The strip lives on its own canvas, so it is the part of the diagram an export can silently omit —
 * and the omission looks like a working export. jsdom has no 2D context, so the surface is a
 * **recording** proxy (the WBS band's suite does the same). The assertions are about what can only
 * go wrong here: the band is drawn at the reserved bottom offset, before the paper ground; the
 * caption says what the strip is and counts what it could not draw; and the path with no strip is
 * the prior export, call for call.
 */
type Call = { method: string; args: unknown[] };

function recordingCanvas() {
  const calls: Call[] = [];
  const ctx = new Proxy<Record<string, unknown>>(
    {},
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === 'measureText') {
          return (t: string) => {
            calls.push({ method: 'measureText', args: [t] });
            return { width: t.length * 6 };
          };
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return undefined;
        };
      },
      set(target, prop, value) {
        // Recorded as a pseudo-call so a test can see the ORDER of state changes relative to draws.
        calls.push({ method: `set:${String(prop)}`, args: [value] });
        target[prop as string] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

const STRIP_HEIGHT = 72;
const DPR = 2;
const TOP_BAND = 96;
const WIDTH = 800;
const HEIGHT = 300 + EXPORT_STRIP_CAPTION_ROW + STRIP_HEIGHT;

const PALETTE: ResourceStripPalette = {
  bar: '#3b6fbf',
  axis: '#cccccc',
  tick: '#555555',
  ground: '#ffffff',
};

function snapshot(caption: StripCaption): ResourceStripSnapshot {
  return {
    segments: [
      { values: [2, 1], fill: '#aa0000' },
      { values: [1, 1], fill: '#00aa00' },
    ],
    bucketTotals: [3, 2],
    dayOffsets: [
      { start: 0, end: 7 },
      { start: 7, end: 14 },
    ],
    dataDate: '2026-01-01',
    max: 3,
    caption,
  };
}

const STACKED: StripCaption = {
  status: 'ready',
  mode: 'resource',
  granularity: 'WEEK',
  legend: [
    { label: 'Crane crew', fill: '#aa0000' },
    { label: 'Other (4 resources)', fill: '#555555' },
  ],
};

function input(over: Partial<RenderExportImageInput> = {}): RenderExportImageInput {
  const viewport: Viewport = { pxPerDay: 10, originX: 0, originY: TOP_BAND };
  const scene: TsldScene = { activities: [], edges: [], dataDate: '2026-01-01' };
  return {
    scene,
    viewport,
    size: { width: WIDTH, height: HEIGHT },
    dpr: DPR,
    topBand: TOP_BAND,
    palette: resolvePrintPalette(document.documentElement),
    scaledToFit: false,
    meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-10-17' },
    ...over,
  };
}

async function render(over: Partial<RenderExportImageInput>): Promise<Call[]> {
  const { canvas, calls } = recordingCanvas();
  await renderExportImage(input(over), { createCanvas: () => canvas, paint: vi.fn() });
  return calls;
}

const texts = (calls: Call[]): string[] =>
  calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));

describe('renderExportImage — the resource strip', () => {
  it('with no strip, draws nothing about one — no band, no offset frame, no caption', async () => {
    const calls = await render({});

    expect(texts(calls).some((t) => t.startsWith('Resource load'))).toBe(false);
    expect(calls).not.toContainEqual({ method: 'clearRect', args: [0, 0, WIDTH, STRIP_HEIGHT] });
    // Every frame the export sets is the surface's own (no vertical offset): nothing was painted
    // into a shifted frame, which is how the band would have got there.
    const offsets = calls.filter((c) => c.method === 'setTransform').map((c) => c.args[5]);
    expect(offsets.every((y) => y === 0)).toBe(true);
  });

  it('paints the band at the bottom, before the paper ground, and the caption after it', async () => {
    const calls = await render({
      resourceStrip: { snapshot: snapshot(STACKED), palette: PALETTE, height: STRIP_HEIGHT },
    });

    // The band's own rectangle is cleared at the bottom offset: (size.height − height) × dpr.
    const offsetTransform = calls.findIndex(
      (c) => c.method === 'setTransform' && c.args[5] === (HEIGHT - STRIP_HEIGHT) * DPR,
    );
    expect(offsetTransform).toBeGreaterThanOrEqual(0);
    expect(calls[offsetTransform + 1]).toEqual({
      method: 'clearRect',
      args: [0, 0, WIDTH, STRIP_HEIGHT],
    });

    // Before the ground, for the WBS band's reason: clearing after it would punch a hole in the paper.
    const groundMode = calls.findIndex(
      (c) => c.method === 'set:globalCompositeOperation' && c.args[0] === 'destination-over',
    );
    expect(groundMode).toBeGreaterThan(offsetTransform);

    // …and the frame is restored so the ground, title and caption author in page coordinates.
    const restored = calls.findIndex(
      (c, i) => i > offsetTransform && c.method === 'setTransform' && c.args[5] === 0,
    );
    expect(restored).toBeGreaterThan(offsetTransform);
    expect(restored).toBeLessThan(groundMode);

    // The caption is chrome, painted after the ground like the title and marker rows.
    const headline = calls.findIndex(
      (c) => c.method === 'fillText' && String(c.args[0]).startsWith('Resource load'),
    );
    expect(headline).toBeGreaterThan(groundMode);
  });

  it('draws the segment fills from the snapshot', async () => {
    const calls = await render({
      resourceStrip: { snapshot: snapshot(STACKED), palette: PALETTE, height: STRIP_HEIGHT },
    });
    const filledInSegmentColour = calls.filter(
      (c, i) =>
        c.method === 'fillRect' &&
        calls
          .slice(0, i)
          .reverse()
          .find((p) => p.method === 'set:fillStyle')?.args[0] === '#aa0000',
    );
    expect(filledInSegmentColour.length).toBeGreaterThan(0);
  });

  it('states mode, bucket size, peak, basis and every legend entry in the caption', async () => {
    const calls = await render({
      resourceStrip: { snapshot: snapshot(STACKED), palette: PALETTE, height: STRIP_HEIGHT },
    });
    const drawn = texts(calls);

    expect(drawn).toContain('Resource load · peak 3 units · stacked by resource · Weekly buckets');
    // The screen's own sentence, so the two surfaces cannot be reworded apart.
    expect(drawn).toContain(RESOURCE_LOAD_BASIS_NOTE);
    expect(drawn).toContain('Crane crew');
    expect(drawn).toContain('Other (4 resources)');
    // Each swatch is the segment's own fill, so the legend cannot disagree with the bars.
    const fills = calls.filter((c) => c.method === 'set:fillStyle').map((c) => c.args[0]);
    expect(fills).toContain('#555555');
  });

  it('counts a legend entry the crop cannot hold instead of dropping it', async () => {
    const crowded: StripCaption = {
      ...STACKED,
      legend: [
        { label: 'Crane crew', fill: '#aa0000' },
        { label: 'Formwork gang', fill: '#00aa00' },
        { label: 'Scaffolders', fill: '#0000aa' },
        { label: 'Other (4 resources)', fill: '#555555' },
      ],
    };
    const calls = await render({
      size: { width: 190, height: HEIGHT },
      resourceStrip: { snapshot: snapshot(crowded), palette: PALETTE, height: STRIP_HEIGHT },
    });
    const drawn = texts(calls);

    expect(drawn).toContain('Crane crew');
    expect(drawn).not.toContain('Other (4 resources)');
    const more = drawn.find((t) => /^\+\d+ more$/.test(t));
    expect(more).toBeDefined();
    // Drawn + counted = every entry: nothing vanishes silently (ADR-0127 D3).
    const shown = crowded.legend.filter((e) => drawn.includes(e.label)).length;
    expect(shown + Number(/\d+/.exec(more ?? '')?.[0])).toBe(crowded.legend.length);
  });

  it('says how many resources were left out when the histogram is truncated', async () => {
    const calls = await render({
      resourceStrip: {
        snapshot: snapshot({ ...STACKED, shown: 200, total: 247 }),
        palette: PALETTE,
        height: STRIP_HEIGHT,
      },
    });
    expect(texts(calls).some((t) => t.includes('Showing 200 of 247 resources'))).toBe(true);
  });

  it('marks a headline it had to cut, rather than clipping it silently', async () => {
    const calls = await render({
      size: { width: 150, height: HEIGHT },
      resourceStrip: { snapshot: snapshot(STACKED), palette: PALETTE, height: STRIP_HEIGHT },
    });
    expect(texts(calls).some((t) => t.startsWith('Resource load') && t.endsWith('…'))).toBe(true);
  });
});

describe('stripCaptionHeadline', () => {
  const base = { legend: [], granularity: 'MONTH' } as const;
  const bare = (caption: StripCaption): ResourceStripSnapshot => ({
    segments: [],
    bucketTotals: [],
    dayOffsets: [],
    dataDate: '2026-01-01',
    max: 12.5,
    caption,
  });

  it.each([
    ['group', 'Resource load · peak 12.5 units · stacked by group · Monthly buckets'],
    ['kind', 'Resource load · peak 12.5 units · stacked by kind · Monthly buckets'],
  ] as const)('names the %s mode', (mode, expected) => {
    expect(stripCaptionHeadline(bare({ ...base, status: 'ready', mode }))).toBe(expected);
  });

  it('names the isolated resource and draws no stack-by', () => {
    expect(
      stripCaptionHeadline(
        bare({ ...base, status: 'ready', mode: 'isolated', resourceName: 'Crane crew' }),
      ),
    ).toBe('Resource load · peak 12.5 units · Crane crew only · Monthly buckets');
  });

  it('says why an open strip has nothing to show, never an unexplained band', () => {
    const mode = 'resource' as const;
    expect(stripCaptionHeadline(bare({ ...base, status: 'loading', mode }))).toBe(
      'Resource load: not shown, still loading when exported',
    );
    expect(stripCaptionHeadline(bare({ ...base, status: 'error', mode }))).toBe(
      'Resource load: not shown, could not be loaded',
    );
    expect(
      stripCaptionHeadline(bare({ ...base, status: 'empty', mode, emptyMessage: 'Nothing yet.' })),
    ).toBe('Resource load: Nothing yet.');
  });
});
