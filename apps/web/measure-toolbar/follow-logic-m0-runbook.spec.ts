import { expect, type Page, test } from '@playwright/test';

import { canvas, drawActivity, openNewPlan, startEditing } from '../e2e-authoring/support';
import { diagramList, selectedActivityId } from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import {
  brief,
  planIdOf,
  readDependencyCount,
  readRows,
  type Row,
  settle,
  signUp,
  sweepRow,
} from './follow-logic-m0-support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Placed bar follows link, M0 / Task 0.1 and 0.3**
 * (`docs/specs/placed-bar-follows-link/m0-measurement.md`): re-run the owner's runbook steps 3.5 to
 * 3.8 by DRAWING bars, because seeded activities carry no `visualStart` and so follow their logic,
 * which is exactly how the first walkthrough was fooled (`docs/HANDOFF.md`, "The owner's biggest
 * finding"). State is read from the API, never from the DOM.
 *
 * A harness, not a gate (ADR-0081 §3). It writes nothing to the product.
 */

type Reading = Record<string, unknown>;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[follow-logic m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

const newlyFlagged = (before: Row[], after: Row[]): string[] =>
  after
    .filter(
      (a) =>
        a.visualConflictReason === 'EARLIER_THAN_LOGIC' &&
        before.find((b) => b.id === a.id)?.visualConflictReason !== 'EARLIER_THAN_LOGIC',
    )
    .map((a) => a.name);

/** What the dock and the toolbar say right now: the strips, the armed tool, the announcer. */
async function dockState(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const text = (el: Element | null | undefined): string | null =>
      el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
    const foot = document.querySelector('[data-activities-bar]');
    const buttons = [...document.querySelectorAll<HTMLElement>('[role="toolbar"] button')].map(
      (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim(),
    );
    return {
      modeBand: text(document.querySelector('[data-testid="canvas-mode-band"]')),
      layoutResolved: text(document.querySelector('[data-testid="canvas-layout-resolved"]')),
      footRow: text(foot),
      armedLinkButton: buttons.filter((b) => /^Linking/.test(b)),
      announcer: text(document.querySelector('[data-testid="announcer"]')),
    };
  });
}

/** The selection bar's items and whether the remedy is inline or in an overflow menu. */
async function barReading(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
    if (!bar) return { bar: null };
    const visible = (el: Element): boolean => {
      const b = el.getBoundingClientRect();
      return b.width > 1.5 && b.height > 1.5;
    };
    const inline = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
      .filter(visible)
      .map((e) => e.getAttribute('data-toolbar-item'));
    const buttons = [...bar.querySelectorAll<HTMLElement>('button')]
      .filter(visible)
      .map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim());
    return {
      name: bar.getAttribute('aria-label'),
      inline,
      buttons,
      clearVisualInline: inline.includes('clear-visual-placement'),
      hasOverflowMenuButton: buttons.some((b) => /^(More|⋯|Overflow)/i.test(b)),
    };
  });
}

async function selectByName(page: Page, org: string, name: string): Promise<void> {
  const row = (await readRows(page, org)).find((r) => r.name === name);
  if (!row) throw new Error(`no ${name}`);
  await diagramList(page).focus();
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 12; i += 1) {
    if ((await selectedActivityId(page)) === row.id) return;
    await page.keyboard.press('ArrowDown');
  }
  if ((await selectedActivityId(page)) !== row.id) throw new Error(`could not reach ${name}`);
}

/**
 * `owner` is the runbook as written: C is drawn far to the right of B, so lengthening A strands B only.
 * `chain` draws B and C a few days apart, so lengthening A far enough strands both, which is the
 * spec's chain edge case and cannot be told from `owner` without drawing it.
 */
const SCENARIOS = {
  owner: { xs: [220, 440, 660], extraDays: 1.5 },
  chain: { xs: [220, 300, 330], extraDays: 3 },
  // B is drawn LEFT of A, so linking A to B strands B at the moment of the link itself.
  linkstrand: { xs: [440, 220, 660], extraDays: 0 },
} as const;

const RUNS = [
  { pointer: 'fine', scenario: 'owner' },
  { pointer: 'coarse', scenario: 'owner' },
  { pointer: 'fine', scenario: 'chain' },
  { pointer: 'fine', scenario: 'linkstrand' },
] as const;

