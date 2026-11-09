import { expect, type Page } from '@playwright/test';

/**
 * Take the pen the way a planner does: press **Start editing** in the plan workspace and wait for
 * the workspace to say it is ours.
 *
 * Every journey that edits goes through this, so the pen layer is exercised in the base journey the
 * way the shipped bundle runs it (docs/TECH_DEBT.md #121). It never calls the lock endpoint
 * directly: a shortcut that took the pen over the API would leave the one control a person presses
 * untested, and would pass while that control was broken.
 *
 * Two assertions, because either alone can pass for the wrong reason: the control flips to
 * **Stop editing** (the holder's affordance), and the status line reads "You’re editing this
 * plan." (`lock-copy.ts` `holding`), matched exactly so other copy containing it cannot satisfy it.
 * Not idempotent: it fails loudly if the pen is already held — a journey that takes it twice has
 * lost track of its own state.
 *
 * Shared from `e2e-support/` because a Playwright `testDir` is its own compilation root.
 */
export async function takeThePen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  await expect(page.getByText('You’re editing this plan.', { exact: true })).toBeVisible();
}
