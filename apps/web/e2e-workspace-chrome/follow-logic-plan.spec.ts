import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import {
  PLAN_STRIP,
  activityRows,
  announced,
  constrainViaApi,
  flaggedNames,
  footBase,
  footFigures,
  recordAnnouncements,
  requireRow,
  selectInList,
  selfHit,
  sentenceShape,
} from './follow-logic-support';
import {
  DATA_DATE,
  createHierarchy,
  diagramList,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
  placeViaApi,
  recalculate,
  seedActivities,
} from './support';

/**
 * **A plan with early-placed bars offers to let all of them follow** (placed-bar-follows-link M3,
 * ADR-0216 D6): the standing counterpart of the edit offer, in the dock, with **Follow logic** and
 * **Dismiss**. The plan here is built through the public REST API (the spec's own fixture: a seeded
 * plan opened, not an edit made), so the offer is raised by what the plan holds and nothing the
 * planner did last.
 *
 * What is asserted is INVARIANTS read in the same cell on the same runner, never an absolute pixel
 * figure: CI's text widths differ from the container's by a few pixels and the foot row has a
 * documented knife edge (see `dock.spec.ts`). Announcer text is polled, because `announce` writes the
 * polite region on the next animation frame.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 12_000;

/** The whole-plan offer, wherever the dock draws it. */
function planOffer(page: Page) {
  return page.getByTestId(PLAN_STRIP);
}

/** The Follow logic button of the whole-plan offer: the milestone's entry point. */
function followPlan(page: Page) {
  return page.getByTestId('canvas-follow-logic-plan');
}

/** The sentence the offer says for two bars, which is what the fixture below produces. */
const TWO_BARS = '2 bars stay where they were placed, before their logic allows.';

/**
 * Excavate drives Pour slab and Steel beam. Nothing is placed, so nothing is flagged and no offer
 * shows; {@link placeEarly} then places both followers on the data date, three working days before
 * Excavate lets them start (`compute.ts:345` flags a placement strictly before the network's earliest).
 */
async function seedChain(page: Page, orgSlug: string): Promise<void> {
  const [excavate, pour, beam] = await seedActivities(page, orgSlug, [
    { name: 'Excavate', laneIndex: 0 },
    { name: 'Pour slab', laneIndex: 1 },
    { name: 'Steel beam', laneIndex: 2 },
  ]);
  if (!excavate || !pour || !beam) throw new Error('seeding returned too few activities');
  await linkActivities(page, orgSlug, excavate.id, pour.id);
  await linkActivities(page, orgSlug, excavate.id, beam.id);
  await recalculate(page, orgSlug);
  await ensurePen(page);
}

/** Place both followers early through the API, recalculate so the engine flags them, and reload. */
async function placeEarly(page: Page, orgSlug: string): Promise<void> {
  await placeViaApi(page, orgSlug, 'Pour slab', DATA_DATE);
  await placeViaApi(page, orgSlug, 'Steel beam', DATA_DATE);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect
    .poll(async () => (await flaggedNames(page, orgSlug)).join(','), {
      message: 'the engine never flagged the early-placed bars',
      timeout: 30_000,
    })
    .toBe('Pour slab,Steel beam');
}

