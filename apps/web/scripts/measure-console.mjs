// M0 of the plan-workspace console (docs/specs/workspace-console/implementation-plan.md).
//
// Every figure the epic is judged on, taken in a real browser on the real product, BEFORE a line
// of the design is built — because eight consecutive epics on this surface were wrong about a
// width they had not measured. Each task below prints a CONTROL beside its result: a reading with
// a known answer, so a harness that measures the wrong node reports its own failure rather than a
// plausible number (ADR-0118 M0 caught four instruments lying in one epic).
//
// **Where it bypasses the product** (ADR-0081): the fixture is seeded through the public REST API
// from inside the page, the pen is taken by API, and study C's composition is an injected
// stylesheet — a picture of the geometry, not the shipped code. The "fabricated" readings in T4
// and T6 clone real DOM rather than restyle a pseudo-element, and say so in their rows.
//
// Run with both dev servers up:
//   E2E_BASE_URL=http://localhost:5173 node scripts/measure-console.mjs > /tmp/m0.md
// Optional: PLAYWRIGHT_CHROMIUM_PATH, STUDY_CSS (path to C-console.css; default: the scratchpad).
/* global window, document, getComputedStyle */
import { readFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const STUDY_CSS =
  process.env.STUDY_CSS ??
  '/tmp/claude-0/-home-user-SchedulePoint-1/a53d725d-c69a-576c-a600-3969c6c63d76/scratchpad/toolbar-design/css/C-console.css';
const WIDTHS = [1920, 1646, 1440, 1280];
// A long name by default (74 chars). `PLAN_NAME` overrides it, because the 180 px control was
// established on the render study's 32-char name and a control has to be reproducible.
const PLAN_NAME =
  process.env.PLAN_NAME ??
  'Riverside Quarter — Phase 2 Substructure & Superstructure Programme (Rev C)';
const DECK = '[role="toolbar"][aria-label="Plan commands"]';
const stamp = Date.now();
const password = 'correct-horse-battery';
const out = [];
const p = (s = '') => out.push(s);
const ctl = (name, ok, detail) => p(`- CONTROL — ${name}: **${ok ? 'PASS' : 'FAIL'}** (${detail})`);

async function onboard(page, tag) {
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(`m0-${tag}@example.com`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
  await page.getByLabel('Organisation name').fill(`M0 Console ${tag}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  return new URL(page.url()).pathname.split('/')[2];
}

// The chrome-workspace fixture's shape, with a LONG plan name — a 37 px placeholder once hid a
// real overflow (ADR-0091 M7), and the study's row figures were read off a short one.
async function seed(page, org, { recalc }) {
  return page.evaluate(
    async ({ org, recalc, tag, planName }) => {
      const post = async (path, body) => {
        const r = await fetch(`/api/v1/organizations/${org}${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
        return (await r.json()).data;
      };
      const client = await post('/clients', { name: `Northgate Developments ${tag}` });
      const project = await post(`/clients/${client.id}/projects`, { name: 'Riverside Quarter' });
      const plan = await post(`/projects/${project.id}/plans`, {
        name: planName,
        plannedStart: '2026-01-05',
      });
      await post(`/plans/${plan.id}/edit-lock`, {});
      const made = [];
      for (const [code, name, durationDays, laneIndex] of [
        ['A1000', 'Site setup & hoarding', 5, 0],
        ['A1010', 'Excavate to formation', 8, 0],
        ['A1020', 'Blind & reinforce', 6, 0],
        ['A1030', 'Pour ground slab', 4, 0],
        ['A1040', 'Cure & strike', 7, 0],
        ['A1050', 'Erect frame — core', 12, 0],
        ['A1100', 'Divert services', 4, 1],
        ['A1110', 'Temporary hoarding', 3, 2],
      ]) {
        made.push(
          await post(`/plans/${plan.id}/activities`, { name, code, durationDays, laneIndex }),
        );
      }
      for (let i = 1; i < 6; i += 1) {
        await post(`/plans/${plan.id}/dependencies`, {
          predecessorId: made[i - 1].id,
          successorId: made[i].id,
        });
      }
      await post(`/plans/${plan.id}/dependencies`, {
        predecessorId: made[0].id,
        successorId: made[6].id,
      });
      await post(`/plans/${plan.id}/dependencies`, {
        predecessorId: made[6].id,
        successorId: made[7].id,
      });
      await post(`/plans/${plan.id}/dependencies`, {
        predecessorId: made[7].id,
        successorId: made[5].id,
      });
      if (recalc) await post(`/plans/${plan.id}/schedule/recalculate`, {});
      return { planId: plan.id };
    },
    { org, recalc, tag: recalc ? 'A' : 'B', planName: PLAN_NAME },
  );
}

async function open(page, org, planId, query = '') {
  await page.goto(`${BASE}/orgs/${org}/plans/${planId}${query}`);
  await page.getByRole('toolbar', { name: 'Plan commands' }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

const setStudy = (page, css) =>
  page.evaluate((c) => {
    let s = document.getElementById('m0-study');
    if (!s) {
      s = document.createElement('style');
      s.id = 'm0-study';
      document.head.appendChild(s);
    }
    s.textContent = c;
  }, css);

async function setWidth(page, width, height = 1000) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(350);
}

/** Every band part by selector, with its rect — never by arithmetic. */
const geometry = (page) =>
  page.evaluate((deckSel) => {
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        top: +b.top.toFixed(1),
        h: +b.height.toFixed(1),
        w: +b.width.toFixed(1),
        bottom: +b.bottom.toFixed(1),
      };
    };
    const q = (s) => document.querySelector(s);
    const band = q('[data-surface="chrome"]:not([data-activities-bar])');
    const rows = q('[data-chrome-slot="rows"]');
    const rowsChild = rows?.firstElementChild;
    const padWrap = rowsChild?.firstElementChild;
    const deck = q(deckSel);
    const foot = q('[data-activities-bar]');
    const lines = (row) => {
      if (!row) return null;
      const kids = [...row.children];
      const tallest = Math.max(0, ...kids.map((c) => c.getBoundingClientRect().height));
      return tallest ? +(row.getBoundingClientRect().height / tallest).toFixed(2) : 0;
    };
    const bandCs = band ? getComputedStyle(band) : null;
    return {
      band: rect(band),
      bandBorderBottom: bandCs?.borderBottomWidth,
      header: rect(q('header')),
      headerRowLines: lines(q('header')?.firstElementChild),
      rows: rect(rows),
      rowsChild: rect(rowsChild),
      rowsChildBorderBottom: rowsChild ? getComputedStyle(rowsChild).borderBottomWidth : null,
      padWrap: rect(padWrap),
      padWrapPad: padWrap
        ? `${getComputedStyle(padWrap).paddingTop}/${getComputedStyle(padWrap).paddingBottom}`
        : null,
      deck: rect(deck),
      deckLines: lines(deck),
      deckItems: deck ? deck.querySelectorAll('[data-toolbar-item]').length : 0,
      foot: rect(foot),
      footPad: foot
        ? `${getComputedStyle(foot).paddingTop}/${getComputedStyle(foot).paddingBottom}`
        : null,
      footTallestChild: foot
        ? +Math.max(0, ...[...foot.children].map((c) => c.getBoundingClientRect().height)).toFixed(
            1,
          )
        : null,
    };
  }, DECK);

