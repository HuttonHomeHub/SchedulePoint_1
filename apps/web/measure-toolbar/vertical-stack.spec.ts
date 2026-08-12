import { expect, test, type Page } from '@playwright/test';

import { writeMeasurement } from './output';

/**
 * **M4-T1** — the vertical stack, measured before M4 claims anything about it.
 *
 * `design.md` §2.1 states a 45 px header band, ≈199 px above the canvas and ≈717 px of canvas.
 * **None of those figures has ever been measured**: M0's harness reads widths only
 * (`measure.spec.ts:78-79`), so every one is arithmetic over class names. M4's own risk note says
 * claiming a canvas gain from arithmetic is ADR-0076 Class 3 and that *this design already did it
 * once* — so the plan makes measuring the first task of the milestone, before the merge is designed.
 *
 * What it reports, per band, is the **rendered** `getBoundingClientRect().height` plus the border
 * box, at 1920 × 1080 and 1440 × 960 (the two the plan names), on a populated plan with the pen
 * **held** — because `CompactPenStatus` renders differently when nobody holds it, and the state a
 * planner is in while using the toolbar is the state worth measuring.
 *
 * The bands are located by **role and structure, never by class name**: a selector like
 * `.border-b.px-4` would silently measure the wrong element after any styling change and report a
 * number rather than a failure.
 *
 * Asserts nothing; it is a harness (ADR-0081 §3).
 */

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 960 },
];

interface BandHeight {
  name: string;
  height: number;
  borderBottom: number;
  paddingBlock: number;
}

