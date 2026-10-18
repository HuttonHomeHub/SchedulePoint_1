import { type Page } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  onboard,
  openProject,
  recalculate,
  seedActivities,
  seedDependency,
} from '../e2e-arrange/support';
import { pickZoomPreset } from '../e2e-search-nav/support';
import { expect, test } from '../e2e-support/test';

import { openReferencePlan, paintedRgb } from './support';

/**
 * **Diagram mark contrast on the real canvas** (`docs/specs/diagram-mark-contrast/`, ADR-0199,
 * TECH_DEBT #368): no ordinary link is stronger than the ordinary bar it joins.
 *
 * `token-contrast.test.ts` holds the rule against the stylesheet. This holds it against **what the
 * browser paints**, which is the one thing that gate cannot see: a colour outside the sRGB gamut is
 * clamped by the browser (`palette.ts` records the matrix once asserting a mapping the browser did
 * not perform), and a token the painter did not read paints nothing at all. So each ink is resolved
 * inside the canvas scope, painted once on an offscreen canvas, and the contrast is computed here
 * from the RGB that comes back.
 *
 * Two things, each able to fail on its own:
 * - the ordering and the 3:1 floors hold on the painted inks, on the ground, the month band and
 *   paper;
 * - the diagram really draws with those inks: a plan with an ordinary bar and an ordinary driving
 *   link has pixels of both on the scene canvas. A painter that kept a stale colour passes the
 *   first and fails this.
 *
 * Screenshots of the diagram at three detail tiers are attached to the run for the reviewers
 * (ux-reviewer and accessibility-reviewer judge them; nobody is asked to look on a device).
 */

type Rgb = [number, number, number];

/** WCAG 2.x relative luminance of an 8-bit sRGB colour. */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Paper is white (`--print` is `oklch(1 0 0)`, outside the canvas scope, so it is not read there). */
const PAPER: Rgb = [255, 255, 255];

/** Pixels on the scene canvas within `tolerance` of each colour, per channel. */
async function census(page: Page, colours: readonly Rgb[], tolerance: number): Promise<number[]> {
  return page.evaluate(
    ({ colours, tolerance }) => {
      const canvases = [...document.querySelectorAll('canvas')];
      const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const hits = colours.map(() => 0);
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i + 3] ?? 0) <= 200) continue;
        colours.forEach(([r, g, b], k) => {
          if (
            Math.abs((data[i] ?? 0) - (r ?? 0)) <= tolerance &&
            Math.abs((data[i + 1] ?? 0) - (g ?? 0)) <= tolerance &&
            Math.abs((data[i + 2] ?? 0) - (b ?? 0)) <= tolerance
          ) {
            hits[k]! += 1;
          }
        });
      }
      return hits;
    },
    { colours, tolerance },
  );
}

test.describe('Diagram mark contrast', () => {
  test.setTimeout(240_000);

  test('the painted bar is at least as strong as the painted ordinary links, and is drawn', async ({
    page,
  }, testInfo) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Mark contrast');
    await ensurePen(page);
    // Alone and long, A is the critical path. C and D finish about thirty days short of it, so the
    // link between them is an ordinary (neither critical nor near-critical) DRIVING link, and the
    // two bars are ordinary bars: exactly the pair the rule is about.
    const made = await seedActivities(page, orgSlug, [
      { name: 'A', laneIndex: 0, durationDays: 40 },
      { name: 'C', laneIndex: 1, durationDays: 5 },
      { name: 'D', laneIndex: 2, durationDays: 5 },
    ]);
    const [, c, d] = made;
    if (!c || !d) throw new Error('the fixture did not seed its activities');
    await seedDependency(page, orgSlug, c.id, d.id);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });

    const bar = await paintedRgb(page, '--canvas-bar');
    const driving = await paintedRgb(page, '--canvas-link');
    const minor = await paintedRgb(page, '--canvas-link-minor');
    const grounds: [string, Rgb][] = [
      ['--canvas', await paintedRgb(page, '--canvas')],
      ['--canvas-band', await paintedRgb(page, '--canvas-band')],
      ['paper', PAPER],
    ];

    for (const [name, ground] of grounds) {
      const onBar = contrast(bar, ground);
      for (const [link, ink] of [
        ['--canvas-link', driving],
        ['--canvas-link-minor', minor],
      ] as const) {
        const onLink = contrast(ink, ground);
        expect(
          onBar,
          `painted --canvas-bar is ${onBar.toFixed(2)}:1 on ${name} but ${link} is ${onLink.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(onLink);
        expect(
          onLink,
          `painted ${link} on ${name} is ${onLink.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      }
      expect(
        onBar,
        `painted --canvas-bar on ${name} is ${onBar.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }

    // The painter, not only the stylesheet: both inks are on the canvas. The bar is 6 px thick and
    // the driving link 2 px, so a full-strength pixel of each exists whatever the sub-pixel offset.
    const [barPixels, linkPixels] = await census(page, [bar, driving], 12);
    expect(barPixels, 'no pixel of the ordinary bar ink on the canvas').toBeGreaterThan(200);
    expect(linkPixels, 'no pixel of the ordinary driving-link ink on the canvas').toBeGreaterThan(
      15,
    );

    const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
    await testInfo.attach('mark-contrast-default', {
      body: await diagram.screenshot(),
      contentType: 'image/png',
    });
    for (const level of ['Week', 'Year']) {
      await pickZoomPreset(page, level);
      await testInfo.attach(`mark-contrast-${level.toLowerCase()}`, {
        body: await diagram.screenshot(),
        contentType: 'image/png',
      });
    }
  });

  test('the reference plan paints the ordinary bar ink, and its pictures are attached', async ({
    page,
  }, testInfo) => {
    await openReferencePlan(page);
    const bar = await paintedRgb(page, '--canvas-bar');
    const [barPixels] = await census(page, [bar], 12);
    expect(barPixels, 'the reference plan paints no ordinary bar ink').toBeGreaterThan(200);

    const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
    await testInfo.attach('mark-contrast-reference-default', {
      body: await diagram.screenshot(),
      contentType: 'image/png',
    });
    for (const level of ['Week', 'Year']) {
      await pickZoomPreset(page, level);
      await testInfo.attach(`mark-contrast-reference-${level.toLowerCase()}`, {
        body: await diagram.screenshot(),
        contentType: 'image/png',
      });
    }
  });
});
