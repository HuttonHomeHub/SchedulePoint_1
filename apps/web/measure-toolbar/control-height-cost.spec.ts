import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **What 44 px costs the diagram** — M0-T2 of `docs/specs/touch-and-control-height/`, the number
 * conditions **F2** and **F3** turn on, and therefore the number CQ-1 and CQ-2 turn on.
 *
 * `aboveCanvas` is read from the **canvas's own `getBoundingClientRect().top`**, never by summing
 * bands and never from the toolbar's `clientWidth` — the `vertical-stack` harness's rule, and the
 * reason ADR-0091 D4 was withdrawn (a toolbar resolving its density from its own leftover width)
 * and ADR-0114 M7 corrected (a pass whose input was its output).
 *
 * **Treatments are injected stylesheets, not separate builds — a deliberate deviation from the
 * plan's M0-T2 step, with its reason.** The plan says "a separate build, never a live style
 * mutation", to avoid measuring the epic's own output. That risk is specific to a **JS width pass**
 * reading its own result, and this surface no longer has one: `Toolbar.tsx:64` records that it "no
 * longer measures anything" and `Deck.tsx:30` that there is "no `ResizeObserver` here, no
 * `clientWidth` read, no width constant" — the deck wraps in pure CSS. An injected custom property
 * therefore reflows exactly as a built one would, with no feedback loop to corrupt, and three Vite
 * builds × three runs of pure overhead buys nothing. If a JS measurement pass ever returns to this
 * surface, this deviation stops being safe and the plan's original instruction applies again.
 *
 * Asserts no product property — a harness (ADR-0081 §3).
 */

const CONTROL_H_44 = '2.75rem';

interface Reading {
  aboveCanvas: number | null;
  canvasHeight: number | null;
  deckHeight: number | null;
  viewport: { width: number; height: number };
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const deck = document
      .querySelector('[role="toolbar"][aria-label="Plan commands"]')
      ?.closest('[data-toolbar-band]') as HTMLElement | null;
    const deckEl =
      deck ?? document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Plan commands"]');
    const cb = canvas?.getBoundingClientRect();
    const db = deckEl?.getBoundingClientRect();
    if (!canvas) throw new Error('control-height-cost: no canvas — the workspace did not render');
    return {
      aboveCanvas: cb ? Math.round(cb.top * 10) / 10 : null,
      canvasHeight: cb ? Math.round(cb.height * 10) / 10 : null,
      deckHeight: db ? Math.round(db.height * 10) / 10 : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

/** Inject a treatment stylesheet; returns a handle to remove it. */
async function treat(page: Page, id: string, css: string): Promise<void> {
  await page.evaluate(
    ({ id: elId, css: text }) => {
      const el = document.createElement('style');
      el.id = elId;
      el.textContent = text;
      document.head.appendChild(el);
    },
    { id, css },
  );
  // Let flex-wrap settle before reading.
  await page.waitForTimeout(200);
}

async function untreat(page: Page, id: string): Promise<void> {
  await page.evaluate((elId) => document.getElementById(elId)?.remove(), id);
  await page.waitForTimeout(200);
}

/** Three runs of a reading; min/median/max, so a single browser number is never the answer. */
async function thrice(page: Page, fn: () => Promise<Reading>): Promise<Record<string, unknown>> {
  const runs: Reading[] = [];
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(120);
    runs.push(await fn());
  }
  const above = runs.map((r) => r.aboveCanvas ?? 0).sort((a, b) => a - b);
  const deck = runs.map((r) => r.deckHeight ?? 0).sort((a, b) => a - b);
  return {
    aboveCanvas: { min: above[0], median: above[1], max: above[2] },
    deckHeight: { min: deck[0], median: deck[1], max: deck[2] },
    canvasHeight: runs[0]?.canvasHeight ?? null,
  };
}

async function assertPointer(page: Page, expected: 'coarse' | 'fine'): Promise<void> {
  const actual = await page.evaluate(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  if (actual !== expected)
    throw new Error(`control-height-cost: asked for ${expected}, page reports ${actual}`);
}

async function openPlan(page: Page, stamp: number): Promise<void> {
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, 'Height cost');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 8 }]);
}

/** Treatment A — 44 px everywhere, both pointers: the cost to a DESKTOP user. */
const A_GLOBAL = `:root { --control-h: ${CONTROL_H_44}; }
  [role="toolbar"] button, [role="toolbar"] a, [role="toolbar"] [role="button"] { min-height: ${CONTROL_H_44}; }`;

/** Treatment B — the same, behind the coarse query: the cost to a TOUCH user only. */
const B_COARSE_ONLY = `@media (pointer: coarse) { ${A_GLOBAL} }`;

/** Treatment C — forms only, coarse-only, the deck untouched: F3's first half. */
const C_FORMS_ONLY = `@media (pointer: coarse) { :root { --control-h: ${CONTROL_H_44}; } }`;

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`${pointer} pointer`, () => {
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M0-T2 — the vertical cost of 44 px (${pointer})`, async ({ page }) => {
      test.setTimeout(300_000);
      const name = `m0-height-cost-${pointer}`;
      clearMeasurement(name);
      await assertPointer(page, pointer);
      await openPlan(page, Date.now() + (pointer === 'coarse' ? 31 : 32));
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(400);

      const baseline = await thrice(page, () => read(page));

      await treat(page, 'tA', A_GLOBAL);
      const treatmentA = await thrice(page, () => read(page));
      await untreat(page, 'tA');

      await treat(page, 'tB', B_COARSE_ONLY);
      const treatmentB = await thrice(page, () => read(page));
      await untreat(page, 'tB');

      await treat(page, 'tC', C_FORMS_ONLY);
      const treatmentC = await thrice(page, () => read(page));
      await untreat(page, 'tC');

      // F3's second half: at 390 coarse with forms at 44, does a dialog exceed the viewport?
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await treat(page, 'tC2', C_FORMS_ONLY);
      const narrowDialog = await page.evaluate(() => {
        const dialogs = [...document.querySelectorAll('dialog[open], [role="dialog"]')];
        return dialogs.map((d) => {
          const r = d.getBoundingClientRect();
          return { h: Math.round(r.height), overflows: r.height > window.innerHeight };
        });
      });
      await untreat(page, 'tC2');

      writeMeasurement(name, {
        pointer,
        context: '1646x1097',
        baseline,
        treatmentA_global44: treatmentA,
        treatmentB_coarseOnly44: treatmentB,
        treatmentC_formsOnly44: treatmentC,
        narrowDialogsAt390: narrowDialog,
      });
      expect(baseline).toBeTruthy();
    });
  });
}
