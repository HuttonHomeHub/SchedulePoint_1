import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **M1 — the pen's sentence is read in the plan's facts row, and its controls stay on the plan.**
 *
 * The one-row header's first shippable slice. `CompactPenStatus` used to render a badge, a
 * live-region sentence and every ADR-0028 hand-off control as one block on the identity row; the
 * sentence is a **fact** and now portals to wherever the plan's facts are read, while the badge and
 * the controls are **actions** and stay beside the plan (ADR-0093's discriminator applied to a
 * model rather than to a command).
 *
 * **Why a journey and not another unit case.** Three of the four assertions here are about *which
 * element contains which*, across a React portal, in a real layout — and the unit suite's answer to
 * that is structurally misleading, because with no outlet registered the sentence renders in place
 * *inside* the controls container, so "the sentence is inside the controls" is true there whether
 * the split works or not. Only a running product has both an outlet and a row.
 *
 * **Every assertion is scoped to an element, never to `page`.** ADR-0073 C2.5 records a journey
 * that passed on the prose alone because its assertion was scoped to the document; this suite's
 * whole subject is *where* something is, so a document-scoped query would assert nothing at all.
 *
 * It runs on the existing `workspace-fit` config and its existing CI step — 1646 CSS px, the
 * product owner's Surface Pro, with `PLAN_EDIT_LOCK_ENFORCED=true` so the pen is really enforced.
 */
test.describe('the pen sentence is a fact and the controls are actions', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1646, height: 1097 } });
    const orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    ]);
    await recalculate(page, orgSlug);
    // `recalculate` reloads, which drops the pen. Take it back — the whole subject here is what the
    // held state renders and where.
    await ensurePen(page);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the sentence is read beside the plan facts, and the hand-off controls are not', async () => {
    // The facts row is identified by a fact rather than by a class: `Activities` is rendered by
    // `FactList` and by nothing else on this screen. Locating the row by its copy is what
    // ADR-0091's retrospective warns against for a *toolbar control*, where copy changes with the
    // width; a fact's label does not.
    const factsRow = page.locator('[data-schedule-state]');
    await expect(factsRow).toBeVisible();

    const sentence = factsRow.getByRole('status');
    await expect(sentence).toHaveText(/editing this plan/i);
    await expect(sentence).toHaveAttribute('aria-live', 'polite');

    // **The pinned negative, and it is the assertion that means the most.** The controls must NOT
    // have travelled with the sentence: a hand-off action belongs on the object. Without this the
    // suite passes equally against a change that moved the whole cluster, which is the shape this
    // milestone exists to avoid.
    await expect(factsRow.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);
  });

  /**
   * **This case passes in both states, and that is recorded rather than left for a reader to
   * discover.** Verified against a build with the outlet removed: the other two cases go red and
   * this one stays green, because everything it asserts is true whether the sentence moved or not —
   * the controls never left, and there is one live region either way. It is a pinned invariant, not
   * a discriminator, and its discriminating sibling is the first case above.
   */
  test('the badge and Stop editing stay on the identity row', async () => {
    const identityRow = page.locator('[data-plan-identity]').locator('..');
    await expect(identityRow.getByRole('button', { name: 'Stop editing' })).toBeVisible();

    // The state word stays visible beside the plan even though the sentence has moved, which is
    // what keeps the identity row self-explanatory at a glance.
    await expect(identityRow).toContainText('Editing');

    // And the sentence is not ALSO here — one subject, one place. A host that portalled and kept
    // its in-place copy would put two live regions in the document, which a screen-reader user
    // meets and a sighted reader does not.
    await expect(page.getByRole('status').filter({ hasText: /editing this plan/i })).toHaveCount(1);
  });

  test('releasing the pen updates the sentence in place, in the facts row', async () => {
    const factsRow = page.locator('[data-schedule-state]');
    await page
      .locator('[data-plan-identity]')
      .locator('..')
      .getByRole('button', { name: 'Stop editing' })
      .click();

    await expect(factsRow.getByRole('status')).toHaveText(/no one is editing this plan/i, {
      timeout: 15_000,
    });
    // Still exactly one region, still in the facts row: the transition must not relocate it.
    await expect(factsRow.getByRole('status')).toHaveCount(1);

    // Put the pen back so this spec leaves the fixture as it found it, for any spec that follows.
    await ensurePen(page);
  });
});
