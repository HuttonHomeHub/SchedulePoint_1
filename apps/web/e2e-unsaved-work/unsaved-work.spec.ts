import { expect, test } from '@playwright/test';

import {
  ensurePen as reacquirePen,
  openEditor,
  showActivities,
} from '../e2e-activity-editor/support';
import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **The unsaved-work navigation guard, against the real product**
 * (`docs/specs/unsaved-work-guard/`, M3-T4).
 *
 * This suite exists because the half most likely to be wrong is unreachable from jsdom.
 * `@tanstack/history` attaches its `beforeunload` listener at history creation and
 * `createMemoryHistory` does not attach it at all — so no unit test can exercise it in principle,
 * not merely in practice. M0 measured the trap it hides: the unload path never consults
 * `shouldBlockFn`, it reads `enableBeforeUnload ?? true` and treats `true` as "block", so a wrong
 * registration prompts on every reload of every page while every unit test stays green.
 *
 * **`page.on('dialog')` is installed before any unload action.** Without it Playwright auto-dismisses
 * the native prompt and the assertion silently observes nothing — the run does not hang, it lies.
 *
 * **The clean cases are the ones to read closely.** Over-warning is the failure mode that gets a
 * guard deleted rather than fixed, so each asserts positively: no dialog fired, AND the navigation
 * completed. "It did not time out" would pass against a guard that blocks nothing at all.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 5200;

test.describe('Navigating away from unsaved work', () => {
  test('prompts on reload when a scope is dirty, and stays silent when it is not', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Unsaved work journey');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Excavate', laneIndex: 0, durationDays: 5 }]);
    await recalculate(page, orgSlug);

    // ONE handler for the whole test. Two of them race, and Playwright throws
    // "Cannot dismiss dialog which is already handled" — which is how the first working run of
    // this suite reported success.
    let prompted = false;
    page.on('dialog', (dialog) => {
      prompted = true;
      void dialog.dismiss().catch(() => {});
    });

    // ── CLEAN. Asserted first, because a guard that prompts unconditionally would pass the dirty
    // case below and be worse than no guard at all: over-warning is what gets one deleted.
    await page.reload();
    expect(prompted, 'a page with nothing unsaved must never prompt on reload').toBe(false);

    // A full load drops the ADR-0028 pen lease and resets the workspace pane — both established by
    // reading a failure's page snapshot rather than assumed.
    await reacquirePen(page);
    await showActivities(page);
    await expect(page.getByRole('button', { name: 'Actions for Excavate' }).first()).toBeVisible();

    // ── DIRTY. The activity editor is a modal <dialog>, so it sits in the browser's top layer and
    // intercepts clicks on everything behind it — an in-app link is unreachable while it is open,
    // for a test OR a planner. What a modal cannot intercept is a reload, a closed tab, or Back,
    // and before this those discarded the work with no prompt at all.
    await openEditor(page, 'Excavate', 'Edit');
    await page.getByLabel(/^Name/).fill('Excavate — revised');

    await page.reload({ timeout: 10_000 }).catch(() => {});
    expect(prompted, 'a dirty scope must prompt before the page unloads').toBe(true);
  });
});
