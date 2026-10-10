import { type Browser, type Page } from '@playwright/test';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  diagramList,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
  openPlanId,
  placeViaApi,
  placements,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **Two deck lines at the floor, in every state that stresses it** (toolbar-redesign M4, SC-1).
 *
 * `command-surface.spec.ts` asserts the base state. The floor is not tight in the base state: it is
 * tight when the LOOK row carries a conflict count and when the DO row carries a peer's pen sentence,
 * which is what M0 projected and M2 measured. So this sweeps 1024 × 600 on a mouse through the
 * states `m4-measurement.md` reads, and asks the same two questions of each: the deck's controls sit
 * on at most two lines (one per declared row), and the diagram keeps its canvas where no selection
 * bar has taken the foot row.
 *
 * **The selection states assert lines only.** A selection docks its bar in the foot row (167 px at
 * the floor, `m3-measurement.md` §4), which leaves 246 px of canvas; that is the selection bar's own
 * width, set by its outlet column, and it is not this milestone's to move. Stating it here keeps the
 * canvas bound honest where it applies instead of loosening it everywhere.
 *
 * **The cycling read-out is count-only** ("Conflict 1 of 1", product owner 2026-10-10). Its reason
 * was 56 px past the row at the floor; the chip no longer carries it. Verified red by restoring the
 * reason clause: LOOK wraps to a second line in the cycling states.
 */
const FLOOR = { width: 1024, height: 600 };
const PASSWORD = 'correct-horse-battery';
const CANVAS_MIN_PX = 350;

interface Reading {
  lines: number;
  look: number;
  do: number;
  canvas: number;
  chip: string | null;
  cluster: boolean;
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
    if (!deck) throw new Error('the deck was not found');
    const lines = (root: Element): number => {
      const tops = [...root.querySelectorAll('[data-toolbar-item]')]
        .map((el) => el.getBoundingClientRect().top)
        .sort((a, b) => a - b);
      let n = 0;
      let last = Number.NEGATIVE_INFINITY;
      for (const t of tops) {
        if (t - last > 4) n += 1;
        last = t;
      }
      return n;
    };
    const row = (id: string): Element => {
      const el = deck.querySelector(`[data-deck-row="${id}"]`);
      if (!el) throw new Error(`no ${id} row`);
      return el;
    };
    return {
      lines: lines(deck),
      look: lines(row('look')),
      do: lines(row('do')),
      canvas: document.querySelector('main canvas')?.getBoundingClientRect().height ?? 0,
      chip:
        document.querySelector('[data-toolbar-item="next-conflict-status"]')?.textContent?.trim() ??
        null,
      cluster: document.querySelector('[role="toolbar"][aria-label="Diagram viewport"]') !== null,
    };
  });
}

async function expectFloor(
  page: Page,
  state: string,
  opts: { canvas: boolean; cluster: boolean },
): Promise<Reading> {
  await page.waitForTimeout(500);
  const r = await read(page);
  expect(r.lines, `${state}: the deck sits on ${r.lines} lines at the floor`).toBeLessThanOrEqual(
    2,
  );
  expect(r.look, `${state}: LOOK wraps to ${r.look} lines`).toBe(1);
  expect(r.do, `${state}: DO wraps to ${r.do} lines`).toBe(1);
  expect(r.cluster, `${state}: the cluster is ${r.cluster ? 'present' : 'absent'}`).toBe(
    opts.cluster,
  );
  if (opts.canvas) {
    expect(r.canvas, `${state}: canvas ${r.canvas}px`).toBeGreaterThanOrEqual(CANVAS_MIN_PX);
  }
  return r;
}

