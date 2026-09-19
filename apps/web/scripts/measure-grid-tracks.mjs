/**
 * M0-T2 readings A and C for `docs/TECH_DEBT.md` #344: **what width does a `PageGrid` track
 * actually give its section, and how much of that reaches the table inside it?**
 *
 * **This has never been measured, and its absence is why `falsification.md` quotes no box-model
 * figure.** The committed readings give a wide span of 905px and a narrow span of 519px at 1280 —
 * which is not the ratio `grid-cols-2` implies — so any track width inferred from them would be a
 * guess dressed as a measurement. FC-5 clause 2 and candidate C1's whole cost depend on the real
 * number, so it is read from the browser rather than reconstructed.
 *
 * It sweeps **all three** `PageGrid` consumers, not just Members, because C1 would change a shared
 * archetype: `/orgs/:slug/members`, `/orgs/:slug` (the landing) and `/staff`. ADR-0143 was opened
 * three weeks ago on the staff console's tables being cramped, so "this costs no other screen"
 * cannot be asserted from one screen.
 *
 * Usage (after `pnpm --filter @repo/web shoot` has created a tenant):
 *
 *   SLUG=shoot-co-<stamp>-<width> WIDTH=1646 node scripts/measure-grid-tracks.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { globSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const WIDTH = Number(process.env.WIDTH ?? '1646');
const SLUG = process.env.SLUG;
if (!SLUG) throw new Error('SLUG is required — pass the org slug the shoot harness created');

const PAGES = [
  ['members', (slug) => `/orgs/${slug}/members`],
  ['org-home', (slug) => `/orgs/${slug}`],
  ['staff', () => `/staff`],
];

/* eslint-disable no-undef */
const probe = () => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width) };
  };

  // A `PageGrid` is found by its computed `grid-template-columns` rather than by a class name: a
  // class is a spelling and can be refactored, a used value is what the browser did.
  const grids = [...document.querySelectorAll('div')].filter((el) => {
    const cs = getComputedStyle(el);
    return cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length >= 2;
  });

  return grids.map((grid) => ({
    grid: box(grid),
    // The USED track widths, as the browser resolved them — not the authored template.
    tracks: getComputedStyle(grid)
      .gridTemplateColumns.split(' ')
      .map((t) => Math.round(parseFloat(t))),
    gap: Math.round(parseFloat(getComputedStyle(grid).columnGap) || 0),
    items: [...grid.children].map((item) => {
      const section = item.querySelector('section') ?? item;
      const table = item.querySelector('table');
      const heading = item.querySelector('h2, h3');
      return {
        name: (heading?.textContent ?? '').trim().slice(0, 32) || null,
        item: box(item),
        section: box(section),
        // The inset is what the card's own padding costs the table — the quantity that turns a
        // track width into the width the content actually gets, and the one a reader would
        // otherwise have to assume.
        inset: table ? box(table).x - box(section).x : null,
        table: table ? box(table) : null,
      };
    }),
  }));
};
/* eslint-enable no-undef */

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
if (!executablePath) throw new Error('No Chromium under /opt/pw-browsers');
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const page = await ctx.newPage();

const EMAIL = process.env.EMAIL ?? `${SLUG.replace('shoot-co-', 'shoot-')}@example.com`;
await page.goto(`${BASE}/sign-in`);
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill('correct-horse-battery');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/\/orgs\//, { timeout: 20000 });

const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const out = { run: { sha, width: WIDTH, slug: SLUG, takenAt: new Date().toISOString() } };
for (const [name, path] of PAGES) {
  await page.goto(`${BASE}${path(SLUG)}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  out[name] = await page.evaluate(probe);
}
await browser.close();

console.log(JSON.stringify(out, null, 1));

// **The pinned positive case** (ADR-0093): a probe that selects no grid reports no tracks, which is
// indistinguishable from a product with no grids. Members is known to render one.
const membersGrids = (out.members ?? []).length;
if (membersGrids === 0) {
  console.error(
    '\nPINNED CASE FAILED: no multi-track grid found on /members. Either the selector no longer ' +
      'matches PageGrid, or the page changed shape. Establish which before trusting any number ' +
      'above — a reading of zero grids is not a reading that the grid is gone.',
  );
  process.exitCode = 1;
} else {
  console.error(
    `\nPinned case OK at ${String(WIDTH)}px: ${String(membersGrids)} grid(s) on /members.`,
  );
}
