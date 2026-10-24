import { describe, expect, it, vi } from 'vitest';

import type { TsldScene } from '../render/paint';
import { resolvePrintPalette } from '../render/palette';
import type { Viewport } from '../render/render-model';
import type { GutterSwimlane } from '../render/swimlane-gutter';

import { EXPORT_MARKER_ROW } from './export-image';
import { EXPORT_GUTTER_WIDTH } from './export-swimlane-gutter';
import { renderExportImage, type RenderExportImageInput } from './render-export-image';

/**
 * **The swimlane gutter in the exported picture** (swimlanes M2-T7, ui-architecture C4).
 *
 * The gutter is DOM on screen, so a picture without a painted mirror shows divided lanes nobody
 * named. jsdom has no raster, so the surface is a recording proxy and the assertions are about what
 * was drawn and where: the names, in the model's order and boxes; the column covering what the scene
 * painted under it; the legend counting what had to be shortened; and the path without swimlanes
 * drawing none of it.
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

const TOP_BAND = 96;
const LABELS_TOP = TOP_BAND + EXPORT_MARKER_ROW;
const LANE = 60;

// Five lines at the gutter's width, in a swimlane one lane tall, which holds three.
const LONG_NAME =
  'Mechanical electrical plumbing first fix ground floor east wing and the plant room';

const swimlane = (id: string | null, name: string | null, firstLane: number, laneCount = 1) =>
  ({ id, name, firstLane, laneCount, activityCount: 1 }) satisfies GutterSwimlane;

function input(over: Partial<RenderExportImageInput> = {}): RenderExportImageInput {
  const viewport: Viewport = { pxPerDay: 10, originX: EXPORT_GUTTER_WIDTH, originY: LABELS_TOP };
  const scene: TsldScene = { activities: [], edges: [], dataDate: '2026-01-01' };
  return {
    scene,
    viewport,
    size: { width: 1400, height: LABELS_TOP + 6 * LANE },
    dpr: 1,
    topBand: TOP_BAND,
    palette: resolvePrintPalette(document.documentElement),
    scaledToFit: false,
    meta: { planName: 'North Tower', dataDate: '2026-01-01', generatedAtIso: '2026-07-30' },
    ...over,
  };
}

async function render(over: Partial<RenderExportImageInput>) {
  const { canvas, calls } = recordingCanvas();
  await renderExportImage(input(over), { createCanvas: () => canvas, paint: vi.fn() });
  return calls;
}

const texts = (calls: Call[]): string[] =>
  calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));

describe('renderExportImage, the swimlane gutter mirror', () => {
  const gutter = {
    swimlanes: [swimlane('s1', 'Mechanical', 0), swimlane('s2', 'Electrical', 1)],
  };

  it('writes each swimlane’s name in the model’s order', async () => {
    const calls = await render({ swimlaneGutter: gutter });
    const names = texts(calls).filter((t) => t === 'Mechanical' || t === 'Electrical');
    expect(names).toEqual(['Mechanical', 'Electrical']);
  });

  it('puts a name at its swimlane’s top, below the marker row', async () => {
    const calls = await render({ swimlaneGutter: gutter });
    const second = calls.find((c) => c.method === 'fillText' && c.args[0] === 'Electrical')!;
    // Left padding of the label, and a baseline inside the second swimlane's block.
    expect(second.args[1]).toBe(8);
    const baseline = Number(second.args[2]);
    expect(baseline).toBeGreaterThan(LABELS_TOP + LANE);
    expect(baseline).toBeLessThan(LABELS_TOP + 2 * LANE);
  });

  it('covers the width it reserved with paper, from under the title band down', async () => {
    const calls = await render({ swimlaneGutter: gutter });
    const size = LABELS_TOP + 6 * LANE;
    expect(calls).toContainEqual({
      method: 'fillRect',
      args: [0, TOP_BAND, EXPORT_GUTTER_WIDTH, size - TOP_BAND],
    });
  });

  it('shifts the ruler’s chips into the stage, so none sits under the gutter', async () => {
    const scene: TsldScene = {
      activities: [],
      edges: [],
      dataDate: '2026-01-01',
      dataDateLine: true,
    };
    const withGutter = await render({
      scene,
      swimlaneGutter: gutter,
      viewport: { pxPerDay: 10, originX: EXPORT_GUTTER_WIDTH + 100, originY: LABELS_TOP },
    });
    const plain = await render({
      scene,
      viewport: { pxPerDay: 10, originX: 100, originY: LABELS_TOP },
    });
    // The chip, not the legend's "Data date" entry: it is the one drawn in the marker row.
    const chipX = (calls: Call[]): number => {
      const chip = calls.find(
        (c) => c.method === 'fillText' && c.args[0] === 'Data date' && Number(c.args[2]) > TOP_BAND,
      );
      return Number(chip!.args[1]);
    };
    // Same day-0 position within the stage; the picture's is the gutter's width further right.
    expect(chipX(withGutter)).toBe(chipX(plain) + EXPORT_GUTTER_WIDTH);
  });

  it('keys the swimlane boundary in the legend only when the picture draws swimlanes', async () => {
    const withMarks = input({ swimlaneGutter: gutter });
    withMarks.scene = {
      ...withMarks.scene,
      swimlaneMarks: {
        extents: [
          { name: 'Mechanical', firstLane: 0, laneCount: 1 },
          { name: 'Electrical', firstLane: 1, laneCount: 1 },
        ],
        ground: true,
      },
    };
    const { canvas, calls } = recordingCanvas();
    await renderExportImage(withMarks, { createCanvas: () => canvas, paint: vi.fn() });
    expect(texts(calls)).toContain('Swimlane boundary');

    expect(texts(await render({})).join('|')).not.toMatch(/Swimlane boundary/);
  });

  it('counts a name it had to shorten in the legend, and says nothing when none was', async () => {
    const long = {
      swimlanes: [swimlane('s1', LONG_NAME, 0)],
    };
    const cut = texts(await render({ swimlaneGutter: long }));
    expect(cut).toContain('1 swimlane name shortened');
    // The ellipsis is the picture's own mark of the cut.
    expect(cut.some((t) => t.endsWith('…'))).toBe(true);

    expect(texts(await render({ swimlaneGutter: gutter })).join('|')).not.toMatch(/shortened/);
  });

  it('counts every shortened name, not only the first', async () => {
    const long = LONG_NAME;
    const calls = await render({
      swimlaneGutter: { swimlanes: [swimlane('a', long, 0), swimlane('b', long, 1)] },
    });
    expect(texts(calls)).toContain('2 swimlane names shortened');
  });

  it('does not count a name only the crop’s edge shortened', async () => {
    // The swimlane is tall enough for the whole name (LONG_NAME needs 5 lines), but the view cuts
    // it a lane in: the label is clipped in THIS picture and whole in the plan.
    const calls = await render({
      swimlaneGutter: { swimlanes: [swimlane('s1', LONG_NAME, 0, 6)] },
      size: { width: 1400, height: LABELS_TOP + 30 + 20 },
      viewport: { pxPerDay: 10, originX: EXPORT_GUTTER_WIDTH, originY: LABELS_TOP },
    });
    expect(texts(calls).some((t) => t.endsWith('…'))).toBe(true);
    expect(texts(calls).join('|')).not.toMatch(/shortened/);
  });

  it('keeps the count ahead of the optional rows, straight after the criticality key', async () => {
    const calls = await render({
      size: { width: 1400, height: LABELS_TOP + 6 * LANE },
      swimlaneGutter: { swimlanes: [swimlane('s1', LONG_NAME, 0)] },
    });
    const t = texts(calls);
    const at = t.indexOf('On schedule');
    expect(t.slice(at, at + 2)).toEqual(['On schedule', '1 swimlane name shortened']);
  });

  it('draws the ruler’s chip in the marker row with no gutter at all', async () => {
    const scene: TsldScene = {
      activities: [],
      edges: [],
      dataDate: '2026-01-01',
      dataDateLine: true,
    };
    const calls = await render({
      scene,
      viewport: { pxPerDay: 10, originX: 100, originY: LABELS_TOP },
    });
    const chip = calls.find(
      (c) => c.method === 'fillText' && c.args[0] === 'Data date' && Number(c.args[2]) > TOP_BAND,
    );
    expect(chip, 'the marker row names the data date').toBeDefined();
    // Inside the reserved row, not over the title band or the diagram.
    expect(Number(chip!.args[2])).toBeGreaterThan(TOP_BAND);
    expect(Number(chip!.args[2])).toBeLessThan(LABELS_TOP);
  });

  it('draws "No swimlane" for the unassigned stack', async () => {
    const calls = await render({
      swimlaneGutter: { swimlanes: [swimlane('s1', 'Mechanical', 0), swimlane(null, null, 1)] },
    });
    expect(texts(calls)).toContain('No swimlane');
  });

  it('draws no label for a swimlane outside the framed rows', async () => {
    const calls = await render({
      viewport: { pxPerDay: 10, originX: EXPORT_GUTTER_WIDTH, originY: LABELS_TOP - 10 * LANE },
      swimlaneGutter: gutter,
    });
    expect(texts(calls)).not.toContain('Mechanical');
  });

  it('is the prior picture without a gutter: no column, no names, no legend note', async () => {
    const calls = await render({});
    expect(texts(calls).join('|')).not.toMatch(/swimlane|Mechanical/i);
    expect(calls.some((c) => c.method === 'fillRect' && c.args[0] === 0 && c.args[2] === 176)).toBe(
      false,
    );
  });
});
