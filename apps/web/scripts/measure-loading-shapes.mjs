#!/usr/bin/env node
/**
 * M0 of the loading-skeletons epic (`docs/specs/loading-skeletons/`, TECH_DEBT #234 + #341): the
 * baseline SC-2, SC-3 and SC-4 are graded against, taken before any of it is built (ADR-0142: a
 * remedy is measured before it is built).
 *
 * For each site it HOLDS the read the surface waits on (a `page.route` the script releases — the
 * `e2e-splitting/splitting.spec.ts` technique, no timers), records the pending picture, releases,
 * records the settled picture, and compares:
 *
 *  - SC-2: anchor positions (headings, field labels, column headings) pending vs settled, at
 *    1646 x 1000 and 1024 x 600 — graded with `measure-loading-shapes.judge.mjs`.
 *  - SC-3: every column's width pending vs settled on the eight resource tables, with the column's
 *    declared `data-col-width` mode (only `fit` is graded; `auto`/`bounded` are reported).
 *  - SC-4: the live regions that held text while pending, and whether any sits inside an
 *    `aria-busy` subtree. Plus whether a reduced-motion context has any running animation.
 *
 * ## It does not hide what it cannot reach
 *
 * Sites needing an interaction, a staff account, a particular seed or a share/invitation token are
 * listed under `notReached` with the reason, rather than skipped silently. The reachable set is:
 * the eight SC-3 tables, client detail, project detail and plan detail. Extend `SITES` as the
 * remaining panels (earned value, notes, history, members, exceptions, schedule summary, the staff
 * console, guest and invitation) gain a skeleton — M0 records what is reachable today.
 *
 * ## It has NEVER been run
 *
 * It was written in a container with no database and no browser session (it needs both). Run the
 * judge's fixtures first — `node scripts/measure-loading-shapes.judge.test.mjs` — then follow the
 * prerequisites below, and read the output before trusting it. Each selector is grep-verified
 * against `data-table.tsx` and the route files at the commit this was written, nothing more.
 *
 * ## Prerequisites (run by the operator; this file starts none of them)
 *
 *   1. A Postgres, and the API on :3000 with `CORS_ORIGINS=http://localhost:5173`
 *      (`scripts/e2e-local.sh --db-only`, then `pnpm --filter @repo/api exec nest start`).
 *   2. The web dev server on :5173 (`pnpm --filter @repo/web dev`).
 *   3. A seeded tenant: `pnpm --filter @repo/web shoot --width 1646 --only clients` creates one and
 *      prints its slug (`shoot-co-<stamp>-<width>`); its owner is `shoot-<stamp>-<width>@example.com`
 *      with password `correct-horse-battery`. The tenant must own at least one client holding a
 *      project holding a plan.
 *
 * ## Run
 *
 *   cd apps/web
 *   SLUG=shoot-co-<stamp>-1646 node scripts/measure-loading-shapes.mjs > loading-baseline.json
 *
 * Optional: `EMAIL=…` (default derived from SLUG), `E2E_BASE_URL=…`, `WIDTHS=1646x1000,1024x600`,
 * `ONLY=calendars,client-detail` (restrict the sweep — a restricted run is evidence about those
 * sites only), `PLAYWRIGHT_CHROMIUM_PATH=…`. Exit code 1 means the control or a verdict failed; the
 * JSON on stdout is the record either way. The figures belong in
 * `docs/specs/loading-skeletons/m0-measurement.md`.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { globSync } from 'node:fs';

import {
  assertExamined,
  judgeAnchors,
  judgeColumns,
  judgeSentences,
  NothingSettledError,
} from './measure-loading-shapes.judge.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const SLUG = process.env.SLUG;
if (!SLUG) throw new Error('SLUG is required — pass the org slug the shoot harness created');
const EMAIL = process.env.EMAIL ?? `${SLUG.replace('shoot-co-', 'shoot-')}@example.com`;
const PASSWORD = 'correct-horse-battery';
const WIDTHS = (process.env.WIDTHS ?? '1646x1000,1024x600')
  .split(',')
  .map((w) => w.split('x').map(Number))
  .map(([width, height]) => ({ width, height }));
const ONLY = (process.env.ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * The reads each site waits on, as `{ name, path, hold, expectedSentences }`. `hold` matches the
 * request URL that is held; for the detail routes it is the single-entity read only, so the
 * list read beneath it is NOT held and the current waterfall (CQ-2) is visible in the record.
 * `expectedSentences` is the SC-4 target AFTER the epic (1, or 0 where an enclosing region speaks);
 * the baseline will mostly fail it, and that is the baseline.
 */