test.describe('The whole-plan offer', () => {
  test('offers every early-placed bar, moves them as one undo step, and Dismiss stays dismissed', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Whole plan offer');
    await ensurePen(page);
    await seedChain(page, orgSlug);
    await expect(
      planOffer(page),
      'nothing is placed before its logic, so there is nothing to offer',
    ).toHaveCount(0);

    // A commitment on Pour slab, which Follow logic must send back exactly as it found it.
    const snetDay = '2026-01-06';
    await constrainViaApi(
      page,
      orgSlug,
      requireRow(await activityRows(page, orgSlug), 'Pour slab'),
      {
        type: 'SNET',
        date: snetDay,
      },
    );
    await placeEarly(page, orgSlug);
    // After the last reload: a reload replaces the page, and the recorder with it.
    await recordAnnouncements(page);

    // ── The offer: one standing strip, the count in the spec's words, no role, not announced ─────
    await expect(planOffer(page)).toBeVisible({ timeout: 15_000 });
    await expect(planOffer(page)).toContainText(TWO_BARS);
    await expect(planOffer(page).getByRole('button')).toHaveText(['Follow logic', 'Dismiss']);
    expect(
      await planOffer(page).getAttribute('role'),
      'no live role: a standing condition',
    ).toBeNull();
    await expect(followPlan(page), 'the entry point is addressable, and there is one').toHaveCount(
      1,
    );
    await expect(
      page.getByTestId('canvas-follow-logic-offer'),
      'the edit offer is not what is showing',
    ).toHaveCount(0);
    expect(
      (await announced(page)).filter((text) => /stay where they were placed/.test(text)),
      'a standing condition is not announced when it appears',
    ).toHaveLength(0);

    // ── Follow logic: busy, visible, one write; the commitment stays ────────────────────────────
    let patches = 0;
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().endsWith('/activities/placements')) {
        patches += 1;
      }
    });
    await page.route('**/activities/placements', async (route) => {
      await new Promise((done) => setTimeout(done, 2500));
      await route.continue();
    });
    const placedBefore = new Map(
      (await activityRows(page, orgSlug)).map((row) => [row.name, row.visualStart]),
    );
    await followPlan(page).click();
    await expect(planOffer(page)).toHaveAttribute('data-phase', 'busy');
    await expect(planOffer(page)).toContainText('Moving “Pour slab” and 1 other…');
    for (const button of await planOffer(page).getByRole('button').all()) {
      await expect(button).toHaveAttribute('aria-disabled', 'true');
    }
    await expect(followPlan(page), 'focus is kept on the control that was pressed').toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await flaggedNames(page, orgSlug)).length, {
        message: 'one press of Follow logic left a flagged bar behind',
        timeout: 30_000,
      })
      .toBe(0);
    await page.unroute('**/activities/placements');
    expect(patches, 'two presses, one write: no double-submit').toBe(1);
    await expect(planOffer(page), 'the ask is replaced once the bars have moved').toHaveCount(0);

    const done = page.getByTestId('canvas-history-result');
    await expect(done).toContainText(
      '“Pour slab” and 1 other now follow their logic; dates will update.',
    );
    await expect(done.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await announced(page)).filter((text) => /now follow their logic/.test(text)).length,
        { message: 'the outcome is announced exactly once', timeout: 5000 },
      )
      .toBe(1);
    await expect(
      diagramList(page),
      'focus landed on the diagram’s list when the strip it was on went (ADR-0135)',
    ).toBeFocused();
    const followed = await activityRows(page, orgSlug);
    expect(requireRow(followed, 'Pour slab').visualStart).toBeNull();
    expect(requireRow(followed, 'Steel beam').visualStart).toBeNull();
    expect(
      [
        requireRow(followed, 'Pour slab').constraintType,
        requireRow(followed, 'Pour slab').constraintDate?.slice(0, 10),
      ],
      'the commitment survives: the batch sends it back as stored, never null',
    ).toEqual(['SNET', snetDay]);

    // ── One Ctrl+Z puts both placements back, and the standing question is true again ───────────
    await diagramList(page).focus();
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await flaggedNames(page, orgSlug)).join(','), {
        message: 'undoing Follow logic did not restore both placements in one step',
        timeout: 30_000,
      })
      .toBe('Pour slab,Steel beam');
    const restored = await activityRows(page, orgSlug);
    expect(requireRow(restored, 'Pour slab').visualStart).toBe(placedBefore.get('Pour slab'));
    expect(requireRow(restored, 'Steel beam').visualStart).toBe(placedBefore.get('Steel beam'));
    expect(requireRow(restored, 'Pour slab').constraintType).toBe('SNET');
    // The bars are flagged again (the chip counts them), but the planner has just taken the move
    // back, so the standing offer does not ask the question they answered (ADR-0216 D6).
    await page.waitForTimeout(2000);
    await expect(planOffer(page), 'no re-ask after undoing the offer’s own step').toHaveCount(0);
    expect(await flaggedNames(page, orgSlug)).toEqual(['Pour slab', 'Steel beam']);
  });

  test('a failed Follow logic stays in the strip, says why, and Try again works', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Whole plan failure');
    await ensurePen(page);
    await seedChain(page, orgSlug);
    await placeEarly(page, orgSlug);
    await recordAnnouncements(page);
    await expect(planOffer(page)).toBeVisible({ timeout: 15_000 });
    const before = await activityRows(page, orgSlug);

    await page.route('**/activities/placements', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":{"code":"X","message":"boom"}}',
      }),
    );
    await followPlan(page).click();
    await expect(planOffer(page)).toHaveAttribute('data-phase', 'failed');
    await expect(planOffer(page)).toContainText(
      'Couldn’t move “Pour slab” and 1 other just now. Nothing was changed.',
    );
    await expect(planOffer(page).getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await announced(page)).some((text) => text.startsWith('Couldn’t move “Pour slab”')),
        { message: 'the failure is announced as well as shown', timeout: 5000 },
      )
      .toBe(true);

    await page.unroute('**/activities/placements');
    await page.route('**/activities/placements', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: '{"error":{"code":"CONFLICT","message":"stale"}}',
      }),
    );
    await planOffer(page).getByRole('button', { name: 'Try again' }).click();
    await expect(planOffer(page)).toContainText(
      'Couldn’t follow logic: this plan changed since you opened it. Nothing was changed.',
    );
    expect(
      (await activityRows(page, orgSlug)).map((r) => [r.name, r.version, r.visualStart]),
      'a refused write changed nothing',
    ).toEqual(before.map((r) => [r.name, r.version, r.visualStart]));

    await page.unroute('**/activities/placements');
    await planOffer(page).getByRole('button', { name: 'Try again' }).click();
    await expect
      .poll(async () => (await flaggedNames(page, orgSlug)).length, { timeout: 30_000 })
      .toBe(0);
    await expect(page.getByTestId('canvas-history-result')).toContainText(
      '“Pour slab” and 1 other now follow their logic; dates will update.',
    );
    await expect(
      diagramList(page),
      'focus is on the plan surface after Try again succeeds, not on <body>',
    ).toBeFocused();

    // The strip's own Undo puts both back, leaves focus on the plan surface, and does not re-ask.
    await page.getByTestId('canvas-history-result').getByRole('button', { name: 'Undo' }).click();
    await expect
      .poll(async () => (await flaggedNames(page, orgSlug)).join(','), { timeout: 30_000 })
      .toBe('Pour slab,Steel beam');
    expect(
      await page.evaluate(() => document.activeElement === document.body),
      'focus did not fall to <body> after the strip’s Undo',
    ).toBe(false);
    await expect(diagramList(page)).toBeFocused();
    await page.waitForTimeout(1500);
    await expect(planOffer(page), 'and the offer does not ask again').toHaveCount(0);
  });

  test('Dismiss puts a failed offer away; a reload asks again', async ({ page }) => {
    test.setTimeout(300_000);
    const orgSlug = await onboard(page, STAMP + 2);
    await createHierarchy(page);
    await newPlan(page, 'Whole plan dismiss failed');
    await ensurePen(page);
    await seedChain(page, orgSlug);
    await placeEarly(page, orgSlug);
    await expect(planOffer(page)).toBeVisible({ timeout: 15_000 });
    const before = await activityRows(page, orgSlug);
    await page.route('**/activities/placements', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":{"code":"X","message":"boom"}}',
      }),
    );
    let patches = 0;
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().endsWith('/activities/placements')) {
        patches += 1;
      }
    });
    await followPlan(page).click();
    await expect(planOffer(page)).toHaveAttribute('data-phase', 'failed');
    const attempted = patches;

    await planOffer(page).getByRole('button', { name: 'Dismiss' }).click();
    await expect(planOffer(page), 'Dismiss works in the failed phase too').toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement === document.body),
      'focus did not fall to <body> when the strip left',
    ).toBe(false);
    await expect(diagramList(page)).toBeFocused();
    await page.waitForTimeout(1500);
    await expect(planOffer(page), 'it stays dismissed').toHaveCount(0);
    expect(patches, 'Dismiss writes nothing').toBe(attempted);
    expect(
      (await activityRows(page, orgSlug)).map((r) => [r.name, r.version, r.visualStart]),
    ).toEqual(before.map((r) => [r.name, r.version, r.visualStart]));

    // Not remembered across a reload: a known trade-off, recorded in ADR-0216.
    await page.unroute('**/activities/placements');
    await page.reload();
    await ensurePen(page);
    await expect(planOffer(page)).toBeVisible({ timeout: 20_000 });
  });

  test('under the Late-start overlay Follow logic is shaded with its reason, and Enter writes nothing', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const orgSlug = await onboard(page, STAMP + 3);
    await createHierarchy(page);
    await newPlan(page, 'Whole plan shaded');
    await ensurePen(page);
    await seedChain(page, orgSlug);
    await placeEarly(page, orgSlug);
    await expect(planOffer(page)).toBeVisible({ timeout: 15_000 });
    let patches = 0;
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().endsWith('/activities/placements')) {
        patches += 1;
      }
    });
    const overlay = page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Late-start overlay' });
    await overlay.click();
    const shaded = followPlan(page);
    await expect(shaded).toHaveAttribute('aria-disabled', 'true');
    await expect(shaded).toHaveAccessibleDescription(/Late-start overlay/);
    await shaded.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    expect(patches, 'a shaded Follow logic writes nothing').toBe(0);
    await expect(shaded, 'and focus stays on it').toBeFocused();
    await overlay.click();
    await expect(shaded).toHaveAttribute('aria-disabled', 'false');
  });
});

