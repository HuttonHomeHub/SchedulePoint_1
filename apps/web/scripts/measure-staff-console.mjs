/**
 * M0-T1 of the staff console redesign (`docs/specs/staff-console-redesign/implementation-plan.md`):
 * the "before" readings its success criteria need, taken from a real browser against a real API
 * (ADR-0142: a remedy is measured before it is built).
 *
 * It reads, per width: full-page height at rest, after **Run diagnostics** and after the probe
 * check (SC-1, SC-10); the elements that stick out past the right edge (SC-8, SC-11); the distinct
 * sub-heading treatments (SC-2); the order of the Status rows in three states (SC-12); the polite
 * announcements on load (SC-6); and the `staff.panel_read` rows one load and one reload write
 * (SC-4). It also photographs `/staff` as a non-staff member beside `/no-such-path` (spec D-13).
 *
 * Needs an API booted with `STAFF_EMAILS=ops@schedulepoint.test` against the database that
 * `DATABASE_URL` names (this script counts audit rows in it), and the web dev server. **Use a fresh
 * database**: the activity table's rows and the audit counts depend on accumulated activity.
 *
 *   DATABASE_URL=… SHOTS=/some/dir WIDTHS=320x640,1368x912 node scripts/measure-staff-console.mjs
 *
 * `SHOTS` is optional; without it nothing is written but the JSON on stdout.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

import { psql } from './local-psql.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const SHOTS = process.env.SHOTS;
const EMAIL = 'ops@schedulepoint.test';
const PASSWORD = 'correct-horse-battery';
const WIDTHS = (process.env.WIDTHS ?? '320x640,390x844,1280x800,1368x912,1646x900,1920x1080')
  .split(',')
  .map((w) => w.split('x').map(Number))
  .map(([width, height]) => ({ width, height }));

const auditRows = () =>
  Number(psql(`select count(*) from audit_events where action = 'staff.panel_read'`).trim());

async function signUp(browser, email, name) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/sign-up`);
  await p.getByLabel('Full name').fill(name);
  await p.getByLabel('Email').fill(email);
  await p.getByLabel('Password').fill(PASSWORD);
  await p.getByRole('button', { name: /create an account/i }).click();
  await p.waitForTimeout(3000);
  await ctx.close();
}

async function signIn(ctx, email) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/sign-in`);
  await p.getByLabel('Email').fill(email);
  await p.getByLabel('Password').fill(PASSWORD);
  await p.getByRole('button', { name: /sign in/i }).click();
  await p.waitForTimeout(2500);
  return p;
}

/* eslint-disable no-undef */
/**
 * Installed before any page script runs. A region counts when its text becomes non-empty after it
 * was mounted, because that is the change a screen reader speaks (the `Panel` docblock's argument).
 */
const installLiveObserver = () => {
  const changed = new Map();
  window.__liveChanges = changed;
  new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target instanceof Element ? r.target : r.target.parentElement;
      const region = node?.closest('[aria-live], [role="status"], [role="alert"]');
      if (!region) continue;
      const text = region.textContent?.trim() ?? '';
      if (text === '') continue;
      const kind = region.getAttribute('aria-live')
        ? `aria-live=${region.getAttribute('aria-live')}`
        : `role=${region.getAttribute('role')}`;
      changed.set(region, { kind, text: text.slice(0, 80), at: Math.round(performance.now()) });
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

const readPage = () => {
  const root = document.documentElement;
  const over = [...document.querySelectorAll('body *')]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.right > root.clientWidth + 1;
    })
    .slice(0, 8)
    .map(
      (e) =>
        `${e.tagName}.${String(e.className).slice(0, 40)} right=${Math.round(e.getBoundingClientRect().right)}`,
    );
  // A button or link past the edge is a control a reader cannot reach, which is a worse thing than a
  // table that is cut off in a scrollable region, so it is listed in full rather than capped.
  const overControls = [...document.querySelectorAll('button, a, input, select, summary')]
    .filter((e) => e.getBoundingClientRect().width > 0)
    .filter((e) => e.getBoundingClientRect().right > root.clientWidth + 1)
    .map(
      (e) =>
        `${e.tagName} "${(e.textContent ?? '').trim().slice(0, 40)}" right=${Math.round(e.getBoundingClientRect().right)}`,
    );
  const main = document.querySelector('main');
  return {
    overControls,
    height: root.scrollHeight,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    mainOverflow: main ? main.scrollWidth > main.clientWidth : null,
    over,
  };
};

