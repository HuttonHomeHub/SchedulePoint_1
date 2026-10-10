import { expect, type Browser, type Page, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  linkActivities,
  newPlan,
  openPlanId,
  placements,
  placeViaApi,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Toolbar redesign, M6: the visual brief's pictures and the app header's numbers**
 * (`docs/specs/toolbar-redesign/implementation-plan.md` M6; the record is `m6-measurement.md`).
 *
 * Two readings of the **real** product, taken the same way before and after the milestone's code
 * (`M6_TAG=before|after` names the files):
 *
 * - **Photos** of the command band at the four viewports the plan names, on both pointers, in three
 *   states: the pen held (the working state), a peer holding the pen (every authoring control
 *   shaded, V3), and a Filter applied (V4a's count).
 * - **The app header's numbers** at 320, 640 (touch), 1024, 1280 and 1646: its height, how many
 *   lines its controls sit on, whether the window scrolls sideways, and whether every control hits
 *   itself under `elementFromPoint` (the method `header-fit.spec.ts` settled on), on a plan and on
 *   an organisation screen.
 *
 * A harness, not a gate (ADR-0081 §3).
 */

const TAG = process.env.M6_TAG ?? 'after';
const PASSWORD = 'correct-horse-battery';

const PHOTO_CELLS = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1912x1080', w: 1912, h: 1080 },
] as const;

const HEADER_CELLS = [
  { label: '320x720', w: 320, h: 720 },
  { label: '640x480', w: 640, h: 480 },
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1646x1097', w: 1646, h: 1097 },
] as const;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[m6 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

type Reading = Record<string, unknown>;

function readHeader(): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const header = document.querySelector('header');
  if (!header) throw new Error('no <header>');
  const box = header.getBoundingClientRect();
  const row = header.parentElement?.getBoundingClientRect();
  const controls = [...header.querySelectorAll('a,button,[role="button"],input,select')].filter(
    (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 1.5 && b.height > 1.5 && getComputedStyle(el).visibility !== 'hidden';
    },
  );
  const tops = [...new Set(controls.map((c) => Math.round(c.getBoundingClientRect().top / 6)))];
  const hits = controls.map((el) => {
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    const inView = x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight;
    const hit = inView ? document.elementFromPoint(x, y) : null;
    return {
      name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 36),
      x: r(b.left),
      w: r(b.width),
      h: r(b.height),
      right: r(b.right),
      hitsItself: hit !== null && (hit === el || el.contains(hit)),
    };
  });
  const band = document.querySelector<HTMLElement>(
    '[data-surface="chrome"]:not([data-activities-bar])',
  );
  return {
    viewport: { w: innerWidth, h: innerHeight },
    headerHeight: r(row?.height ?? box.height),
    bandHeight: r(band?.getBoundingClientRect().height ?? 0),
    lines: tops.length,
    pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1,
    controlsOffWindow: hits.filter((h) => h.right > innerWidth + 1).length,
    controlsMiss: hits.filter((h) => !h.hitsItself).map((h) => h.name),
    controls: hits,
  };
}

/** Lines and unused width per declared deck row — the SC-1 / SC-17 reading, as the M5 harness takes it. */
function readRows(): Reading[] {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const deck = document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Plan commands"]');
  if (!deck) throw new Error('the deck was not found');
  return ['look', 'do'].map((id) => {
    const row = deck.querySelector<HTMLElement>(`[data-deck-row="${id}"]`);
    if (!row) throw new Error(`deck row ${id} missing`);
    const rr = row.getBoundingClientRect();
    const controls = [...row.querySelectorAll('button, input, [data-toolbar-item]')].filter((c) => {
      const b = c.getBoundingClientRect();
      return b.width > 1.5 && b.height >= 24;
    });
    const tops = [...new Set(controls.map((c) => Math.round(c.getBoundingClientRect().top / 4)))];
    // The free gap on a one-line row: between the last group before the trailing one (or the row's
    // end) and the trailing group's start. `used` from the last control would read 0 because the
    // trailing group is pushed to the line's end by an auto margin.
    const groups = [...row.querySelectorAll<HTMLElement>('[role="group"]')]
      .map((g) => g.getBoundingClientRect())
      .sort((x, y) => x.left - y.left);
    const trailing = row.querySelector<HTMLElement>('[role="group"].ml-auto');
    const tr = trailing?.getBoundingClientRect();
    const before = groups.filter((g) => !tr || g.left < tr.left - 1);
    const lead = before.length > 0 ? Math.max(...before.map((g) => g.right)) : rr.left;
    const used = tr ? tr.left : rr.right;
    return {
      row: id,
      width: r(rr.width),
      lines: tops.length,
      gap: r(used - lead),
      groups: groups.map((g) => [r(g.left - rr.left), r(g.width)]),
    };
  });
}