for (const { pointer, scenario } of RUNS) {
  test.describe(`follow-logic M0 runbook (${scenario}, ${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`runbook 3.5 to 3.8 drawn, ${scenario}, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(1_200_000);
      const name = `follow-logic-m0-runbook.${scenario}.${pointer}`;
      clearMeasurement(name);
      const cfg = SCENARIOS[scenario];
      const record: Reading = { pointer, scenario, steps: [] as Reading[] };
      const steps = record['steps'] as Reading[];
      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      const { orgSlug } = await signUp(
        page,
        Date.now() +
          (pointer === 'coarse' ? 7 : 0) +
          (scenario === 'chain' ? 13 : 0) +
          (scenario === 'linkstrand' ? 29 : 0),
        'FollowM0',
      );
      await openNewPlan(page);
      await startEditing(page);
      const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });

      // 3.5: draw three tasks. Each is drawn by the Add tool, so each carries a placement.
      const draws = [
        { name: 'Excavate', pos: { x: cfg.xs[0], y: 120 } },
        { name: 'Pour slab', pos: { x: cfg.xs[1], y: 180 } },
        { name: 'Steel beam', pos: { x: cfg.xs[2], y: 240 } },
      ];
      for (const [i, d] of draws.entries()) {
        await drawActivity(page, 'Task', d.name, d.pos);
        await expect(diagram.getByRole('option')).toHaveCount(i + 1, { timeout: 15_000 });
      }
      let { rows } = await settle(
        page,
        orgSlug,
        (r) => r.length === 3 && r.every((x) => x.visualEffectiveStart !== null),
        'three drawn bars with dates',
      );
      steps.push({ step: '3.5 three bars drawn', rows: rows.map(brief) });
      log(`drawn ${JSON.stringify(rows.map(brief))}`);
      const placedAfterDraw = rows.every((r) => r.visualStart !== null);
      record['everyDrawnBarHasAPlacement'] = placedAfterDraw;
      const byName = (n: string): Row => {
        const r = rows.find((x) => x.name === n);
        if (!r) throw new Error(`no ${n}`);
        return r;
      };

      // Leave the sticky Add tool, then find each bar's point by sweeping its row.
      await canvas(page).press('Escape');
      await canvas(page).press('Escape');
      const pointOf = async (
        n: string,
        y: number,
        hint: number,
      ): Promise<{ x: number; y: number; r: [number, number] }> => {
        const range = await sweepRow(page, byName(n).id, y, hint);
        return { x: Math.round((range.min + range.max) / 2), y, r: [range.min, range.max] };
      };
      const A = await pointOf('Excavate', 120, cfg.xs[0]);
      const B = await pointOf('Pour slab', 180, cfg.xs[1]);
      const C = await pointOf('Steel beam', 240, cfg.xs[2]);
      record['barPoints'] = { A, B, C };
      await canvas(page).press('Escape');

      // 3.6/3.7: arm the Link tool, A -> B, then B -> C without disarming.
      const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
      await toolbar.getByRole('button', { name: 'Link', exact: true }).click();
      await canvas(page).click({ position: A });
      await canvas(page).click({ position: B });
      await expect(page.getByTestId('canvas-mode-band')).toContainText('Linked', {
        timeout: 10_000,
      });
      const afterLinkAB = await settle(page, orgSlug, () => true, 'link A to B recalculated');
      expect(await readDependencyCount(page, orgSlug)).toBe(1);
      const dockAB = await dockState(page);
      steps.push({
        step: '3.6 link A->B, Link tool still armed?',
        rows: afterLinkAB.rows.map(brief),
        newlyFlagged: newlyFlagged(rows, afterLinkAB.rows),
        dock: dockAB,
        linkToolStillArmed: (dockAB['armedLinkButton'] as string[]).length > 0,
      });
      log(`after A->B dock ${JSON.stringify(dockAB)}`);
      rows = afterLinkAB.rows;

      await canvas(page).click({ position: B });
      await canvas(page).click({ position: C });
      await expect(page.getByTestId('canvas-mode-band')).toContainText('Linked', {
        timeout: 10_000,
      });
      await expect.poll(() => readDependencyCount(page, orgSlug), { timeout: 10_000 }).toBe(2);
      const afterLinkBC = await settle(page, orgSlug, () => true, 'link B to C recalculated');
      const dockBC = await dockState(page);
      steps.push({
        step: '3.7 link B->C',
        rows: afterLinkBC.rows.map(brief),
        newlyFlagged: newlyFlagged(rows, afterLinkBC.rows),
        dock: dockBC,
      });
      log(`after B->C dock ${JSON.stringify(dockBC)}`);
      rows = afterLinkBC.rows;

      // Disarm: does the confirmation go with the tool?
      await canvas(page).press('Escape');
      await page.waitForTimeout(500);
      steps.push({ step: 'Esc after linking', dock: await dockState(page) });

      if (scenario !== 'linkstrand') {
        // 3.8: lengthen A by dragging its end handle across B's start.
        const a0 = byName('Excavate');
        const bStart = Date.parse(
          `${byName('Pour slab').visualEffectiveStart?.slice(0, 10)}T00:00:00Z`,
        );
        const aStart = Date.parse(`${a0.visualEffectiveStart?.slice(0, 10)}T00:00:00Z`);
        const gapDays = Math.round((bStart - aStart) / 86_400_000);
        const pxPerDay = (B.r[0] - A.r[0]) / Math.max(1, gapDays);
        record['scale'] = { gapDays, pxPerDay };
        const box = await canvas(page).boundingBox();
        if (!box) throw new Error('no canvas box');
        const grabX = A.r[1] - 1;
        const cStart = Date.parse(
          `${byName('Steel beam').visualEffectiveStart?.slice(0, 10)}T00:00:00Z`,
        );
        const gapToC = Math.round((cStart - aStart) / 86_400_000);
        const dx = Math.round(
          pxPerDay * ((scenario === 'chain' ? gapToC : gapDays) + cfg.extraDays),
        );
        await page.mouse.move(box.x + grabX, box.y + A.y);
        await page.mouse.down();
        await page.mouse.move(box.x + grabX + dx / 2, box.y + A.y, { steps: 6 });
        await page.mouse.move(box.x + grabX + dx, box.y + A.y, { steps: 6 });
        await page.mouse.up();
        const lengthened = await settle(
          page,
          orgSlug,
          (r) => (r.find((x) => x.name === 'Excavate')?.durationDays ?? 0) > a0.durationDays,
          'Excavate lengthened',
        );
        const dockLen = await dockState(page);
        steps.push({
          step: '3.8 lengthen A',
          durationBefore: a0.durationDays,
          durationAfter: lengthened.rows.find((x) => x.name === 'Excavate')?.durationDays,
          settleMs: lengthened.ms,
          rows: lengthened.rows.map(brief),
          newlyFlagged: newlyFlagged(rows, lengthened.rows),
          dock: dockLen,
        });
        log(
          `after lengthen ${JSON.stringify(lengthened.rows.map(brief))} dock ${JSON.stringify(dockLen)}`,
        );
        rows = lengthened.rows;
      }
      const flagged = rows.filter((r) => r.visualConflictReason === 'EARLIER_THAN_LOGIC');
      record['flaggedAtEnd'] = flagged.map((r) => r.name);
      // Task 0.1 step 3: is Clear visual start inline on the selection bar? Read at both sizes.
      const placement: Reading[] = [];
      for (const size of [
        { w: 1024, h: 600 },
        { w: 1440, h: 900 },
      ]) {
        await page.setViewportSize({ width: size.w, height: size.h });
        await page.waitForTimeout(500);
        for (const target of flagged.length > 0
          ? [flagged[0]?.name ?? 'Pour slab']
          : ['Pour slab']) {
          await selectByName(page, orgSlug, target);
          await page.waitForTimeout(400);
          placement.push({ size: `${size.w}x${size.h}`, target, ...(await barReading(page)) });
        }
        await page.keyboard.press('Escape');
      }
      record['clearVisualStartPlacement'] = placement;
      log(`bar ${JSON.stringify(placement)}`);

      record['finalRows'] = rows.map(brief);
      record['planId'] = planIdOf(page);
      writeMeasurement(name, record);
      expect(steps.length).toBeGreaterThan(0);
    });
  });
}
