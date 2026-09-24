import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  onboard,
  openProject,
  recalculate,
  seedActivities,
  seedDependency,
} from '../e2e-arrange/support';

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

  /**
   * **All three rungs, measured** (FC-G4). The reference plan has no near-critical activity (nothing
   * there has 1–5 days of total float), so the accessibility review could judge only critical against
   * on schedule from its pictures. This plan has one of each: `Pour` and `Cure` are the critical
   * chain, `Rebar` feeds `Cure` with 3 days of float (near-critical, `NEAR_CRITICAL_THRESHOLD_MINUTES`
   * is 5 days) and `Fence` stands alone with 11.
   *
   * Each rung's rim is measured by walking straight UP from a node's centre, clear of the bar that
   * enters from the side, and counting the ink run met at the rim. Weight is the non-colour channel
   * (spec §4.2 G4, CQ-11), so the three runs must differ in length whatever their hue. Set
   * `NETPOINT_SHOOT_DIR` to also save the canvas, in colour and for a greyscale review.
   */
  test('the three rungs draw three rim weights', async ({ page }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Rungs');
    await ensurePen(page);
    const [pour, rebar, cure] = await seedActivities(page, orgSlug, [
      { name: 'Pour', laneIndex: 0, durationDays: 10 },
      { name: 'Rebar', laneIndex: 1, durationDays: 7 },
      { name: 'Cure', laneIndex: 2, durationDays: 5 },
      { name: 'Fence', laneIndex: 3, durationDays: 4 },
    ]);
    await seedDependency(page, orgSlug, pour!.id, cure!.id);
    await seedDependency(page, orgSlug, rebar!.id, cure!.id);
    await recalculate(page, orgSlug);
    await ensurePen(page);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
    await page.waitForTimeout(800);

    const rims = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')];
      const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2D context');
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      type Rgb = [number, number, number];
      const rgbAt = (x: number, y: number): Rgb => {
        const i = (y * width + x) * 4;
        return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      };
      const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3] ?? 0;
      // Each rung's exact ink, as the browser renders the token the painter reads: painted on a
      // 1 px offscreen canvas and read back, so no colour is restated here.
      const style = getComputedStyle(canvas);
      const probe = document.createElement('canvas').getContext('2d')!;
      const inkOf = (token: string): Rgb => {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = style.getPropertyValue(token).trim();
        probe.fillRect(0, 0, 1, 1);
        const d = probe.getImageData(0, 0, 1, 1).data;
        return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
      };
      const inks: Record<'critical' | 'near' | 'none', Rgb> = {
        critical: inkOf('--destructive'),
        near: inkOf('--warning'),
        none: inkOf('--canvas-bar'),
      };
      const groundRgb = inkOf('--canvas');
      const dist = (p: Rgb, q: Rgb): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const isGround = (x: number, y: number): boolean =>
        alphaAt(x, y) > 200 && dist(rgbAt(x, y), groundRgb) < 12;
      /** How much of a pixel the ink covers: its fraction of the way from the ground to the ink. */
      const coverage = (p: Rgb, ink: Rgb): number => {
        const g = groundRgb;
        const v: Rgb = [ink[0] - g[0], ink[1] - g[1], ink[2] - g[2]];
        const w: Rgb = [p[0] - g[0], p[1] - g[1], p[2] - g[2]];
        const t = (v[0] * w[0] + v[1] * w[1] + v[2] * w[2]) / (v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
        return Math.min(1, Math.max(0, t));
      };
      const dpr = window.devicePixelRatio || 1;
      const r = 7.5 * dpr;
      const reach = Math.ceil(r + 3 * dpr);
      const samples: Record<'critical' | 'near' | 'none', number[]> = {
        critical: [],
        near: [],
        none: [],
      };
      for (let y = reach + 1; y < height - reach - 1; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!isGround(x, y)) continue;
          // A node centre: ground here, and ground straight up and down until the rim's reach.
          const up = (d: number): Rgb => rgbAt(x, y - d);
          const down = (d: number): Rgb => rgbAt(x, y + d);
          let clear = true;
          for (let d = 1; d < r - 2.5 * dpr; d += 1) {
            if (!isGround(x, y - d) || !isGround(x, y + d)) {
              clear = false;
              break;
            }
          }
          // And ground just beyond the rim on both sides: a line crossing the node (the data-date
          // rule runs vertically through every start node on the data date) is ink the whole way.
          if (!clear || !isGround(x, y - reach - 1) || !isGround(x, y + reach + 1)) continue;
          // The darkest pixel on the upward ray names the rung; the ray's summed coverage of that
          // ink is the rim's width, however anti-aliasing split it.
          let darkest: Rgb = groundRgb;
          for (let d = Math.floor(r - 2.5 * dpr); d <= reach; d += 1) {
            if (dist(up(d), groundRgb) > dist(darkest, groundRgb)) darkest = up(d);
          }
          if (dist(darkest, groundRgb) < 40) continue;
          const rung = (Object.keys(inks) as ('critical' | 'near' | 'none')[]).reduce((a, b) =>
            dist(darkest, inks[a]) <= dist(darkest, inks[b]) ? a : b,
          );
          let widthUp = 0;
          let widthDown = 0;
          for (let d = Math.floor(r - 2.5 * dpr); d <= reach; d += 1) {
            widthUp += coverage(up(d), inks[rung]);
            widthDown += coverage(down(d), inks[rung]);
          }
          // Both sides must carry the same ring, or this is not a node's centre.
          if (Math.abs(widthUp - widthDown) > 0.6 * dpr || widthUp < 0.5) continue;
          samples[rung].push(widthUp / dpr);
        }
      }
      // The median column per rung: an off-centre column crosses the ring obliquely and reads wider.
      const median = (xs: number[]): number | undefined =>
        xs.length === 0 ? undefined : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      return {
        critical: median(samples.critical),
        near: median(samples.near),
        none: median(samples.none),
      };
    });
    // In CSS px. Nominal 3, 2 and 1 (`NODE_RIM_W`); each within 0.6 of it, and strictly ordered.
    expect(rims.critical, 'no critical node rim found').toBeDefined();
    expect(rims.near, 'no near-critical node rim found').toBeDefined();
    expect(rims.none, 'no on-schedule node rim found').toBeDefined();
    expect(rims.critical!).toBeGreaterThan(rims.near!);
    expect(rims.near!).toBeGreaterThan(rims.none!);
    expect(Math.abs(rims.critical! - 3), `critical rim ${rims.critical}`).toBeLessThan(0.6);
    expect(Math.abs(rims.near! - 2), `near rim ${rims.near}`).toBeLessThan(0.6);
    expect(Math.abs(rims.none! - 1), `on-schedule rim ${rims.none}`).toBeLessThan(0.6);

    const dir = process.env.NETPOINT_SHOOT_DIR;
    if (dir) {
      const box = (await page.locator('canvas').first().boundingBox())!;
      await page.screenshot({
        path: resolve(dir, 'rungs.png'),
        clip: { x: box.x, y: box.y, width: Math.min(box.width, 900), height: 320 },
      });
    }
  });
});