const readHeadings = () => {
  const sig = (e) => {
    const cs = getComputedStyle(e);
    return [
      e.tagName.toLowerCase(),
      cs.fontSize,
      cs.fontWeight,
      cs.textTransform,
      cs.letterSpacing,
    ].join(' ');
  };
  const groups = new Map();
  // Sub-headings are the headings below a box title: `h3` on the flat page, `h4` once the boxes sit
  // in a group (box titles are then `h3`), plus the `summary` disclosure heading. `h3` is therefore
  // read only when no group exists, so the count means the same thing before and after M3.
  const grouped = document.getElementById('staff-group-conditions') !== null;
  const selector = grouped ? 'main h4, main summary' : 'main h3, main h4, main summary';
  for (const e of document.querySelectorAll(selector)) {
    const key = sig(e);
    groups.set(key, [...(groups.get(key) ?? []), (e.textContent ?? '').trim().slice(0, 40)]);
  }
  return Object.fromEntries(groups);
};

const readStatusOrder = () => {
  const status = [...document.querySelectorAll('main section')].find(
    (s) => s.querySelector('h2')?.textContent?.trim() === 'Status',
  );
  return status
    ? [...status.querySelectorAll('li')].map((li) =>
        (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
      )
    : null;
};

/** Polite regions that hold text once the page has settled: the census, as opposed to the changes. */
const readPoliteCensus = () =>
  [...document.querySelectorAll('[aria-live="polite"], [role="status"]')]
    .filter((e) => (e.textContent ?? '').trim() !== '')
    .map((e) => (e.textContent ?? '').trim().slice(0, 60));

const readLive = () => [...window.__liveChanges.values()].map(({ kind, text }) => ({ kind, text }));

const readNotFound = () => ({
  title: document.title,
  url: location.pathname,
  h1: [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim()),
  mainText: document.querySelector('main')?.innerText.slice(0, 200) ?? null,
  mainClass: document.querySelector('main')?.className ?? null,
  firstContainerClass:
    document.querySelector('main > div')?.className ??
    document.querySelector('main')?.firstElementChild?.className ??
    null,
  firstContainerLeft: Math.round(
    document.querySelector('main')?.firstElementChild?.getBoundingClientRect().left ?? -1,
  ),
  height: document.documentElement.scrollHeight,
});
/* eslint-enable no-undef */

async function openStaff(ctx, email) {
  const p = await signIn(ctx, email);
  await p.addInitScript(installLiveObserver);
  return p;
}

async function waitForConsole(p) {
  // Boxes are `h2` on the flat page and `h3` inside a group (ADR-0178), so either names the console.
  await p.waitForSelector(':is(h2, h3):has-text("Diagnostics")', { timeout: 20000 });
}

async function shot(p, name) {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
});
if (SHOTS) await mkdir(SHOTS, { recursive: true });

const exists = psql(`select count(*) from users where email = '${EMAIL}'`).trim() !== '0';
if (!exists) await signUp(browser, EMAIL, 'Ops Staff');
psql(`update users set email_verified = true where email = '${EMAIL}'`);

const result = { environment: { base: BASE, chromium: browser.version() }, widths: {} };