/** Per-group and per-section widths of the deck, plus the gaps between groups. */
const rowWidths = (page) =>
  page.evaluate((deckSel) => {
    const deck = document.querySelector(deckSel);
    const groups = [...deck.querySelectorAll(':scope > [role="group"]')];
    const g = groups.map((el) => {
      const b = el.getBoundingClientRect();
      const label = el.getAttribute('aria-label');
      const sections = [...el.children].map((c) => ({
        tag: c.tagName.toLowerCase(),
        w: +c.getBoundingClientRect().width.toFixed(1),
        text: (c.textContent || '').trim().slice(0, 24),
      }));
      const items = [...el.querySelectorAll('[data-toolbar-item]')].map((i) =>
        i.getAttribute('data-toolbar-item'),
      );
      const kidsW = sections.reduce((s, c) => s + c.w, 0);
      const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap) || 0;
      return {
        label,
        top: +b.top.toFixed(1),
        w: +b.width.toFixed(1),
        left: +b.left.toFixed(1),
        right: +b.right.toFixed(1),
        kidsPlusGaps: +(
          kidsW +
          gap * (sections.length - 1) +
          parseFloat(getComputedStyle(el).paddingLeft) +
          parseFloat(getComputedStyle(el).paddingRight) +
          parseFloat(getComputedStyle(el).borderLeftWidth) +
          parseFloat(getComputedStyle(el).borderRightWidth)
        ).toFixed(1),
        items,
        sections,
      };
    });
    const cs = getComputedStyle(deck);
    return {
      container: deck.clientWidth,
      scrollWidth: deck.scrollWidth,
      gap: cs.columnGap || cs.gap,
      groups: g,
    };
  }, DECK);

