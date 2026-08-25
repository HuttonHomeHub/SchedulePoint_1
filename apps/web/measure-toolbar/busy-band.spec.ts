import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **The busiest state the merged bottom band can reach, photographed.**
 *
 * The M4 UX review passed M2 with one open question it could not settle from the diff: nothing has
 * ever looked at the collapsed activities bar carrying **the facts, a critical count, a stale
 * Recalculate button and a docked strip all at once** — and M2 put up to five facts plus a button
 * into a slot that previously held one word next to a tinted chip. The mechanism is unchanged and
 * the layout is sound on paper; density is not a thing paper can answer.
 *
 * So this is a **photograph, not an assertion**. It reports the fact cluster's width, the dock
 * outlet's width, the row's height and whether the row wrapped, and attaches the image. A number
 * here would be arbitrary — "how crowded is too crowded" is the product owner's judgement, and the
 * epic's own rule is to bring them a measurement rather than a verdict.
 *
 * Deliberately at **1280**, where `m0-measurement.md` records the bar at its narrowest (979 px) and
 * the deck already wrapping to four lines, and again at **1646**, the width this product is judged
 * at.
 *
 * Asserts only that the state was actually reached — a screenshot of the wrong state is worse than
 * none, because it looks like evidence (ADR-0081 §3).
 */
const WIDTHS = [
  { width: 1646, height: 1097 },
  { width: 1280, height: 800 },
];

test('the bottom band at its busiest, photographed rather than asserted', async ({
  page,
}, testInfo) => {
  clearMeasurement('busy-band');
  test.setTimeout(300_000);

  await page.setViewportSize(WIDTHS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
  // Two linked activities so the plan has a critical path — the critical-count fact only renders
  // when there is one, and it is the fact the review named.
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  expect(seeded.length).toBe(2);

  // **No recalculation, deliberately.** Leaving the schedule un-computed is what puts the status
  // into `stale` and renders Recalculate — the busiest the fact cluster gets. Recalculating first
  // would photograph the calm state, which is the one that already looks fine.
  await page.reload();
  await ensurePen(page);

  const report: Record<string, unknown> = {};

  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(700);

    // Arm a tool so a strip is docked beside the facts. By `data-toolbar-item`, never by copy.
    const linkTool = page.locator('[data-toolbar-item="link-tool"]').first();
    if ((await linkTool.count()) > 0)
      await linkTool.click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);

    const shot = await page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const bar = document.querySelector('[data-activities-bar]');
      const facts = document.querySelector('[data-schedule-state]');
      const strip = bar?.querySelector('[class*="flex-1"]') ?? null;
      const box = (el: Element | null): { w: number; h: number } | null =>
        el
          ? {
              w: round(el.getBoundingClientRect().width),
              h: round(el.getBoundingClientRect().height),
            }
          : null;
      return {
        bar: box(bar),
        facts: box(facts),
        dockOutlet: box(strip),
        factsText: facts ? (facts.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
        // Did the row grow past one control's height? That is the honest proxy for "it wrapped",
        // and `min-h-9` is 36 px.
        wrapped: bar !== null && bar.getBoundingClientRect().height > 44,
        recalculatePresent:
          [...(bar?.querySelectorAll('button') ?? [])].some((b) =>
            (b.getAttribute('aria-label') ?? b.textContent ?? '').includes('Recalculate'),
          ) ||
          [...document.querySelectorAll('button')].some(
            (b) => (b.getAttribute('aria-label') ?? '') === 'Recalculate',
          ),
      };
    });

    // The state has to have been REACHED, or the photograph is of something else.
    expect(shot.bar, `no activities bar at ${viewport.width}`).not.toBeNull();
    expect(shot.facts, `no fact cluster at ${viewport.width}`).not.toBeNull();

    report[`${viewport.width}`] = shot;
    const png = await page.screenshot({ fullPage: false });
    await testInfo.attach(`busy-band-${viewport.width}.png`, {
      body: png,
      contentType: 'image/png',
    });

    await page.keyboard.press('Escape');
  }

  const path = writeMeasurement('busy-band', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
