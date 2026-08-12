import { expect, test, type Page } from '@playwright/test';

import { writeMeasurement } from './output';

/**
 * **M0-T2 — what does the toolbar's search icon actually do?**
 *
 * The epic's leading hypothesis (feature-spec §3.2) is that the icon is present, correctly sized,
 * and painted **under** the input's opaque `bg-field`. That is a hypothesis read from source, not a
 * finding: `SearchFieldControl` and its live successor both render
 *
 *     <div class="ml-3 flex items-center">
 *       <Search class="… -mr-6 size-4" />
 *       <Input class="… pl-8" />
 *
 * — a negative margin on a **non-positioned** flex item, so the icon keeps its box in flow and the
 * input, later in DOM order and carrying an opaque background, paints over the overlap. The house
 * primitive solves the same problem with a `relative` wrapper and an `absolute` icon
 * (`components/ui/search-field.tsx`), which is why the fix is expected to be two lines.
 *
 * Three different defects would need three different fixes, and only a browser can tell them apart:
 *
 * | evidence                                   | defect      |
 * | ------------------------------------------ | ----------- |
 * | no element found                           | **absent**  |
 * | box present but width/height 0             | **zero-box**|
 * | box present, `elementFromPoint` = the input| **covered** |
 *
 * So the probe reports the icon's box, its computed `position`/`z-index`, and what
 * `elementFromPoint` returns at the icon's own centre. It asserts nothing about the outcome — it is
 * a harness (ADR-0081 §3). The assertion lands at M4 **with** the fix, verified red first.
 */

async function probeSearchIcon(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) return { found: false, reason: 'no input[type=search] on the page' };

    // The icon is the `svg` sibling preceding the input inside its wrapper — located structurally,
    // never by class, so a restyle cannot silently redirect the reading.
    const wrapper = input.parentElement;
    const icon = wrapper?.querySelector('svg') ?? null;
    if (!icon) {
      return { found: false, reason: 'input found, but no sibling svg — the icon is ABSENT' };
    }

    const box = icon.getBoundingClientRect();
    const iconStyle = getComputedStyle(icon);
    const inputStyle = getComputedStyle(input);
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const atCentre = box.width > 0 && box.height > 0 ? document.elementFromPoint(cx, cy) : null;

    const describe = (el: Element | null): string => {
      if (!el) return 'null';
      const tag = el.tagName.toLowerCase();
      if (el === icon) return `${tag} (THE ICON — visible)`;
      if (el === input) return `${tag}[type=search] (THE INPUT — icon is COVERED)`;
      return `${tag}${el === wrapper ? ' (the wrapper)' : ''}`;
    };

    return {
      found: true,
      icon: {
        box: {
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
          left: Math.round(box.left * 10) / 10,
        },
        position: iconStyle.position,
        zIndex: iconStyle.zIndex,
        marginRight: iconStyle.marginRight,
        opacity: iconStyle.opacity,
        visibility: iconStyle.visibility,
      },
      input: {
        left: Math.round(input.getBoundingClientRect().left * 10) / 10,
        paddingLeft: inputStyle.paddingLeft,
        backgroundColor: inputStyle.backgroundColor,
        position: inputStyle.position,
      },
      wrapper: { position: wrapper ? getComputedStyle(wrapper).position : null },
      elementAtIconCentre: describe(atCentre),
      // The plain-language verdict, derived from the evidence rather than from the hypothesis.
      verdict:
        box.width === 0 || box.height === 0
          ? 'ZERO-BOX — the icon renders but has no area'
          : atCentre === icon
            ? 'VISIBLE — the icon is the topmost element at its own centre'
            : `COVERED — ${describe(atCentre)} paints over the icon`,
    };
  });
}

test('M0-T2 — the search icon: absent, zero-box, or covered?', async ({ page }) => {
  const stamp = Date.now();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Icon Prober');
  await page.getByLabel('Email').fill(`icon-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Icon Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();

  writeMeasurement('m0-search-icon', await probeSearchIcon(page));
});