const SITES = [
  {
    name: 'clients',
    path: () => `/orgs/${SLUG}/clients`,
    hold: /\/organizations\/[^/]+\/clients(\?|$)/,
    table: true,
  },
  {
    name: 'calendars',
    path: () => `/orgs/${SLUG}/calendars`,
    hold: /\/organizations\/[^/]+\/calendars(\?|$)/,
    table: true,
  },
  {
    name: 'resources',
    path: () => `/orgs/${SLUG}/resources`,
    hold: /\/organizations\/[^/]+\/resources(\?|$)/,
    table: true,
  },
  {
    name: 'members',
    path: () => `/orgs/${SLUG}/members`,
    hold: /\/organizations\/[^/]+\/members(\?|$)/,
    table: true,
  },
  {
    name: 'audit-log',
    path: () => `/orgs/${SLUG}/audit-log`,
    hold: /\/organizations\/[^/]+\/audit-events/,
    table: true,
  },
  {
    name: 'recently-deleted',
    path: () => `/orgs/${SLUG}/recently-deleted`,
    hold: /\/organizations\/[^/]+\/deleted/,
    table: true,
  },
  {
    name: 'client-detail',
    subjectHeading: true,
    path: (ids) => `/orgs/${SLUG}/clients/${ids.clientId}`,
    hold: (ids) => new RegExp(`/organizations/[^/]+/clients/${ids.clientId}$`),
    table: true,
  },
  {
    name: 'project-detail',
    subjectHeading: true,
    path: (ids) => `/orgs/${SLUG}/projects/${ids.projectId}`,
    hold: (ids) => new RegExp(`/organizations/[^/]+/projects/${ids.projectId}$`),
    table: true,
  },
  {
    name: 'plan-detail',
    subjectHeading: true,
    path: (ids) => `/orgs/${SLUG}/plans/${ids.planId}`,
    hold: (ids) => new RegExp(`/organizations/[^/]+/plans/${ids.planId}$`),
    table: false,
  },
];
// The Projects table (client-detail) and the Plans table (project-detail) are SC-3 tables too: they
// are measured as the table inside those two pages, with only the detail read held, so they settle
// at once in the baseline and their pending width is a lower bound. The dedicated list holds below
// are what grade them.
const LIST_HOLDS = [
  {
    name: 'projects-table',
    path: (ids) => `/orgs/${SLUG}/clients/${ids.clientId}`,
    hold: /\/organizations\/[^/]+\/clients\/[^/]+\/projects(\?|$)/,
    table: true,
  },
  {
    name: 'plans-table',
    path: (ids) => `/orgs/${SLUG}/projects/${ids.projectId}`,
    hold: /\/organizations\/[^/]+\/projects\/[^/]+\/plans(\?|$)/,
    table: true,
  },
];

/** Surfaces this instrument cannot reach today, with the reason — recorded, never skipped silently. */
const NOT_REACHED = {
  'staff accounts / installation / mail / retention / alerting / security panels':
    'need a verified STAFF_EMAILS account and the staff API config (measure-staff-console.mjs boots both)',
  'earned value dialog': 'needs a plan with cost data and a command click inside the workspace',
  'schedule summary strip': 'needs the workspace toolbar popover opened',
  'notes / activity history / WBS members / calendar exceptions':
    'need an activity or calendar selected first',
  'guest plan view': 'needs a live share token (and a dead one for the oracle comparison)',
  'accept invitation': 'needs an invitation token',
};

/* eslint-disable no-undef */
/** Installed before any page script: records every live-region text change and when it happened. */
const installLiveObserver = () => {
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const id = e.getAttribute('data-testid');
      parts.unshift(
        e.tagName.toLowerCase() +
          (id ? `[data-testid=${id}]` : '') +
          (e.hasAttribute('data-loading-shape') ? '[data-loading-shape]' : ''),
      );
    }
    return parts.slice(-6).join(' > ');
  };
  const seen = new Map();
  window.__loadingLive = seen;
  new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target instanceof Element ? r.target : r.target.parentElement;
      const region = node?.closest('[aria-live], [role="status"], [role="alert"]');
      if (!region) continue;
      const text = (region.textContent ?? '').trim();
      if (text === '') continue;
      seen.set(region, {
        kind: region.getAttribute('aria-live')
          ? `aria-live=${region.getAttribute('aria-live')}`
          : `role=${region.getAttribute('role')}`,
        text: text.slice(0, 80),
        insideBusy: region.closest('[aria-busy="true"]') !== null,
        path: pathOf(region),
      });
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

