import { expect, test, type Page } from '@playwright/test';

import { createHierarchy, ensurePen, newPlan, onboard } from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **F3b — does a 44 px control push a form past a phone viewport?** (ADR-0118 M3.)
 *
 * M0 committed five falsification conditions and answered four. F3b was reported **NOT MEASURED**,
 * and the reason is recorded in `m0-measurement.md` rather than smoothed over: the probe queried
 * `dialog[open], [role="dialog"]` at 390 × 844 and got an empty array **without ever opening a
 * dialog**, so the empty result meant "nothing was open", not "nothing overflowed". Reporting "no
 * dialog overflows" from that would have been the green-run-about-nothing this epic keeps finding
 * in its own instruments. So this one **opens** a dialog and asserts that it did.
 *
 * The subject is the plan-settings form reached from `Edit plan` — a real multi-field form, present
 * at 390, and reachable without the canvas. The question is not whether it scrolls (a long form on a
 * phone always will) but whether every control inside it stays **reachable by pointer**: a dialog
 * that grows past the viewport and cannot scroll is the ADR-0114 M1 shape, and that is what a taller
 * control could newly cause.
 *
 * `hasTouch` is passed to the page the FIXTURE builds, via `test.use` — correct here because this
 * file uses the `page` fixture. `e2e-workspace-fit`'s coarse projection cannot, because it builds
 * its page in `beforeAll`; the two are different for that reason and not by accident. The
 * `matchMedia` assertion runs first either way.
 */
/**
 * **The context is coarse throughout; the VIEWPORT starts wide and narrows before the dialog is
 * opened.** The setup helpers navigate through the Project Explorer's `Clients` destination, and
 * below `lg` that is not rendered at all — it is the off-canvas Sheet. Running the whole test at
 * 390 fails in `createHierarchy`, which is how this was found rather than reasoned about.
 */
test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });

interface DialogTarget {
  id: string;
  tag: string;
  w: number;
  h: number;
  reachable: boolean;
  visible: boolean;
}

async function sweepDialog(page: Page): Promise<{
  dialogBox: { w: number; h: number; top: number; bottom: number };
  scrollable: boolean;
  targets: DialogTarget[];
}> {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('dialog[open], [role="dialog"]');
    if (!dialog) throw new Error('dialog-coarse: no dialog is open — nothing to measure');
    const dr = dialog.getBoundingClientRect();
    // Does anything inside the dialog actually scroll? A form taller than the viewport is fine
    // when it does and is ADR-0114 M1's defect when it does not.
    const scrollable = [dialog, ...dialog.querySelectorAll<HTMLElement>('*')].some((el) => {
      const st = getComputedStyle(el);
      return /auto|scroll/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    const targets: DialogTarget[] = [];
    for (const el of dialog.querySelectorAll('button,a,[role="button"],input,select,textarea')) {
      if (el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0;
      // Only judge what is currently on screen: a control below the fold of a scrolling form is
      // reached by scrolling, which is the same discriminator `command-surface.spec.ts` uses.
      const onScreen =
        visible && r.top + r.height / 2 >= 0 && r.top + r.height / 2 <= window.innerHeight;
      let reachable = false;
      if (onScreen) {
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        reachable = hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
      }
      targets.push({
        id:
          el.getAttribute('aria-label') ??
          (el.textContent ?? '').trim().slice(0, 28) ??
          el.tagName.toLowerCase(),
        tag: el.tagName.toLowerCase(),
        w: Math.round(r.width),
        h: Math.round(r.height),
        visible,
        reachable: onScreen ? reachable : true,
      });
    }
    return {
      dialogBox: {
        w: Math.round(dr.width),
        h: Math.round(dr.height),
        top: Math.round(dr.top),
        bottom: Math.round(dr.bottom),
      },
      scrollable,
      targets,
    };
  });
}

test('F3b — a form at 390 under a coarse pointer', async ({ page }) => {
  test.setTimeout(300_000);
  clearMeasurement('m3-dialog-coarse');

  const pointer = await page.evaluate(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  expect(
    pointer,
    'this run did not report a coarse pointer — it would measure the wrong thing',
  ).toBe('coarse');

  await onboard(page, Date.now() + 41);
  await createHierarchy(page);
  await newPlan(page, 'Dialog coarse');
  await ensurePen(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  // **The dialog is OPENED and the open is asserted** — the whole reason F3b was unmeasurable.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const report = await sweepDialog(page);
  writeMeasurement('m3-dialog-coarse', {
    pointer,
    viewport: { width: 390, height: 844 },
    ...report,
    summary: {
      controls: report.targets.length,
      unreachable: report.targets.filter((t) => t.visible && !t.reachable).map((t) => t.id),
      belowHouse44: report.targets
        .filter((t) => t.visible && (t.w < 44 || t.h < 44))
        .map((t) => `${t.id} ${t.w}x${t.h}`),
      overflowsViewport: report.dialogBox.h > 844,
    },
  });

  // The pinned positive: a dialog with no controls would satisfy every assertion below.
  expect(report.targets.length, 'the dialog reported no controls').toBeGreaterThan(3);
  // **The answer, kept as an assertion rather than only as a number in a file.** Measured
  // 2026-08-29: the plan-settings form is 358 x 508 in an 844 px viewport with every control 44
  // tall, so a 44 px control does NOT push a form past a phone viewport — F3b's question, finally
  // asked of an actual dialog. This pins the finding so a future field that DOES break it fails
  // here rather than on somebody's phone.
  expect(
    report.dialogBox.h,
    `the dialog is ${report.dialogBox.h}px tall in an 844px viewport and nothing inside it scrolls`,
  ).toBeLessThanOrEqual(report.scrollable ? Number.POSITIVE_INFINITY : 844);
  expect(
    report.targets.filter((t) => t.visible && (t.w < 44 || t.h < 44)),
    `controls below the 44x44 house rule inside the dialog: ${JSON.stringify(report.targets.filter((t) => t.visible && (t.w < 44 || t.h < 44)))}`,
  ).toEqual([]);
  // The finding that would matter: a control a pointer cannot reach.
  expect(
    report.targets.filter((t) => t.visible && !t.reachable),
    `controls a pointer cannot reach inside the dialog: ${JSON.stringify(report.targets.filter((t) => t.visible && !t.reachable))}`,
  ).toEqual([]);
});