async function waitDeck(page: Page): Promise<void> {
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(700);
}

async function peerTakesPen(b: Page, org: string, planId: string): Promise<void> {
  const res = await b.evaluate(
    async ({ o, p }: { o: string; p: string }) => {
      const url = `/api/v1/organizations/${o}/plans/${p}/edit-lock`;
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const w = window as unknown as { __hb?: number };
      if (w.__hb) clearInterval(w.__hb);
      w.__hb = window.setInterval(() => {
        void fetch(`${url}/heartbeat`, { method: 'POST', credentials: 'include' });
      }, 15_000);
      return { ok: r.ok, status: r.status };
    },
    { o: org, p: planId },
  );
  expect(res.ok, `peer could not take the pen: ${JSON.stringify(res)}`).toBe(true);
}

async function peerReleasesPen(b: Page, org: string, planId: string): Promise<void> {
  await b.evaluate(
    async ({ o, p }: { o: string; p: string }) => {
      const w = window as unknown as { __hb?: number };
      if (w.__hb) clearInterval(w.__hb);
      await fetch(`/api/v1/organizations/${o}/plans/${p}/edit-lock`, {
        method: 'DELETE',
        credentials: 'include',
      });
    },
    { o: org, p: planId },
  );
}

async function inviteAndSignUpPeer(a: Page, browser: Browser, stamp: number): Promise<Page> {
  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const invite = a.getByRole('dialog');
  await invite.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await invite.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Done' }).click();
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
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
  return b;
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`toolbar-redesign M6 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M6 readings, ${TAG}, ${pointer} pointer`, async ({ page, browser }) => {
      test.setTimeout(1_800_000);
      const name = `toolbar-redesign-m6-${TAG}.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = {
        pointer,
        tag: TAG,
        header: {},
        rows: {},
        photos: [] as string[],
      };
      const header = record.header as Reading;
      const save = (): void => {
        writeMeasurement(name, record);
      };
      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Chrome Tester');
      await page.getByLabel('Email').fill(`chrome-${stamp}@example.com`);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /create an account/i }).click();
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Chrome Co ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      const orgSlug = `chrome-co-${stamp}`;
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      const orgUrl = page.url();

      const peer = await inviteAndSignUpPeer(page, browser, stamp);
      await createHierarchy(page);
      await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
      const planId = openPlanId(page);
      await ensurePen(page);
      const seeded = await seedActivities(page, orgSlug, [
        { name: 'Site setup', laneIndex: 0, durationDays: 12 },
        { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
        { name: 'Pour slab', laneIndex: 2, durationDays: 6 },
      ]);
      const [s0, s1] = seeded;
      if (!s0 || !s1) throw new Error('seed too short');
      await linkActivities(page, orgSlug, s0.id, s1.id);
      await recalculate(page, orgSlug);
      const planUrl = page.url();
      log('fixture ready');

      const shoot = async (cell: string, state: string): Promise<void> => {
        const file = `m6-${TAG}-${pointer}-${cell}-${state}.png`;
        await page
          .locator('[data-surface="chrome"]:not([data-activities-bar])')
          .first()
          .screenshot({ path: `../../docs/specs/toolbar-redesign/photos/${file}` });
        (record.photos as string[]).push(file);
      };

      // ---- the header's numbers: a plan, then an organisation screen ------------------------
      await page.goto(planUrl);
      await waitDeck(page);
      await ensurePen(page);
      for (const c of HEADER_CELLS) {
        await page.setViewportSize({ width: c.w, height: c.h });
        await page.waitForTimeout(500);
        header[`plan ${c.label}`] = await page.evaluate(readHeader);
        await shoot(c.label, 'header-plan');
      }
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(orgUrl);
      await page.waitForTimeout(800);
      for (const c of HEADER_CELLS) {
        await page.setViewportSize({ width: c.w, height: c.h });
        await page.waitForTimeout(500);
        header[`org ${c.label}`] = await page.evaluate(readHeader);
        await shoot(c.label, 'header-org');
      }
      save();
      log('header done');

      // ---- the photos ----------------------------------------------------------------------
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(planUrl);
      await waitDeck(page);
      await ensurePen(page);
      for (const c of PHOTO_CELLS) {
        await page.setViewportSize({ width: c.w, height: c.h });
        await page.waitForTimeout(550);
        (record.rows as Reading)[`pen ${c.label}`] = await page.evaluate(readRows);
        await shoot(c.label, 'pen');
      }

      // A Filter applied: V4a's count, and the pressed state beside it.
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.getByRole('button', { name: /^Filter/ }).click();
      await page.getByRole('checkbox', { name: /Has constraint/ }).check();
      await page.keyboard.press('Escape');
      for (const c of PHOTO_CELLS) {
        await page.setViewportSize({ width: c.w, height: c.h });
        await page.waitForTimeout(550);
        (record.rows as Reading)[`filtered ${c.label}`] = await page.evaluate(readRows);
        await shoot(c.label, 'filtered');
      }
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.getByRole('button', { name: /^Filter/ }).click();
      await page.getByRole('checkbox', { name: /Has constraint/ }).uncheck();
      await page.keyboard.press('Escape');

      // A peer holds the pen: every authoring control is shaded (V3).
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(`${planUrl}`);
      await waitDeck(page);
      await page
        .getByRole('button', { name: 'Stop editing' })
        .click()
        .catch(() => undefined);
      await peerTakesPen(peer, orgSlug, planId);
      await page.reload();
      await waitDeck(page);
      for (const c of PHOTO_CELLS) {
        await page.setViewportSize({ width: c.w, height: c.h });
        await page.waitForTimeout(550);
        (record.rows as Reading)[`shaded ${c.label}`] = await page.evaluate(readRows);
        await shoot(c.label, 'shaded');
      }
      await peerReleasesPen(peer, orgSlug, planId);

      // The worst stress state for LOOK: a conflict, cycling, with the chip's read-out showing.
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(planUrl);
      await waitDeck(page);
      await ensurePen(page);
      await placeViaApi(page, orgSlug, 'Excavate to formation', '2026-01-05');
      await recalculate(page, orgSlug);
      await waitDeck(page);
      await expect
        .poll(
          async () => (await placements(page, orgSlug)).some((r) => r.visualConflict === true),
          {
            timeout: 25_000,
          },
        )
        .toBe(true);
      await page.reload();
      await waitDeck(page);
      await ensurePen(page);
      await page.locator('[data-toolbar-item="next-conflict"]').first().click();
      await page.waitForTimeout(500);
      for (const c of PHOTO_CELLS) {
        await page.setViewportSize({ width: c.w, height: c.h });
        await page.waitForTimeout(550);
        (record.rows as Reading)[`conflict ${c.label}`] = await page.evaluate(readRows);
        await shoot(c.label, 'conflict');
      }

      // A second organisation, so the switcher is a MENU: the header's numbers with the button in
      // it, then the menu open on a plan.
      const made = await page.evaluate(async (orgName: string) => {
        const r = await fetch('/api/v1/organizations', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: orgName }),
        });
        return { ok: r.ok, status: r.status };
      }, `Second Co ${stamp}`);
      expect(made.ok, `could not create a second organisation: ${made.status}`).toBe(true);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(planUrl);
      await waitDeck(page);
      for (const c of HEADER_CELLS) {
        await page.setViewportSize({ width: c.w, height: c.h });
        await page.waitForTimeout(500);
        header[`multi ${c.label}`] = await page.evaluate(readHeader);
        await shoot(c.label, 'header-multi');
      }
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByRole('button', { name: /^Active organisation/ }).click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `../../docs/specs/toolbar-redesign/photos/m6-${TAG}-${pointer}-org-menu-1280x800.png`,
        clip: { x: 0, y: 0, width: 1280, height: 260 },
      });
      (record.photos as string[]).push(`m6-${TAG}-${pointer}-org-menu-1280x800.png`);
      save();
      log('done');
    });
  });
}
