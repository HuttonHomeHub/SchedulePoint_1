/**
 * M0 of the organisation landing (docs/specs/organisation-landing-portfolio/).
 *
 * Every figure the epic is judged on, taken in a real browser on the real product, BEFORE a line of
 * the design is built — because this repository has been wrong about a width on this kind of screen
 * eight consecutive times, each time from arithmetic rather than a browser.
 *
 * Reports:
 *   FC-1  the document `y` of each of Q1–Q7's ANSWERING SENTENCE at 1646 × 1000 (bar: y < 1000)
 *   FC-4  each section's rendered CONTENT width at 1280 / 1440 / 1646 (bar: after >= this)
 *   FC-5  the number of `…/overview` requests the landing issues (bar: exactly 1)
 *
 * **The non-vacuity control runs FIRST and throws** (`landing-fixture.mjs`), and the harness
 * additionally asserts the `<h1>` is the organisation's name — `measure-staff.mjs` once printed
 * `FC-1: 0 of 5 → FAIL` from the sign-in page, a verdict about a screen it had never reached.
 *
 * **Where it departs from the approved plan, and why.** M0-T3's risk line says the harness should
 * "refuse to run while anything answers on 3000 or 5173". That mitigation is `scripts/e2e-local.sh`'s
 * and belongs to a harness that STARTS its own servers; this one drives the running dev servers, so
 * obeying it would make the harness unable to run at all. The risk it names is real (ADR-0099's
 * three false diagnoses came from a silently-adopted stale server), so it is answered the other way:
 * the harness READS THE BUILD off the shell footer and prints it in the header of every report. A
 * stale server then shows up as a wrong version number in the record rather than as a refusal — and
 * unlike a refusal, it is still true when somebody reads the report a week later.
 *
 * Run with both dev servers up:
 *   PLAYWRIGHT_CHROMIUM_PATH=… node scripts/measure-overview.mjs > /tmp/m0.md
 */
/* global document, window, getComputedStyle */
import { chromium } from '@playwright/test';

import { assertLandingStates, expireInvitation, seedLandingStates } from './landing-fixture.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const WIDTHS = [1646, 1440, 1280];
// 1646 × 1000 is FC-1's stated frame — the product owner's Surface Pro, and the height `shoot.mjs`
// photographs at. The fold is a property of the condition, not of this harness.
const FOLD = 1000;
const tag = String(Date.now());
const out = [];
const p = (s = '') => out.push(s);

/**
 * Q1–Q7 and how each one's ANSWER is located.
 *
 * Sections are found by `role="region"` + accessible name, never by class — `SectionCard` renders a
 * named region (ADR-0143), and a class is the thing a redesign changes. Each question's answer is
 * the first element that actually STATES it, not the section heading: a heading reading "Recently
 * changed" above the fold with every row below it answers nothing, and scoring the heading would
 * report the screen as passing (ADR-0110 D5's shape — a gate satisfied by the wrong node).
 *
 * Q4–Q7 have no locator today by construction. They score `absent`, which is the baseline this
 * epic exists to move, and `find` returning null is how that is reported rather than a zero.
 */
/**
 * How a section is found — and it is NOT `[role="region"]`.
 *
 * `SectionCard` renders `<section aria-labelledby={titleId}>` (`section-card.tsx:65-67`), which IS
 * a region: a `<section>` with an accessible name has the `region` role IMPLICITLY, and there is no
 * `role` attribute in the DOM to match. The approved plan's own risk line said to locate sections
 * "by `role=\"region\"` + accessible name (`SectionCard` renders named regions)" — half right, and
 * the half that is wrong is invisible: `[role="region"]` matched NOTHING, and the first run of this
 * harness printed `FC-1: 0 of 7` and `no named regions found` over a page whose sections were
 * plainly on screen in the same session's screenshot. The `<h1>` guard did not catch it, because the
 * harness HAD reached the right screen; it was asking the wrong question about it.
 *
 * (Playwright's own `getByRole('region')` computes implicit roles and would have found them. This
 * runs inside `page.evaluate`, where a CSS attribute selector does not.)
 */
