import { expect, test } from '@playwright/test';

import { openReferencePlan, sceneCanvasToken } from './support';

/**
 * **NetPoint grammar M2 — the bar and the node on the real canvas** (spec §4.2 G3/G4).
 *
 * jsdom has no canvas and resolves no custom property, so every unit suite here is blind to whether
 * the green reaches the painter and whether a node really is filled with the ground. This reads the
 * token where the painter reads it (the scene canvas, inside the canvas scope, ADR-0102) and then
 * reads the pixels.
 *
 * A node is found by its SHAPE, not its colour alone: an opaque near-white centre with coloured ink
 * at the rim's radius in all four directions. The node it replaced was a hollow ring centred on the
 * bar's end, so its centre pixel was the bar's green and it cannot satisfy this; a ground-filled
 * node can. The radius comes from the painter's own constant (15 px across, rim up to 3 px), scaled
 * by the device pixel ratio.
 */
test.describe('NetPoint grammar — bars and nodes', () => {
  test.setTimeout(240_000);

  test('bars paint in their own green, and task nodes are ground-filled rings', async ({
    page,
  }) => {
    await openReferencePlan(page);
    expect(await sceneCanvasToken(page, '--canvas-bar')).toBe('oklch(0.629 0.13 150)');

    const found = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')];
      const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2D context');
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const px = (x: number, y: number): [number, number, number, number] => {
        const i = (y * width + x) * 4;
        return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
      };
      // `--canvas-bar` is oklch(0.629 0.13 150) ≈ rgb(69, 158, 93); a pixel within 24 of it.
      let green = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (
          (data[i + 3] ?? 0) > 200 &&
          Math.abs((data[i] ?? 0) - 69) < 24 &&
          Math.abs((data[i + 1] ?? 0) - 158) < 24 &&
          Math.abs((data[i + 2] ?? 0) - 93) < 24
        ) {
          green += 1;
        }
      }
      const dpr = window.devicePixelRatio || 1;
      const r = 7.5 * dpr;
      const ground = (x: number, y: number): boolean => {
        const [pr, pg, pb, pa] = px(x, y);
        return pa > 200 && pr > 238 && pg > 238 && pb > 238;
      };
      const ink = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= width || y >= height) return false;
        const [pr, pg, pb, pa] = px(x, y);
        return pa > 120 && (Math.max(pr, pg, pb) - Math.min(pr, pg, pb) > 40 || pr + pg + pb < 360);
      };
      const rimAt = (x: number, y: number, dx: number, dy: number): boolean => {
        for (let d = Math.floor(r - 2 * dpr); d <= Math.ceil(r + 1.5 * dpr); d += 1) {
          if (ink(x + dx * d, y + dy * d)) return true;
        }
        return false;
      };
      const centres = new Set<string>();
      const cell = Math.max(4, Math.round(6 * dpr));
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!ground(x, y)) continue;
          if (rimAt(x, y, 1, 0) && rimAt(x, y, -1, 0) && rimAt(x, y, 0, 1) && rimAt(x, y, 0, -1)) {
            centres.add(`${Math.round(x / cell)},${Math.round(y / cell)}`);
          }
        }
      }
      return { green, nodes: centres.size };
    });
    expect(found.green, 'no pixel of the scene is the bar green').toBeGreaterThan(200);
    expect(found.nodes, 'no ground-filled node ring found on the scene').toBeGreaterThan(10);
  });
});