/** Every button of the strip is pressable where it is, and the foot row does not scroll sideways. */
async function expectPlanOfferFits(page: Page, label: string): Promise<void> {
  await expect(planOffer(page)).toBeVisible();
  const buttons = planOffer(page).getByRole('button');
  expect(await buttons.count(), `${label}: the strip’s two buttons`).toBe(2);
  for (const button of await buttons.all()) {
    expect(
      await selfHit(button),
      `${label}: a pointer at the centre of “${await button.textContent()}”`,
    ).toBe(true);
  }
  expect((await footFigures(page, PLAN_STRIP)).sideways, `${label}: no sideways scroll`).toBe(
    false,
  );
  const sentence = await sentenceShape(page, PLAN_STRIP);
  expect(sentence.cut, `${label}: the sentence is never cut`).toBe(false);
}

/** The strip costs the foot row at most its own height and the 8 px gap, against a base read here. */
async function expectCostsItsOwnHeight(page: Page, label: string): Promise<void> {
  const figures = await footFigures(page, PLAN_STRIP);
  const base = await footBase(page, PLAN_STRIP);
  expect(
    figures.foot - base.foot,
    `${label}: the strip costs the foot row at most its own height and gap (foot ${String(figures.foot)}, base ${String(base.foot)}, strip ${String(figures.strip)})`,
  ).toBeLessThanOrEqual(figures.strip + 8 + 4);
}