function lineAssign(groups) {
  const tops = [...new Set(groups.map((g) => g.top))].sort((a, b) => a - b);
  return groups.map((g) => ({
    label: g.label,
    line: tops.indexOf(g.top) + 1,
    w: g.w,
    items: g.items.length,
  }));
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 1646, height: 1000 } });
const page = await context.newPage();
const org = await onboard(page, stamp);
const { planId } = await seed(page, org, { recalc: true });
await open(page, org, planId);
const studyCss = readFileSync(STUDY_CSS, 'utf8');
const FOOT_PY1 =
  '\n[data-activities-bar]{padding-top:.25rem!important;padding-bottom:.25rem!important}\n';

p(`# M0 measurement — the plan-workspace console`);
p();
p(
  `Taken ${new Date().toISOString()} against ${BASE}, Chromium via Playwright, fixture: 8 activities on 3 lanes, computed schedule, pen held, plan name ${PLAN_NAME.length} chars: “${PLAN_NAME}”.`,
);
p();

// ── T1 ────────────────────────────────────────────────────────────────────────────────────────
p(`## §1 · M0-T1 — band and foot heights, today and under C`);
p();
p(
  `| width | variant | band | header | header lines | rows child (border-b) | pad wrap (pt/pb) | deck | deck lines | rule | foot (pt/pb) | foot tallest child |`,
);
p(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
const t1 = {};
for (const variant of [
  ['today', ''],
  ['C', studyCss],
  ['C + foot py-1', studyCss + FOOT_PY1],
]) {
  await setStudy(page, variant[1]);
  for (const w of WIDTHS) {
    await setWidth(page, w);
    const g = await geometry(page);
    t1[`${variant[0]}@${w}`] = g;
    p(
      `| ${w} | ${variant[0]} | ${g.band?.h} | ${g.header?.h} | ${g.headerRowLines} | ${g.rowsChild?.h} (${g.rowsChildBorderBottom}) | ${g.padWrap?.h} (${g.padWrapPad}) | ${g.deck?.h} | ${g.deckLines} | ${g.bandBorderBottom} | ${g.foot?.h} (${g.footPad}) | ${g.footTallestChild} |`,
    );
  }
}
p();
ctl(
  'band is 180 px today at 1646 and 1920',
  t1['today@1646'].band.h === 180 && t1['today@1920'].band.h === 180,
  `${t1['today@1646'].band.h} / ${t1['today@1920'].band.h}`,
);
ctl('foot is 55 px today at 1646', t1['today@1646'].foot.h === 55, `${t1['today@1646'].foot.h}`);
p(
  `- Decomposition today @1646: header ${t1['today@1646'].header.h} + rows child ${t1['today@1646'].rowsChild.h} (its border-b ${t1['today@1646'].rowsChildBorderBottom}) + rule ${t1['today@1646'].bandBorderBottom} → band ${t1['today@1646'].band.h}.`,
);
p(
  `- Under C @1646: band ${t1['C@1646'].band.h} (study predicted 139; the difference is recorded, not explained). Foot under C with py-1: ${t1['C + foot py-1@1646'].foot.h} (tallest child ${t1['C + foot py-1@1646'].footTallestChild}).`,
);
p();

// ── T2 / T3 ───────────────────────────────────────────────────────────────────────────────────
await setStudy(page, '');
p(`## §2 · M0-T2 — each row's content width, pen held (today's composition)`);
p();
p(
  `| width | container | scrollWidth | group | line | group w | kids+gaps+pad | items | sections |`,
);
p(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
const t2 = {};
for (const w of WIDTHS) {
  await setWidth(page, w);
  const r = await rowWidths(page);
  t2[w] = r;
  const la = lineAssign(r.groups);
  r.groups.forEach((g, i) =>
    p(
      `| ${w} | ${r.container} | ${r.scrollWidth} | ${g.label} | ${la[i].line} | ${g.w} | ${g.kidsPlusGaps} | ${g.items.length} | ${g.sections.map((s) => `${s.tag}:${s.w}`).join(' ')} |`,
    ),
  );
}
p();
for (const w of WIDTHS) {
  const bad = t2[w].groups.filter((g) => Math.abs(g.w - g.kidsPlusGaps) > 2);
  ctl(
    `@${w} each group's width equals its children + gaps + padding within 2 px`,
    bad.length === 0,
    bad.length
      ? bad.map((g) => `${g.label}: ${g.w} vs ${g.kidsPlusGaps}`).join('; ')
      : 'all groups',
  );
}
p();
p(`### §2a · Sets`);
p();
p(
  `| width | container | LOOK (View+Find) incl. one deck gap | DO (Author+Plan) incl. one deck gap | deck gap |`,
);
p(`| --- | --- | --- | --- | --- |`);
for (const w of WIDTHS) {
  const g = t2[w].groups;
  const gap = parseFloat(t2[w].gap) || 0;
  p(
    `| ${w} | ${t2[w].container} | ${(g[0].w + g[1].w + gap).toFixed(1)} | ${(g[2].w + g[3].w + gap).toFixed(1)} | ${gap} |`,
  );
}
p();
p(`## §3 · M0-T3 — the deck's line count today`);
p();
p(`| width | lines (height / tallest child) | groups per line |`);
p(`| --- | --- | --- |`);
for (const w of WIDTHS) {
  const la = lineAssign(t2[w].groups);
  p(
    `| ${w} | ${t1[`today@${w}`].deckLines} | ${la.map((x) => `${x.label}→L${x.line}`).join(', ')} |`,
  );
}
ctl(
  'deck is 2 lines at 1646',
  Math.round(t1['today@1646'].deckLines) === 2,
  `${t1['today@1646'].deckLines}`,
);
p();

// ── T6 ────────────────────────────────────────────────────────────────────────────────────────
p(`## §4 · M0-T6 — the REAL pen control's width, and the DO row with it`);
p();
await setWidth(page, 1646);
const penW = await page.evaluate(() => {
  const b = document.querySelector('[data-plan-pen] button');
  return b
    ? {
        label: b.textContent.trim(),
        w: +b.getBoundingClientRect().width.toFixed(1),
        h: +b.getBoundingClientRect().height.toFixed(1),
      }
    : null;
});
p(
  `- Header pen button while holding: **${penW?.label}** ${penW?.w} × ${penW?.h} px (a real \`ToolbarButton\`-class control with icon, not the study's \`::before\`).`,
);
// Release to read the other label, then re-take.
await page.locator('[data-plan-pen] button', { hasText: /stop editing/i }).click();
await page.waitForTimeout(600);
const penW2 = await page.evaluate(() => {
  const b = document.querySelector('[data-plan-pen] button');
  return b ? { label: b.textContent.trim(), w: +b.getBoundingClientRect().width.toFixed(1) } : null;
});
p(`- After release: **${penW2?.label}** ${penW2?.w} px.`);
await page.locator('[data-plan-pen] button', { hasText: /start editing/i }).click();
await page.waitForTimeout(800);
const penBack = await page.evaluate(() =>
  document.querySelector('[data-plan-pen] button')?.textContent.trim(),
);
ctl(
  'pen re-taken (control reads Stop editing again)',
  /stop editing/i.test(penBack ?? ''),
  `${penBack}`,
);
p();
p(`| width | container | DO set today | DO set + pen (widest label) + one gap | slack |`);
p(`| --- | --- | --- | --- | --- |`);
const penMax = Math.max(penW?.w ?? 0, penW2?.w ?? 0);
for (const w of WIDTHS) {
  const g = t2[w].groups;
  const gap = parseFloat(t2[w].gap) || 0;
  const doW = g[2].w + g[3].w + gap;
  const withPen = doW + penMax + gap;
  p(
    `| ${w} | ${t2[w].container} | ${doW.toFixed(1)} | ${withPen.toFixed(1)} | ${(t2[w].container - withPen).toFixed(1)} |`,
  );
}
p(
  `- Under C the cards go (−18 px width per group, S1), so each set above is ~36 px wider than C's rows will be; the slack column is therefore conservative by that amount.`,
);
p();

// ── T10 ───────────────────────────────────────────────────────────────────────────────────────
p(`## §5 · M0-T10 — the header's wrap threshold once the pen leaves`);
p();
p(`| width | header lines today | pen cluster hidden | buttons hidden, badge kept |`);
p(`| --- | --- | --- | --- |`);
for (const w of WIDTHS) {
  await setWidth(page, w);
  await setStudy(page, '');
  const a = (await geometry(page)).headerRowLines;
  await setStudy(page, '[data-plan-pen]{display:none!important}');
  await page.waitForTimeout(200);
  const b = (await geometry(page)).headerRowLines;
  await setStudy(page, '[data-plan-pen] button{display:none!important}');
  await page.waitForTimeout(200);
  const c = (await geometry(page)).headerRowLines;
  p(`| ${w} | ${a} | ${b} | ${c} |`);
}
await setStudy(page, '');
p(
  `- \`pen-status.spec.ts\` asserts 1 line at 1646 and 2 at 1440 and 1280 today; the middle column says which of those move when the button leaves (M5-T6).`,
);
p();

// ── T4 ────────────────────────────────────────────────────────────────────────────────────────
p(`## §6 · M0-T4 — the pen cluster's width in both of CQ-4's homes`);
p();
await setWidth(page, 1646);
const t4 = await page.evaluate(() => {
  const foot = document.querySelector('[data-activities-bar]');
  const state = foot.querySelector('[data-schedule-state]');
  const pen = document.querySelector('[data-plan-pen]');
  const rect = (el) => +el.getBoundingClientRect().height.toFixed(1);
  const wOf = (el) => +el.getBoundingClientRect().width.toFixed(1);
  const base = { foot: rect(foot), penTodayW: wOf(pen) };
  // Fabricate the WIDEST realistic cluster from real DOM: the `Locked · <name>` badge and the two
  // longest hand-off labels, cloned from the live button so they carry its real padding and font.
  const make = () => {
    const c = pen.cloneNode(true);
    const badge = c.querySelector('span');
    if (badge) badge.textContent = 'Locked · Alexandra';
    const btn = c.querySelector('button');
    for (const label of ['Request control', 'Take over now']) {
      const b = btn.cloneNode(true);
      b.textContent = label;
      c.appendChild(b);
    }
    btn.remove();
    return c;
  };
  // (a) inside the schedule-state block
  const ca = make();
  state.appendChild(ca);
  const a = { foot: rect(foot), cluster: wOf(ca), state: wOf(state) };
  ca.remove();
  // (b) third sibling of the dock and the facts
  const cb = make();
  foot.appendChild(cb);
  const b = { foot: rect(foot), cluster: wOf(cb) };
  cb.remove();
  const after = { foot: rect(foot) };
  return { base, a, b, after };
});
p(
  `- Pen cluster in the header today (badge + Stop editing): ${t4.base.penTodayW} px. Fabricated widest cluster (\`Locked · Alexandra\` + Request control + Take over now), cloned from live DOM: **${t4.b.cluster} px**.`,
);
p(
  `- (a) inside \`[data-schedule-state]\`: foot ${t4.a.foot} px, the state block ${t4.a.state} px wide. (b) as a third foot sibling: foot **${t4.b.foot} px**. Baseline foot ${t4.base.foot} px.`,
);
ctl(
  'foot returns to its baseline once the clones are removed',
  t4.after.foot === t4.base.foot,
  `${t4.after.foot} vs ${t4.base.foot}`,
);
ctl(
  'baseline foot equals §1 today@1646',
  t4.base.foot === t1['today@1646'].foot.h,
  `${t4.base.foot} vs ${t1['today@1646'].foot.h}`,
);
p(
  `- The sentence itself is \`sr-only\` in the foot (foot-row D4), so it adds no width in either home; the width is the badge and the buttons.`,
);
p();

// ── T5 ────────────────────────────────────────────────────────────────────────────────────────
p(`## §7 · M0-T5 — what the organisation switcher paints`);
p();
const t5 = await page.evaluate(() => {
  const s = document.getElementById('org-switcher');
  if (!s) return null;
  const cs = getComputedStyle(s);
  return {
    bg: cs.backgroundColor,
    color: cs.color,
    appearance: cs.appearance,
    colorScheme: cs.colorScheme,
    inChrome: !!s.closest('[data-surface="chrome"]'),
    className: s.className,
  };
});
p(
  `- computed: background-color \`${t5?.bg}\`, color \`${t5?.color}\`, appearance \`${t5?.appearance}\`, color-scheme \`${t5?.colorScheme}\`, inside chrome scope: ${t5?.inChrome}.`,
);
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#org-switcher',
  });
  const m = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
  const bgRules = (m.matchedCSSRules ?? [])
    .filter((r) =>
      r.rule.style.cssProperties.some(
        (pp) => pp.name === 'background-color' || pp.name === 'background',
      ),
    )
    .map(
      (r) =>
        `${r.rule.origin}: ${r.rule.selectorList.text} { ${r.rule.style.cssProperties
          .filter((pp) => /^background/.test(pp.name))
          .map((pp) => `${pp.name}: ${pp.value}`)
          .join('; ')} }`,
    );
  p(
    `- matched rules declaring a background (cascade order, last wins): ${bgRules.length ? bgRules.map((x) => `\n  - \`${x}\``).join('') : 'none'}`,
  );
  await cdp.detach();
} catch (e) {
  p(`- CDP matched-rules read failed: ${String(e.message).slice(0, 80)}`);
}
p();

// ── T9 ────────────────────────────────────────────────────────────────────────────────────────
p(`## §8 · M0-T9 — does an offset focus ring fit? (CQ-2)`);
p();
const t9 = await page.evaluate((deckSel) => {
  const deck = document.querySelector(deckSel);
  const items = [...deck.querySelectorAll('[data-toolbar-item]')].map((el) => ({
    id: el.getAttribute('data-toolbar-item'),
    r: el.getBoundingClientRect(),
  }));
  const wrap = deck.parentElement.getBoundingClientRect();
  let minGap = Infinity,
    pair = '';
  let minEdge = Infinity,
    edgeItem = '';
  for (const a of items)
    for (const b of items) {
      if (a === b) continue;
      const sameLine = Math.abs(a.r.top - b.r.top) < 4;
      if (sameLine && b.r.left >= a.r.right) {
        const g = b.r.left - a.r.right;
        if (g < minGap) {
          minGap = g;
          pair = `${a.id}→${b.id}`;
        }
      }
    }
  for (const a of items) {
    const e = Math.min(a.r.left - wrap.left, wrap.right - a.r.right);
    if (e < minEdge) {
      minEdge = e;
      edgeItem = a.id;
    }
  }
  const rowGap = (() => {
    const tops = [...new Set(items.map((i) => Math.round(i.r.top)))].sort((x, y) => x - y);
    if (tops.length < 2) return null;
    const l1 = items.filter((i) => Math.round(i.r.top) === tops[0]);
    const l2 = items.filter((i) => Math.round(i.r.top) === tops[1]);
    return +(Math.min(...l2.map((i) => i.r.top)) - Math.max(...l1.map((i) => i.r.bottom))).toFixed(
      1,
    );
  })();
  return {
    count: items.length,
    minGap: +minGap.toFixed(1),
    pair,
    minEdge: +minEdge.toFixed(1),
    edgeItem,
    rowGap,
  };
}, DECK);
p(
  `- ${t9.count} controls. Smallest horizontal gap between two controls on one line: **${t9.minGap} px** (${t9.pair}). Smallest distance from a control to the deck wrapper's edge: ${t9.minEdge} px (${t9.edgeItem}). Gap between the two lines: ${t9.rowGap} px.`,
);
p(
  `- A 2 px ring at 2 px offset needs **4 px** of clear space on every side to avoid touching a neighbour and **≥ 4 px** to the wrapper to avoid clipping (\`overflow\` permitting). Verdict on the numbers above: ${t9.minGap >= 8 ? 'two adjacent offset rings could both fit' : t9.minGap >= 4 ? 'one offset ring fits without touching its neighbour, but two adjacent focused controls cannot both — a non-issue, since focus is singular' : '**the offset ring touches its neighbour**'}; row gap ${t9.rowGap} px ${t9.rowGap >= 4 ? 'clears' : 'does NOT clear'} it vertically.`,
);
p(
  `- Under C (C2 sets \`gap: 0.5rem\` inside a group) the within-group gap becomes 8 px; the reading above is today's.`,
);
p();

