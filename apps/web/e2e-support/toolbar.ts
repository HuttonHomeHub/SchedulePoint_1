import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Locating a plan command by **registry id**, wherever the surface has put it.
 *
 * ## Why this is shared rather than per-suite
 *
 * It was written for a command surface that DEMOTED: the TSLD row hid commands in a `⋯` when it ran
 * out of width, so "where is this control" was a function of the viewport, the plan's state and the
 * item's `priority` — none of which a journey should have to model. Two implementations of that
 * question would drift and the drift would be invisible until a width changed (the ADR-0065
 * `routeOrthogonal` argument), so there was one.
 *
 * **The width ladder and its `⋯` are gone** (workspace redesign M2). The command surface is a deck
 * that wraps, so every command is inline at every width and the menu branch below is unreachable.
 * It is kept rather than deleted for one reason and it is not sentiment: the deck's groups FOLD, and
 * a folded group's items are absent from the DOM. Nothing exercises that path today because nothing
 * persists a fold across a journey's fresh profile, and a helper that already answers "wherever the
 * surface has put it" is where that answer belongs when it does.
 *
 * ## What makes it work at all
 *
 * `data-toolbar-item` is written by `Toolbar` on every inline control. Locating by it rather than by
 * copy is the standing rule after three journeys broke on a label change (ADR-0091 M7): the id is
 * what the registry guarantees, and the words are not.
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

/**
 * Ensure the open plan's schedule is computed, pressing the status bar's **Recalculate** when there
 * is something to compute.
 *
 * ## Why a helper rather than a locator (workspace redesign M3-T5)
 *
 * `Recalculate` used to be a toolbar command, offered at every moment of every session, so nineteen
 * call sites across ten suites could write `getByRole('button', { name: 'Recalculate' }).click()`
 * and be right. It is now attached to the condition it answers: it appears only when the schedule is
 * behind the plan, and disappears the moment it is not.
 *
 * That makes the naive locator **racy in both directions**. Auto-recalculation has fired on every
 * structural edit since ADR-0032 M3, so after a UI edit the control may appear and vanish before a
 * journey looks; and a plan seeded through the API has never been calculated, so the control is
 * waiting from first paint. "Renders nothing" is indistinguishable from "has not painted yet" by any
 * point-in-time read — the exact trap `revealToolbarCommand` above records hitting on a slow
 * machine — which is why the bar carries `data-schedule-state` unconditionally and this waits on it.
 *
 * The postcondition is what every caller actually wanted: **the schedule is current**. Callers that
 * merely need dates on the bars get that whether the press happened or auto-recalculation beat them
 * to it, which is why the press is conditional rather than asserted.
 */
export async function recalculate(page: Page): Promise<void> {
  const bar = page.locator('[data-schedule-state]');
  await expect(bar).toBeVisible();
  // Wait out any run already in flight, so the read below is a settled answer.
  await expect(bar).not.toHaveAttribute('data-schedule-state', 'recalculating');
  if ((await bar.getAttribute('data-schedule-state')) === 'stale') {
    await bar.getByRole('button', { name: 'Recalculate' }).click();
  }
  await expect(bar).toHaveAttribute('data-schedule-state', 'current');
}
