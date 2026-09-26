import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Which label `Make milestone…` can afford on the selection bar** (`docs/specs/zero-duration-task/`
 * M0-T5, spec FC-6).
 *
 * The item does not exist yet — M2 builds it — so this harness **bypasses the product in one
 * place, and says so** (ADR-0081 §3): with a zero-duration task selected, it clones the bar's own
 * `Edit` control in the DOM, gives the clone a candidate label, inserts it beside the original and
 * reads the foot row. A clone carries the real control's classes, padding, icon and gap, so its
 * width is what a registered item with that label would take; what it cannot show is anything the
 * registry would do differently (an order other than "after Edit", or a second item appearing with
 * it). Everything else is the real product: sign-up, plan, pen, a recalculated schedule and the
 * canvas's own listbox for the selection.
 *
 * Two selections, because the bar differs between them: an **unplaced** zero-duration task (the
 * common case), and a **placed** one, which also shows `Clear visual start` — the widest bar this
 * item will ever join. It reports, per viewport and candidate: the foot row's height at rest and
 * with the selection, the number of lines the bar's controls sit on, and the candidate's own width.
 * Asserts nothing about the numbers; they are the answer.
 */
const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1646', width: 1646, height: 1097 },
  { name: '1440', width: 1440, height: 900 },
];

/** The last is not a label: the Edit clone with its text removed, an approximation of an icon-only item. */
const CANDIDATES = [
  null,
  'Make milestone…',
  'Make milestone',
  'Milestone…',
  '(icon only)',
] as const;

test.describe.configure({ mode: 'serial' });

/** Walk the canvas listbox until the named activity is the subject of the actions bar. */
async function select(page: Page, name: string): Promise<void> {
  const listbox = page.getByRole('listbox', { name: /Activities/ }).first();
  await listbox.focus();
  const bar = page.getByRole('toolbar', { name: /^Actions for / });
  const selected = async () =>
    (await bar.count()) > 0 && (await bar.getAttribute('aria-label')) === `Actions for ${name}`;
  // Walk up to the top of the list, then down: the listbox keeps its last position, so the target
  // can be on either side of it.
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
    if (await selected()) return;
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }
  if (await selected()) return;
  throw new Error(`could not select ${name}`);
}

/** Clone the bar's Edit control with a candidate label; returns the clone's width. */
async function inject(page: Page, label: string): Promise<number> {
  return page.evaluate((text) => {
    const bar = document.querySelector('[role="toolbar"][aria-label^="Actions for "]');
    if (!bar) throw new Error('no actions bar');
    const edit = [...bar.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === 'Edit',
    );
    if (!edit) throw new Error('no Edit control to clone');
    const host = edit.closest('[data-toolbar-item]') ?? edit;
    const clone = host.cloneNode(true) as HTMLElement;
    clone.setAttribute('data-m0t5-candidate', '');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    const button = clone.matches('button') ? clone : clone.querySelector('button');
    if (!button) throw new Error('clone has no button');
    const iconOnly = text === '(icon only)';
    button.setAttribute('aria-label', iconOnly ? 'Make milestone…' : text);
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    let replaced = false;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.textContent ?? '').trim() === 'Edit') {
        n.textContent = iconOnly ? '' : text;
        replaced = true;
      }
    }
    if (!replaced) throw new Error('Edit label text not found in the clone');
    host.after(clone);
    return Math.round(clone.getBoundingClientRect().width);
  }, label);
}

/**
 * The row's height, how many lines the bar's controls sit on, and — when they sit on one — how
 * many pixels the dock outlet has left beside the bar's card. The slack is the number that says how
 * wide a new control could be before the row wraps, which is the answer the candidate labels alone
 * cannot give when every one of them wraps.
 *
 * **Measured against the outlet, not the toolbar.** The first version read the toolbar's own right
 * edge and reported 0 on every line: the toolbar and its card are sized to their content, so their
 * edge is always the last control's. The room is the outlet (`CanvasDockOutlet`, `flex min-w-0
 * flex-1 flex-wrap`), which is the card's parent.
 */
async function readRow(
  page: Page,
): Promise<{ rowHeight: number | null; lines: number; slack: number | null }> {
  const rowHeight = (await page.locator('[data-activities-bar]').boundingBox())?.height ?? null;
  const { lines, slack } = await page.evaluate(() => {
    const bar = document.querySelector('[role="toolbar"][aria-label^="Actions for "]');
    const card = bar?.parentElement;
    const outlet = card?.parentElement;
    if (!bar || !card || !outlet) return { lines: 0, slack: null };
    const rects = [...bar.querySelectorAll('button')]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0);
    const count = new Set(rects.map((r) => Math.round(r.top))).size;
    return {
      lines: count,
      slack:
        count === 1
          ? Math.round(outlet.getBoundingClientRect().right - card.getBoundingClientRect().right)
          : null,
    };
  });
  return { rowHeight, lines, slack };
}

async function place(page: Page, orgSlug: string, activityId: string): Promise<void> {
  const failure = await page.evaluate(
    async ({ org, id }) => {
      const read = await fetch(`/api/v1/organizations/${org}/activities/${id}`, {
        credentials: 'include',
      });
      const body = (await read.json()) as { data: { version: number } };
      const patch = await fetch(`/api/v1/organizations/${org}/activities/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: body.data.version, visualStart: '2026-02-02' }),
      });
      return patch.ok ? null : `${String(patch.status)} ${await patch.text()}`;
    },
    { org: orgSlug, id: activityId },
  );
  if (failure) throw new Error(`placing failed: ${failure}`);
}

test('the foot row with a zero-duration task selected, per candidate label', async ({ page }) => {
  test.setTimeout(300_000);
  clearMeasurement('zero-duration-foot-row');

  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, `Zero foot row ${stamp}`);
  await ensurePen(page);
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Sign-off', laneIndex: 0, durationDays: 0 },
    { name: 'Placed sign-off', laneIndex: 1, durationDays: 0 },
    { name: 'Dig', laneIndex: 2, durationDays: 5 },
  ]);
  const placed = seeded.find((a) => a.name === 'Placed sign-off');
  if (!placed) throw new Error('seed did not return the placed row');
  await place(page, orgSlug, placed.id);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  expect(openPlanId(page)).toBeTruthy();

  const readings: unknown[] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);
    const idle = (await page.locator('[data-activities-bar]').boundingBox())?.height ?? null;

    for (const subject of ['Sign-off', 'Placed sign-off']) {
      await select(page, subject);
      await expect(page.getByRole('toolbar', { name: `Actions for ${subject}` })).toBeVisible();
      await page.waitForTimeout(300);
      const barBox = await page.getByRole('toolbar', { name: /^Actions for / }).boundingBox();

      for (const candidate of CANDIDATES) {
        const width = candidate ? await inject(page, candidate) : null;
        await page.waitForTimeout(150);
        const { rowHeight, lines, slack } = await readRow(page);
        readings.push({
          viewport: vp.name,
          subject,
          candidate: candidate ?? '(none — today)',
          candidateWidth: width,
          rowHeightIdle: idle,
          rowHeightWithSelection: rowHeight,
          costToCanvas: idle !== null && rowHeight !== null ? rowHeight - idle : null,
          barLines: lines,
          slackOnOneLine: slack,
          barWidthGiven: barBox ? Math.round(barBox.width) : null,
        });
        await page.evaluate(() =>
          document.querySelectorAll('[data-m0t5-candidate]').forEach((n) => n.remove()),
        );
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  }

  writeMeasurement('zero-duration-foot-row', { takenAt: new Date().toISOString(), readings });
});
