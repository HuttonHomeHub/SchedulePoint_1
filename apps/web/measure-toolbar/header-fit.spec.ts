import { expect, test } from '@playwright/test';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Does the app header row fit its container, and is every control in it reachable by pointer?**
 *
 * Written because ADR-0097 D1b merged the plan identity line into the header and the milestone
 * measured only the VERTICAL stack — it proved the band did not grow and never asked whether the
 * row still fits horizontally. `vertical-stack`'s own `appHeaderRoom` says it does not: the centre
 * cell measures 1376 px at 1920 **and** at 1440, i.e. it is not shrinking, so at 1440 the row wants
 * 1571 px in a 1440 px box.
 *
 * That arithmetic is exactly what ADR-0090 M1 was opened on, and its lesson is that arithmetic is
 * not the answer: a control can be 131 px over and still be reachable, or be nominally inside the
 * box and painted at **0 px visible**. So this probes the consequence with `elementFromPoint`, the
 * method `e2e-toolbar-fit` settled on after a proposed gate would have passed a control shrunk to
 * zero width.
 *
 * Asserts nothing; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

test('the app header row, measured for fit and pointer reachability', async ({ page }) => {
  clearMeasurement('header-fit');
  const stamp = Date.now();

  await page.setViewportSize(VIEWPORTS[0]!);
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Header Fit');
  await page.getByLabel('Email').fill(`header-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Header Co ${stamp}`);
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
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside — Phase 2 Substructure');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Riverside — Phase 2 Substructure' }).click();
  // `Plan commands` is the deck. This line waited for a toolbar named `View and navigate` until the
  // 2026-08-26 repair (`docs/TECH_DEBT.md` #188) — a name ADR-0099 M5 removed when it merged the two
  // rows, so this harness had been dead since then while still reading as the authority on whether
  // the header fits.
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();

  const report: Record<string, unknown> = {};
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(500);
    report[`${viewport.width}x${viewport.height}`] = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) throw new Error('header-fit: no <header>');
      const box = header.getBoundingClientRect();

      // Every focusable control inside the header, and whether its centre actually hits itself.
      // A control pushed outside the row, or clipped to zero width, fails this while still
      // existing in the DOM and still being keyboard-reachable — which is the ADR-0090 defect.
      const controls = [...header.querySelectorAll('a,button,[role="button"],input')].map((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(cx, cy) : null;
        return {
          label:
            el.getAttribute('aria-label') ??
            (el.textContent ?? '').trim().slice(0, 28) ??
            el.tagName,
          width: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          // Outside the row's own box, i.e. pushed past the right edge or clipped away.
          overhangRight: Math.round(Math.max(0, r.right - box.right)),
          reachable: hit !== null && (hit === el || el.contains(hit)),
        };
      });

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        headerWidth: Math.round(box.width),
        scrollWidth: header.scrollWidth,
        overflows: header.scrollWidth > Math.ceil(box.width),
        controls,
        unreachable: controls.filter((c) => !c.reachable).map((c) => c.label),
        clipped: controls.filter((c) => c.overhangRight > 0).map((c) => c.label),
      };
    });
  }

  writeMeasurement('header-fit', report);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
});