for (const { pointer, touch } of [
  { pointer: 'mouse', touch: false },
  { pointer: 'finger', touch: true },
] as const) {
  test.describe(`The whole-plan offer in the foot row, ${pointer}`, () => {
    test.use({ hasTouch: touch });

    test(`1250 and 1024 wide: every button pressable, no sideways scroll, the strip costs its own height (${pointer})`, async ({
      page,
    }) => {
      test.setTimeout(420_000);
      const orgSlug = await onboard(page, STAMP + (touch ? 11 : 10));
      await createHierarchy(page);
      await newPlan(page, 'Plan offer row');
      await ensurePen(page);
      await seedChain(page, orgSlug);
      await placeEarly(page, orgSlug);
      expect(
        await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
        'the pointer this describe says it is',
      ).toBe(touch);

      await page.setViewportSize({ width: 1250, height: 800 });
      await selectInList(page, orgSlug, 'Pour slab');
      await expectPlanOfferFits(page, `${pointer} 1250 × 800, flagged bar selected`);
      await expectCostsItsOwnHeight(page, `${pointer} 1250 × 800, flagged bar selected`);

      await page.setViewportSize({ width: 1024, height: 600 });
      await diagramList(page).focus();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('toolbar', { name: /^Actions for / })).toHaveCount(0);
      await expectPlanOfferFits(page, `${pointer} 1024 × 600, nothing selected`);
      await expectCostsItsOwnHeight(page, `${pointer} 1024 × 600, nothing selected`);
      expect(
        (await footFigures(page, PLAN_STRIP)).stage,
        'with nothing selected the stage keeps its 120 px floor',
      ).toBeGreaterThanOrEqual(120);

      await selectInList(page, orgSlug, 'Pour slab');
      await expectPlanOfferFits(page, `${pointer} 1024 × 600, flagged bar selected`);
      await expectCostsItsOwnHeight(page, `${pointer} 1024 × 600, flagged bar selected`);

      // Dismissing gives the height back: the dock is the base dock again.
      const base = await footBase(page, PLAN_STRIP);
      await planOffer(page).getByRole('button', { name: 'Dismiss' }).click();
      await expect(planOffer(page)).toHaveCount(0);
      const dismissed = await page.evaluate(() =>
        Math.round(
          document.querySelector<HTMLElement>('[data-activities-bar]')?.getBoundingClientRect()
            .height ?? 0,
        ),
      );
      expect(
        Math.abs(dismissed - base.foot),
        'the dismissed dock is the base dock',
      ).toBeLessThanOrEqual(2);
    });
  });
}

