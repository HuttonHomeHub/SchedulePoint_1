import { expect, test, type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import {
  DATA_DATE,
  createHierarchy,
  diagramList,
  linkActivities,
  newPlan,
  placeViaApi,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { readRows, signUp } from './follow-logic-m0-support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Follow logic's arrow, M3a: measure it before building it**
 * (`docs/specs/follow-logic-follow-ups/implementation-plan.md`, "Milestone M3a"). On a short window
 * (1024 x 600), mouse and finger, with a flagged, placed, unstarted bar selected (the fullest
 * realistic selection bar), does a caret of the split button's width beside **Follow logic** cost the
 * bar a line, cut a control off, put a button out of reach, scroll the foot row sideways or shorten
 * the diagram?
 *
 * **The arrow is INJECTED, not shipped; nothing under `apps/web/src` changes.** The stand-in is a
 * clone of the caret the product already draws for Add, so its width, padding and coarse-pointer
 * floor are the real ones. It is inserted after Follow logic, read, and removed before anything React
 * renders around it: no selection change, resize or reload happens while it is in place.
 *
 * What is asserted are INVARIANTS read in the same cell on the same runner, never a pixel figure
 * (fonts differ between machines). The stop rule: if the caret adds a bar line in either pointer,
 * this fails, and M3 does not proceed on this placement (fallback: the toolbar button, option B2).
 * When the product already draws the real arrow (M3 built) the spec reads that one instead, hiding only
 * the caret for the baseline, with the same assertions. A harness, not a gate (ADR-0081 section 3): no CI step, no new config.
 */

const STAMP = Date.now();

interface Reading {
  lines: number;
  items: number;
  barH: number;
  footH: number;
  canvasH: number;
  sideways: boolean;
  /** Controls whose pointer-centre does not land on themselves, or that sit outside the bar. */
  unpressable: string[];
  followW: number | null;
}

/** The selection bar as the browser lays it out right now. */
function readBar(): Reading {
  const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
  const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
  const canvas = document.querySelector('main canvas');
  if (!bar || !foot) throw new Error('the selection bar or the foot row is not on screen');
  const items = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter(
    (e) => e.getBoundingClientRect().width > 1.5,
  );
  const tops: number[] = [];
  for (const top of items.map((e) => e.getBoundingClientRect().top).sort((a, b) => a - b)) {
    const last = tops[tops.length - 1];
    if (last === undefined || top - last > 4) tops.push(top);
  }
  const footBox = foot.getBoundingClientRect();
  const unpressable: string[] = [];
  for (const el of items) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const inside = box.left >= footBox.left - 1 && box.right <= footBox.right + 1;
    if (hit === null || !el.contains(hit) || !inside) {
      unpressable.push(el.getAttribute('data-toolbar-item') ?? el.textContent ?? '?');
    }
  }
  const follow = bar.querySelector<HTMLElement>('[data-toolbar-item="clear-visual-placement"]');
  return {
    lines: tops.length,
    items: items.length,
    barH: Math.round(bar.getBoundingClientRect().height),
    footH: Math.round(footBox.height),
    canvasH: Math.round(canvas?.getBoundingClientRect().height ?? 0),
    sideways: foot.scrollWidth > foot.clientWidth,
    unpressable,
    followW: follow ? Math.round(follow.getBoundingClientRect().width * 10) / 10 : null,
  };
}

/**
 * Insert a clone of the product's own caret after Follow logic, read, and put the DOM back. The
 * three steps are separate evaluations so `readBar` is passed as itself, not as source text.
 * Throws if there is no caret to clone or no Follow logic.
 */
async function readWithCaret(page: Page): Promise<{ reading: Reading; caretW: number }> {
  const caretW = await page.evaluate(() => {
    const follow = document.querySelector<HTMLElement>(
      '[role="toolbar"][aria-label^="Actions for"] [data-toolbar-item="clear-visual-placement"]',
    );
    const source = document.querySelector<HTMLElement>(
      '[role="toolbar"][aria-label="Plan commands"] button[aria-haspopup="menu"][tabindex="-1"]',
    );
    if (!follow || !source) throw new Error('no Follow logic, or no product caret to clone');
    const caret = source.cloneNode(true) as HTMLElement;
    caret.removeAttribute('data-toolbar-item');
    caret.removeAttribute('id');
    caret.setAttribute('data-m3a-stand-in', '');
    follow.insertAdjacentElement('afterend', caret);
    return Math.round(caret.getBoundingClientRect().width * 10) / 10;
  });
  try {
    return { reading: await page.evaluate(readBar), caretW };
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll('[data-m3a-stand-in]').forEach((e) => {
        e.remove();
      });
    });
  }
}

