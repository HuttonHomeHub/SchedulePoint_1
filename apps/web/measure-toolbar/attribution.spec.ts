import { expect, test, type Page } from '@playwright/test';

import { writeMeasurement } from './output';

/**
 * **M1-T1** — attribute the overshoot before anything is changed.
 *
 * `m0-measurement.md` establishes *that* each row exceeds its container (109 px at 1920 on a
 * populated plan) and that the `⋯` does not compensate. It does **not** establish *why*, and the
 * plan names three candidates. Fixing the one that sounds right is the failure this milestone was
 * written to avoid, so this pass decomposes the row and lets the numbers pick:
 *
 * - **(a) unmeasured chrome** — `computeOverflow` is handed only item widths (`Toolbar.tsx:172-181`)
 *   and sees neither the container's `gap-1` (`:322`) nor each group's `gap-1` + `ml-1 border-l pl-2`
 *   (`:331`). Signature: `scrollWidth − Σitem widths` ≈ `Σgaps + Σgroup rules`.
 * - **(b) two `ml-auto` boxes on one flex line** (`:333` and `:386`). Signature: two or more boxes
 *   with a computed `margin-left: auto` in the same row. Already excluded at 1920 on the empty plan,
 *   where the overflow wrapper is not rendered at all — checked here at every width.
 * - **(c) promotion/overflow ordering** — `measure()` computes overflow and `autoLabelsFit` from one
 *   set of readings (`:158-212`), and flipping the latter re-creates `measure` and re-runs the
 *   layout effect (`:212`, `:216-219`). Signature: the row's `scrollWidth` or labelled-set differs
 *   between consecutive settled frames at a **fixed** width.
 *
 * It **asserts nothing** — it is a harness (ADR-0081 §3); the gate is `e2e-toolbar-fit`. It measures
 * a **populated** plan, because M0's first two passes did not and every figure they produced was a
 * lower bound.
 */

const WIDTHS = [2133, 1920, 1600, 1440, 1280, 1024, 960, 768];
const ROWS = ['View and navigate', 'Build and manage'] as const;

async function attribute(page: Page, ariaLabel: string): Promise<unknown> {
  return page.getByRole('toolbar', { name: ariaLabel }).evaluate((el) => {
    const container = el as HTMLElement;
    const cs = getComputedStyle(container);
    const containerGap = parseFloat(cs.columnGap) || 0;

    // Direct children of the toolbar: the `role="group"` boxes, plus the overflow wrapper when it
    // renders. Both are laid out on the same flex line, which is what candidate (b) is about.
    const children = [...container.children] as HTMLElement[];
    // Read the CLASS, not the computed style. `getComputedStyle().marginLeft` reports the **used**
    // value in px, never the literal `auto`, so a computed-style probe reports zero `ml-auto` boxes
    // even when two are present — which it did on the first run of this harness, and would have been
    // recorded as candidate (b) refuted. It is not refuted by that method; it is invisible to it.
    const autoMarginBoxes = children.filter((c) => c.classList.contains('ml-auto')).length;

    let groupWidthTotal = 0;
    let groupRuleTotal = 0;
    let intraGroupGapTotal = 0;
    const groups: unknown[] = [];
    for (const child of children) {
      if (child.getAttribute('role') !== 'group') continue;
      const g = getComputedStyle(child);
      const rule =
        (parseFloat(g.marginLeft) || 0) +
        (parseFloat(g.borderLeftWidth) || 0) +
        (parseFloat(g.paddingLeft) || 0);
      const items = child.querySelectorAll('[data-toolbar-item]').length;
      const gap = parseFloat(g.columnGap) || 0;
      groupWidthTotal += child.getBoundingClientRect().width;
      groupRuleTotal += rule;
      intraGroupGapTotal += Math.max(0, items - 1) * gap;
      groups.push({
        label: child.getAttribute('aria-label'),
        items,
        width: Math.round(child.getBoundingClientRect().width),
        ruleAndPadding: Math.round(rule),
        intraGap: Math.round(Math.max(0, items - 1) * gap),
      });
    }

    let itemWidthTotal = 0;
    for (const node of container.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
      itemWidthTotal += node.getBoundingClientRect().width;
    }

    const betweenChildrenGap = Math.max(0, children.length - 1) * containerGap;
    const unexplained = container.scrollWidth - itemWidthTotal;
    const chromeAccounted = betweenChildrenGap + groupRuleTotal + intraGroupGapTotal;

    return {
      containerWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      overshoot: container.scrollWidth - container.clientWidth,
      itemWidthTotal: Math.round(itemWidthTotal),
      groupWidthTotal: Math.round(groupWidthTotal),
      // (a): does the chrome we can name account for what the item widths do not?
      unexplainedByItems: Math.round(unexplained),
      chromeAccounted: Math.round(chromeAccounted),
      chromeResidual: Math.round(unexplained - chromeAccounted),
      betweenChildrenGap: Math.round(betweenChildrenGap),
      groupRuleTotal: Math.round(groupRuleTotal),
      intraGroupGapTotal: Math.round(intraGroupGapTotal),
      // (b)
      autoMarginBoxes,
      overflowRendered: container.querySelector('[data-toolbar-item="__overflow__"]') !== null,
      groups,
    };
  });
}

/** (c): the labelled set and width across consecutive settled frames at one fixed viewport. */
async function frames(page: Page, ariaLabel: string, count: number): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(
      await page.getByRole('toolbar', { name: ariaLabel }).evaluate(
        (el) =>
          new Promise((resolve) => {
            requestAnimationFrame(() => {
              const container = el as HTMLElement;
              const labelled: string[] = [];
              const inline: string[] = [];
              for (const n of container.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
                const id = n.getAttribute('data-toolbar-item') ?? '';
                inline.push(id);
                if ((n.innerText ?? '').trim().length > 0) labelled.push(id);
              }
              resolve({
                scrollWidth: container.scrollWidth,
                inline: inline.join(','),
                labelled: labelled.join(','),
              });
            });
          }),
      ),
    );
  }
  return out;
}

test('M1-T1 — attribute the row overshoot to a mechanism', async ({ page }) => {
  const stamp = Date.now();

  await page.setViewportSize({ width: 2133, height: 1080 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Attrib Tester');
  await page.getByLabel('Email').fill(`attrib-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Attrib Co ${stamp}`);
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
  await expect(
    page
      .getByRole('toolbar', { name: 'View and navigate' })
      .locator('[data-toolbar-item="finish-chip"]'),
  ).toHaveCount(1, { timeout: 30_000 });

  const report: Record<string, unknown> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 1200 ? 1280 : 1080 });
    await page.waitForTimeout(600);
    const perRow: Record<string, unknown> = {};
    for (const row of ROWS) perRow[row] = await attribute(page, row);
    report[String(width)] = perRow;
  }

  // Candidate (c), at the reported width only: eight consecutive settled frames, no input at all.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(800);
  report['stability@1920'] = {
    'View and navigate': await frames(page, 'View and navigate', 8),
    'Build and manage': await frames(page, 'Build and manage', 8),
  };

  writeMeasurement('toolbar-attribution', report);
});
