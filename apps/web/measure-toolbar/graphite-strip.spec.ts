import { expect, test } from '@playwright/test';

import { writeMeasurement } from './output';

/**
 * **Graphite M0** — does the single command strip fit?
 *
 * ADR-0099 deletes the width ladder, the band floors, the hysteresis and the `⋯`. That is only
 * safe if the strip genuinely fits, and **five consecutive epics in this register had their width
 * expectation contradicted by their own measurement** (ADR-0090, 0091 D4, 0092 M4, 0093, 0097
 * Landing C). Graphite removes the escape hatch that made those failures embarrassing rather than
 * broken, so this runs BEFORE the ladder is deleted, not after.
 *
 * **It composes the proposed strip from the REAL rendered controls**, cloned out of the live
 * toolbar into one flex row with the real gaps — rather than summing estimated widths, which is
 * the specific mistake `CHROME_RESIDUAL_PX` was invented to paper over and then found to be
 * miscalibrated against (ADR-0091 M7).
 *
 * The worst case is measured deliberately, not the typical one: a real construction plan name, and
 * the finish read-out RESOLVED. ADR-0097's closure harness reported 307 px of slack and a PROCEED
 * because its first run used a 37 px plan name.
 *
 * Asserts nothing; it is a harness (ADR-0081 §3). The falsification condition is in the plan: if
 * the strip does not fit at 1280, the strip narrows — it is not shaved for a sixth epic.
 */

const WIDTHS = [1920, 1646, 1440, 1280];

/** The Graphite strip, in order. Rail tools and object actions are deliberately absent. */
const STRIP: readonly string[] = [
  'undo',
  'redo',
  'recalculate',
  'auto-arrange',
  'zoom-out',
  'zoom-in',
  'fit',
  'today',
  'zoom',
  'view',
  'float-paths',
  'baseline-overlay',
  'resource-view',
  'over-allocation',
  'legend',
  'search',
  'filter',
  'next-conflict',
  'calendar',
  'analysis',
  'comments',
  'export',
  'mode-early',
  'mode-visual',
  'view-tsld',
  'view-gantt',
  'finish-chip',
];

/** Commands Graphite adds that have no control to clone; charged at a measured icon width. */
const NEW_ICON_ITEMS = ['level-resources', 'print'];

test('M0 — the Graphite strip, composed from real controls', async ({ page }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();

  await page.setViewportSize({ width: 1920, height: 1030 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Strip Measurer');
  await page.getByLabel('Email').fill(`strip-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Strip Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate Developments');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate Developments' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside Quarter');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside Quarter' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  // The worst-case plan name, deliberately. ADR-0091's retrospective records a 227 px real name
  // against the 37 px one a harness had used, and that 190 px reversed a verdict.
  await page
    .getByRole('dialog')
    .getByLabel('Name')
    .fill('Riverside Quarter — Phase 2 Substructure & Below-Ground Services');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: /Riverside Quarter — Phase 2/ }).click();
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();

  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  for (const name of ['Site setup', 'Excavate to formation', 'Pour ground slab']) {
    await page.getByRole('button', { name: 'New activity' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  // The finish read-out RESOLVED, not its loading state — the resolved one is wider.
  await expect(page.getByText(/Finish/).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  const report: Record<string, unknown> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1030 });
    await page.waitForTimeout(700);

    report[String(width)] = await page.evaluate(
      ({ strip, newItems }) => {
        const host = document.createElement('div');
        host.style.cssText =
          'position:fixed;top:-9999px;left:0;display:flex;align-items:center;' +
          'gap:2px;padding:0 8px;white-space:nowrap;width:max-content';
        document.body.appendChild(host);

        const found: { id: string; width: number; iconOnly: number }[] = [];
        const missing: string[] = [];
        let iconWidth = 0;

        // The six items Graphite keeps labelled: the `▾` triggers and the two mode segments,
        // whose labels ARE the control (a caret with no word is not a menu).
        const KEEP_LABEL = new Set([
          'zoom',
          'view',
          'filter',
          'analysis',
          'export',
          'mode-early',
          'mode-visual',
          'view-tsld',
          'view-gantt',
          'finish-chip',
        ]);

        const iconHost = document.createElement('div');
        iconHost.style.cssText = host.style.cssText;
        document.body.appendChild(iconHost);

        for (const id of strip) {
          const src = document.querySelector<HTMLElement>(`[data-toolbar-item="${id}"]`);
          if (!src) {
            missing.push(id);
            continue;
          }
          const clone = src.cloneNode(true) as HTMLElement;
          host.appendChild(clone);
          const w = Math.round(clone.getBoundingClientRect().width * 10) / 10;

          // **The Graphite variant.** The mockup draws these icon-only; the live controls are
          // labelled. Measuring the live ones answers a question nobody asked. Strip the text
          // nodes from a second clone, keeping the icon and the control's own padding.
          const iconClone = src.cloneNode(true) as HTMLElement;
          if (!KEEP_LABEL.has(id)) {
            const walker = document.createTreeWalker(iconClone, NodeFilter.SHOW_TEXT);
            const texts: Node[] = [];
            while (walker.nextNode()) texts.push(walker.currentNode);
            for (const t of texts) t.textContent = '';
          }
          iconHost.appendChild(iconClone);
          const iw = Math.round(iconClone.getBoundingClientRect().width * 10) / 10;

          found.push({ id, width: w, iconOnly: iw });
          if (iw > 0 && iw < 34 && iconWidth === 0) iconWidth = iw;
        }
        const iconMeasured = Math.round(iconHost.getBoundingClientRect().width * 10) / 10;
        iconHost.remove();

        // Six group rules: a 1px separator with 6px either side, matching the primitive.
        const groupChrome = 6 * 13;
        const newItemsCost = newItems.length * ((iconWidth || 26) + 2);
        const measured = Math.round(host.getBoundingClientRect().width * 10) / 10;
        host.remove();

        const RAIL = 46;
        const total = Math.round((measured + groupChrome + newItemsCost) * 10) / 10;
        const available = window.innerWidth - RAIL;
        return {
          viewport: window.innerWidth,
          itemsFound: found.length,
          itemsMissing: missing,
          clonedWidth: measured,
          groupChrome,
          newItemsCost: Math.round(newItemsCost * 10) / 10,
          stripTotal: total,
          availableWidth: available,
          slack: Math.round((available - total) * 10) / 10,
          fits: total <= available,
          // The shape Graphite actually proposes.
          graphiteTotal: Math.round((iconMeasured + groupChrome + newItemsCost) * 10) / 10,
          graphiteSlack:
            Math.round((available - (iconMeasured + groupChrome + newItemsCost)) * 10) / 10,
          graphiteFits: iconMeasured + groupChrome + newItemsCost <= available,
          items: found,
        };
      },
      { strip: STRIP, newItems: NEW_ICON_ITEMS },
    );
  }

  writeMeasurement('graphite-strip', report);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
});
