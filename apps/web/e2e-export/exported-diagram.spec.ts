import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { EXPORT_MARKER_ROW, EXPORT_TOP_BAND } from '../src/features/tsld/export/export-image';

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
 * The reserved chrome above the diagram: the title strip (name + generated date + legend) and,
 * since fix-slice M-F, the axis-marker row under it. The DIAGRAM sampling starts below both; the
 * marker row itself is sampled separately for its own assertion.
 *
 * **Imported rather than restated**, and scaled by the device pixel ratio the export rasterises
 * at. The title constant was once a literal 110 against a real `EXPORT_TOP_BAND` of 96 — safe
 * only because this config runs at `deviceScaleFactor: 1`, and at dpr 2 the band is 192 raster
 * rows while 110 would have sampled title text into the colour counts. A second copy of a
 * constant, wrong by 14 and silently right for one reason.
 */
const TITLE_BAND_PX = EXPORT_TOP_BAND;
const RESERVED_PX = EXPORT_TOP_BAND + EXPORT_MARKER_ROW;

/**
 * Assert that one print surface, under **print media**, computes the product's own face.
 *
 * `emulateMedia({ media: 'print' })` makes the browser evaluate `@media print`, so the computed
 * value is what paper actually gets — and it is restored in a `finally`, or every later test in
 * this serial file inherits print media. One helper for both surfaces rather than two copies: the
 * printed diagram and the printed programme are the same assertion about two roots, and the reason
 * this epic exists is that one of the pair got a decision the other did not.
 *
 * **Verified red before the fix**: both returned a list beginning `Inter`.
 */
/**
 * Open `Share & export ▾ → Print…` and wait for the print document to mount.
 *
 * **It asserts the item is not shaded before clicking, and that is the whole point of the helper.**
 * `Print…` is `disabled={!ctx.hasDiagram}`, and `hasDiagram` reads the activities query — so it is
 * false until that query resolves. `Menu`'s items are shaded with `aria-disabled` rather than the
 * native attribute (ADR-0082, so a `disabledReason` stays keyboard-reachable) and `onSelect`
 * returns early, which makes a Playwright click on a shaded item a **silent no-op**: no error, no
 * retry, just thirty seconds of waiting for a container nothing asked for.
 *
 * That is exactly how this failed in CI and not on my machine. The Gantt half reloads the route,
 * and a runner is slow enough that the treegrid renders — empty — before the activities arrive, so
 * the click landed on a shaded item. Waiting for a row is the cause; asserting the item is the
 * guard, and it fails in one second naming the real reason instead of timing out on a symptom.
 */
async function openPrintDocument(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /share.*export/i })
    .first()
    .click();
  const print = page.getByRole('menuitem', { name: 'Print…', exact: true });
  await expect(
    print,
    'Print… is shaded — the plan has no computed diagram yet, so this click would do nothing',
  ).not.toHaveAttribute('aria-disabled', 'true');
  await print.click();
  // `attached`, not the default visibility: the container is `display: none` until the print
  // stylesheet shows it.
  //
  // **Racing the banner is the diagnosis, not belt-and-braces.** The TSLD path builds the
  // whole-plan PNG first and only mounts on success; a build failure is caught, announced and
  // rendered as a `role="alert"`. Without this the assertion waits the full thirty seconds, three
  // times, and reports "element(s) not found" — which names the symptom and hides the cause, and
  // is exactly what a CI run cost before this was here.
  const container = page.locator('.tsld-print-container');
  const banner = page.getByRole('alert').first();
  const attached = await container
    .waitFor({ state: 'attached', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (attached) return;

  // **Report which silent return it was, and gather it BEFORE throwing.** `printDiagram` has three
  // exits that render nothing — the flag is off, `printing` is already true, or
  // `buildDiagramImage` returned null because the canvas handle or the data date was absent —
  // and only the fourth, a rejected build, shows a banner. The discriminator is the live region:
  // the TSLD path announces "Preparing the diagram to print…" **after** the build starts, so its
  // absence puts the return before that line and its presence with no container puts the failure
  // after it.
  //
  // Every read here is short-timeout and `.catch`ed. The first version raced two 30 s waits and
  // then evaluated, and when the test hit its own timeout the evaluate reported "Target page …
  // has been closed" — a diagnostic that replaced the diagnosis with an artefact of itself.
  const said = await banner.textContent({ timeout: 2000 }).catch(() => null);
  const state = await page
    .evaluate(() => ({
      announced: [...document.querySelectorAll('[role="status"], [aria-live]')]
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean)
        .join(' | '),
      canvases: document.querySelectorAll('canvas').length,
      containers: document.querySelectorAll('.tsld-print-container').length,
    }))
    .catch(() => null);
  throw new Error(
    (said
      ? `Print… was clicked and the app answered "${said.trim()}" instead of mounting a print document`
      : 'Print… was clicked, no print document mounted, and the app reported nothing') +
      (state
        ? ` — live region: "${state.announced}"; canvases: ${state.canvases}; containers: ${state.containers}`
        : ' — and the page closed before its state could be read'),
  );
}

