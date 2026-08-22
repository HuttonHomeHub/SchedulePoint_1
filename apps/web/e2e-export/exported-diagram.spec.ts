import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **The exported diagram, decoded and measured** (TECH_DEBT #164, W3-M2).
 *
 * This is the only instrument in the repository that can see the defect this milestone fixes, and
 * the reason is structural rather than an oversight: **every export unit suite runs in jsdom**,
 * where `getComputedStyle` returns nothing and `resolvePrintPalette` takes its fallbacks. They
 * exercise the branch that is correct and can never reach the branch that ships. So the export
 * dropped seven default-on layers — weekends, month bands, the gridline tiers, time-true link
 * anchoring with arrowheads, the bar refresh, orthogonal link routing and the fractional Today
 * marker — for months, behind a green suite, in the file a planner sends to someone who was not in
 * the room.
 *
 * It therefore asserts the **artefact**: it presses the real menu item, catches the real download,
 * decodes the PNG and reads pixels back.
 *
 * **No stored golden, deliberately.** `render-export-image.ts` draws the generation date into the
 * title band, so a byte- or image-comparison against a checked-in reference would fail every day
 * — and ADR-0058 records that a gate which fails daily gets deleted rather than fixed. The
 * assertions are therefore *properties of the picture* (a month band exists; weekend columns are
 * shaded; the ground is light) rather than an image identity.
 *
 * **Verified red against the pre-fix state**, which was trivially available: before this milestone
 * every pixel in the diagram region that was not a bar or a gridline came out pure white, so the
 * "not overwhelmingly white" and "a band tone exists" assertions both failed. Measured after:
 * white 30%, band #f6f7f9 27.2%, wash #f2f3f5 19.5%, hatch #e3e6ea.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 7300;

/** The reserved title strip, which carries a generated date and the plan's name. Never sampled. */
const TITLE_BAND_PX = 110;

test.describe('The exported diagram', () => {
  test('is painted on light paper and carries the ground layers the screen shows', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Export journey');
    await ensurePen(page);
    // Distinct lanes deliberately: unconstrained activities all start at the data date, and an
    // earlier harness in this repository had them collide in lane 0 and assert against a picture
    // of one bar. Long enough, together, to span more than one month so the band alternation is
    // actually in frame.
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
      { name: 'Blind and reinforce', laneIndex: 2, durationDays: 16 },
    ]);
    await recalculate(page, orgSlug);

    // ── The entry point IS the subject (ADR-0081). By role and accessible name, never by copy or
    // a CSS selector — ADR-0091 M7's rule, after three journeys broke on a label change.
    await page
      .getByRole('button', { name: /share.*export/i })
      .first()
      .click();
    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }).click();
    const file = await download;
    const path = await file.path();
    expect(path, 'the export produced no file').toBeTruthy();

    // ── Decode the real artefact in the browser and read its pixels back. `createImageBitmap` +
    // `OffscreenCanvas` rather than a Node image library, so the bytes are decoded by the same
    // engine that produced them.
    const bytes = (await import('node:fs')).readFileSync(path);
    const stats = await page.evaluate(
      async ({ base64, bandPx }) => {
        const binary = atob(base64);
        const buf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) buf[i] = binary.charCodeAt(i);
        const bitmap = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        const counts = new Map<string, number>();
        let total = 0;
        let luminanceSum = 0;
        for (let y = bandPx; y < bitmap.height; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            const i = (y * bitmap.width + x) * 4;
            const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            luminanceSum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
            total += 1;
          }
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        return {
          width: bitmap.width,
          height: bitmap.height,
          total,
          meanChannel: luminanceSum / total,
          white: counts.get('255,255,255') ?? 0,
          top: top.map(([colour, n]) => ({ colour, n })),
          distinct: counts.size,
        };
      },
      { base64: bytes.toString('base64'), bandPx: TITLE_BAND_PX },
    );

    await testInfo.attach('exported-diagram.png', { path: path, contentType: 'image/png' });
    testInfo.annotations.push({ type: 'measured', description: JSON.stringify(stats.top) });

    // ── Paper is light. The defect this whole thread began with was a near-black diagram panel
    // inside white paper chrome, because the print ground resolved from the app's live theme.
    //
    // Asserted on the DOMINANT colour rather than the region's mean, and the difference is not
    // pedantry: the first version used a mean-channel floor and went red on this very fixture
    // once the bars were made long enough to span two months, because three thick bars in a short
    // raster drag the average down. A mean measures how much ink is on the page; the property
    // wanted here is what the GROUND is, and only the mode expresses that. An assertion tuned to
    // a fixture fails the next fixture and teaches nothing.
    const [dominant] = stats.top;
    const dominantMean =
      (dominant?.colour.split(',').map(Number) ?? [0, 0, 0]).reduce((a, b) => a + b, 0) / 3;
    expect(
      dominantMean,
      `the diagram's dominant tone is ${dominant?.colour} — that is not light paper`,
    ).toBeGreaterThan(225);

    // ── The ground layers exist. Before this milestone the region was pure white wherever it was
    // not a bar or a gridline, so this is the assertion that was red.
    expect(
      stats.white / stats.total,
      'the diagram region is almost entirely bare paper — the ground layers are missing',
    ).toBeLessThan(0.75);

    // ── At least two distinct light ground tones besides paper: the month band and the
    // non-working wash. Counted rather than named, because naming a hex would re-create the
    // brittle golden this suite exists to avoid.
    const lightGrounds = stats.top.filter(({ colour, n }) => {
      const [r, g, b] = colour.split(',').map(Number) as [number, number, number];
      const mean = (r + g + b) / 3;
      return mean > 225 && mean < 255 && n / stats.total > 0.02;
    });
    expect(
      lightGrounds.length,
      `expected a month band and a non-working wash beside paper; saw ${JSON.stringify(stats.top)}`,
    ).toBeGreaterThanOrEqual(2);
  });
});