/** Anchors: the elements whose position a reader tracks. A key is tag + text, so a pair can match. */
const readSnapshot = () => {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const textOf = (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const anchors = [];
  const seenKey = new Set();
  const tables = [...document.querySelectorAll('main table')];
  // The last table that PRECEDES the element in document order, or -1: what the judge needs to tell
  // growth below a placeholder (rows arriving) from a shift above it.
  const lastTableBefore = (e) => {
    let found = -1;
    tables.forEach((t, i) => {
      const follows = (t.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      if (follows && !t.contains(e)) found = i;
    });
    return found;
  };
  for (const e of document.querySelectorAll('main h1, main h2, main h3, main th, main dt')) {
    if (!visible(e)) continue;
    const text = textOf(e);
    if (text === '') continue;
    const key = `${e.tagName.toLowerCase()} ${text}`;
    if (seenKey.has(key)) continue; // a repeated heading text cannot be paired by key
    seenKey.add(key);
    const r = e.getBoundingClientRect();
    const anchor = {
      key,
      top: Math.round(r.top + window.scrollY),
      left: Math.round(r.left + window.scrollX),
      width: Math.round(r.width),
      afterTable: lastTableBefore(e),
    };
    if (e.tagName === 'TH') {
      // A column heading's own x is a function of its column's declared width mode and of the
      // columns to its left, so the judge needs both (spec SC-2, amended 2026-10-18).
      anchor.mode = e.getAttribute('data-col-width') ?? 'undeclared';
      anchor.table = tables.indexOf(e.closest('table'));
      anchor.col = e.cellIndex;
    }
    anchors.push(anchor);
  }
  const firstRow = document.querySelector('main tbody tr');
  if (firstRow && visible(firstRow)) {
    anchors.push({
      key: 'first body row',
      top: Math.round(firstRow.getBoundingClientRect().top + window.scrollY),
      left: 0,
      width: 0,
    });
  }
  return {
    anchors,
    // Per table: how many body rows and how tall the body is, so the judge can show that a shift
    // below a table is the rows arriving and nothing else.
    tables: tables.map((t) => {
      const body = t.querySelector('tbody');
      return {
        rows: body ? body.querySelectorAll(':scope > tr').length : 0,
        bodyHeight: body ? Math.round(body.getBoundingClientRect().height) : 0,
      };
    }),
    // The skeleton material and the loading-shape hook M1 adds; counted so the control can tell a
    // skeleton picture from a settled one.
    skeletons: document.querySelectorAll('.animate-pulse, [data-skeleton], [data-loading-shape]')
      .length,
    spinners: [...document.querySelectorAll('[role="status"]')].filter((e) =>
      e.querySelector('svg.animate-spin'),
    ).length,
    // Settled cells: a body cell with text that is not inside a skeleton or aria-hidden subtree.
    settledCells: [...document.querySelectorAll('main tbody td')].filter(
      (td) =>
        (td.textContent ?? '').trim() !== '' &&
        !td.closest('[aria-hidden="true"], [data-loading-shape]'),
    ).length,
    tableHeadingsExposed: document.querySelectorAll('main [role="columnheader"], main th').length,
  };
};

/** Per-column widths of the first table, read from th (index-matched; the contract keeps the count). */
const readColumns = () => {
  const table = document.querySelector('main table');
  if (!table) return null;
  return [...table.querySelectorAll('thead th')].map((th) => ({
    header: (th.textContent ?? '').replace(/\s+/g, ' ').trim(),
    mode: th.getAttribute('data-col-width') ?? 'undeclared',
    width: Math.round(th.getBoundingClientRect().width),
  }));
};

const readLive = () =>
  [...window.__loadingLive.entries()].map(([region, entry]) => ({
    ...entry,
    // A region unmounted before the reading cannot be speaking now; one that is still mounted is.
    connected: region.isConnected,
  }));

const readAnimations = () => {
  const running = document
    .getAnimations()
    .filter(
      (a) =>
        a.playState === 'running' && a.effect?.target?.closest?.('.animate-pulse, .animate-spin'),
    );
  return running.length;
};
/* eslint-enable no-undef */

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/** Signs in once per context; returns the page. */
async function signedIn(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/orgs\//, { timeout: 20000 });
  return page;
}

/** Finds a client, project and plan to measure by following the first link at each level. */
async function discoverIds(page) {
  await page.goto(`${BASE}/orgs/${SLUG}/clients`);
  await page.waitForLoadState('networkidle');
  const clientHref = await page
    .locator(`a[href*="/orgs/${SLUG}/clients/"]`)
    .first()
    .getAttribute('href');
  if (!clientHref) throw new Error('No client to follow — seed the fixture first');
  await page.goto(`${BASE}${clientHref}`);
  await page.waitForLoadState('networkidle');
  const projectHref = await page
    .locator(`a[href*="/orgs/${SLUG}/projects/"]`)
    .first()
    .getAttribute('href');
  if (!projectHref) throw new Error('The client has no project to follow');
  await page.goto(`${BASE}${projectHref}`);
  await page.waitForLoadState('networkidle');
  const planHref = await page
    .locator(`a[href*="/orgs/${SLUG}/plans/"]`)
    .first()
    .getAttribute('href');
  if (!planHref) throw new Error('The project has no plan to follow');
  return {
    clientId: clientHref.split('/').pop(),
    projectId: projectHref.split('/').pop(),
    planId: planHref.split('/').pop(),
  };
}

/** Holds `pattern`, runs `measure` while held, releases, and returns `{ pending, settled }`. */
async function heldPair(page, url, pattern, kind) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let seen;
  const heldSeen = new Promise((resolve) => {
    seen = resolve;
  });
  await page.route(
    (u) => pattern.test(new URL(u).pathname.replace(/^\/api\/v1/, '') + new URL(u).search),
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      seen(true);
      await gate;
      return route.continue();
    },
  );
  await page.goto(url);
  // The hold is only credible once the request has actually been intercepted; a site whose read
  // was served from the client cache never reaches here, and the timeout says so.
  await Promise.race([
    heldSeen,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('the read was never requested')), 15000),
    ),
  ]);
  await page.waitForTimeout(400);
  const pending = {
    snapshot: await page.evaluate(readSnapshot),
    columns: kind === 'table' ? await page.evaluate(readColumns) : null,
    live: await page.evaluate(readLive),
    runningAnimations: await page.evaluate(readAnimations),
  };
  release();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  const settled = {
    snapshot: await page.evaluate(readSnapshot),
    columns: kind === 'table' ? await page.evaluate(readColumns) : null,
  };
  await page.unroute(() => true).catch(() => undefined);
  return { pending, settled };
}

