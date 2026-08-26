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

/**
 * **M2 — the merged header row: one line at 1646, two at 1440.**
 *
 * The epic's headline acceptance condition, and it is asserted in a browser because nothing else can
 * ask it. The row's shape is a flex-wrap outcome — no breakpoint, no `matchMedia`, no observer — so
 * there is no value to unit-test and jsdom has no layout to measure. Written before the merge was
 * built and **verified red against both wrong states**: a surviving `flex-1` on the identity block
 * (one line at every width, plan name truncating towards nothing) and a shrinkable mode cluster
 * (two ragged lines where one clean one was expected).
 *
 * Measured with the same instrument the design was chosen on: the row requires 1482 px, its wrap
 * point is a container of 1480, and the containers at these two viewports are 1588 and 1382
 * (`docs/specs/one-row-header/m2-measurement.md`).
 */
test.describe('the merged header row', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1646, height: 1097 } });
    const orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
    // A long-but-plausible construction plan name. A short one is how three prior costings of this
    // row reported slack that a real plan did not have (ADR-0091 M7).
    await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
    await recalculate(page, orgSlug);
    await ensurePen(page);
    await expect(page.getByRole('toolbar', { name: 'Plan mode' })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  /** The row's height in line boxes, derived from its tallest child rather than from a constant. */
  const lines = async (p: Page): Promise<number> =>
    p.evaluate(() => {
      const row = document.querySelector('header')?.firstElementChild as HTMLElement | null;
      if (!row) return 0;
      const tallest = Math.max(
        0,
        ...[...row.children].map((c) => (c as HTMLElement).getBoundingClientRect().height),
      );
      return tallest > 0 ? Math.round(row.getBoundingClientRect().height / tallest) : 0;
    });

  test('is one line at 1646 and two at 1440, with the plan name readable in both', async () => {
    for (const [width, expected] of [
      [1646, 1],
      [1440, 2],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(400);

      expect(await lines(page), `line count at ${width}`).toBe(expected);

      // **Readable, not merely present.** A `flex-1` identity block keeps the row one line by
      // shrinking the plan name towards nothing — which passes a "the row is one line" assertion
      // and is the exact failure the design turns on. So the name's own box is measured.
      const name = page.locator('[data-plan-identity]').getByText('Riverside Quarter', {
        exact: false,
      });
      await expect(name).toBeVisible();
      const box = await name.boundingBox();
      expect(box?.width ?? 0, `plan name width at ${width}`).toBeGreaterThan(80);

      // The four modes stay on one line inside the row: a mode cluster that folds turns one clean
      // row into two ragged ones, which is the hazard ADR-0109 D1 left behind when it replaced
      // demotion with wrapping.
      const modes = page.getByRole('toolbar', { name: 'Plan mode' });
      const modeBox = await modes.boundingBox();
      const firstMode = await modes.getByRole('button').first().boundingBox();
      expect(
        Math.round((modeBox?.height ?? 0) / (firstMode?.height ?? 1)),
        `mode cluster lines at ${width}`,
      ).toBe(1);
    }
  });

  test('keeps the account chip as the row trailing control on both shapes', async () => {
    for (const width of [1646, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(400);
      const account = await page.getByRole('banner').getByRole('button').last().boundingBox();
      const row = await page.getByRole('banner').boundingBox();
      // ADR-0091 M7 records a flex line splitting free space equally between every auto margin,
      // leaving a trailing group 281 px adrift. There is exactly one `ml-auto` here; this asserts it.
      expect(
        (row?.x ?? 0) + (row?.width ?? 0) - ((account?.x ?? 0) + (account?.width ?? 0)),
      ).toBeLessThan(40);
    }
  });
});
