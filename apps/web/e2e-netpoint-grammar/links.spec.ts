import { expect, test, type Page } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  onboard,
  openPlanId,
  openProject,
  recalculate,
  seedActivities,
  seedDependency,
} from '../e2e-arrange/support';
import { pickZoomPreset } from '../e2e-search-nav/support';

/**
 * **NetPoint grammar M3 — the link language on the real canvas** (spec §4.2 G5, G6, G12).
 *
 * jsdom has no canvas, so the unit suites prove what the painter is ASKED to draw and never what a
 * browser paints. This reads pixels, with each colour resolved inside the canvas scope and painted
 * once on an offscreen canvas, so the comparison is against the exact RGB the browser produces for
 * that token rather than a hex written here.
 *
 * Three things, each with a control that makes it discriminate:
 * - the non-driving link is drawn in the link family's own hue;
 * - a waiting link carries a gap label, and it goes when `View ▾ ▸ Link gaps` is switched off. The
 *   label is text in the mark shade, so it is measured as the mark-shade ink that disappears with
 *   the switch (the chevrons, also mark shade, stay);
 * - an `SS + 2` link puts a dot on its predecessor's bar, and the same plan before that link has
 *   none;
 * - a link leaves its predecessor through the node (node-to-node links M2, ADR-0158): the vertical
 *   that crosses an empty lane runs up into the node's ring, not one gap east of it;
 * - a link runs round a name rather than through it where it can (links-and-labels M2, #393).
 */

/** A token's colour as the browser paints it, read inside the canvas scope. */
async function paintedRgb(page: Page, token: string): Promise<[number, number, number]> {
  return page.evaluate((name) => {
    const canvases = [...document.querySelectorAll('canvas')];
    const scene = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    scene.parentElement!.appendChild(probe);
    const css = getComputedStyle(probe).color;
    probe.remove();
    const off = document.createElement('canvas');
    off.width = 1;
    off.height = 1;
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, token);
}

interface Counts {
  /** Pixels within tolerance of each colour. */
  hits: number[];
  /** Mark-shade pixels flanked by bar green on both sides along the row: a dot on a bar. */
  dotsOnBars: number;
}

/** Counts, on the scene canvas, pixels near each of `colours`, and mark pixels sitting on a bar. */
async function countInk(
  page: Page,
  colours: readonly [number, number, number][],
  mark: [number, number, number],
  bars: readonly [number, number, number][],
  ground: [number, number, number],
): Promise<Counts> {
  return page.evaluate(
    ({ colours, mark, bars, ground }) => {
      const canvases = [...document.querySelectorAll('canvas')];
      const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      const ctx = canvas.getContext('2d')!;
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const near = (i: number, [r, g, b]: number[], tol: number): boolean =>
        (data[i + 3] ?? 0) > 200 &&
        Math.abs((data[i] ?? 0) - (r ?? 0)) <= tol &&
        Math.abs((data[i + 1] ?? 0) - (g ?? 0)) <= tol &&
        Math.abs((data[i + 2] ?? 0) - (b ?? 0)) <= tol;
      // A 1 px line is anti-aliased across two device pixels, so its ink is blended with the ground
      // and never exact. A pixel counts for a colour when it lies on the straight blend from the
      // ground to that colour, at least a third of the way along.
      const [gr, gg, gb] = ground;
      const onBlend = (i: number, [r = 0, g = 0, b = 0]: number[]): boolean => {
        const dr = r - gr;
        const dg = g - gg;
        const db = b - gb;
        const len2 = dr * dr + dg * dg + db * db;
        if (len2 === 0) return false;
        const pr = (data[i] ?? 0) - gr;
        const pg = (data[i + 1] ?? 0) - gg;
        const pb = (data[i + 2] ?? 0) - gb;
        const t = (pr * dr + pg * dg + pb * db) / len2;
        if (t < 0.35 || t > 1.1) return false;
        return Math.hypot(pr - t * dr, pg - t * dg, pb - t * db) < 10;
      };
      const hits = colours.map(() => 0);
      let dotsOnBars = 0;
      const reach = Math.round(4 * (window.devicePixelRatio || 1));
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          colours.forEach((c, k) => {
            if (onBlend(i, c)) hits[k]! += 1;
          });
          if (
            near(i, mark, 10) &&
            x - reach >= 0 &&
            x + reach < width &&
            bars.some(
              (b) =>
                near((y * width + x - reach) * 4, b, 24) &&
                near((y * width + x + reach) * 4, b, 24),
            )
          ) {
            dotsOnBars += 1;
          }
        }
      }
      return { hits, dotsOnBars };
    },
    { colours, mark, bars, ground },
  );
}

