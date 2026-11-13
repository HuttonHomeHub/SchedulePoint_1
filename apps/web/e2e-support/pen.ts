import { expect, type Page } from '@playwright/test';

/**
 * Hold the pen the way a planner does, whichever state the plan opens in, and wait for the
 * workspace to say it is ours.
 *
 * Every journey that edits goes through this, so the pen layer is exercised in the base journey the
 * way the shipped bundle runs it (docs/TECH_DEBT.md #121). It never calls the lock endpoint
 * directly: a shortcut that took the pen over the API would leave the one control a person presses
 * untested, and would pass while that control was broken.
 *
 * **Idempotent, and correct in both orderings.** It waits until the pen control has settled on
 * either verb — **Stop editing** (this session already holds the lease: a reload that retook it, a
 * second tab, or an opening that acquires on its own) or an **enabled** **Start editing** — and
 * presses Start only in the second case. "Enabled" is the point: while the lock status loads, and
 * while an automatic acquire is in flight, the deck shades the pen (`aria-disabled`), and a button
 * that is shaded is not an offer. Deciding with `stop.isVisible()` instead answers at once and, on a
 * page whose pen is still being drawn, takes the "not held" branch and waits for a Start that
 * becomes Stop (the PR #669 failure). The decision is re-taken on every attempt for the same reason.
 *
 * Two assertions at the end, because either alone can pass for the wrong reason: the control reads
 * **Stop editing** (the holder's affordance), and the status line reads "You’re editing this plan."
 * (`lock-copy.ts` `holding`), matched exactly so other copy containing it cannot satisfy it.
 *
 * A journey that means "nobody holds it" asserts that with {@link expectPenFree}; this helper no
 * longer fails when the pen is already held, so it is not that tripwire.
 *
 * Shared from `e2e-support/` because a Playwright `testDir` is its own compilation root.
 */
export async function holdThePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  const offer = page.getByRole('button', { name: 'Start editing', disabled: false });
  try {
    await expect(async () => {
      await stop.or(offer).first().waitFor({ timeout: 5_000 });
      if (await stop.isVisible()) return;
      await offer.first().click({ timeout: 2_000 });
      await expect(stop).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  } catch (error) {
    const seen = await page
      .getByRole('button', { name: /editing|Request control|Waiting/ })
      .evaluateAll((els) => els.map((el) => `${el.textContent?.trim()} (${el.ariaDisabled})`))
      .catch(() => ['(page unreadable)']);
    throw new Error(
      `holdThePen: the pen never settled on Stop editing. Pen buttons: ${seen.join(' | ') || 'none'}`,
      { cause: error },
    );
  }
  await expect(stop).toBeVisible();
  await expect(page.getByText('You’re editing this plan.', { exact: true })).toBeVisible();
}

/** Let the pen go from the deck, and wait for the control to offer it again. */
export async function releaseThePen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
}

/**
 * Assert that the plan is free to take: the control offers **Start editing** and nobody — this
 * session included — holds it. The explicit form of what `holdThePen`'s old failure mode used to
 * give by accident, for a test that is about the free state.
 */
export async function expectPenFree(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);
}
