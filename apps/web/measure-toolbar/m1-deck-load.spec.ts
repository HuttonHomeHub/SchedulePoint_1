import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **M1's falsification condition, and M4's — measured before either is built.**
 *
 * M1 takes `zoom-to-selection` and `isolate-logic` off the object bar so the foot row stops
 * wrapping (measured: +36 px of canvas at 1646). They go back to the command deck, which is where
 * they were until ADR-0090 M2-T1 moved them. **That milestone's stated reason is not the one the
 * design review reported.** `tsld-toolbar-items.tsx:2184-2186` says it in full:
 *
 *   > `zoom-to-selection` moved to the SELECTION BAR in ADR-0090 M2-T1, with `isolate-logic` and
 *   > `float-paths`. All three required a selection, so all three spent most of their life on Row 1
 *   > shaded — holding width to say "Select an activity first".
 *
 * That is an objection about **shaded controls holding width**, not about a pinned floor, and
 * ADR-0109 D1 did not delete it — it only removed the rationing at widths where the deck now has
 * slack. M0 measured that slack as 1175.6 px on line 2 at 1920 and 275/375 px at 1646, but only
 * **69.2/169.5 px at 1440**. So the objection may still hold at the narrow end, and the trade would
 * be 36 px of canvas at 1646 bought with a deck line at 1440.
 *
 * The product owner has separately asked for three lens toggles (`Critical path`, `Float paths`,
 * `Baseline overlay`) promoted out of `View ▾`, and accepted a stated risk of an extra deck line at
 * 1440. This measures both loads, together and separately, so that risk is a number rather than a
 * caveat.
 *
 * **Falsification, written before the run.** If either load adds a line to the deck at 1646 — the
 * width this epic exists to serve — that half is withdrawn and re-opened rather than shipped. A
 * line at 1440 only is a decision for the product owner, reported with its cost.
 *
 * Clones are injected into the real cards and removed; that is not how either change would be
 * built. It establishes the budget, not the implementation (ADR-0081 §3).
 */
const LOADS: ReadonlyArray<{ name: string; add: ReadonlyArray<{ card: number; label: string }> }> =
  [
    { name: 'today', add: [] },
    {
      name: 'M1 only: zoom-to-selection + isolate-logic return to Find',
      add: [
        { card: 1, label: 'Zoom to selection' },
        { card: 1, label: 'Isolate logic path' },
      ],
    },
    {
      name: 'M4a: 1 lens toggle (Critical path)',
      add: [{ card: 0, label: 'Critical path' }],
    },
    {
      name: 'M4b: 2 lens toggles',
      add: [
        { card: 0, label: 'Critical path' },
        { card: 0, label: 'Float paths' },
      ],
    },
    {
      name: 'M4c: 3 lens toggles, icon-only',
      add: [
        { card: 0, label: '' },
        { card: 0, label: '' },
        { card: 0, label: '' },
      ],
    },
    {
      name: 'M4 only: 3 lens toggles promoted to View',
      add: [
        { card: 0, label: 'Critical path' },
        { card: 0, label: 'Float paths' },
        { card: 0, label: 'Baseline overlay' },
      ],
    },
    {
      name: 'M1 + M4 together',
      add: [
        { card: 1, label: 'Zoom to selection' },
        { card: 1, label: 'Isolate logic path' },
        { card: 0, label: 'Critical path' },
        { card: 0, label: 'Float paths' },
        { card: 0, label: 'Baseline overlay' },
      ],
    },
  ];

test('M1/M4 falsification: what the deck does when it takes the load back', async ({ page }) => {
  clearMeasurement('m1-deck-load');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const apply = (add: ReadonlyArray<{ card: number; label: string }>) =>
    page.evaluate((items: ReadonlyArray<{ card: number; label: string }>) => {
      const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      if (!deck) return;
      for (const el of deck.querySelectorAll('[data-probe-clone]')) el.remove();
      const cards = [...deck.children];
      // A donor with a visible label, so the clone carries the shipped CVA rather than a guess.
      const donor = [...deck.querySelectorAll('[data-toolbar-item]')].find((el) =>
        [...el.querySelectorAll('span')].some(
          (s) => !s.className.toString().includes('sr-only') && (s.textContent ?? '').trim(),
        ),
      );
      if (!donor) return;
      for (const { card, label } of items) {
        const host = cards[card];
        if (!host) continue;
        const clone = donor.cloneNode(true) as HTMLElement;
        clone.setAttribute('data-probe-clone', '');
        clone.removeAttribute('data-toolbar-item');
        const span = [...clone.querySelectorAll('span')].find(
          (s) => !s.className.toString().includes('sr-only') && (s.textContent ?? '').trim(),
        );
        if (span) span.textContent = label;
        // Append into the card's own control container, so it joins the same flex line the real
        // controls are on rather than sitting beside the caption.
        const target = host.querySelector('[role="group"]') ?? host.lastElementChild ?? host;
        target.appendChild(clone);
      }
    }, add);

  const read = (name: string, width: number) =>
    page.evaluate(
      ({ label, w }: { label: string; w: number }) => {
        const r = (n: number): number => Math.round(n * 10) / 10;
        const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
        const band = document.querySelector('[data-surface="chrome"]');
        const cv = document.querySelector('canvas');
        const cards = deck ? [...deck.children] : [];
        const tops = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().y)))];
        return {
          load: label,
          width: w,
          deckH: deck ? r(deck.getBoundingClientRect().height) : null,
          deckLines: tops.length,
          bandH: band ? r(band.getBoundingClientRect().height) : null,
          canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
          cards: cards.map((c) => r(c.getBoundingClientRect().width)),
        };
      },
      { label: name, w: width },
    );

  const results: Array<Record<string, unknown>> = [];
  for (const width of [1920, 1646, 1440]) {
    await page.setViewportSize({
      width,
      height: width === 1440 ? 900 : width === 1646 ? 1097 : 1080,
    });
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(500);
    for (const load of LOADS) {
      await apply(load.add);
      await page.waitForTimeout(320);
      results.push(await read(load.name, width));
    }
    await apply([]);
  }

  writeMeasurement('m1-deck-load', results);
  expect(results.length).toBe(LOADS.length * 3);
});
