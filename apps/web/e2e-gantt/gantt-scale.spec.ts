import { expect, test, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ensurePen,
  ganttGrid,
  onboard,
  seedActivities,
  showGantt,
} from './support';

/**
 * **The claim the substrate decision rests on** (ADR-0059 §1), measured in a real browser.
 *
 * ADR-0026 chose Canvas 2D for the TSLD because thousands of items are visible at once at arbitrary
 * 2-D positions. The Gantt declined to inherit that on one premise: *virtualization removes the
 * premise* — the live node count is bounded by the viewport, not by the plan. If that stops being
 * true the ADR is wrong and the view needs re-deciding, so it is asserted rather than believed.
 *
 * It has to live here rather than in a component test: **jsdom has no layout**, so the real
 * virtualizer measures a zero-height scroller and yields nothing, which is why `GanttPanel.test.tsx`
 * stubs it out entirely. A stubbed virtualizer cannot prove that virtualization windows.
 *
 * The comparison is **one plan, topped up** rather than two plans — same claim, and it avoids
 * navigating between plans, which is a shell behaviour this suite has no business depending on.
 *
 * What this measures is **structure, not milliseconds**. A timing number from a CI container is
 * noise (the ADR-0054 counting-stub precedent, and the reason `TECH_DEBT #59` exists); a node count
 * is exact and means the same thing on every machine. Frame timing on the ADR-0026 hardware
 * envelope — a mid-tier laptop, iPad-class Safari — stays an operator gate (`TECH_DEBT #60`).
 */

/**
 * Two plan sizes far enough apart that "the DOM did not grow" is a real statement. CI measured 100
 * activities rendering 101 rows on the runner's window, which is why the assertion below is about
 * **growth** rather than an absolute ceiling — how many rows a viewport holds is not a constant, and
 * pinning one would make this test fail for reasons unrelated to virtualization.
 */
const FIRST_FILL = 100;
const TOPPED_UP = 300;

async function liveRowCount(page: Page): Promise<number> {
  await showGantt(page);
  return ganttGrid(page).getByRole('row').count();
}

test.describe('the Gantt at plan scale', () => {
  test.describe.configure({ timeout: 180_000 });

  test('keeps the live row count bounded by the viewport, not the plan', async ({ page }) => {
    const orgSlug = await onboard(page, Date.now());
    await createClient(page, 'Northgate');
    await createProject(page, 'Riverside');
    await createPlan(page, 'Programme');

    // Writes are pen-gated (ADR-0028), and the seed goes through the same API the UI does.
    await ensurePen(page);
    await seedActivities(page, orgSlug, FIRST_FILL);
    await page.reload();
    const small = await liveRowCount(page);

    // Top the SAME plan up by three times.
    await ensurePen(page);
    await seedActivities(page, orgSlug, TOPPED_UP - FIRST_FILL, FIRST_FILL);
    await page.reload();
    const large = await liveRowCount(page);

    // **The invariant, stated as growth rather than size.** Three times the plan must not mean three
    // times the DOM. Asserting an absolute ceiling instead would need a guess at how many rows a
    // viewport holds — which varies with chrome, zoom and the runner's window — and would fail for
    // reasons that say nothing about virtualization. Growth is the property ADR-0026's premise turns
    // on, and it is exact.
    //
    // The measurements ride in the message: if this ever fails, the numbers say immediately whether
    // the window merely shifted or virtualization stopped windowing altogether.
    const measured = `rows at ${FIRST_FILL} activities: ${small}; at ${TOPPED_UP}: ${large}`;
    expect(large, measured).toBe(small);
    expect(large, measured).toBeLessThan(TOPPED_UP);

    // Accessibility must still describe the WHOLE plan: a screen-reader user hearing "row 12 of 40"
    // for a 300-activity programme is being misinformed about how much work there is.
    await expect(ganttGrid(page)).toHaveAttribute('aria-rowcount', String(TOPPED_UP + 1));
  });
});
