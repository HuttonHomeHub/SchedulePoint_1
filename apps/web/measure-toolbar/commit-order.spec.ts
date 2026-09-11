import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **M0-T2 of `docs/specs/unmount-focus-handoff/` — falsification condition F3.**
 *
 * The design's detection point is a `useLayoutEffect` in the commit that removed the focused item.
 * That only works if `document.activeElement` has already been reassigned by then. §4.8 of the spec
 * **reasons** it is `<body>`; nothing in this repository has observed it, and the epic's own plan
 * forbids starting M1 on the strength of a reasoned answer.
 *
 * If the layout-effect reading is NOT `BODY`/`(null)`, F3 fails and detection moves to the
 * container's `onBlur` — a change to M1-T1's mechanism, not to the milestone's shape.
 *
 * **It reports a field; it is not a gate.** The `expect`s here guard the instrument, not the
 * product: they fail only if the probe never focused the node it was about to remove, which would
 * make every other reading a statement about nothing (the ADR-0093 shape).
 *
 * The probe module is loaded through Vite's `/@fs/` route so the dev server transforms the TSX and
 * the app's own React is used — there is no second copy of React on the page.
 */
test('M0-T2 — what has focus inside the layout effect of the commit that removed it', async ({
  page,
}) => {
  clearMeasurement('unmount-focus-commit-order');

  const probePath = resolve(process.cwd(), 'measure-toolbar/commit-order-probe.tsx');

  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

  const reading = await page.evaluate(async (fsPath: string) => {
    const mod = (await import(/* @vite-ignore */ `/@fs${fsPath}`)) as {
      runProbe: () => Promise<Record<string, unknown>>;
    };
    return mod.runProbe();
  }, probePath);

  // Instrument guards, before the reading is believed.
  expect(
    reading.wasFocusedBeforeFlip,
    `probe never focused its target: ${JSON.stringify(reading)}`,
  ).toBe(true);
  expect(reading.beforeFlip).toBe('BUTTON#probe-target');

  const layout = String(reading.inLayoutEffect);
  const dropped = layout === 'BODY' || layout === '(null)';

  writeMeasurement('unmount-focus-commit-order', {
    ...reading,
    verdict: dropped
      ? 'F3 HOLDS — by the layout phase of the removing commit the browser has already moved ' +
        'focus off the detached node, so a `useLayoutEffect` read can see the drop. The design ' +
        'may detect there.'
      : `F3 FAILS — the layout effect saw ${layout}, not BODY. Detection must move to the ` +
        "container's onBlur; amend feature-spec.md §4.6 before M1 is written.",
  });
});