const REGION_SELECTOR = 'section[aria-labelledby], section[aria-label], [role="region"]';

const QUESTIONS = [
  { id: 'Q1', asks: 'Where was I?', region: 'Jump back in', answer: 'a' },
  {
    id: 'Q2',
    asks: 'What changed while I was away, and who?',
    region: 'Recently changed',
    answer: 'a',
  },
  { id: 'Q3', asks: 'Is anything waiting on me?', region: 'Needs your attention', answer: 'a, p' },
  // The four this epic adds, each located by the data attribute its row carries.
  //
  // **Three of the four regions below were WRONG in the version written at M0, and the error was
  // silent.** That table put all four inside "Recently changed"; M3 then decided that finish,
  // variance and flags belong in a section of their own, and this harness scopes an answer selector
  // INSIDE the named region — so it would have found nothing for Q5–Q7 and reported three failures
  // about a screen that answers all seven. The obvious reading of that verdict is "the layout is
  // wrong", which would have sent M5 to re-order a screen that was already right. Corrected by
  // reading the components rather than by running this, because running it produces a plausible
  // number either way.
  {
    id: 'Q4',
    asks: 'Are these figures current, or stale?',
    region: 'Recently changed',
    answer: '[data-overview-freshness]',
  },
  {
    id: 'Q5',
    asks: 'When does each programme finish?',
    region: 'Where the work stands',
    answer: '[data-overview-finish]',
  },
  {
    id: 'Q6',
    asks: 'Has that moved against what we committed?',
    region: 'Where the work stands',
    answer: '[data-overview-variance]',
  },
  {
    id: 'Q7',
    asks: 'Is anything flagged in the schedule?',
    region: 'Where the work stands',
    answer: '[data-overview-flags]',
  },
];