// ── T8 ────────────────────────────────────────────────────────────────────────────────────────
p(`## §9 · M0-T8 — is the group→row assignment stable across plan states?`);
p();
p(`| state | width | items in deck | groups per line | group widths |`);
p(`| --- | --- | --- | --- | --- |`);
const t8 = [];
async function state(name) {
  for (const w of [1920, 1646, 1440]) {
    await setWidth(page, w);
    const r = await rowWidths(page);
    const la = lineAssign(r.groups);
    t8.push({ name, w, la });
    p(
      `| ${name} | ${w} | ${r.groups.reduce((s, g) => s + g.items.length, 0)} | ${la.map((x) => `${x.label}→L${x.line}`).join(', ')} | ${r.groups.map((g) => g.w).join(' / ')} |`,
    );
  }
}
await state('computed, Diagram, pen held');
await open(page, org, planId, '?view=gantt');
await state('computed, Gantt, pen held');
const { planId: bare } = await seed(page, org, { recalc: false });
await open(page, org, bare);
await state('NO computed schedule, Diagram');
p();
p(
  `- NOT MEASURED: a plan mid-conflict-cycle (needs an engine conflict the seed does not produce) and a **Viewer** (needs a second member; one session cannot reach it). Both are recorded as owed, not assumed stable.`,
);
const moved = new Set();
for (const s of t8)
  for (const x of s.la) {
    const key = `${x.label}@${s.w}`;
    const first = t8.find((t) => t.w === s.w).la.find((y) => y.label === x.label);
    if (first && first.line !== x.line)
      moved.add(`${key}: L${first.line}→L${x.line} in "${s.name}"`);
  }
