import { expect, test, type Page } from '@playwright/test';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **M0** for `docs/specs/workspace-layout/design.md` — the measurement that design asks for, and
 * could not take.
 *
 * It reports, per viewport width and per toolbar row: the container's real `clientWidth`, which
 * items are inline, which are in the `⋯`, whether any inline control is truncated or clipped past
 * the container's right edge, and whether the `'auto'` label promotion fired. Two predictions in
 * the design are falsifiable against this output:
 *
 * - **P1** — at 1920 @100%, Row 1's `⋯` holds exactly *Go to today* and *Zoom to selection*, and
 *   at 2133 there is no `⋯` at all.
 * - **P2** — at 960, every command is still reachable (inline or via `⋯`); the failure is
 *   truncation, not loss. If a command is unreachable, that is a live WCAG 2.1.1 defect and
 *   outranks the design.
 *
 * `reachable` is the union of inline + overflow ids, compared against the row's full item set as
 * measured at the widest viewport — so "lost" means lost relative to what this same build shows
 * when it has room, never relative to a list typed into this file.
 */

const WIDTHS = [
  { label: '2133 (1920 @ 90%)', width: 2133, height: 1080 },
  { label: '1920 @100%', width: 1920, height: 1080 },
  { label: '1440 (Surface Pro landscape)', width: 1440, height: 960 },
  { label: '960 (Surface Pro portrait)', width: 960, height: 1280 },
  { label: '768 (md breakpoint)', width: 768, height: 1024 },
];

interface RowReading {
  row: string;
  containerWidth: number;
  scrollWidth: number;
  inline: string[];
  labelled: string[];
  truncated: string[];
  clippedPastRightEdge: string[];
  overflowPresent: boolean;
  overflow: string[];
}

async function readRow(page: Page, ariaLabel: string): Promise<RowReading> {
  const bar = page.getByRole('toolbar', { name: ariaLabel });
  const dom = await bar.evaluate((el) => {
    const container = el as HTMLElement;
    const box = container.getBoundingClientRect();
    const nodes = [...container.querySelectorAll<HTMLElement>('[data-toolbar-item]')];
    const inline: string[] = [];
    const labelled: string[] = [];
    const truncated: string[] = [];
    const clipped: string[] = [];
    let overflowPresent = false;
    for (const node of nodes) {
      const id = node.getAttribute('data-toolbar-item') ?? '';
      if (id === '__overflow__') {
        overflowPresent = true;
        continue;
      }
      inline.push(id);
      // A label is showing when the control renders visible text beside its icon. `ToolbarButton`
      // only emits the text node when `showLabel` is true, so a non-empty innerText IS the signal.
      if ((node.innerText ?? '').trim().length > 0) labelled.push(id);
      for (const candidate of [node, ...node.querySelectorAll<HTMLElement>('*')]) {
        if (candidate.scrollWidth > candidate.clientWidth + 1 && candidate.clientWidth > 0) {
          truncated.push(id);
          break;
        }
      }
      const nodeBox = node.getBoundingClientRect();
      // `overflow-hidden` on the container means anything past its right edge is invisible AND
      // unclickable — the failure mode the design says it did not observe either way.
      if (nodeBox.left >= box.right - 1 || nodeBox.right > box.right + 1) clipped.push(id);
    }
    return {
      containerWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      inline,
      labelled,
      truncated: [...new Set(truncated)],
      clipped,
      overflowPresent,
    };
  });

  let overflow: string[] = [];
  if (dom.overflowPresent) {
    await bar.getByRole('button', { name: 'More toolbar actions' }).click();
    const menu = page.getByRole('menu', { name: 'More toolbar actions' });
    await expect(menu).toBeVisible();
    overflow = await menu.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((n) =>
        (n.innerText ?? '').trim(),
      ),
    );
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }

  return {
    row: ariaLabel,
    containerWidth: dom.containerWidth,
    scrollWidth: dom.scrollWidth,
    inline: dom.inline,
    labelled: dom.labelled,
    truncated: dom.truncated,
    clippedPastRightEdge: dom.clipped,
    overflowPresent: dom.overflowPresent,
    overflow,
  };
}

test('M0 — measure the two toolbar rows across five viewport widths', async ({ page }) => {
  clearMeasurement('toolbar-m0');
  const stamp = Date.now();

  await page.setViewportSize({ width: 2133, height: 1080 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Measure Tester');
  await page.getByLabel('Email').fill(`measure-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Measure Co ${stamp}`);
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

  const report: Record<string, RowReading[]> = {};
  for (const { label, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    // One frame for the ResizeObserver to settle, then a second for the label-promotion pass it
    // can trigger — the two run on separate commits (`Toolbar.tsx:211`).
    await page.waitForTimeout(400);
    report[label] = [
      await readRow(page, 'View and navigate'),
      await readRow(page, 'Build and manage'),
    ];
  }

  writeMeasurement('toolbar-m0', report);
});