async function stackHeights(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const read = (name: string, el: Element | null | undefined): BandHeight | null => {
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        name,
        height: Math.round(el.getBoundingClientRect().height * 10) / 10,
        borderBottom: Math.round(parseFloat(style.borderBottomWidth || '0') * 10) / 10,
        paddingBlock:
          Math.round(
            (parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')) * 10,
          ) / 10,
      };
    };

    // The plan header is the `<header>` holding the visually-hidden <h1> — located by that
    // relationship rather than by its classes, so a restyle cannot silently redirect the reading.
    const heading = document.querySelector('h1');
    const header = heading?.closest('header') ?? null;

    // Each row is the element wrapping a `role="toolbar"` and its visible row-purpose caption; the
    // band is their common parent.
    const rowOf = (label: string): Element | null =>
      document.querySelector(`[role="toolbar"][aria-label="${label}"]`)?.parentElement ?? null;
    const rowLook = rowOf('View and navigate');
    const rowDo = rowOf('Build and manage');
    const commandBand = rowLook?.parentElement ?? null;

    // **The shell's own chrome band** (ADR-0055 S2), which sits above everything the plan owns and
    // which `design.md` §2.1 does not account for at all. Located as the command band's nearest
    // `sticky` ancestor — the toolbar rows portal INTO this band, so the relationship is structural
    // rather than a class match.
    const chromeBand = (() => {
      for (let el = commandBand?.parentElement; el; el = el.parentElement) {
        if (getComputedStyle(el).position === 'sticky') return el;
      }
      return null;
    })();
    // What the band holds besides the portalled rows — the app header row.
    const appHeaderRow = chromeBand?.firstElementChild ?? null;

    // The canvas itself — what all of the above costs.
    const canvas = document.querySelector('canvas');

    const bands = [
      read('shell chrome band (total)', chromeBand),
      read('app header row', appHeaderRow),
      read('plan header', header),
      read('command band (both rows)', commandBand),
      read('row 1 · View and navigate', rowLook),
      read('row 2 · Build and manage', rowDo),
    ].filter((b): b is BandHeight => b !== null);

    const canvasBox = canvas?.getBoundingClientRect();
    // What sits between the top of the viewport and the top of the canvas — the honest "above the
    // canvas" figure, which is the one design.md guesses at. Taken from the canvas's own top rather
    // than by summing the bands, so anything unaccounted for (the app shell's own chrome, a banner)
    // is included instead of quietly dropped.
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bands,
      aboveCanvas: canvasBox ? Math.round(canvasBox.top * 10) / 10 : null,
      canvasHeight: canvasBox ? Math.round(canvasBox.height * 10) / 10 : null,
      // Deliberately NOT a sum of every band: the command rows nest inside the chrome band, so
      // adding both double-counts. This is the attribution `aboveCanvas` must reconcile against.
      attribution: {
        chromeBand: read('x', chromeBand)?.height ?? null,
        planHeader: read('x', header)?.height ?? null,
      },
      // **The canvas's own ancestor chain**, walked from the canvas up to the document.
      //
      // Two earlier probes are recorded because each produced a *number* rather than an answer. The
      // first reported `chromeBand + planHeader = 200` against an `aboveCanvas` of 257 and would
      // have shipped a 57 px hole described as "the app shell's own chrome" — a plausible sentence
      // covering something nobody had looked at. The second listed every box inside that 57 px and
      // returned the Project Explorer's `treeitem` for **Riverside**, because the rail sits *beside*
      // the canvas and a vertical band cuts through it: a geometric filter cannot tell a column
      // apart from a row. The ancestor chain has no such ambiguity — every element in it genuinely
      // contains the canvas, so what it contributes above the canvas is genuinely spent.
      canvasAncestry: (() => {
        const out: {
          tag: string;
          role: string;
          height: number;
          top: number;
          padTop: number;
          marginTop: number;
        }[] = [];
        for (let el: Element | null = canvas; el && el !== document.body; el = el.parentElement) {
          const b = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          out.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') ?? '',
            height: Math.round(b.height * 10) / 10,
            top: Math.round(b.top * 10) / 10,
            padTop: Math.round(parseFloat(style.paddingTop || '0') * 10) / 10,
            marginTop: Math.round(parseFloat(style.marginTop || '0') * 10) / 10,
          });
        }
        return out;
      })(),
      // **The app header row's horizontal budget** — what a plan-identity slot inside it would have
      // to fit into. Reported because M4-T2's first attempt moved the identity line into the band
      // and measured a **zero** canvas gain: relocating a row within the same column changes
      // nothing, and only merging it into an existing row can.
      appHeaderRoom: (() => {
        if (!appHeaderRow) return null;
        const row = appHeaderRow.getBoundingClientRect();
        const kids = [...appHeaderRow.children].map((c) => c.getBoundingClientRect());
        const used = kids.reduce((sum, b) => sum + b.width, 0);
        // The widest horizontal gap between adjacent children — where a slot would actually land.
        const sorted = [...kids].sort((a, z) => a.left - z.left);
        let widestGap = 0;
        for (let i = 1; i < sorted.length; i++) {
          widestGap = Math.max(widestGap, sorted[i]!.left - sorted[i - 1]!.right);
        }
        return {
          rowWidth: Math.round(row.width),
          childCount: kids.length,
          used: Math.round(used),
          widestGap: Math.round(widestGap),
        };
      })(),
      // Every canvas on the page, because ADR-0026's surface is layered and `querySelector` returns
      // whichever comes first in document order — not necessarily the scene.
      canvases: [...document.querySelectorAll('canvas')].map((c) => {
        const b = c.getBoundingClientRect();
        return {
          label: c.getAttribute('aria-label') ?? '',
          top: Math.round(b.top * 10) / 10,
          height: Math.round(b.height * 10) / 10,
        };
      }),
    };
  });
}

test('M4-T1 — the vertical stack on a populated plan, pen held', async ({ page }) => {
  const stamp = Date.now();

  await page.setViewportSize(VIEWPORTS[0]!);
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Stack Tester');
  await page.getByLabel('Email').fill(`stack-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Stack Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();

  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  for (const name of ['Excavate', 'Pour slab']) {
    await page.getByRole('button', { name: 'New activity' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Finish', { exact: true })).toBeVisible({ timeout: 30_000 });

  const report: Record<string, unknown> = {};
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);
    report[`${viewport.width}x${viewport.height}`] = await stackHeights(page);
  }

  writeMeasurement('m4-vertical-stack', report);
});
