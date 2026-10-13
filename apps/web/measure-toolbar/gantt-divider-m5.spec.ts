import { type BrowserContext, expect, test } from '@playwright/test';

import { onboard, openPlanId, recalculate, seedActivities } from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Pre-1.0 hardening, M5 (#494): what the Gantt's divider strip covers**
 * (`docs/specs/pre-1-0-hardening/m5-measurement.md`). A harness, not a gate (ADR-0081 §3): it
 * drives the real product and writes JSON.
 *
 * For each viewport and pointer it reads the strip's **own painted box** (the separator's inner
 * span, not an assumed ±12.5 px) and, for every row `Actions for …` button and every sortable
 * header button, how many px of the control the strip covers and what `elementFromPoint` returns
 * 2 px inside the control's left edge, which is the press the journey makes.
 */

const OUT = 'gantt-divider-m5';

const results: Record<string, unknown> = {};

interface Reading {
  strip: { left: number; right: number } | null;
  /** Right edges of the pinned block and of each column header, to place the controls against. */
  pinnedRight: number | null;
  headerRights: Record<string, number>;
  controls: {
    label: string;
    box: { left: number; right: number; width: number };
    overlapPx: number;
    hitAtLeftEdge: string;
    headerTextClipped: boolean;
  }[];
}

function readGantt(): Reading {
  const sep = document.querySelector<HTMLElement>('[data-gantt-grid-splitter] [role="separator"]');
  const span = sep?.querySelector<HTMLElement>(':scope > span') ?? null;
  const sb = span?.getBoundingClientRect() ?? null;
  const grid = document.querySelector('[role="treegrid"][aria-label="Schedule as a bar chart"]');
  const controls: Reading['controls'] = [];
  if (!grid) return { strip: null, pinnedRight: null, headerRights: {}, controls };
  const headers = [
    ...grid.querySelectorAll<HTMLElement>('[role="row"]:first-child [role="columnheader"]'),
  ];
  const headerRights = Object.fromEntries(
    headers.map((h) => [
      (h.textContent ?? '').trim() || 'sr-only',
      Math.round(h.getBoundingClientRect().right),
    ]),
  );
  const pinned = headers[0]?.parentElement ?? null;
  const candidates = [
    ...grid.querySelectorAll<HTMLElement>(
      '[role="row"] button[aria-label^="Actions for"], [role="columnheader"] button',
    ),
  ];
  for (const el of candidates) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || sb === null) continue;
    const near = Math.abs(b.left - sb.left) < 60 || Math.abs(b.right - sb.right) < 60;
    if (!near) continue;
    const hit = document.elementFromPoint(b.left + 2, b.top + b.height / 2);
    controls.push({
      label: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim(),
      box: { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) },
      overlapPx:
        Math.round(Math.max(0, Math.min(b.right, sb.right) - Math.max(b.left, sb.left)) * 10) / 10,
      hitAtLeftEdge: hit === el || el.contains(hit) ? 'itself' : `${hit?.tagName ?? 'nothing'}`,
      headerTextClipped: el.scrollWidth > el.clientWidth,
    });
  }
  return {
    pinnedRight: pinned ? Math.round(pinned.getBoundingClientRect().right) : null,
    headerRights,
    strip: sb ? { left: Math.round(sb.left), right: Math.round(sb.right) } : null,
    controls,
  };
}

test('#494 what the Gantt divider strip covers', async ({ browser }) => {
  test.setTimeout(300_000);
  const setup = await browser.newContext({ viewport: { width: 1646, height: 1097 } });
  await setup.addInitScript(
    (key: string) => window.localStorage.setItem(key, '1'),
    VIEWPORT_NOTICE_ACK_KEY,
  );
  const page0 = await setup.newPage();
  const orgSlug = await onboard(page0, Date.now() + 17);
  await page0.getByRole('link', { name: 'Clients', exact: true }).click();
  await page0.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page0.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page0.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page0.getByRole('link', { name: 'Northgate' }).click();
  await page0.getByRole('button', { name: 'New project' }).click();
  await page0.getByRole('dialog').getByLabel('Name').fill('Quarter');
  await page0.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page0.getByRole('link', { name: 'Quarter' }).click();
  await page0.getByRole('button', { name: 'New plan' }).click();
  await page0.getByRole('dialog').getByLabel('Name').fill('Slab');
  await page0
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page0.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page0.getByRole('link', { name: 'Slab', exact: true }).click();
  await expect(page0).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  await page0.getByRole('button', { name: 'Start editing' }).click();
  await expect(page0.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  await seedActivities(page0, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  void openPlanId(page0);
  await recalculate(page0, orgSlug);
  const planUrl = page0.url();
  const storage = await setup.storageState();
  await setup.close();

  clearMeasurement(OUT);
  for (const cell of [
    { label: 'fine 1024x600', w: 1024, h: 600, coarse: false },
    { label: 'fine 1646x1097', w: 1646, h: 1097, coarse: false },
    { label: 'fine 1912x948', w: 1912, h: 948, coarse: false },
    { label: 'coarse 1024x600', w: 1024, h: 600, coarse: true },
    { label: 'coarse 1646x1097', w: 1646, h: 1097, coarse: true },
  ]) {
    const context: BrowserContext = await browser.newContext({
      storageState: storage,
      viewport: { width: cell.w, height: cell.h },
      hasTouch: cell.coarse,
    });
    await context.addInitScript(
      (key: string) => window.localStorage.setItem(key, '1'),
      VIEWPORT_NOTICE_ACK_KEY,
    );
    const page = await context.newPage();
    await page.goto(planUrl);
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(page.getByRole('treegrid', { name: 'Schedule as a bar chart' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Actions for/ }).first()).toBeVisible();
    results[cell.label] = await page.evaluate(readGantt);
    await context.close();
  }
  writeMeasurement(OUT, results);
});
