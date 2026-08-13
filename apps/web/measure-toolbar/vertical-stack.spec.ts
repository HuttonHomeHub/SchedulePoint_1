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
  // **1646 — the product owner's Surface Pro** (2880 × 1920 at 175 %), and the width this surface is
  // actually judged at. It was absent from this harness through the whole of ADR-0090 and ADR-0091,
  // which is how both epics shipped decisions taken against widths nobody uses.
  { width: 1646, height: 1097 },
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

    // Each row is the element wrapping a `role="toolbar"` and its visible row-purpose caption; the
    // band is their common parent.
    const rowOf = (label: string): Element | null =>
      document.querySelector(`[role="toolbar"][aria-label="${label}"]`)?.parentElement ?? null;
    const rowLook = rowOf('View and navigate');
    const rowDo = rowOf('Build and manage');
    const commandBand = rowLook?.parentElement ?? null;

    // The **identity row** — breadcrumbs + pen status. ADR-0090 M4-T2 folded it INTO the command
    // band as a `<div>` (a second `<header>` would have made a second `banner` landmark) and left
    // the `sr-only <h1>` inside `<main>`. This lookup used to be `h1.closest('header')`, which
    // returned `null` from that day on; `read()` returned `null`, `.filter()` dropped it, and the
    // report silently listed five bands where six were asked for — with `aboveCanvas` still
    // reading a plausible 249, so nothing looked wrong. Measured 2026-08-12 (M0-T1): five bands
    // reported, and 135 − 45 − 44 = 46 px of command band unaccounted for. That 46 px IS this row.
    //
    // It is now located structurally, as the command band's first child — the row above the two
    // toolbars — and verified to be the element carrying the breadcrumb `nav`.
    const identityRow = (() => {
      const first = commandBand?.firstElementChild ?? null;
      if (!first) return null;
      return first.querySelector('nav') ? first : null;
    })();

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

    // A band that cannot be located **throws**. It used to be dropped by a `.filter()`, which is how
    // the identity row went missing for the whole of ADR-0090 M5 without anyone noticing: a silently
    // shorter list still reads as a complete measurement, and every surviving number is still right,
    // so there is nothing for a reader to catch. A harness that under-reports is worse than one that
    // fails, because its output gets quoted into a design document (ADR-0058: verify the claim).
    const bands = [
      ['shell chrome band (total)', chromeBand],
      ['app header row', appHeaderRow],
      ['identity row (breadcrumbs + pen)', identityRow],
      ['command band (identity + both rows)', commandBand],
      ['row 1 · View and navigate', rowLook],
      ['row 2 · Build and manage', rowDo],
    ].map(([name, el]) => {
      const band = read(name as string, el as Element | null);
      if (!band) throw new Error(`vertical-stack: band "${name as string}" could not be located`);
      return band;
    });

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
        identityRow: read('x', identityRow)?.height ?? null,
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
      // **What the identity content actually costs, horizontally.** The single number decision 2
      // turns on: folding the identity line into the command band is only possible if its content
      // fits the slack a row has after the mode cluster leaves it. Measured as the sum of the
      // identity row's children — the breadcrumb nav and the pen status — not the row's own width,
      // which is the full container and says nothing about what has to fit.
      identityContent: (() => {
        if (!identityRow) return null;
        // Reported one level deeper than the other budgets, deliberately: the top-level split is
        // only "breadcrumbs" and "pen", and the question decision 2 asks is *which parts of those
        // could go* — which a two-number answer cannot inform.
        const kids = [...identityRow.children].map((c) => ({
          tag: c.tagName.toLowerCase(),
          width: Math.round(c.getBoundingClientRect().width),
          text: (c.textContent ?? '').trim().slice(0, 40),
          parts: [...c.children].map((g) => ({
            tag: g.tagName.toLowerCase(),
            width: Math.round(g.getBoundingClientRect().width),
            text: (g.textContent ?? '').trim().slice(0, 48),
          })),
        }));
        return {
          rowWidth: Math.round(identityRow.getBoundingClientRect().width),
          contentWidth: kids.reduce((sum, k) => sum + k.width, 0),
          children: kids,
        };
      })(),
      /**
       * **The app header row's horizontal budget** — what a plan-identity slot inside it would have
       * to fit into, and therefore whether ADR-0091's band merge is possible at all.
       *
       * **The first version of this could not answer that, and reported a confident zero.** It read
       * `appHeaderRow.children`, and `AppHeaderRow` (`app-header.tsx:150-156`) renders exactly ONE
       * child — so the adjacent-pair loop never executed and `widestGap` was 0 at every width **by
       * construction**. `docs/TECH_DEBT.md` #129 cites that zero as evidence the merge is not
       * feasible. It is an artefact, not a measurement, and nobody has actually measured this.
       *
       * The repair descends through single-child wrappers to the real flex/grid line before
       * measuring, and reports the nav separately — because if the merge does not fit, the
       * organisation nav is the only material slack in the row and its cost has to be a number the
       * product owner can weigh rather than an impression.
       */
      appHeaderRoom: (() => {
        if (!appHeaderRow) return null;
        // Descend while the node has exactly one element child: a chain of layout wrappers is not
        // the line, and measuring one of them measures nothing.
        let line: Element = appHeaderRow;
        let depth = 0;
        while (line.children.length === 1 && depth < 8) {
          line = line.children[0]!;
          depth += 1;
        }
        const row = appHeaderRow.getBoundingClientRect();
        const kids = [...line.children].map((c) => ({
          box: c.getBoundingClientRect(),
          label:
            c.getAttribute('aria-label') ??
            (c.tagName === 'NAV' ? 'nav' : (c.textContent ?? '').trim().slice(0, 24)),
        }));
        const used = kids.reduce((sum, k) => sum + k.box.width, 0);
        const sorted = [...kids].sort((a, z) => a.box.left - z.box.left);
        let widestGap = 0;
        for (let i = 1; i < sorted.length; i += 1) {
          widestGap = Math.max(widestGap, sorted[i]!.box.left - sorted[i - 1]!.box.right);
        }
        // The organisation nav on its own — the fallback ladder's first candidate.
        const nav = appHeaderRow.querySelector('nav');
        return {
          rowWidth: Math.round(row.width),
          lineDepth: depth,
          childCount: kids.length,
          used: Math.round(used),
          freeSpace: Math.round(row.width - used),
          widestGap: Math.round(widestGap),
          navWidth: nav ? Math.round(nav.getBoundingClientRect().width) : null,
          children: sorted.map((k) => ({ label: k.label, width: Math.round(k.box.width) })),
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