async function seedLink(
  page: Page,
  orgSlug: string,
  pred: string,
  succ: string,
  type: 'FS' | 'SS',
  lagDays: number,
): Promise<void> {
  const planId = openPlanId(page);
  const error = await page.evaluate(
    async ({ org, id, body }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/dependencies`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.ok ? null : `${String(response.status)} ${await response.text()}`;
    },
    {
      org: orgSlug,
      id: planId,
      body: { predecessorId: pred, successorId: succ, type, lagDays },
    },
  );
  if (error !== null) throw new Error(`seeding the ${type} link was rejected: ${error}`);
}

test.describe('NetPoint grammar — links', () => {
  test.setTimeout(240_000);

  test('a waiting link is drawn in the link hue and labelled with its gap, which is spoken too', async ({
    page,
  }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Link gaps');
    await ensurePen(page);
    // Piling drives Pour; Excavate finishes a week earlier, so Excavate → Pour is a NON-driving link
    // that waits. (Placing Pour late instead does not make a waiting link: the placement is not
    // logic, so Excavate → Pour stays driving and draws no gap, which is the rule, ADR-0154.)
    const made = await seedActivities(page, orgSlug, [
      { name: 'Excavate', laneIndex: 0, durationDays: 3 },
      { name: 'Piling', laneIndex: 1, durationDays: 10 },
      { name: 'Pour', laneIndex: 2, durationDays: 4 },
    ]);
    const [excavate, piling, pour] = made;
    if (!excavate || !piling || !pour) throw new Error('the fixture did not seed its activities');
    await seedDependency(page, orgSlug, excavate.id, pour.id);
    await seedDependency(page, orgSlug, piling.id, pour.id);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });

    const minor = await paintedRgb(page, '--canvas-link-minor');
    const mark = await paintedRgb(page, '--canvas-link-mark');
    const bar = await paintedRgb(page, '--canvas-bar');
    const ground = await paintedRgb(page, '--canvas');
    const on = await countInk(page, [minor, mark, bar], mark, [bar], ground);
    expect(on.hits[0], 'the waiting link is not in the link hue').toBeGreaterThan(30);
    expect(minor, 'the link hue is the bar green').not.toEqual(bar);

    // Switched off, the label goes and nothing else in the mark shade does. Measured before anything
    // is selected, and both sides with nothing selected: a selection re-inks its links in the
    // selection colour, chevrons included, which moves the count on its own (this journey's first
    // version passed with no label drawn at all for exactly that reason).
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const gaps = page.getByRole('checkbox', { name: 'Link gaps' });
    await expect(gaps, 'Link gaps defaults on (NetPoint grammar M3-T3)').toBeChecked();
    await gaps.uncheck();
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await countInk(page, [minor, mark, bar], mark, [bar], ground)).hits[1], {
        message: 'switching Link gaps off removed no mark-shade ink (no label was drawn)',
      })
      .toBeLessThan((on.hits[1] ?? 0) - 10);

    // The same fact, spoken, which does not depend on the switch: the Tier-2 summary names the tie,
    // its type and the gap in working days.
    const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
    const listbox = diagram.getByRole('listbox', { name: 'Activities in the diagram' });
    await listbox.focus();
    // Walk the listbox to Pour by keyboard; its order is the plan's, not asserted here.
    for (let i = 0; i < 3; i += 1) {
      if ((await diagram.getByRole('option', { name: /^Pour/, selected: true }).count()) > 0) break;
      await page.keyboard.press('ArrowDown');
    }
    await expect(diagram.getByRole('option', { name: /^Pour/, selected: true })).toHaveCount(1);
    await page.keyboard.press('i');
    const announcer = page.getByTestId('announcer');
    await expect(announcer).toHaveText(/slack to Excavate \(FS\) \d+ working days?/);
  });

  test('an SS link with a lag puts a dot where it joins its predecessor’s bar', async ({
    page,
  }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Attachment');
    await ensurePen(page);
    const made = await seedActivities(page, orgSlug, [
      { name: 'Frame', laneIndex: 0, durationDays: 10 },
      { name: 'Clad', laneIndex: 2, durationDays: 4 },
    ]);
    const [frame, clad] = made;
    if (!frame || !clad) throw new Error('the fixture did not seed its two activities');
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
    const mark = await paintedRgb(page, '--canvas-link-mark');
    // Frame is the critical chain here, so its bar is the critical ink; either bar ink counts.
    const bars = [
      await paintedRgb(page, '--canvas-bar'),
      await paintedRgb(page, '--destructive'),
      await paintedRgb(page, '--warning'),
    ];
    const ground = await paintedRgb(page, '--canvas');
    // The control: no link yet, so no mark-shade ink sits on a bar.
    expect((await countInk(page, [], mark, bars, ground)).dotsOnBars).toBe(0);

    await ensurePen(page);
    await seedLink(page, orgSlug, frame.id, clad.id, 'SS', 2);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached();
    await expect
      .poll(async () => (await countInk(page, [], mark, bars, ground)).dotsOnBars, {
        message: 'no attachment dot on Frame, two days in',
      })
      .toBeGreaterThan(0);
  });

  test('a link leaves its predecessor through the finish node, not beside it', async ({ page }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Node to node');
    await ensurePen(page);
    // Lane 1 is left empty, so the only ink between the two bars is the link's vertical. One-letter
    // names keep the name row clear of the node, which the probe below looks through.
    const made = await seedActivities(page, orgSlug, [
      { name: 'A', laneIndex: 0, durationDays: 5 },
      { name: 'B', laneIndex: 2, durationDays: 5 },
    ]);
    const [a, b] = made;
    if (!a || !b) throw new Error('the fixture did not seed its two activities');
    await seedLink(page, orgSlug, a.id, b.id, 'FS', 5);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
    const ground = await paintedRgb(page, '--canvas');
    const inks = [
      await paintedRgb(page, '--canvas-link'),
      await paintedRgb(page, '--canvas-link-minor'),
      await paintedRgb(page, '--destructive'),
      await paintedRgb(page, '--warning'),
    ];

    /**
     * Finds the link's vertical (the column with the longest run of link ink), then walks UP it
     * from the middle of that run. Leaving through the node, the link ink stops at the ring's
     * bottom rim, the ring's ground-filled interior follows, and then its top rim: a gap of about
     * the node's diameter with ink on both sides. The corridor router bent one gap east of the
     * node, so the same walk ends at the corner, with nothing above it.
     */
    const probe = await page.evaluate(
      ({ ground, inks }) => {
        const canvases = [...document.querySelectorAll('canvas')];
        const canvas = canvases.reduce((p, q) =>
          p.width * p.height >= q.width * q.height ? p : q,
        );
        const { width, height } = canvas;
        const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
        const dpr = window.devicePixelRatio || 1;
        const [gr, gg, gb] = ground;
        const at = (x: number, y: number): number => (y * width + x) * 4;
        const isGround = (i: number): boolean =>
          Math.abs((data[i] ?? 0) - gr) <= 6 &&
          Math.abs((data[i + 1] ?? 0) - gg) <= 6 &&
          Math.abs((data[i + 2] ?? 0) - gb) <= 6;
        const isLink = (i: number): boolean =>
          inks.some(([r, g, b]) => {
            const dr = r - gr;
            const dg = g - gg;
            const db = b - gb;
            const len2 = dr * dr + dg * dg + db * db;
            const pr = (data[i] ?? 0) - gr;
            const pg = (data[i + 1] ?? 0) - gg;
            const pb = (data[i + 2] ?? 0) - gb;
            const t = (pr * dr + pg * dg + pb * db) / len2;
            return t >= 0.5 && t <= 1.1 && Math.hypot(pr - t * dr, pg - t * dg, pb - t * db) < 12;
          });
        let best = { x: -1, top: 0, bottom: 0 };
        for (let x = 0; x < width; x += 1) {
          let run = 0;
          for (let y = 0; y < height; y += 1) {
            run = isLink(at(x, y)) ? run + 1 : 0;
            if (run > best.bottom - best.top) best = { x, top: y - run + 1, bottom: y };
          }
        }
        if (best.x < 0) return null;
        let y = Math.round((best.top + best.bottom) / 2);
        while (y > 0 && !isGround(at(best.x, y))) y -= 1;
        const gapStart = y;
        while (y > 0 && isGround(at(best.x, y))) y -= 1;
        return { run: (best.bottom - best.top) / dpr, gap: (gapStart - y) / dpr, above: y > 0 };
      },
      { ground, inks },
    );
    expect(probe, 'no link vertical was found').not.toBeNull();
    expect(probe!.run, 'the vertical is too short to be the link').toBeGreaterThan(40);
    // The node's interior: 15 px across less its rim, so 8–16 px of ground with ink above it.
    expect(probe!.above, 'nothing above the link: it turned at a corner').toBe(true);
    expect(probe!.gap).toBeGreaterThan(6);
    expect(probe!.gap).toBeLessThan(18);
  });

  /**
   * **Links-and-labels M2 (#393): a link runs round a name where it can.** A → B leaves A's finish
   * node and has two one-bend shapes, both through no bar: down first (through lane 1) or along
   * first (lane 0's centre line, then down into B). Text-blind, the router took the first by
   * candidate order, and here it runs straight through the long name of M, the activity between
   * them. Reading text, it takes the second.
   *
   * Text is found as ink: connected runs of dark, unsaturated pixels no taller than a line of text,
   * so a grid rule cannot pass for a name. The assertion is that no link ink falls inside any of
   * them; the controls are that the link is drawn and that M's name is found at all.
   */
  test('a link runs round a name rather than through it where it can', async ({ page }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Round the name');
    await ensurePen(page);
    const made = await seedActivities(page, orgSlug, [
      { name: 'A', laneIndex: 0, durationDays: 3 },
      {
        name: 'Temporary works design and approval by the engineer',
        laneIndex: 1,
        durationDays: 1,
      },
      { name: 'B', laneIndex: 2, durationDays: 4 },
    ]);
    const [a, , b] = made;
    if (!a || !b) throw new Error('the fixture did not seed its activities');
    await seedLink(page, orgSlug, a.id, b.id, 'FS', 8);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
    await pickZoomPreset(page, 'Week');
    // The data-date line is a dark vertical through every row: off, so it is not read as text.
    const view = page.getByRole('button', { name: 'View', exact: true });
    if ((await view.getAttribute('aria-expanded')) !== 'true') await view.click();
    await page.getByRole('checkbox', { name: 'Data date line', exact: true }).uncheck();
    await page.keyboard.press('Escape');

    const ground = await paintedRgb(page, '--canvas');
    const inks = [
      await paintedRgb(page, '--canvas-link'),
      await paintedRgb(page, '--canvas-link-minor'),
      await paintedRgb(page, '--canvas-link-mark'),
      await paintedRgb(page, '--destructive'),
      await paintedRgb(page, '--warning'),
    ];
    const read = (): Promise<{
      link: number;
      widest: number;
      boxes: number;
      through: number;
      debug: string;
    }> =>
      page.evaluate(
        ({ ground, inks }) => {
          const canvases = [...document.querySelectorAll('canvas')];
          const canvas = canvases.reduce((p, q) =>
            p.width * p.height >= q.width * q.height ? p : q,
          );
          const { width, height } = canvas;
          const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
          const dpr = window.devicePixelRatio || 1;
          const [gr, gg, gb] = ground;
          // The scene canvas is transparent where nothing is drawn (the ground is painted beneath
          // it), so an anti-aliased edge has a partial alpha: every pixel is judged as it
          // composites over the ground, which is what a reader sees.
          const rgb = (i: number): [number, number, number] => {
            const a = (data[i + 3] ?? 0) / 255;
            return [
              (data[i] ?? 0) * a + gr * (1 - a),
              (data[i + 1] ?? 0) * a + gg * (1 - a),
              (data[i + 2] ?? 0) * a + gb * (1 - a),
            ];
          };
          const dark = (i: number): boolean => {
            const [r, g, b] = rgb(i);
            // Anti-aliased grey text: most of a glyph's pixels are mid-grey, not dark (measured on
            // this journey's first red run, where a sum under 450 found only the stems).
            return r + g + b < 600 && Math.max(r, g, b) - Math.min(r, g, b) < 30;
          };
          const isLink = (i: number): boolean => {
            const [cr, cg, cb] = rgb(i);
            return inks.some(([r, g, bl]) => {
              const dr = r - gr;
              const dg = g - gg;
              const db = bl - gb;
              const len2 = dr * dr + dg * dg + db * db;
              if (len2 === 0) return false;
              const pr = cr - gr;
              const pg = cg - gg;
              const pb = cb - gb;
              const t = (pr * dr + pg * dg + pb * db) / len2;
              return (
                t >= 0.35 && t <= 1.1 && Math.hypot(pr - t * dr, pg - t * dg, pb - t * db) < 12
              );
            });
          };
          // Text boxes: dark pixels joined across a word's letter gaps, no taller than one line.
          const seen = new Uint8Array(width * height);
          const reachX = Math.round(4 * dpr);
          const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const k = y * width + x;
              if (seen[k] || !dark(k * 4)) continue;
              const box = { x0: x, x1: x, y0: y, y1: y };
              const stack = [k];
              seen[k] = 1;
              while (stack.length > 0) {
                const at = stack.pop()!;
                const px = at % width;
                const py = (at - px) / width;
                box.x0 = Math.min(box.x0, px);
                box.x1 = Math.max(box.x1, px);
                box.y0 = Math.min(box.y0, py);
                box.y1 = Math.max(box.y1, py);
                for (let dy = -1; dy <= 1; dy += 1) {
                  for (let dx = -reachX; dx <= reachX; dx += 1) {
                    const nx = px + dx;
                    const ny = py + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const n = ny * width + nx;
                    if (seen[n] || !dark(n * 4)) continue;
                    seen[n] = 1;
                    stack.push(n);
                  }
                }
              }
              const h = (box.y1 - box.y0 + 1) / dpr;
              const w = (box.x1 - box.x0 + 1) / dpr;
              if (h >= 4 && h <= 16 && w >= 4) boxes.push(box);
            }
          }
          let link = 0;
          let through = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              if (!isLink((y * width + x) * 4)) continue;
              link += 1;
              if (boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)) through += 1;
            }
          }
          const widest = Math.max(0, ...boxes.map((b) => (b.x1 - b.x0 + 1) / dpr));
          const top = [...boxes]
            .sort((p, q) => q.x1 - q.x0 - (p.x1 - p.x0))
            .slice(0, 6)
            .map((b) => [b.x0, b.x1, b.y0, b.y1]);
          return {
            link,
            widest,
            boxes: boxes.length,
            through,
            debug: JSON.stringify({ dpr, width, height, n: canvases.length, top }),
          };
        },
        { ground, inks },
      );
    // The zoom preset and the switch repaint on the next frame: wait for the settled picture, in
    // which M's long name is one run of text (this journey's second red run read the frame before).
    await expect
      .poll(async () => (await read()).widest, { message: 'M’s name was not found as text' })
      .toBeGreaterThan(150);
    const got = await read();
    // The controls: the link is drawn, and M's long name is found as text.
    expect(got.link, 'no link ink on the canvas').toBeGreaterThan(50);
    expect(got.widest, `M’s name was not found as text ${got.debug}`).toBeGreaterThan(150);
    expect(got.through, `link ink inside a name or date ${got.debug}`).toBe(0);
  });
});