for (const { pointer, touch } of [
  { pointer: 'mouse', touch: false },
  { pointer: 'finger', touch: true },
] as const) {
  test.describe(`Follow logic's arrow, M3a (${pointer})`, () => {
    test.use({ hasTouch: touch, actionTimeout: 8_000 });

    test(`1024 x 600: the arrow costs the selection bar nothing (${pointer})`, async ({ page }) => {
      test.setTimeout(420_000);
      const name = `follow-logic-m3a.${pointer}`;
      clearMeasurement(name);
      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      const { orgSlug } = await signUp(page, STAMP + (touch ? 1 : 0), 'm3a');
      await createHierarchy(page);
      await newPlan(page, 'Follow arrow');
      await holdThePen(page);

      // Excavate drives three followers; all three are then placed on the data date, before
      // their logic lets them start, so each is flagged and counted by the whole-plan offer.
      const seeded = await seedActivities(page, orgSlug, [
        { name: 'Excavate', laneIndex: 0 },
        { name: 'Pour slab', laneIndex: 1 },
        { name: 'Steel beam', laneIndex: 2 },
        { name: 'Frame', laneIndex: 3 },
      ]);
      const byName = new Map(seeded.map((s) => [s.name, s.id]));
      const id = (n: string): string => {
        const v = byName.get(n);
        if (!v) throw new Error(`no seeded ${n}`);
        return v;
      };
      for (const follower of ['Pour slab', 'Steel beam', 'Frame']) {
        await linkActivities(page, orgSlug, id('Excavate'), id(follower));
      }
      await recalculate(page, orgSlug);
      await holdThePen(page);
      for (const follower of ['Pour slab', 'Steel beam', 'Frame']) {
        await placeViaApi(page, orgSlug, follower, DATA_DATE);
      }
      await recalculate(page, orgSlug);
      await holdThePen(page);
      await expect
        .poll(
          async () =>
            (await readRows(page, orgSlug)).filter(
              (r) => r.visualConflictReason === 'EARLIER_THAN_LOGIC',
            ).length,
          { message: 'the engine never flagged the three placed bars', timeout: 30_000 },
        )
        .toBe(3);
      expect(
        await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
        'the pointer this describe says it is',
      ).toBe(touch);

      await page.setViewportSize({ width: 1024, height: 600 });
      await page.waitForTimeout(500);
      const target = (await readRows(page, orgSlug)).find((r) => r.name === 'Pour slab');
      if (!target) throw new Error('no Pour slab');
      await diagramList(page).focus();
      for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
      for (let i = 0; i < 12 && (await selectedActivityId(page)) !== target.id; i += 1) {
        await page.keyboard.press('ArrowDown');
      }
      expect(await selectedActivityId(page), 'Pour slab is selected').toBe(target.id);
      await page.waitForTimeout(400);

      const stopRule = (arrow: Reading, without: Reading, what: string): void => {
        // The bar's line count without the arrow is recorded, not asserted: at 1024 x 600 the
        // selection bar already wraps (measured 2026-11-14: 3 lines, mouse and finger), so the
        // question is only whether the arrow ADDS a line or any height.
        expect(without.lines, 'the bar has at least one line without the arrow').toBeGreaterThan(0);
        expect(arrow.lines, `STOP RULE (${what}): the arrow must not add a bar line`).toBe(
          without.lines,
        );
        expect(arrow.unpressable, 'every control stays pressable and inside the row').toEqual([]);
        expect(arrow.sideways, 'the foot row does not scroll sideways').toBe(false);
        expect(arrow.canvasH, 'the diagram is exactly as tall with the arrow as without').toBe(
          without.canvasH,
        );
        expect(arrow.footH, 'the foot row is exactly as tall').toBe(without.footH);
      };

      // The real arrow, when the product draws one: the split primary can differ a little in width
      // from the plain button, which a clone beside the plain button cannot show. "Without" hides
      // only the caret, then puts it back; nothing renders in between.
      const real = page.getByRole('button', { name: 'More Follow logic choices' });
      if ((await real.count()) > 0) {
        const withArrow = await page.evaluate(readBar);
        // Marked first and found by the marker: a `display: none` caret leaves the accessibility
        // tree, so the role locator can no longer find it to put it back.
        await real.evaluate((e) => {
          e.setAttribute('data-m3a-caret', e.style.display);
          e.style.display = 'none';
        });
        const marked = page.locator('[data-m3a-caret]');
        let without: Reading;
        try {
          without = await page.evaluate(readBar);
        } finally {
          await marked.evaluate((e) => {
            e.style.display = e.getAttribute('data-m3a-caret') ?? '';
            e.removeAttribute('data-m3a-caret');
          });
        }
        writeMeasurement(`${name}.real`, { pointer, withArrow, without });
        expect(withArrow.followW, 'Follow logic is on the bar').not.toBeNull();
        stopRule(withArrow, without, 'real arrow');
        return;
      }

      const today = await page.evaluate(readBar);
      const { reading: withCaret, caretW } = await readWithCaret(page);
      const after = await page.evaluate(readBar);
      writeMeasurement(name, { pointer, today, withCaret, caretW, afterRemoval: after });

      expect(today.followW, 'Follow logic is on the bar').not.toBeNull();
      expect(after, 'removing the stand-in puts the bar back as it was').toEqual(today);
      stopRule(withCaret, today, 'stand-in caret');
    });
  });
}
