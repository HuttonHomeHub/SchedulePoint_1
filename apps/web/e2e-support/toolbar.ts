import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Locating a plan command **wherever the width ladder has put it**.
 *
 * ## Why this is shared rather than per-suite
 *
 * The TSLD command surface demotes commands into the `⋯` when the row runs out of width, so
 * "where is this control" is a function of the viewport, the plan's state and the item's
 * `priority` — none of which a journey should have to model. A locator written against the inline
 * control is a locator coupled to one layout answer at one width.
 *
 * That coupling was invisible while ADR-0031's two rows had room for nearly everything. Graphite
 * M5 merged them onto one budget, `calendar` became menu-only at every width, and
 * `e2e-library/support.ts` timed out on a locator whose own comment promised the opposite:
 * *"the id is what the registry actually guarantees"*.
 *
 * `e2e-float-paths` had already met the same problem and solved it locally. Two implementations of
 * "where is this command" would drift, and the drift would be invisible until a width changed —
 * the ADR-0065 `routeOrthogonal` argument. So there is one.
 *
 * ## What makes it work at all
 *
 * `data-toolbar-item` is now written by `Toolbar` on the inline control **and** by
 * `ToolbarOverflow` on the menu row (both the enabled and the shaded branch). Before that this
 * helper could not have existed: the menu row was reachable only by copy, so a suite would have had
 * to name a label inline and a different one in the menu, and re-edit both on every wording change.
 */

/** The plan workspace's single command strip (Graphite M5 merged the two rows into it). */
export function planCommands(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Plan commands' });
}

/**
 * The control for `id`, opening the `⋯` only if it is not on the row.
 *
 * **Awaits the row before asking.** `count()` is a point-in-time read with no auto-wait, so calling
 * it before the toolbar mounts finds nothing inline and then waits out the timeout on a `⋯` that a
 * wide row never renders — a helper that reports "it is in the menu" when what it saw was an empty
 * page. That trap is not hypothetical; `e2e-float-paths` records hitting it on a slower machine.
 */
export async function revealToolbarCommand(page: Page, id: string): Promise<Locator> {
  const row = planCommands(page);
  await expect(row).toBeVisible();

  const inline = row.locator(`[data-toolbar-item="${id}"]`);
  if ((await inline.count()) > 0) return inline;

  const more = row.getByRole('button', { name: 'More toolbar actions' });
  await expect(
    more,
    `${id} is neither on the row nor is there an overflow to look in`,
  ).toBeVisible();
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();

  // The menu portals to `document.body`, so it is scoped from the page rather than from the row.
  return page.locator(`[role="menu"] [data-toolbar-item="${id}"]`);
}

/**
 * Click a plan command by registry id, wherever the ladder has put it.
 *
 * The overwhelmingly common shape — `await (await revealToolbarCommand(page, id)).click()` reads
 * badly and every call site wrote it the same way. Added when a **third** suite needed it: the
 * `e2e-gantt-editing` specs had ten `getByRole('button', { name: 'Recalculate' })` calls, which
 * work only while the ladder happens to leave that command on the row in that view at that width.
 */
export async function clickToolbarCommand(page: Page, id: string): Promise<void> {
  const control = await revealToolbarCommand(page, id);
  await control.click();
}

/**
 * Is `id` offered by the command strip at all — on the row **or** in the `⋯`?
 *
 * The negative form matters as much as the positive one. A journey asserting a command is *gone*
 * has to look in both places, or it passes the moment the ladder demotes it — which is what
 * happened to `e2e-gantt-editing`'s "switching back brings Add note home": that assertion had been
 * failing since the two command rows merged and `add-note` moved into the menu, in the one suite a
 * sweep never finished.
 *
 * Leaves the `⋯` as it found it, so a caller can assert either way without a side effect.
 */
export async function toolbarOffers(page: Page, id: string): Promise<boolean> {
  const row = planCommands(page);
  await expect(row).toBeVisible();
  if ((await row.locator(`[data-toolbar-item="${id}"]`).count()) > 0) return true;

  const more = row.getByRole('button', { name: 'More toolbar actions' });
  if ((await more.count()) === 0) return false;
  const wasOpen = (await more.getAttribute('aria-expanded')) === 'true';
  if (!wasOpen) await more.click();
  const offered = (await page.locator(`[role="menu"] [data-toolbar-item="${id}"]`).count()) > 0;
  if (!wasOpen) await page.keyboard.press('Escape');
  return offered;
}
