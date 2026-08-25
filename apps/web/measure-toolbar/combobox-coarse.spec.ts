import { expect, test } from '@playwright/test';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **What a hand-rolled `Combobox` costs on a coarse pointer** — the question
 * `docs/TECH_DEBT.md` **#145** holds ADR-0097 Landing F1's last two conversions on.
 *
 * A native `<select>` gets the platform's own picker: the iOS wheel, the Android sheet. It is the
 * best mobile control in the product and it is free. `components/ui/combobox.tsx` gets an in-flow
 * listbox competing with a virtual keyboard. Two conversions clear F1's discriminator and both live
 * in the **activity editor**, which is reachable on a tablet — so the question is not academic, and
 * the failure would be silent: a converted picker looks correct on every desktop and the only
 * person who meets the worse control is on a device nobody tested.
 *
 * This is #133 one surface along. That row records that **no toolbar measurement in this repository
 * had ever been taken with a coarse pointer**, because Playwright defaults to a fine one. #133 is
 * about control *sizing*; this is about whether a whole control *type* is the right choice on
 * touch.
 *
 * `hasTouch: true` is what makes Chromium report `pointer: coarse` — `isMobile` is deliberately NOT
 * used, because it also reflows dialogs and would measure a different product (the same choice
 * `item-widths.spec.ts` made and recorded).
 *
 * **What it can and cannot answer.** It measures the two things a desk cannot: whether the two
 * control types are reachable at a touch-sized target (WCAG 2.5.8's 24 px floor, and the 44 px most
 * platform guidance prefers), and how much of the viewport each consumes once open — a listbox that
 * covers the field it belongs to is the failure mode. It **cannot** tell you how the platform picker
 * feels, because Chromium renders its own; that half stays a judgement for the specialist reviewers
 * `migration.md` F1 names.
 *
 * Asserts nothing; it is a harness (ADR-0081 §3).
 */