async function onboard(page) {
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(`m0-overview-${tag}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
  const orgName = `M0 Landing ${tag}`;
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  return { slug: new URL(page.url()).pathname.split('/')[2], orgName };
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: WIDTHS[0], height: FOLD } });
const page = await context.newPage();

// FC-5: every request the page issues, counted before anything else can navigate.
const overviewRequests = [];
page.on('request', (r) => {
  const u = r.url();
  // ADR-0098's own guard: the Vite dev server also serves `/src/features/overview/…`, which once
  // made this count read 19. Only the API route counts.
  if (/\/api\/v\d+\/organizations\/[^/]+\/overview/.test(u)) overviewRequests.push(u);
});

const { slug, orgName } = await onboard(page);
const ids = await seedLandingStates(page, slug);
expireInvitation(ids.expiredInvite);
const control = assertLandingStates(ids);

// Q1 ("Where was I?") is backed by a per-user store of plans actually opened, so on a freshly
// onboarded account it is legitimately empty. Opening one plan is what makes the BASELINE describe
// the shipped screen rather than a state no returning user is ever in — without it Q1 would score
// `absent` and the epic would get credit at M5 for a section that already worked.
await page.goto(`${BASE}/orgs/${slug}/plans/${ids.late}`);
await page.waitForLoadState('networkidle');

overviewRequests.length = 0;
await page.goto(`${BASE}/orgs/${slug}`);
await page.getByRole('heading', { level: 1 }).waitFor();
await page.waitForLoadState('networkidle');

const h1 = (await page.getByRole('heading', { level: 1 }).first().textContent())?.trim() ?? '';
if (h1 !== orgName) {
  throw new Error(
    `The harness never reached the organisation landing: <h1> is ${JSON.stringify(h1)}, expected ${JSON.stringify(orgName)}. Every figure below would have been about another screen.`,
  );
}

const build =
  (
    await page
      .locator('text=/^web \\d+\\.\\d+\\.\\d+ · api \\d+\\.\\d+\\.\\d+$/')
      .first()
      .textContent()
      .catch(() => null)
  )?.trim() ?? 'UNREAD';

p('# M0 — the organisation landing, measured before anything is built');
p();
p(`- **Taken:** ${new Date().toISOString()}`);
p(`- **Build:** \`${build}\` (read off the shell footer, not assumed — see the harness docblock)`);
p(`- **Organisation:** \`${slug}\`, seeded by \`landing-fixture.mjs\``);
p(
  `- **Non-vacuity control:** PASS, ${String(control.checked)} states asserted positively before any measurement`,
);
p();

p('## FC-1 — is each question answered above the fold at 1646 × 1000?');
p();
p('| Q | Question | Answering element | `y` | Above the fold? |');
p('| - | -------- | ----------------- | --: | --------------- |');

await page.setViewportSize({ width: 1646, height: FOLD });
await page.waitForTimeout(300);

let answered = 0;
for (const q of QUESTIONS) {
  const box = await page.evaluate(
    ({ region, answer, sel }) => {
      const regions = [...document.querySelectorAll(sel)];
      const host = regions.find((el) => {
        const labelled = el.getAttribute('aria-labelledby');
        const named =
          el.getAttribute('aria-label') ??
          (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '');
        return named.trim() === region;
      });
      if (!host) return { found: false, why: `no region named "${region}"` };
      const el = host.querySelector(answer);
      if (!el) return { found: false, why: `region present, no ${answer} inside it` };
      const r = el.getBoundingClientRect();
      return {
        found: true,
        y: Math.round(r.top + window.scrollY),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim().slice(0, 48),
      };
    },
    { region: q.region, answer: q.answer, sel: REGION_SELECTOR },
  );
  if (!box.found) {
    p(`| ${q.id} | ${q.asks} | **absent** — ${box.why} | — | **no** |`);
    continue;
  }
  const ok = box.y < FOLD;
  if (ok) answered += 1;
  p(
    `| ${q.id} | ${q.asks} | \`${box.tag}\` — ${JSON.stringify(box.text)} | ${String(box.y)} | ${ok ? '**yes**' : '**no**'} |`,
  );
}
p();
p(
  `**FC-1 baseline: ${String(answered)} of ${String(QUESTIONS.length)} answered above the fold.** Bar for the after run: 7 of 7.`,
);
p();

p("## FC-4 — each section's rendered content width");
p();
p('| Width | Section | Content width |');
p('| ----: | ------- | ------------: |');
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: FOLD });
  await page.waitForTimeout(300);
  const widths = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((el) => {
        const labelled = el.getAttribute('aria-labelledby');
        const name =
          el.getAttribute('aria-label') ??
          (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '');
        const cs = getComputedStyle(el);
        // The CONTENT width, not the border box: padding is chrome, and a section that keeps its box
        // and loses its padding has been narrowed in the only sense a reader notices.
        const inner =
          el.getBoundingClientRect().width -
          parseFloat(cs.paddingLeft) -
          parseFloat(cs.paddingRight) -
          parseFloat(cs.borderLeftWidth) -
          parseFloat(cs.borderRightWidth);
        return { name: name.trim(), width: Math.round(inner) };
      }),
    REGION_SELECTOR,
  );
  if (widths.length === 0) p(`| ${String(w)} | **no named regions found** | — |`);
  for (const s of widths) p(`| ${String(w)} | ${s.name} | ${String(s.width)} |`);
}
p();
p(`## FC-5 — requests to \`…/overview\` on one landing load`);
p();
p(`Counted **${String(overviewRequests.length)}** (bar: exactly 1).`);
p();
p('## What the fixture holds');
p();
p('| Plan | id |');
p('| ---- | -- |');
for (const [k, v] of Object.entries(ids)) {
  if (Array.isArray(v)) continue;
  p(`| ${k} | \`${String(v)}\` |`);
}

console.log(out.join('\n'));
await browser.close();
