import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { EXPORT_TOP_BAND } from '../src/features/tsld/export/export-image';

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

/**
 * The reserved title strip, which carries a generated date and the plan's name. Never sampled.
 *
 * **Imported rather than restated**, and scaled by the device pixel ratio the export rasterises
 * at. It was a literal 110 against a real `EXPORT_TOP_BAND` of 96 — safe only because this
 * config runs at `deviceScaleFactor: 1`, and at dpr 2 the band is 192 raster rows while 110 would
 * have sampled title text into the colour counts. A second copy of a constant, wrong by 14 and
 * silently right for one reason.
 */
const TITLE_BAND_PX = EXPORT_TOP_BAND;

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
    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
      { name: 'Blind and reinforce', laneIndex: 2, durationDays: 16 },
    ]);
    // **Two links, deliberately, and across lanes.** The fixture had none, so `linkRouting` and
    // `timeTrueLinks` — two of the seven layers this milestone restored — were unassertable on it,
    // and ADR-0065 is the sharpest instance of the defect: a line drawn through an unrelated bar
    // makes the reader disprove a relationship the picture appears to assert. A journey that
    // cannot see a link cannot see that.
    await linkActivities(page, orgSlug, seeded[0]!.id, seeded[1]!.id);
    await linkActivities(page, orgSlug, seeded[1]!.id, seeded[2]!.id);
    await recalculate(page, orgSlug);

    /**
     * **Switch the month band ON, because it is no longer the default** (ADR-0109 D4).
     *
     * The band used to be on out of the box, so the export inherited it and the assertion below
     * came free. The product owner's verdict on the shipped diagram was that a second ground under
     * a wall of bars is noise, so it now defaults off with its `View ▸ Structure` switch kept.
     *
     * That is a decision about the DEFAULT, not about whether the export composes the layer — and
     * composing it is precisely what this journey exists to prove (TECH_DEBT #164: the export
     * carried six of the canvas's scene keys and the picture a planner sent out was missing layers
     * the screen had). Weakening the assertion to match the new default would forfeit that, so the
     * journey turns the band on and keeps asking the harder question.
     */
    await page.getByRole('button', { name: 'View', exact: true }).click();
    // `checkbox`, NOT `menuitemcheckbox`: the View surface is a disclosure popover of grouped
    // checkboxes rather than a menu, which the page snapshot settled after the first attempt spent
    // four minutes timing out on the wrong role. `exact: true` on the trigger matters too — the
    // deck's group caption is "View commands" and a loose match finds both.
    const monthBands = page.getByRole('checkbox', { name: 'Month bands' });
    await expect(monthBands, 'Month bands should default OFF (ADR-0109 D4)').not.toBeChecked();
    await monthBands.check();
    await page.keyboard.press('Escape');

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

    // ── The ground layers, asserted SEPARATELY rather than counted.
    //
    // A count cannot say which layer is present, and that is not academic: with `>= 2` and three
    // candidate tones, dropping `monthBands` alone still leaves the wash and its hatch, so the
    // assertion passes while a restored layer is missing again. Each band is therefore named by
    // the lightness range it occupies — a range, not a hex, so a re-value moves within it and only
    // a layer's absence fails.
    const toneShare = (lo: number, hi: number): number =>
      stats.top
        .filter(({ colour }) => {
          const mean =
            colour
              .split(',')
              .map(Number)
              .reduce((a, b) => a + b, 0) / 3;
          return mean > lo && mean <= hi;
        })
        .reduce((sum, { n }) => sum + n, 0) / stats.total;

    // The month band sits just off paper and the non-working wash a step below it. A third tone —
    // the diagonal hatch over the wash — was here until ADR-0109 D4 removed it: in the product
    // owner's screenshot it was the single loudest element on the diagram, a texture competing with
    // the bars it sat behind. The wash it decorated is now a real value rather than a 0.007
    // difference the hatch was carrying, so the range below still names a layer that exists.
    // Measured at the time of writing: band 246.7, wash 242.7, paper 255.
    expect(toneShare(244, 254), 'no month band in the exported picture').toBeGreaterThan(0.02);
    expect(toneShare(236, 244), 'no non-working wash in the exported picture').toBeGreaterThan(
      0.02,
    );

    // ── The links are in the picture. Dark ink well below any ground tone, which on this fixture
    // can only be a bar fill, a label or a link — and the bars are counted separately above.
    const inkShare = toneShare(0, 200);
    expect(inkShare, 'no dark ink at all — bars and links are both missing').toBeGreaterThan(0.02);
  });
});
