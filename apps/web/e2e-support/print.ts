import { expect, type Page } from '@playwright/test';

/**
 * Open `Share & export ▾ → Print…` (the trigger reads `Export` once Share… is on the bar) and
 * wait for the print document to mount.
 *
 * **It asserts the item is not shaded before clicking, and that is the whole point of the helper.**
 * `Print…` is `disabled={!ctx.hasDiagram}`, and `hasDiagram` reads the activities query — so it is
 * false until that query resolves. `Menu`'s items are shaded with `aria-disabled` rather than the
 * native attribute (ADR-0082, so a `disabledReason` stays keyboard-reachable) and `onSelect`
 * returns early, which makes a Playwright click on a shaded item a **silent no-op**: no error, no
 * retry, just thirty seconds of waiting for a container nothing asked for.
 *
 * That is exactly how this failed in CI and not on my machine. The Gantt half reloads the route,
 * and a runner is slow enough that the treegrid renders — empty — before the activities arrive, so
 * the click landed on a shaded item. Waiting for a row is the cause; asserting the item is the
 * guard, and it fails in one second naming the real reason instead of timing out on a symptom.
 */
export async function openPrintDocument(page: Page): Promise<void> {
  // **Stop the print dialog opening, or the document is gone before it can be read.**
  // `mountPrintDocument` tears the container down on `afterprint` — whichever of that event and a
  // 60 s fallback comes first — so in a browser that fires `afterprint` for a headless `print()`
  // the document exists for microseconds. `scripts/shoot.mjs` has stubbed `print` for exactly this
  // reason since it was written, and its comment says so; this journey did not, and paid for it
  // over four CI rounds.
  //
  // **The local probe that argued against this was a true measurement of the wrong browser.** On
  // this container's Chromium it recorded `{containers: 1, afterprint: 0}` at every sample, which
  // is why teardown was ruled out; CI's build fires it. What settled it was the diagnostic
  // reporting `live region: "… | Printing Paper face."` with `containers: 0` — that sentence is
  // announced INSIDE the success branch, after `mountPrintDocument` has run, so the document had
  // been created and removed rather than never made.
  //
  // Re-applied on every call because a navigation resets it.
  await page.evaluate(() => {
    globalThis.print = () => {};
  });
  await page
    // "Export" while Share… is promoted onto the bar beside it, "Share & export" otherwise.
    .getByRole('button', { name: /^(share & )?export$/i })
    .first()
    .click();
  const print = page.getByRole('menuitem', { name: 'Print…', exact: true });
  await expect(
    print,
    'Print… is shaded — the plan has no computed diagram yet, so this click would do nothing',
  ).not.toHaveAttribute('aria-disabled', 'true');
  await print.click();
  // `attached`, not the default visibility: the container is `display: none` until the print
  // stylesheet shows it.
  //
  // **Racing the banner is the diagnosis, not belt-and-braces.** The TSLD path builds the
  // whole-plan PNG first and only mounts on success; a build failure is caught, announced and
  // rendered as a `role="alert"`. Without this the assertion waits the full thirty seconds, three
  // times, and reports "element(s) not found" — which names the symptom and hides the cause, and
  // is exactly what a CI run cost before this was here.
  const container = page.locator('.tsld-print-container');
  const banner = page.getByRole('alert').first();
  const attached = await container
    .waitFor({ state: 'attached', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (attached) return;

  // **Report which silent return it was, and gather it BEFORE throwing.** `printDiagram` has three
  // exits that render nothing — the flag is off, `printing` is already true, or
  // `buildDiagramImage` returned null because the canvas handle or the data date was absent —
  // and only the fourth, a rejected build, shows a banner. The discriminator is the live region:
  // the TSLD path announces "Preparing the diagram to print…" **after** the build starts, so its
  // absence puts the return before that line and its presence with no container puts the failure
  // after it.
  //
  // Every read here is short-timeout and `.catch`ed. The first version raced two 30 s waits and
  // then evaluated, and when the test hit its own timeout the evaluate reported "Target page …
  // has been closed" — a diagnostic that replaced the diagnosis with an artefact of itself.
  const said = await banner.textContent({ timeout: 2000 }).catch(() => null);
  const state = await page
    .evaluate(() => ({
      announced: [...document.querySelectorAll('[role="status"], [aria-live]')]
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean)
        .join(' | '),
      canvases: document.querySelectorAll('canvas').length,
      containers: document.querySelectorAll('.tsld-print-container').length,
    }))
    .catch(() => null);
  throw new Error(
    (said
      ? `Print… was clicked and the app answered "${said.trim()}" instead of mounting a print document`
      : 'Print… was clicked, no print document mounted, and the app reported nothing') +
      (state
        ? ` — live region: "${state.announced}"; canvases: ${state.canvases}; containers: ${state.containers}`
        : ' — and the page closed before its state could be read'),
  );
}