const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const out = {
  run: { sha, slug: SLUG, takenAt: new Date().toISOString() },
  notReached: NOT_REACHED,
  widths: {},
};
let failed = false;

for (const vp of WIDTHS) {
  const key = `${vp.width}x${vp.height}`;
  const perSite = {};
  const ctx = await browser.newContext({ viewport: vp });
  const idsPage = await signedIn(ctx);
  const ids = await discoverIds(idsPage);
  await idsPage.close();
  out.run.ids = ids;

  // A second context under reduced motion answers SC-5 for the same held pending picture.
  const rmCtx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
  await signedIn(rmCtx).then((p) => p.close());

  const sweep = [...SITES, ...LIST_HOLDS].filter((s) => ONLY.length === 0 || ONLY.includes(s.name));
  for (const site of sweep) {
    const pattern = typeof site.hold === 'function' ? site.hold(ids) : site.hold;
    const url = `${BASE}${site.path(ids)}`;
    const record = {};
    try {
      const page = await ctx.newPage();
      await page.addInitScript(installLiveObserver);
      const { pending, settled } = await heldPair(
        page,
        url,
        pattern,
        site.table ? 'table' : 'none',
      );
      await page.close();

      record.pendingShape =
        pending.snapshot.skeletons > 0
          ? 'skeleton'
          : pending.snapshot.spinners > 0
            ? 'spinner'
            : 'blank';
      assertExamined(site.name, pending.snapshot, settled.snapshot);
      record.sc2 = judgeAnchors(pending.snapshot, settled.snapshot, {
        // The subject's name is data a skeleton cannot hold (spec SC-2, amended 2026-10-18).
        subjectHeading: site.subjectHeading === true,
        columns:
          pending.columns && settled.columns
            ? { pending: pending.columns, settled: settled.columns }
            : undefined,
      });
      record.sc4 = judgeSentences(pending.live, 1);
      record.tableHeadingsExposedWhilePending = pending.snapshot.tableHeadingsExposed;
      if (pending.columns && settled.columns) {
        record.sc3 = judgeColumns(
          settled.columns.map((s, i) => ({
            header: s.header,
            mode: s.mode,
            pending: pending.columns[i]?.width ?? 0,
            settled: s.width,
          })),
        );
      }

      const rmPage = await rmCtx.newPage();
      await rmPage.addInitScript(installLiveObserver);
      const rm = await heldPair(rmPage, url, pattern, 'none');
      await rmPage.close();
      // SC-5: after the 100 ms the spec allows, nothing may still be animating under reduce.
      record.sc5 = {
        runningAnimationsWhilePending: rm.pending.runningAnimations,
        verdict: rm.pending.runningAnimations === 0 ? 'PASS' : 'FAIL',
      };
    } catch (err) {
      record.error = err instanceof Error ? err.message : String(err);
      // The control: an instrument that read a skeleton as content, or never held a read, is a
      // failed run, not a quiet zero.
      failed = true;
      if (!(err instanceof NothingSettledError)) record.errorKind = 'harness';
    }
    perSite[site.name] = record;
  }
  await ctx.close();
  await rmCtx.close();
  out.widths[key] = perSite;
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
if (failed) {
  console.error(
    '\nCONTROL FAILED: at least one site could not be examined (see `error` in the JSON). A site that ' +
      'cannot be examined has no verdict — establish whether the instrument or the product changed ' +
      'before using any figure above.',
  );
  process.exitCode = 1;
}
