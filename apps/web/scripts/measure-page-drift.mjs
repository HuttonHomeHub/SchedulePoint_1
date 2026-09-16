/**
 * M0 for the per-page scope: measure the DRIFT between the non-canvas screens, rendered.
 *
 * The source tells you which component a screen reaches for. It does not tell you that one
 * heading sits 10px higher than its neighbour's, that a row's first and last fact are 1,090px
 * apart, or that a page is 2% full. Those are the things a planner sees, and this repository's
 * record (ADR-0099, ADR-0143) is that the screens were argued from source and band heights for
 * months and settled the first time somebody rendered them.
 *
 * Reuses the shoot harness's own sign-up + seed so it measures the SAME fixture the pictures show;
 * a second fixture drifts and the drift is invisible (ADR-0065, ADR-0121).
 */
import { chromium } from '@playwright/test';
import { globSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const WIDTH = Number(process.env.WIDTH ?? '1646');
const SLUG = process.env.SLUG;
if (!SLUG) throw new Error('SLUG is required — pass the org slug the shoot harness created');

const PAGES = [
  ['clients', `/orgs/${SLUG}/clients`],
  ['calendars', `/orgs/${SLUG}/calendars`],
  ['resources', `/orgs/${SLUG}/resources`],
  ['members', `/orgs/${SLUG}/members`],
  ['audit-log', `/orgs/${SLUG}/audit-log`],
  ['recently-deleted', `/orgs/${SLUG}/recently-deleted`],
  ['my-activity', `/me/activity`],
  ['account', `/account`],
];

const probe = () => {
  const main = document.querySelector('main');
  const r = (el) => (el ? el.getBoundingClientRect() : null);
  const h1 = document.querySelector('h1');
  const h1r = r(h1);

  // The page frame: whichever element carries the measure cap.
  const frame = [...document.querySelectorAll('main div')].find((d) => {
    const cs = getComputedStyle(d);
    return (
      cs.maxWidth !== 'none' &&
      parseFloat(cs.maxWidth) > 400 &&
      d.getBoundingClientRect().width > 400
    );
  });

  // A page-level description: the first paragraph that is a sibling-ish of the h1, before any table.
  const firstTable = document.querySelector('table');
  const paras = [...document.querySelectorAll('main p')].filter((p) => {
    if (!p.textContent.trim()) return false;
    if (firstTable && p.compareDocumentPosition(firstTable) & Node.DOCUMENT_POSITION_PRECEDING)
      return false;
    return true;
  });

  const tables = [...document.querySelectorAll('table')].map((t) => {
    const heads = [...t.querySelectorAll('thead th')].map((th) => ({
      text: th.textContent.trim().slice(0, 24),
      x: Math.round(th.getBoundingClientRect().left),
      w: Math.round(th.getBoundingClientRect().width),
    }));
    const rows = [...t.querySelectorAll('tbody tr')];
    const first = rows[0];
    const cells = first
      ? [...first.querySelectorAll('td')].map((td) => Math.round(td.getBoundingClientRect().left))
      : [];
    const heights = rows.slice(0, 6).map((tr) => Math.round(tr.getBoundingClientRect().height));
    // What a row offers as actions, by accessible role.
    const actions = first
      ? [...first.querySelectorAll('button,a')].map((el) =>
          (el.textContent.trim() || el.getAttribute('aria-label') || '?').slice(0, 18),
        )
      : [];
    return {
      rows: rows.length,
      headers: heads,
      rowHeights: heights,
      firstCellX: cells[0] ?? null,
      lastCellX: cells.length ? cells[cells.length - 1] : null,
      actions,
    };
  });

  // Sections built from the archetype render a <section> with an accessible name (ADR-0098).
  const sections = [...document.querySelectorAll('main section')].map((s) => ({
    name: (s.getAttribute('aria-label') || s.querySelector('h2,h3')?.textContent || '')
      .trim()
      .slice(0, 30),
    boxed: getComputedStyle(s).backgroundColor,
  }));

  return {
    mainScrolls: main ? main.scrollHeight > main.clientHeight + 1 : null,
    mainScrollHeight: main ? main.scrollHeight : null,
    mainClientHeight: main ? main.clientHeight : null,
    docScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    h1: h1
      ? {
          text: h1.textContent.trim().slice(0, 30),
          top: Math.round(h1r.top),
          size: getComputedStyle(h1).fontSize,
          weight: getComputedStyle(h1).fontWeight,
        }
      : null,
    frameMaxWidth: frame ? getComputedStyle(frame).maxWidth : null,
    frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null,
    descriptions: paras
      .slice(0, 4)
      .map((p) => ({
        chars: p.textContent.trim().length,
        width: Math.round(p.getBoundingClientRect().width),
        top: Math.round(p.getBoundingClientRect().top),
      })),
    sectionCount: sections.length,
    sections,
    tables,
  };
};

// The same discovery the shoot harness does — this container ships Chromium under
// /opt/pw-browsers and has no headless-shell build, so a bare launch() throws.
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
if (!executablePath) throw new Error('No Chromium under /opt/pw-browsers');
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const page = await ctx.newPage();

// Sign in as the account the shoot harness created, so this measures the SAME fixture the
// pictures show. Deriving the address from the slug rather than passing it twice: two values
// that have to agree and are written down twice is how they stop agreeing.
const EMAIL = process.env.EMAIL ?? `${SLUG.replace('shoot-co-', 'shoot-')}@example.com`;
await page.goto(`${BASE}/sign-in`);
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill('correct-horse-battery');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/\/orgs\//, { timeout: 20000 });
const out = {};
for (const [name, path] of PAGES) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  out[name] = await page.evaluate(probe);
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