async function invitePeer(a: Page, browser: Browser, stamp: number): Promise<{ b: Page }> {
  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const invite = a.getByRole('dialog');
  await invite.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await invite.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Done' }).click();
  const ctx = await browser.newContext();
  await acknowledgeViewportNotice(ctx);
  const b = await ctx.newPage();
  await b.goto('/sign-up');
  await b.getByLabel('Full name').fill('Peer Planner');
  await b.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await b.getByLabel('Password').fill(PASSWORD);
  await b.getByRole('button', { name: /create an account/i }).click();
  await expect(b.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await b.goto(acceptUrl);
  await b.getByRole('button', { name: /accept and join/i }).click();
  await expect(b).toHaveURL(/\/orgs\//);
  return { b };
}

test.describe('The deck at the 1024 x 600 floor, in every stress state (mouse)', () => {
  test('stays on two lines, one per row', async ({ browser, page }) => {
    test.setTimeout(300_000);
    await acknowledgeViewportNotice(page.context());
    await page.setViewportSize({ width: 1646, height: 1097 });
    const stamp = Date.now() + 5400;
    const orgSlug = await onboard(page, stamp);
    const { b } = await invitePeer(page, browser, stamp);
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
    const planId = openPlanId(page);
    const planUrl = page.url();

    // ---- empty plan: no diagram, the cluster is shaded not absent ----------------------------
    await page.setViewportSize(FLOOR);
    await expectFloor(page, 'empty plan', { canvas: false, cluster: true });
    await page.setViewportSize({ width: 1646, height: 1097 });

    await ensurePen(page);
    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
      { name: 'Pour slab', laneIndex: 2, durationDays: 6 },
    ]);
    await linkActivities(page, orgSlug, seeded[0]!.id, seeded[1]!.id);
    await recalculate(page, orgSlug);

    const reopen = async (pen: boolean): Promise<void> => {
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(planUrl);
      await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
        timeout: 30_000,
      });
      if (pen) await ensurePen(page);
      const mm = page.locator('[data-toolbar-item="minimap"]').first();
      if ((await mm.getAttribute('aria-pressed')) === 'true') await mm.click();
      const comments = page.locator('[data-toolbar-item="comments"]').first();
      if ((await comments.getAttribute('aria-pressed')) === 'true') await comments.click();
      const diagram = page.locator('[data-toolbar-item="view-tsld"]').first();
      if ((await diagram.getAttribute('aria-pressed')) === 'false') await diagram.click();
      await page.waitForTimeout(400);
    };

    // ---- base --------------------------------------------------------------------------------
    await reopen(true);
    await page.setViewportSize(FLOOR);
    await expectFloor(page, 'base', { canvas: true, cluster: true });

    // ---- selection (a bar docks in the foot row: lines only) ---------------------------------
    await reopen(true);
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.setViewportSize(FLOOR);
    await expectFloor(page, 'selection', { canvas: false, cluster: true });

    // ---- dock open ---------------------------------------------------------------------------
    await reopen(true);
    await page.locator('[data-toolbar-item="comments"]').first().click();
    await page.setViewportSize(FLOOR);
    await expectFloor(page, 'dock', { canvas: true, cluster: true });

    // ---- minimap open ------------------------------------------------------------------------
    await reopen(true);
    await page.setViewportSize(FLOOR);
    await page.locator('[data-toolbar-item="minimap"]').first().click();
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toBeVisible();
    await expectFloor(page, 'minimap', { canvas: true, cluster: true });
    await page.locator('[data-toolbar-item="minimap"]').first().click();

    // ---- Gantt: no cluster, same deck --------------------------------------------------------
    await reopen(true);
    await page.locator('[data-toolbar-item="view-gantt"]').first().click();
    await page.setViewportSize(FLOOR);
    await expectFloor(page, 'gantt', { canvas: false, cluster: false });

    // ---- a peer holds the pen ----------------------------------------------------------------
    await reopen(false);
    const url = `/api/v1/organizations/${orgSlug}/plans/${planId}/edit-lock`;
    const took = await b.evaluate(async (u: string) => {
      const r = await fetch(u, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return r.ok;
    }, url);
    expect(took, 'the peer could not take the pen').toBe(true);
    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
      timeout: 30_000,
    });
    await page.setViewportSize(FLOOR);
    await expectFloor(page, 'peer pen', { canvas: true, cluster: true });
    await b.evaluate(async (u: string) => {
      await fetch(u, { method: 'DELETE', credentials: 'include' });
    }, url);

    // ---- conflicts: "1 conflict", then the count-only cycling read-out -----------------------
    await reopen(true);
    await placeViaApi(page, orgSlug, 'Excavate to formation', '2026-01-05');
    await recalculate(page, orgSlug);
    await ensurePen(page);
    await expect
      .poll(async () => (await placements(page, orgSlug)).some((r) => r.visualConflict === true), {
        timeout: 25_000,
      })
      .toBe(true);
    await reopen(true);
    await page.setViewportSize(FLOOR);
    const idle = await expectFloor(page, 'conflict (idle chip)', { canvas: true, cluster: true });
    expect(idle.chip, 'the idle chip is missing').toBe('1 conflict');

    await page.setViewportSize({ width: 1646, height: 1097 });
    await page.locator('[data-toolbar-item="next-conflict"]').first().click();
    await page.setViewportSize(FLOOR);
    const cycling = await expectFloor(page, 'conflict (cycling read-out)', {
      canvas: false,
      cluster: true,
    });
    expect(cycling.chip, 'the cycling read-out carries more than the count').toBe(
      'Conflict 1 of 1',
    );
  });
});