for (const vp of WIDTHS) {
  const key = `${vp.width}x${vp.height}`;
  const out = {};
  const ctx = await browser.newContext({ viewport: vp });
  const p = await signIn(ctx, EMAIL);

  // Load: audit rows, announcements within 5 s, resting height. The init script is added to the
  // page after sign-in so the sign-in screen's own regions are not counted.
  await p.addInitScript(installLiveObserver);
  const before = auditRows();
  await p.goto(`${BASE}/staff`);
  await waitForConsole(p);
  await p.waitForTimeout(5000);
  out.auditRowsPerLoad = auditRows() - before;
  out.announcementsOnLoad = await p.evaluate(readLive);
  out.politeRegionsWithTextAfterLoad = await p.evaluate(readPoliteCensus);
  out.rest = await p.evaluate(readPage);
  out.subHeadings = await p.evaluate(readHeadings);
  out.statusOrder = { attention: await p.evaluate(readStatusOrder) };
  await shot(p, `${key}-01-rest`);

  const beforeReload = auditRows();
  await p.reload();
  await waitForConsole(p);
  await p.waitForTimeout(3000);
  out.auditRowsPerReload = auditRows() - beforeReload;

  await p.getByRole('button', { name: 'Run diagnostics' }).click();
  await p.waitForTimeout(4000);
  out.afterDiagnostics = await p.evaluate(readPage);
  await shot(p, `${key}-02-diagnostics`);

  await p.getByRole('button', { name: 'Check the probe works' }).click();
  await p.waitForTimeout(1000);
  const dialog = p.getByRole('alertdialog');
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button').last().click();
  }
  await p.waitForTimeout(2000);
  out.afterProbeConfirm = await p.evaluate(readPage);
  await shot(p, `${key}-03-probe-after-confirm`);
  await p.waitForTimeout(30000);
  out.afterProbeCheck = await p.evaluate(readPage);
  // Diagnostics results and the probe's sittings only exist by now, and several sub-headings live
  // in them, so the SC-2 count is the union over this reading and the one at rest.
  out.subHeadingsAfterTools = await p.evaluate(readHeadings);
  await shot(p, `${key}-04-probe-check-after`);
  await ctx.close();

  // Error state: every panel read fails.
  const ectx = await browser.newContext({ viewport: vp });
  const ep = await openStaff(ectx, EMAIL);
  await ep.route(/\/staff\/(health|installation|accounts|csp-reports|activity)/, (r) =>
    r.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }),
    }),
  );
  await ep.goto(`${BASE}/staff`);
  await ep.waitForSelector('h2:has-text("Status")', { timeout: 20000 });
  await ep.waitForTimeout(4000);
  out.statusOrder.error = await ep.evaluate(readStatusOrder);
  out.error = await ep.evaluate(readPage);
  await shot(ep, `${key}-05-error`);
  await ectx.close();

  // Loading state: every panel read held for 8 s.
  const lctx = await browser.newContext({ viewport: vp });
  const lp = await openStaff(lctx, EMAIL);
  await lp.route(/\/staff\/(health|installation|accounts|csp-reports|activity)/, async (r) => {
    await new Promise((x) => setTimeout(x, 8000));
    await r.continue();
  });
  await lp.goto(`${BASE}/staff`);
  await lp.waitForSelector('h2:has-text("Status")', { timeout: 20000 });
  await lp.waitForTimeout(2000);
  out.statusOrder.loading = await lp.evaluate(readStatusOrder);
  out.loading = await lp.evaluate(readPage);
  await shot(lp, `${key}-06-loading`);
  await lctx.close();

  result.widths[key] = out;
}

// D-13: a non-staff member's `/staff` beside an address that does not exist.
const outsider = `outsider-${Date.now()}@example.com`;
await signUp(browser, outsider, 'Outsider');
const nctx = await browser.newContext({ viewport: { width: 1368, height: 912 } });
const np = await signIn(nctx, outsider);
const notFound = {};
for (const path of ['/staff', '/no-such-path']) {
  await np.goto(`${BASE}${path}`);
  await np.waitForTimeout(3000);
  await shot(np, `non-staff${path.replaceAll('/', '-')}`);
  notFound[path] = await np.evaluate(readNotFound);
}
result.nonStaffVsUnknownPath = notFound;
await nctx.close();

await browser.close();
console.log(JSON.stringify(result, null, 2));