ctl(
  "no group changes line between measured states at a given width (today's flex wrap)",
  moved.size === 0,
  moved.size ? [...moved].join('; ') : 'stable across the three states',
);
p();

// ── T7 ────────────────────────────────────────────────────────────────────────────────────────
p(`## §10 · M0-T7 — coarse-pointer geometry`);
p();
const cpage = await browser.newPage({
  viewport: { width: 1646, height: 1000 },
  hasTouch: true,
  storageState: await context.storageState(),
});
await cpage.goto(`${BASE}/orgs/${org}/plans/${planId}`);
await cpage.getByRole('toolbar', { name: 'Plan commands' }).waitFor();
await cpage.waitForLoadState('networkidle');
await cpage.waitForTimeout(800);
const pointer = await cpage.evaluate(() =>
  window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
);
if (pointer !== 'coarse')
  throw new Error(
    'this context did not report a coarse pointer — nothing below would be about the coarse path',
  );
ctl('matchMedia("(pointer: coarse)") matches on the coarse page', true, pointer);
p(`| width | variant | band | header | deck | deck lines | foot | control height |`);
p(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
for (const variant of [
  ['today', ''],
  ['C', studyCss],
]) {
  await setStudy(cpage, variant[1]);
  for (const w of [1646, 1024, 834, 390]) {
    await setWidth(cpage, w);
    const g = await geometry(cpage);
    const ch = await cpage.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--control-h').trim(),
    );
    p(
      `| ${w} | ${variant[0]} | ${g.band?.h} | ${g.header?.h} | ${g.deck?.h} | ${g.deckLines} | ${g.foot?.h ?? 'not mounted'} | ${ch} |`,
    );
  }
}
await cpage.close();
p();
p(
  `- Study predicted 159 px for C's band under coarse at 1646. \`docs/TECH_DEBT.md\` #133 (labels lost in tablet mode) is reported by the line count, not asserted.`,
);

await browser.close();
process.stdout.write(out.join('\n') + '\n');