test.describe('The whole-plan offer at 200 % text', () => {
  test('every button can be reached by scrolling, and nothing scrolls sideways', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: 1646, height: 1097 });
    const orgSlug = await onboard(page, STAMP + 20);
    await createHierarchy(page);
    await newPlan(page, 'Plan offer 200');
    await ensurePen(page);
    await seedChain(page, orgSlug);
    await placeEarly(page, orgSlug);

    await page.setViewportSize({ width: 1024, height: 600 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    await expect(planOffer(page)).toBeVisible();
    for (const button of await planOffer(page).getByRole('button').all()) {
      expect(
        await selfHit(button),
        `200 %: “${await button.textContent()}” is reachable after scrolling it into view`,
      ).toBe(true);
    }
    expect((await footFigures(page, PLAN_STRIP)).sideways, '200 %: no sideways scroll').toBe(false);
    expect((await sentenceShape(page, PLAN_STRIP)).cut, '200 %: the sentence is never cut').toBe(
      false,
    );
  });
});

test.describe('The whole-plan offer reflows at 320 CSS px (WCAG 1.4.10)', () => {
  test.use({ acknowledgeViewportNotice: true });

  test('no sideways scroll, and both buttons are still hit-testable', async ({ page }) => {
    test.setTimeout(300_000);
    const orgSlug = await onboard(page, STAMP + 30);
    await createHierarchy(page);
    await newPlan(page, 'Plan offer reflow');
    await ensurePen(page);
    await seedChain(page, orgSlug);
    await placeEarly(page, orgSlug);

    await page.setViewportSize({ width: 320, height: 640 });
    await expectPlanOfferFits(page, '320 px');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      '320 px: the page does not scroll sideways',
    ).toBe(true);
  });
});