async function expectPaperFace(page: Page, selector: string, what: string): Promise<void> {
  await page.emulateMedia({ media: 'print' });
  try {
    const family = await page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);

    expect(
      family,
      `the ${what} computes \`${family}\` — paper must lead with the product's own face`,
    ).toMatch(/^"?IBM Plex Sans"?/);
    expect(
      family,
      `the ${what} names a face with no @font-face and no file in this repository`,
    ).not.toContain('Inter');
  } finally {
    await page.emulateMedia({ media: null });
  }
}

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
      async ({ base64, titlePx, bandPx }) => {
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
        // The axis-marker row, sampled on its own: dark chip pixels (the data-date chip fills in
        // the print foreground) against its paper ground.
        let markerDark = 0;
        for (let y = titlePx; y < bandPx; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            const i = (y * bitmap.width + x) * 4;
            if ((data[i]! + data[i + 1]! + data[i + 2]!) / 3 < 128) markerDark += 1;
          }
        }
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
          markerDark,
          total,
          meanChannel: luminanceSum / total,
          white: counts.get('255,255,255') ?? 0,
          top: top.map(([colour, n]) => ({ colour, n })),
          distinct: counts.size,
        };
      },
      { base64: bytes.toString('base64'), titlePx: TITLE_BAND_PX, bandPx: RESERVED_PX },
    );

    await testInfo.attach('exported-diagram.png', { path: path, contentType: 'image/png' });
    testInfo.annotations.push({ type: 'measured', description: JSON.stringify(stats.top) });

    // ── The marker row names the rules (fix-slice M-F, #175). Before it, the data-date and
    // Today verticals always reached the export and their labels never did — two unexplained
    // rules in the deliverable. The chip is the print foreground on paper, so "dark pixels exist
    // in the reserved row" is the treatment's signature; on this fixture the data date IS today
    // (a new plan pins plannedStart to today), so the single merged chip is what should print,
    // and ~1,000+ dark pixels is its measured footprint (chip fill + ink). The printed diagram
    // inherits this by construction — PrintSurface embeds the SAME blob (PrintSurface.tsx) — so
    // there is deliberately no second assertion for it.
    expect(
      stats.markerDark,
      'no marker chip in the reserved axis-marker row — the export axis marks are missing',
    ).toBeGreaterThan(200);

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

  /**
   * **The exported picture is DRAWN in the product's typeface**
   * (`docs/specs/typeface-outward-artefacts/`, M2-U1; the paper half is the test below).
   *
   * Two artefacts leave the product carrying type that no cascade governs, and both had received
   * none of the face decision the product owner made on 2026-08-24:
   *
   * - the **printed document** declared `font-family: 'Inter', …` in `PrintSurface.css` and
   *   `GanttPrintSurface.css` — a face with no `@font-face` and no file in `src/assets/fonts/` — so
   *   paper fell through to `system-ui` while the diagram drawn inside it was IBM Plex Sans. One
   *   artefact, two typefaces, in the file a planner hands to a QS;
   * - the **exported PNG's title band** set its four fonts as bare `system-ui`, so the band around
   *   the picture was drawn in whatever the reader's machine happened to resolve.
   *
   * **Only a browser can see either**, which is why both assertions are here. Every export and
   * print unit suite runs in jsdom, where `getComputedStyle` resolves nothing and `measureText`
   * returns a stub — the same structural blindness recorded at the top of this file for the
   * picture's layers. And the structural gate (`styles/typeface-reach.structural.test.ts`) cannot
   * see them either: it proves the STRINGS are right and can never prove a face resolved.
   *
   * **The raster assertion is about the FACE, never a width** (M1-T1's closing note). It measures
   * this plan's name in-page at the export's own font shorthand and at the face the band used to
   * name, then reads the title's ink extent out of the decoded PNG and asserts it is nearer the
   * first than the second. A pixel width would be an assertion about IBM Plex Sans's metrics on
   * one machine; "nearer this face than that one" is an assertion about which face was used.
   *
   * It refuses to pass when it cannot discriminate — `document.fonts.check()` must report the face
   * available, and the two candidates must measure at least 8 px apart. That is M1-T1's lesson
   * rather than caution: the first run of that probe reported a delta of **exactly zero**, because
   * an `OffscreenCanvas` created inside `page.evaluate` gets no web face unless one is loaded, so
   * both branches measured one fallback. A test that passes for either face is worse than none.
   * Measured on this fixture's name once the guards were added: 66.32 px apart, eight times the
   * bar — so the wrong face was also laying the band out ~19 % wider.
   */
  test('the exported picture is drawn in the product typeface', async ({ page }) => {
    test.setTimeout(240_000);
    // Its own fixture and its own plan: this file gives each test a fresh `page`, and both a print
    // document and an export need a plan behind them. One activity is enough — neither assertion
    // is about what the diagram contains. The name is deliberately long, because the two candidate
    // faces separate in proportion to the string.
    const planName = 'Foundations and superstructure programme';
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, planName);
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
    await recalculate(page, orgSlug);

    // ── The raster. Read the CSS-px geometry straight out of the picture, which is sound only at
    // dpr 1 — so that is asserted rather than assumed. This file already depends on it silently
    // (`TITLE_BAND_PX` is used as a count of raster rows); a `deviceScaleFactor` change in the
    // config should fail loudly here instead of halving every measurement below.
    expect(
      await page.evaluate(() => globalThis.devicePixelRatio),
      'this scan reads the raster in CSS px, which holds only at deviceScaleFactor 1',
    ).toBe(1);

    const candidates = await page.evaluate(async (name) => {
      // `fonts.ready` then an explicit `load`, then `check` — see the docblock. Measured on a real
      // `<canvas>` rather than an `OffscreenCanvas`, which is what the export draws into.
      await document.fonts.ready;
      await document.fonts.load("600 16px 'IBM Plex Sans'");
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      // The INK box, not the advance width: that is what a pixel scan of the raster measures, so
      // comparing an advance against it would bias every reading toward the narrower candidate.
      const inkWidth = (font: string): number => {
        ctx.font = font;
        const m = ctx.measureText(name);
        return (m.actualBoundingBoxLeft ?? 0) + (m.actualBoundingBoxRight ?? m.width);
      };
      return {
        available: document.fonts.check("600 16px 'IBM Plex Sans'"),
        plex: inkWidth(
          "600 16px 'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        ),
        // What the four export-band constants named before this milestone, verbatim.
        system: inkWidth("600 16px system-ui, -apple-system, 'Segoe UI', sans-serif"),
      };
    }, planName);

    expect(
      candidates.available,
      'the product face is not loaded in this page, so neither branch below measures it — the ' +
        'reading would be one fallback twice',
    ).toBe(true);
    expect(
      Math.abs(candidates.plex - candidates.system),
      `the two candidate faces measure ${candidates.plex} and ${candidates.system} — under 8 px ` +
        'apart, this assertion cannot tell them apart and would pass for either',
    ).toBeGreaterThanOrEqual(8);

    await page
      .getByRole('button', { name: /share.*export/i })
      .first()
      .click();
    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }).click();
    const path = await (await download).path();
    expect(path, 'the export produced no file').toBeTruthy();

    const bytes = (await import('node:fs')).readFileSync(path);
    const ink = await page.evaluate(
      async ({ base64, top, bottom }) => {
        const binary = atob(base64);
        const buf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) buf[i] = binary.charCodeAt(i);
        const bitmap = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        let left = Number.POSITIVE_INFINITY;
        let right = -1;
        let dark = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            const i = (y * bitmap.width + x) * 4;
            if ((data[i]! + data[i + 1]! + data[i + 2]!) / 3 >= 128) continue;
            dark += 1;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
        return { left, right, dark, imageWidth: bitmap.width };
      },
      // The title's own rows and nothing else's. `render-export-image.ts` draws the title on the
      // baseline at y = 28 at 16 px, the subtitle at 48 and the legend at 68, on an opaque band —
      // so 14…33 contains the title's glyphs and no other ink in the picture.
      { base64: bytes.toString('base64'), top: 14, bottom: 33 },
    );

    expect(ink.dark, 'no title ink in the exported band at all').toBeGreaterThan(50);
    expect(
      ink.right,
      'the title runs to the raster edge — it is clipped, and a clipped title measures the same ' +
        'in both faces',
    ).toBeLessThan(ink.imageWidth - 8);

    const drawn = ink.right - ink.left + 1;
    expect(
      Math.abs(drawn - candidates.plex),
      `the exported title measures ${drawn} px, against ${candidates.plex} for the product face ` +
        `and ${candidates.system} for the one the band used to name — the band was not drawn in ` +
        'the product face',
    ).toBeLessThan(Math.abs(drawn - candidates.system));
  });

  /**
   * **Paper, in its own test and its own fixture, deliberately.**
   *
   * It began as the second half of the test above, and CI would not have it: the printed diagram
   * never mounted, on three attempts running, while the same sequence passed on a developer
   * machine every time. The one thing that differed was that the PNG export had already run in
   * that page — and a throwaway probe against a fresh page (Print… clicked with nothing before it)
   * mounted the container and held it, with `afterprint` never firing.
   *
   * Two artefacts related only by being made from the same diagram do not need to share a page,
   * and one test asserting two things fails without saying which. So they are two tests, and this
   * one starts clean.
   */
  test('paper is set in the product typeface — the diagram and the programme', async ({ page }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP + 2);
    await createHierarchy(page);
    await newPlan(page, 'Paper face');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
    await recalculate(page, orgSlug);

    // **Wait for the SCENE, not only for the data.** `recalculate` ends in a reload, and the TSLD
    // print path reads the live canvas handle (`buildDiagramImage` returns null without it) and
    // then returns **silently** — no container and no banner, which is exactly the signature CI
    // reported. `hasDiagram`, which gates the menu item, comes from the activities query and says
    // nothing about whether the canvas has mounted, so waiting on the item alone waits for the
    // wrong thing. The canvas's own parallel listbox (ADR-0026 D7) having a row is the honest
    // proof that the scene is live.
    await expect(
      page.getByRole('listbox', { name: 'Activities in the diagram' }).getByRole('option').first(),
    ).toBeAttached({ timeout: 30_000 });

    // ── The paper. The printed document is a separate artefact with its own stylesheets, and
    // `emulateMedia({ media: 'print' })` makes the browser evaluate `@media print`, so the computed
    // value below is what paper actually gets. **Verified red before the fix**: it returned a list
    // beginning `Inter`.
    await openPrintDocument(page);

    // The ROOT, not the container: the container is where the family is declared, and the root is
    // where the two deleted overrides used to win. Asserting the root is what proves inheritance
    // actually reaches the content rather than stopping at the box.
    await expectPaperFace(page, '.tsld-print-root', 'printed diagram');

    // ── **And the programme, which is the half that had never been driven by anything.**
    // `GanttPrintSurface.css` carried the identical `'Inter'` override, and the spec's §0
    // establishes that no journey in this repository has ever rendered the printed programme — so
    // the structural gate (which proves the stylesheet no longer DECLARES a face) was the only
    // thing covering it, and a stylesheet not declaring a face says nothing about what the browser
    // resolves on `.gantt-print-root`. The plan's M1-T6 risk mitigation says to assert **both**
    // surfaces and SC-3 names both artefacts; the first version of this test shipped only the
    // first, and recorded the narrowing nowhere. Found at the gate pass, independently, by two
    // reviewers.
    const gantt = new URL(page.url());
    gantt.searchParams.set('view', 'gantt');
    await page.goto(gantt.toString());
    // **A ROW, not the treegrid** — and not the mode button, which exists in both views. The grid
    // renders empty while the activities query is in flight, and it is that query `hasDiagram`
    // reads, so waiting on the grid alone is waiting for the wrong thing (see
    // `openPrintDocument`).
    await expect(
      page.getByRole('treegrid', { name: 'Schedule as a bar chart' }).getByRole('row').nth(1),
    ).toBeVisible({ timeout: 30_000 });
    // The SAME menu item: `printDiagram` branches on the live view mode (ADR-0059 M4), so this is
    // the programme rather than the diagram.
    await openPrintDocument(page);
    await expectPaperFace(page, '.gantt-print-root', 'printed programme');
  });
});
