import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  diagramList,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Verifying an independent review's corrections to M0, rather than accepting them.**
 *
 * `design-review.md` (ui-architect) challenged four decision-bearing numbers in
 * `m0-measurement.md`. Three would change what gets built, so each is re-established here against
 * the running product instead of being folded on the strength of a citation — which is the same
 * rule the measurement pass applied to my own claims, and the reason its instruments were caught
 * being wrong five times.
 *
 * 1. **Is `You're editing this plan.` actually painted?** M0 recorded a 125.9 px leaf. The review
 *    says the sentence is `sr-only` whenever the reader HOLDS the pen (`CompactPenStatus.tsx:179`
 *    gates on `LockView.messageVisible`, set only on `lost` and an incoming request), so a
 *    milestone removing it "for width" would free nothing.
 * 2. **Is two-line facts free with `gap-y-0`?** M0 measured +24 px and concluded no. The review
 *    says the whole cost is the row-gap and one Tailwind class removes it.
 * 3. **Is the dock's width a viewport property?** M0 read it at three viewports. The review says
 *    the Project Explorer is user-resizable across a range wider than the shortfall, so the same
 *    viewport can be in or out of the defect depending on a drag.
 * 4. **Does `Data date` render more than once on one screen?** The review reports three.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
test('M0 verify: the pen phantom, the row-gap, the Explorer range, the duplicate facts', async ({
  page,
}) => {
  clearMeasurement('m0-verify');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: 1646, height: 1097 });
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

  /* -- 1. the pen sentence: painted, or clipped to 1px by an sr-only ancestor? ------------ */
  const penClaim = await page.evaluate(() => {
    const r = (n: number): number => Math.round(n * 10) / 10;
    const hit = [...document.querySelectorAll('*')].filter(
      (el) =>
        (el.textContent ?? '').includes('editing this plan') &&
        ![...el.children].some((k) => (k.textContent ?? '').includes('editing this plan')),
    );
    return hit.map((el) => {
      const own = el.getBoundingClientRect();
      // Walk up looking for the clip that `sr-only` applies.
      let clipped: string | null = null;
      let node: Element | null = el;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        const b = node.getBoundingClientRect();
        if (cs.clipPath !== 'none' || cs.clip !== 'auto' || (b.width <= 1 && b.height <= 1)) {
          clipped = `${node.tagName}.${node.className.toString().slice(0, 40)} rect=${r(b.width)}x${r(b.height)} clip=${cs.clip} clipPath=${cs.clipPath}`;
          break;
        }
        node = node.parentElement;
      }
      return { ownRect: `${r(own.width)}x${r(own.height)}`, clippedBy: clipped };
    });
  });

  /* -- 2. two-line facts with the row-gap removed ---------------------------------------- */
  const factsRowHandle = () =>
    page.evaluate(() => {
      const foot = document.querySelector('[data-activities-bar]');
      const outer = foot?.children[0] as HTMLElement | undefined;
      if (!outer) return null;
      const cands = [outer, ...outer.querySelectorAll<HTMLElement>('*')].filter(
        (el) => getComputedStyle(el).display.includes('flex') && el.children.length > 1,
      );
      const row = cands.sort((a, b) => b.children.length - a.children.length)[0] ?? outer;
      row.setAttribute('data-probe-facts-row', '');
      const cs = getComputedStyle(row);
      return { rowGap: cs.rowGap, columnGap: cs.columnGap, cls: row.className.toString() };
    });

  const gapInfo = await factsRowHandle();

  const readHeights = (tag: string) =>
    page.evaluate((label: string) => {
      const r = (n: number): number => Math.round(n * 10) / 10;
      const foot = document.querySelector('[data-activities-bar]');
      const row = document.querySelector('[data-probe-facts-row]');
      const cv = document.querySelector('canvas');
      const dock = foot?.children[1];
      const items = dock ? [...dock.querySelectorAll('[data-toolbar-item]')] : [];
      return {
        tag: label,
        footH: foot ? r(foot.getBoundingClientRect().height) : null,
        factsRowH: row ? r(row.getBoundingClientRect().height) : null,
        factsRowW: row ? r(row.getBoundingClientRect().width) : null,
        canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
        dockLines: items.length
          ? new Set(items.map((e) => Math.round(e.getBoundingClientRect().y))).size
          : 0,
      };
    }, tag);

  const setRow = (styles: Record<string, string>, clear = false) =>
    page.evaluate(
      ({ s, c }: { s: Record<string, string>; c: boolean }) => {
        // `querySelector<HTMLElement>` rather than a cast: `--fix` removed the cast as
        // "unnecessary" and typecheck then failed on `.style`, because the lint rule and the
        // compiler disagree about what `querySelector` returns here. The generic satisfies both.
        const row = document.querySelector<HTMLElement>('[data-probe-facts-row]');
        if (!row) return;
        if (c) {
          row.style.cssText = '';
          return;
        }
        for (const [k, v] of Object.entries(s)) row.style.setProperty(k, v);
      },
      { s: styles, c: clear },
    );

  const gapBefore = await readHeights('facts 1 line, gap-4');
  await setRow({ 'max-width': '250px', 'flex-wrap': 'wrap', 'flex-shrink': '1' });
  await page.waitForTimeout(250);
  const gapKept = await readHeights('facts wrapped, row-gap 16px (today)');
  await setRow({ 'row-gap': '0px' });
  await page.waitForTimeout(250);
  const gapZero = await readHeights('facts wrapped, row-gap 0');
  await setRow({}, true);
  await page.waitForTimeout(200);

  /* -- 3. the Explorer's width, and the dock's width as a function of it ------------------ */
  const explorer = await page.evaluate(() => {
    const r = (n: number): number => Math.round(n * 10) / 10;
    const foot = document.querySelector('[data-activities-bar]');
    const sep = document.querySelector('[role="separator"][aria-orientation="vertical"]');
    const panel =
      document.querySelector('[data-surface="panel"]') ??
      document.querySelector('[aria-label*="Explorer" i]');
    return {
      footX: foot ? r(foot.getBoundingClientRect().x) : null,
      footW: foot ? r(foot.getBoundingClientRect().width) : null,
      explorerW: panel ? r(panel.getBoundingClientRect().width) : null,
      hasResizeSeparator: Boolean(sep),
      separatorAria: sep
        ? {
            now: sep.getAttribute('aria-valuenow'),
            min: sep.getAttribute('aria-valuemin'),
            max: sep.getAttribute('aria-valuemax'),
            label: sep.getAttribute('aria-label'),
          }
        : null,
    };
  });

  /* -- 4. how many times does one fact render on one screen? ----------------------------- */
  await diagramList(page).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const selectedFoot = await readHeights('selected, gap-4');

  const summaryTrigger = page
    .locator('[role="toolbar"][aria-label="Plan commands"] [aria-haspopup]')
    .filter({ hasText: 'Summary' });
  await summaryTrigger
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  const duplicates = await page.evaluate(() => {
    const count = (needle: string): Array<string> =>
      [...document.querySelectorAll('*')]
        .filter(
          (el) =>
            (el.textContent ?? '').trim() === needle &&
            ![...el.children].some((k) => (k.textContent ?? '').trim() === needle),
        )
        .map((el) => {
          const b = el.getBoundingClientRect();
          const visible = b.width > 1 && b.height > 1;
          const host =
            el.closest('[data-activities-bar]') !== null
              ? 'foot row'
              : el.closest('[role="dialog"],[role="menu"]') !== null
                ? 'popover'
                : 'elsewhere';
          return `${host} ${visible ? 'VISIBLE' : 'clipped'} ${Math.round(b.width)}x${Math.round(b.height)}`;
        });
    return {
      'Data date': count('Data date'),
      Finish: count('Finish'),
      Activities: count('Activities'),
    };
  });

  /* -- 5. DECISIVE: does a free two-line facts row fix the wrap, alone? ------------------- */
  // §0's shortfall at 1646 is 261.8 px. Wrapping the facts at zero row-gap takes them 481.4 → 250,
  // freeing 231.4 — which is 30 px SHORT on paper. Paper is exactly what this repository keeps
  // getting wrong (a wrapping row breaks between items, so freed width need not buy a line), so the
  // question is measured in both states and at both widths rather than computed.
  const decisive: Array<Record<string, unknown>> = [];
  for (const w of [1646, 1440]) {
    await page.setViewportSize({ width: w, height: w === 1646 ? 1097 : 900 });
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(500);
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    await factsRowHandle();
    decisive.push({ width: w, ...(await readHeights('selected / facts 1 line')) });
    await setRow({
      'max-width': '250px',
      'flex-wrap': 'wrap',
      'flex-shrink': '1',
      'row-gap': '0px',
    });
    await page.waitForTimeout(350);
    decisive.push({ width: w, ...(await readHeights('selected / facts 2 lines, row-gap 0')) });
    await setRow({ 'max-width': '190px' });
    await page.waitForTimeout(350);
    decisive.push({ width: w, ...(await readHeights('selected / facts capped 190, row-gap 0')) });
    await setRow({}, true);
  }

  writeMeasurement('m0-verify', {
    decisive,
    penSentence: penClaim,
    factsRowGap: gapInfo,
    gapBefore,
    gapKept,
    gapZero,
    selectedFoot,
    explorer,
    duplicates,
  });
  expect(penClaim.length).toBeGreaterThan(0);
});