test.describe('coarse pointer', () => {
  test.use({ hasTouch: true });

  test('TECH_DEBT #145 — a native select and a Combobox, measured on touch', async ({ page }) => {
    clearMeasurement('combobox-coarse');
    const stamp = Date.now();
    // The Surface Pro's own width (2880×1920 at 175 %), which ADR-0091's retrospective established
    // as the width this product is actually judged at and which no measurement had used before it.
    await page.setViewportSize({ width: 1646, height: 1097 });

    await page.goto('/sign-up');
    await page.getByLabel('Full name').fill('Coarse Picker');
    await page.getByLabel('Email').fill(`coarse-picker-${stamp}@example.com`);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: /create an account/i }).click();
    await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
    await page.getByLabel('Organisation name').fill(`Coarse Co ${stamp}`);
    await page.getByRole('button', { name: /create organisation/i }).click();

    const report: Record<string, unknown> = {
      viewport: { width: 1646, height: 1097 },
      pointer: await page.evaluate(() => ({
        coarse: window.matchMedia('(pointer: coarse)').matches,
        anyHover: window.matchMedia('(any-hover: hover)').matches,
      })),
    };

    // **A native `<select>` and our `Combobox`, on one screen.** The resources library carries
    // both: the kind filter is native, and the New-resource dialog's Group picker is the
    // hand-rolled combobox (ADR-0053 M4/§3). One screen makes the comparison fair — a difference
    // measured across two screens could be the screen.
    //
    // **The first version of this harness measured the org switcher twice**, and it is recorded
    // rather than tidied: `getByRole('combobox')` matches a native `<select>`, because that is the
    // element's implicit ARIA role. So the "combobox" reading was a `<select>` — identical numbers
    // to the "native select" reading, plausible, and about the wrong control. Both locators below
    // are now specific enough that they cannot resolve to each other.
    await page.getByRole('link', { name: 'Resources', exact: true }).click();
    await expect(page.getByRole('heading', { name: /resources/i })).toBeVisible();

    // **Seed real options first.** The second version of this harness reported `optionCount: 1,
    // shortestOption: 0, listHeight: 0` and passed. A fresh organisation has no resources, so the
    // Group picker offered only its `emptyOption`; and the listbox is deliberately always in the
    // DOM (`hidden` when closed, so `aria-controls` always resolves), so a measurement taken
    // without opening it reads a hidden box as zero. Both halves produced a plausible number about
    // nothing — ADR-0097's closure harness failure verbatim, one epic later.
    for (const name of ['Site teams', 'Plant', 'Subcontractors']) {
      await page.getByRole('button', { name: 'New resource' }).click();
      const seedDialog = page.getByRole('dialog');
      await seedDialog.getByLabel('Name').fill(name);
      await seedDialog.getByLabel('Kind').selectOption('GROUP');
      await seedDialog.getByRole('button', { name: /create|save/i }).click();
      await expect(seedDialog).toBeHidden();
    }

    report.nativeSelect = await page.evaluate(() => {
      // A real `<select>`, addressed as an element rather than by role.
      const el = document.querySelector('main select');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        label:
          el.getAttribute('aria-label') ??
          document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ??
          el.id,
        width: Math.round(r.width),
        height: Math.round(r.height),
        paddingInline: `${style.paddingLeft} / ${style.paddingRight}`,
        clearsWcagMinimum: r.height >= 24,
        clearsPlatformPreference: r.height >= 44,
      };
    });

    await page.getByRole('button', { name: 'New resource' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // OUR combobox: an `<input type="text">` carrying `aria-autocomplete="list"`. A native
    // `<select>` has neither, which is what makes this locator unambiguous.
    const combobox = dialog.locator('input[role="combobox"][aria-autocomplete="list"]').first();
    await expect(combobox).toBeVisible();

    report.comboboxClosed = await combobox.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ?? el.id,
        width: Math.round(r.width),
        height: Math.round(r.height),
        clearsWcagMinimum: r.height >= 24,
        clearsPlatformPreference: r.height >= 44,
      };
    });

    // **Clicking the input does NOT open the list** (`combobox.tsx:460-465` — the input opens on
    // *typing*; the pointer affordance is the trailing toggle). On touch that toggle is the only
    // pointer route in, which makes it the right thing to measure here anyway.
    await dialog.getByRole('button', { name: 'Show groups' }).click();
    await expect(dialog.getByRole('listbox', { name: 'Show groups' })).toBeVisible();

    report.comboboxOpen = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]:not([hidden])');
      const input = document.querySelector('input[role="combobox"][aria-autocomplete="list"]');
      if (!list || !input) return null;
      const lr = list.getBoundingClientRect();
      const ir = input.getBoundingClientRect();
      const options = [...list.querySelectorAll('[role="option"]')].map((o) => {
        const r = o.getBoundingClientRect();
        return { height: Math.round(r.height), clearsWcagMinimum: r.height >= 24 };
      });
      return {
        listHeight: Math.round(lr.height),
        // The failure mode this exists to catch: a listbox covering the field it belongs to, or
        // eating the viewport a virtual keyboard is about to take half of.
        coversItsOwnField: lr.top < ir.bottom && lr.bottom > ir.top,
        viewportFractionUsed: Math.round((lr.height / window.innerHeight) * 100) / 100,
        optionCount: options.length,
        shortestOption: options.length ? Math.min(...options.map((o) => o.height)) : null,
        everyOptionClearsWcagMinimum: options.every((o) => o.clearsWcagMinimum),
        // What a virtual keyboard leaves: roughly half the viewport on a tablet in portrait. A
        // list taller than the space above it is the one measurement a desk cannot take.
        spaceBelowField: Math.round(window.innerHeight - ir.bottom),
      };
    });

    // **A harness with nothing to judge throws rather than reporting a zero** — the rule
    // ADR-0097's closure measurement earned by producing a PROCEED verdict out of an `undefined`.
    const open = report.comboboxOpen as { listHeight: number; optionCount: number } | null;
    if (!open || open.listHeight === 0 || open.optionCount < 2) {
      throw new Error(
        `Nothing to measure: the listbox is ${JSON.stringify(open)}. Seeding or the open gesture ` +
          'is wrong — a reading taken from a closed list is worse than no reading.',
      );
    }

    writeMeasurement('combobox-coarse', report);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  });
});
