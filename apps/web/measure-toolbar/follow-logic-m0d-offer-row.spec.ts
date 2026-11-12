import { type CDPSession, expect, type Page, test } from '@playwright/test';

import { canvas, drawActivity, openNewPlan, startEditing } from '../e2e-authoring/support';
import { ganttRow, showGantt } from '../e2e-gantt/support';
import {
  diagramList,
  ensurePen,
  linkActivities,
  placeViaApi,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { readRows, settle, signUp, sweepRow } from './follow-logic-m0-support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Placed bar follows link, M0d** (`docs/specs/placed-bar-follows-link/m0-measurement.md`, "M0d";
 * `amendment-3-after-m0c.md` section 6): does option A-double-prime hold stop rules S1 to S7?
 *
 * **A-double-prime is INJECTED, not shipped; nothing under `apps/web/src` changes.** It is A-prime
 * (M0c's probe, `RULES_CSS` verbatim, the strip cloned from the REAL `NoticeStrip` the product
 * renders) PLUS one element, amendment 3 section 4: the plan facts' outlet and the foot row's toggle
 * become one flex item, `<div data-foot-trail>`. The group is built in the page by moving the two
 * real nodes under one new element and is UNDONE (the nodes put back, the element removed) straight
 * after each reading and always before anything React renders around it: no view switch, panel
 * expand or collapse, reload, route change or selection change ever happens while it is in place.
 *
 * Three foot-row modes are read in every cell so that each stop rule has its own control:
 *   `base`          the shipped dock, no strip, no group (what S1, S3 and S5 compare with);
 *   `base-grouped`  the shipped dock plus the group only (S2's baseline, and S7's subject);
 *   `A-double-prime` / `own-row`  the strip with A-prime's markup, plus the group.
 * The row 580 messages also read `shipped` (the product's own strip, no group, no marker).
 *
 * A harness, not a gate (ADR-0081 section 3): no CI step, no new config.
 */

interface Cell {
  label: string;
  w: number;
  h: number;
}

const GRID: readonly Cell[] = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1120x700', w: 1120, h: 700 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1646x1097', w: 1646, h: 1097 },
  { label: '1912x1080', w: 1912, h: 1080 },
];
const SWEEP: readonly Cell[] = Array.from({ length: 19 }, (_, i) => ({
  label: `${String(1150 + i * 10)}x800`,
  w: 1150 + i * 10,
  h: 800,
}));
/** Row 580's widths: the design floor, the band (1210 to 1250) and 1280. */
const MESSAGE_WIDTHS: readonly Cell[] = [1024, 1210, 1220, 1230, 1240, 1250, 1280].map((w) => ({
  label: `${String(w)}x${w === 1024 ? '600' : '800'}`,
  w,
  h: w === 1024 ? 600 : 800,
}));
/** R3s: the wide-facts widths, mouse only. */
const FACTS_WIDTHS: readonly Cell[] = [
  1024, 1200, 1210, 1220, 1230, 1240, 1250, 1260, 1270, 1280, 1440,
].map((w) => ({
  label: `${String(w)}x${w === 1024 ? '600' : '800'}`,
  w,
  h: w === 1024 ? 600 : 800,
}));
/** Where the shipped dock is predicted to strand its toggle behind "Recalculating..." (about 1027 to 1075). */
const HELD_WIDTHS: readonly Cell[] = Array.from({ length: 12 }, (_, i) => ({
  label: `${String(1024 + i * 6)}x800`,
  w: 1024 + i * 6,
  h: 800,
}));

const LONG_A = 'Install structural steel to level 3 west wings';
const LONG_B = 'Fabricate and erect precast stair cores, blk B';
const LONG_C = 'Commission the rooftop plant and chilled water loop';

/** Amendment 2 section 3's injected stylesheet (A-prime), verbatim, as M0c injected it. */
const RULES_CSS = `
[data-activities-bar] > div[class*='not-empty:min-w-']:not(:empty):has([data-dock-row]) {
  min-width: min(36rem, 100%);
}
[data-dock-row] {
  min-width: 0;
  flex-wrap: wrap;
}
[data-dock-row] > p {
  flex: 1 1 0%;
  min-width: min(16rem, 100%);
}
[data-dock-row] > [data-dock-row-actions] {
  margin-inline-start: auto;
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
`;

/** Amendment 3 section 4's one added rule, verbatim. */
const TRAIL_CSS = `
[data-activities-bar] > [data-foot-trail] {
  margin-inline-start: auto;
  display: flex;
  max-width: 100%;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 0.5rem;
  row-gap: 0;
}
`;

const VARIANTS = [
  {
    id: 'edit-one',
    text: '“Pour slab” stays where you placed it, before its logic allows.',
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: false,
  },
  {
    id: 'edit-one-long-name',
    text: `“${LONG_A}” stays where you placed it, before its logic allows.`,
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: false,
  },
  {
    id: 'edit-several',
    text: '“Pour slab” and 2 others stay where you placed them, before their logic allows.',
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: false,
  },
  {
    id: 'plan',
    text: '3 bars stay where they were placed, before their logic allows.',
    buttons: ['Follow logic', 'Dismiss'],
    dashed: true,
    beforeBar: false,
  },
  {
    id: 'link-confirmation-plus-offer',
    text: 'Linked “Excavate” → “Pour slab” (FS). “Pour slab” stays where you placed it, before its logic allows.',
    buttons: ['Undo', 'Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: true,
  },
] as const;
const FACTS_VARIANTS = VARIANTS.filter((v) => v.id === 'edit-one' || v.id.startsWith('link-'));
const HELD_VARIANTS = FACTS_VARIANTS;

/** `shipped`: the product's strip. `own-row`: A-prime's markup (marker, wrap, grouped actions). */
type Mode = 'shipped' | 'own-row';

interface Sentence {
  text: string;
  buttons: readonly string[];
  dashed: boolean;
  beforeBar: boolean;
}
interface Variant extends Sentence {
  id: string;
}

type Reading = Record<string, unknown>;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[follow-logic m0d ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

const STRIP_ID = 'm0d-injected-strip';

/** Everything read in one place, in the page. Self-contained: Playwright serialises it. */
function readDock(arg: { tag: string; stripSelector: string }): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
  const diagramStage = document.querySelector<HTMLElement>(
    'section[aria-label="Time-scaled logic diagram"]',
  );
  const grid = document.querySelector<HTMLElement>(
    '[role="treegrid"][aria-label="Schedule as a bar chart"]',
  );
  // The Gantt has no `section[aria-label]`; its stage is the tallest ancestor of the grid that ends where
  // the foot row begins, which is the box the foot row's height comes out of.
  const ganttStage = ((): HTMLElement | null => {
    if (!grid || !foot) return null;
    const footTop = foot.getBoundingClientRect().top;
    let best: HTMLElement | null = null;
    for (let el: HTMLElement | null = grid; el && el !== document.body; el = el.parentElement) {
      if (Math.abs(el.getBoundingClientRect().bottom - footTop) <= 3) best = el;
    }
    return best;
  })();
  const stage = diagramStage ?? ganttStage;
  const outlet = foot?.querySelector<HTMLElement>('div[class*="not-empty:min-w-"]') ?? null;
  const cluster = (values: number[], tol = 4): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const lines: number[] = [];
    for (const v of sorted) {
      const last = lines[lines.length - 1];
      if (last === undefined || v - last > tol) lines.push(v);
    }
    return lines;
  };
  // The shell's one scroller: the grid that is `h-dvh` and carries the `squat:overflow-y-auto` rule
  // (`app-shell.tsx:160`). It scrolls only when `squat` is engaged (narrow AND short, or 200 % text).
  const scroller =
    [...document.querySelectorAll<HTMLElement>('div')].find(
      (d) =>
        d.className.includes('h-dvh') && d.className.includes('grid-cols-[auto_minmax(0,1fr)]'),
    ) ?? null;
  const strip = document.querySelector<HTMLElement>(arg.stripSelector);
  const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
  const bulk = document.querySelector<HTMLElement>('[data-testid="bulk-selection-bar"]');
  const corner = document.querySelector<HTMLElement>(
    '[role="toolbar"][aria-label="Diagram viewport"]',
  );
  const facts = document.querySelector<HTMLElement>('[data-schedule-state]');
  // The facts' OUTLET is the foot row's own item (the node the group wraps); it shares the facts' line.
  const factsItem =
    foot && facts
      ? ([...foot.querySelectorAll<HTMLElement>('*')].find(
          (e) =>
            e.contains(facts) &&
            (e.parentElement === foot || e.parentElement?.hasAttribute('data-foot-trail')),
        ) ?? null)
      : null;
  const trail = foot?.querySelector<HTMLElement>(':scope > [data-foot-trail]') ?? null;
  const toggle = foot?.querySelector<HTMLElement>('button[aria-label$="activities panel"]') ?? null;
  const footCs = foot ? getComputedStyle(foot) : null;
  const pad = (side: string): number => (footCs ? parseFloat(footCs.getPropertyValue(side)) : 0);
  const footRect = foot?.getBoundingClientRect() ?? null;
  const footInnerH = footRect
    ? footRect.height -
      pad('padding-top') -
      pad('padding-bottom') -
      pad('border-top-width') -
      pad('border-bottom-width')
    : null;
  const footContentLeft = footRect
    ? footRect.left + pad('border-left-width') + pad('padding-left')
    : null;
  const footContentW = foot ? foot.clientWidth - pad('padding-left') - pad('padding-right') : null;
  const out: Reading = {
    tag: arg.tag,
    view: diagramStage ? 'diagram' : grid ? 'gantt' : 'unknown',
    coarse: matchMedia('(pointer: coarse)').matches,
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    footH: foot ? r(foot.getBoundingClientRect().height) : null,
    footInnerH: footInnerH === null ? null : r(footInnerH),
    footContentW: footContentW === null ? null : r(footContentW),
    footScrollsSideways: foot ? foot.scrollWidth > foot.clientWidth + 1 : null,
    pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    shellScrollsSideways: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : null,
    stageH: stage ? r(stage.getBoundingClientRect().height) : null,
    outletW: outlet ? r(outlet.getBoundingClientRect().width) : null,
    outletH: outlet ? r(outlet.getBoundingClientRect().height) : null,
    outletTop: outlet ? r(outlet.getBoundingClientRect().top) : null,
    outletBasis: outlet ? getComputedStyle(outlet).flexBasis : null,
    outletMinW: outlet ? getComputedStyle(outlet).minWidth : null,
    grouped: trail !== null,
    group: trail
      ? {
          w: r(trail.getBoundingClientRect().width),
          h: r(trail.getBoundingClientRect().height),
          top: r(trail.getBoundingClientRect().top),
          left: r(trail.getBoundingClientRect().left),
        }
      : null,
    shell: scroller
      ? {
          scrollTop: r(scroller.scrollTop),
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          overflowY: getComputedStyle(scroller).overflowY,
          squat: getComputedStyle(scroller).overflowY === 'auto',
        }
      : null,
    facts: facts
      ? {
          state: facts.getAttribute('data-schedule-state'),
          w: r(facts.getBoundingClientRect().width),
          h: r(facts.getBoundingClientRect().height),
          top: r(facts.getBoundingClientRect().top),
          left: r(facts.getBoundingClientRect().left),
          // Where the facts sit on their line: 0 is the leading edge of the row's content box.
          leftOffset:
            footContentLeft === null
              ? null
              : r(facts.getBoundingClientRect().left - footContentLeft),
          itemTop: factsItem ? r(factsItem.getBoundingClientRect().top) : null,
          itemH: factsItem ? r(factsItem.getBoundingClientRect().height) : null,
          tail: (facts.textContent ?? '').replace(/\s+/g, ' ').trim().slice(-48),
        }
      : null,
  };
  if (corner && stage) {
    const c = corner.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    out['cornerInsideStage'] =
      c.width > 0 &&
      c.left >= s.left - 0.5 &&
      c.top >= s.top - 0.5 &&
      c.right <= s.right + 0.5 &&
      c.bottom <= s.bottom + 0.5;
  } else {
    out['cornerInsideStage'] = corner ? null : 'no-cluster-in-this-view';
  }
  const selectionEl = bar ?? bulk;
  if (selectionEl) {
    const items = [
      ...selectionEl.querySelectorAll<HTMLElement>('[data-toolbar-item], button'),
    ].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 1.5 && b.height > 1.5;
    });
    out['selectionBar'] = {
      label: selectionEl.getAttribute('aria-label') ?? selectionEl.getAttribute('data-testid'),
      lines: cluster(items.map((e) => e.getBoundingClientRect().top)).length,
      barW: r(selectionEl.getBoundingClientRect().width),
      barH: r(selectionEl.getBoundingClientRect().height),
      inOutlet: outlet ? outlet.contains(selectionEl) : null,
    };
  }

  // Controls whose reachability is read: the strip's buttons and the foot row's own toggle. Geometry
  // and the in-place hit test first, for every control; only then the scroll-into-view pass.
  const controls: { kind: 'strip' | 'toggle'; el: HTMLElement }[] = [];
  if (strip) {
    for (const b of strip.querySelectorAll<HTMLElement>('button')) {
      controls.push({ kind: 'strip', el: b });
    }
  }
  if (toggle) controls.push({ kind: 'toggle', el: toggle });
  const hitSelf = (el: HTMLElement): boolean => {
    const bb = el.getBoundingClientRect();
    const hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
    return hit !== null && el.contains(hit);
  };
  const inPlace = controls.map((c) => ({
    hit: hitSelf(c.el),
    inViewport:
      c.el.getBoundingClientRect().bottom <= window.innerHeight + 1 &&
      c.el.getBoundingClientRect().top >= -1 &&
      c.el.getBoundingClientRect().right <= window.innerWidth + 1,
  }));
  const geometry = controls.map((c) => {
    const bb = c.el.getBoundingClientRect();
    return {
      text: (c.el.getAttribute('aria-label') ?? c.el.textContent ?? '').trim(),
      w: r(bb.width),
      h: r(bb.height),
      top: r(bb.top),
      // Past the foot row's own right edge: a control the row clips whatever the page does.
      pastFootRight: bb.right > (footRect?.right ?? 0) + 1,
    };
  });
  const sb = strip?.getBoundingClientRect() ?? null;
  if (strip && sb) {
    const p = strip.querySelector<HTMLElement>('p');
    const actions = strip.querySelector<HTMLElement>('[data-dock-row-actions]');
    const pb = p?.getBoundingClientRect() ?? null;
    const fb = factsItem?.getBoundingClientRect() ?? null;
    out['strip'] = {
      w: r(sb.width),
      h: r(sb.height),
      left: r(sb.left),
      right: r(sb.right),
      top: r(sb.top),
      bottom: r(sb.bottom),
      textClientW: p ? r(p.clientWidth) : null,
      textTruncated: p ? p.scrollWidth > p.clientWidth + 1 : null,
      textLines: p
        ? Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight))
        : null,
      minWidthComputed: getComputedStyle(strip).minWidth,
      flexWrap: getComputedStyle(strip).flexWrap,
      overflowsOutletBy: outlet
        ? r(Math.max(0, sb.right - outlet.getBoundingClientRect().right))
        : null,
      // The buttons dropped under the sentence (the strip's wrap), as one group.
      actionsBelowText: pb && actions ? actions.getBoundingClientRect().top >= pb.bottom - 2 : null,
      actionsW: actions ? r(actions.getBoundingClientRect().width) : null,
      overlapsFootSibling:
        outlet && outlet.parentElement
          ? [...outlet.parentElement.children]
              .filter((c) => c !== outlet && (c.textContent ?? '').trim() !== '')
              .some((c) => {
                const cb = c.getBoundingClientRect();
                return (
                  cb.left < sb.right - 1 &&
                  cb.right > sb.left + 1 &&
                  cb.top < sb.bottom - 1 &&
                  cb.bottom > sb.top + 1
                );
              })
          : null,
      // The strip and the selection bar do not share a line, either way round.
      stackedWithBar: selectionEl
        ? sb.top >= selectionEl.getBoundingClientRect().bottom - 2 ||
          sb.bottom <= selectionEl.getBoundingClientRect().top + 2
        : null,
      aboveBar: selectionEl ? sb.bottom <= selectionEl.getBoundingClientRect().top + 2 : null,
      // The strip's line is above the plan facts (DOM order: outlet first).
      aboveFacts: fb ? sb.bottom <= fb.top + 2 : null,
      // The strip shares a line with the facts (their vertical ranges overlap): S2's `expected` needs it.
      sharesFactsLine: fb ? sb.top < fb.bottom - 1 && sb.bottom > fb.top + 1 : null,
    };
  }

  // The scroll pass. Every scrollable ancestor's offset is put back afterwards, so the next reading
  // starts from the same scroll the product would.
  const saved: { el: Element; top: number; left: number }[] = [];
  const remember = (el: Element | null): void => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      if (!saved.some((s) => s.el === n))
        saved.push({ el: n, top: n.scrollTop, left: n.scrollLeft });
    }
  };
  for (const c of controls) remember(c.el);
  const afterScroll = controls.map((c) => {
    c.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    return hitSelf(c.el);
  });
  for (const s of saved) {
    s.el.scrollTop = s.top;
    s.el.scrollLeft = s.left;
  }
  const merged = controls.map((_, i) => ({
    ...geometry[i],
    selfHitInPlace: inPlace[i]?.hit ?? null,
    inViewportInPlace: inPlace[i]?.inViewport ?? null,
    selfHitAfterScroll: afterScroll[i] ?? null,
  }));
  out['stripButtons'] = merged.filter((_, i) => controls[i]?.kind === 'strip');
  out['toggle'] = merged.find((_, i) => controls[i]?.kind === 'toggle') ?? null;
  return out;
}

async function read(page: Page, tag: string, stripSelector = `[data-testid="${STRIP_ID}"]`) {
  return page.evaluate(readDock, { tag, stripSelector });
}

async function installRules(page: Page): Promise<void> {
  await page.evaluate((css: string) => {
    document.getElementById('m0d-rules')?.remove();
    const style = document.createElement('style');
    style.id = 'm0d-rules';
    style.textContent = css;
    document.head.appendChild(style);
  }, RULES_CSS + TRAIL_CSS);
}

/**
 * Amendment 3 section 4's group, made in the page: the facts' outlet and the toggle under one new
 * element, in their DOM order. Undone by {@link groupOff} before any React render around them.
 */
async function groupOn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const row = document.querySelector('[data-activities-bar]');
    if (!row) throw new Error('no foot row');
    if (row.querySelector(':scope > [data-foot-trail]')) throw new Error('group already in place');
    const facts = [...row.children].find((c) => c.querySelector('[data-schedule-state]'));
    const toggle = row.querySelector(':scope > [data-activities-toggle]');
    if (!facts || !toggle) throw new Error('no facts or toggle among the foot row children');
    const group = document.createElement('div');
    group.setAttribute('data-foot-trail', '');
    facts.before(group);
    group.append(facts, toggle);
  });
}

async function groupOff(page: Page): Promise<void> {
  await page.evaluate(() => {
    const group = document.querySelector('[data-activities-bar] > [data-foot-trail]');
    if (!group) return;
    const kids = [...group.children];
    group.before(...kids);
    group.remove();
  });
}

/** Put one strip, cloned from a real one, into the real outlet, in the product's order. */
async function injectStrip(
  page: Page,
  template: string,
  sentence: Sentence,
  mode: Mode,
  view: 'diagram' | 'gantt',
): Promise<void> {
  await page.evaluate(
    ({ html, s, m, id, v }) => {
      const foot = document.querySelector('[data-activities-bar]');
      const outlet = foot?.querySelector('div[class*="not-empty:min-w-"]');
      if (!outlet) throw new Error('no dock outlet');
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const strip = holder.firstElementChild as HTMLElement;
      strip.setAttribute('data-testid', id);
      strip.removeAttribute('role');
      if (s.dashed) strip.classList.add('border-dashed');
      const p = strip.querySelector('p');
      if (!p) throw new Error('template has no sentence');
      p.textContent = s.text;
      const buttons = [...strip.querySelectorAll('button')];
      const first = buttons[0];
      if (!first) throw new Error('template has no button');
      for (const b of buttons) b.remove();
      const labelled = s.buttons.map((label) => {
        const b = first.cloneNode(true) as HTMLElement;
        b.textContent = label;
        return b;
      });
      if (m === 'own-row') {
        p.className = 'flex-1';
        strip.classList.remove('items-center', 'justify-between', 'py-1.5');
        strip.classList.add('items-start', 'py-2');
        strip.setAttribute('data-dock-row', '');
        const group = document.createElement('div');
        group.setAttribute('data-dock-row-actions', '');
        for (const b of labelled) group.appendChild(b);
        strip.appendChild(group);
      } else {
        p.className = 'min-w-0 truncate';
        for (const b of labelled) strip.appendChild(b);
      }
      const bar = outlet.querySelector('[role="toolbar"][aria-label^="Actions for"]');
      const barChild = bar
        ? ([...outlet.children].find((c) => c === bar || c.contains(bar)) ?? null)
        : null;
      if (s.beforeBar && v === 'diagram' && barChild) outlet.insertBefore(strip, barChild);
      else outlet.appendChild(strip);
    },
    { html: template, s: sentence, m: mode, id: STRIP_ID, v: view },
  );
}

async function removeStrip(page: Page): Promise<void> {
  await page.evaluate((id) => {
    document.querySelector(`[data-testid="${id}"]`)?.remove();
  }, STRIP_ID);
}

/**
 * Reshape the REAL multi-select bar in place (row 580). `restoreBulk` puts its classes back; React
 * does not touch them while the bar's props are unchanged.
 */
async function reshapeBulk(page: Page, mode: Mode): Promise<void> {
  await page.evaluate((m) => {
    const strip = document.querySelector<HTMLElement>('[data-testid="bulk-selection-bar"]');
    if (!strip) throw new Error('no bulk bar');
    strip.setAttribute('data-m0d-orig', strip.className);
    const p = strip.querySelector(':scope > p');
    if (!p) throw new Error('no bulk sentence');
    p.setAttribute('data-m0d-orig', p.className);
    if (m === 'shipped') return;
    p.className = 'flex-1';
    strip.classList.remove('items-center', 'justify-between', 'py-1.5');
    strip.classList.add('items-start', 'py-2');
    strip.setAttribute('data-dock-row', '');
    const actions = strip.querySelector(':scope > div');
    if (!actions) throw new Error('no bulk actions group');
    actions.setAttribute('data-dock-row-actions', '');
  }, mode);
}

async function restoreBulk(page: Page): Promise<void> {
  await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('[data-testid="bulk-selection-bar"]');
    if (!strip) return;
    const orig = strip.getAttribute('data-m0d-orig');
    if (orig !== null) strip.className = orig;
    strip.removeAttribute('data-m0d-orig');
    strip.removeAttribute('data-dock-row');
    strip.querySelector(':scope > div')?.removeAttribute('data-dock-row-actions');
    const p = strip.querySelector(':scope > p');
    const po = p?.getAttribute('data-m0d-orig');
    if (p && po !== null && po !== undefined) p.className = po;
    p?.removeAttribute('data-m0d-orig');
  });
}

async function selectByName(page: Page, org: string, name: string): Promise<void> {
  const row = (await readRows(page, org)).find((x) => x.name === name);
  if (!row) throw new Error(`no ${name}`);
  await diagramList(page).focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 15; i += 1) {
    if ((await selectedActivityId(page)) === row.id) return;
    await page.keyboard.press('ArrowDown');
  }
  if ((await selectedActivityId(page)) !== row.id) throw new Error(`could not reach ${name}`);
}

async function selectInGantt(page: Page, name: string): Promise<void> {
  await ganttRow(page, name).getByRole('gridcell').first().click();
}

type Selection = 'none' | 'placed-unflagged-selected' | 'flagged-bar-selected';
const SELECTIONS: readonly Selection[] = [
  'none',
  'placed-unflagged-selected',
  'flagged-bar-selected',
];
const BAR_SELECTIONS = SELECTIONS.filter((s) => s !== 'none');
const NAME_FOR: Record<Selection, string | null> = {
  none: null,
  'placed-unflagged-selected': 'Excavate',
  'flagged-bar-selected': 'Pour slab',
};

async function applySelection(
  page: Page,
  org: string,
  view: 'diagram' | 'gantt',
  selection: Selection,
): Promise<void> {
  const name = NAME_FOR[selection];
  if (name === null) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // The Gantt has no way to clear a selection (no Clear selection button, and Escape does not reach it),
    // so its `none` pass runs first, from a selection cleared in the diagram; this checks it held.
    if ((await page.locator('[role="toolbar"][aria-label^="Actions for"]').count()) > 0) {
      throw new Error(`selection would not clear in ${view}`);
    }
  } else if (view === 'diagram') {
    await selectByName(page, org, name);
  } else {
    await selectInGantt(page, name);
  }
  await page.waitForTimeout(500);
}

/** The real plural selection: the long-named bar, then Shift+ArrowDown to extend (ADR-0080). */
async function selectPlural(page: Page, org: string): Promise<void> {
  await selectByName(page, org, LONG_A);
  await diagramList(page).press('Shift+ArrowDown');
  await expect(page.getByTestId('bulk-selection-bar')).toContainText(/2 activities selected/);
  await page.waitForTimeout(500);
}

/**
 * One reading with the group in place, undone before this returns. `strip` is the injected strip's
 * selector when one is in the page.
 */
async function readGrouped(page: Page, tag: string, stripSelector?: string): Promise<Reading> {
  await groupOn(page);
  try {
    await page.waitForTimeout(300);
    return await read(page, tag, stripSelector);
  } finally {
    await groupOff(page);
  }
}

/**
 * One cell: the base (no group), the base with the group, then every variant as A-double-prime
 * (A-prime's strip plus the group). The strip is injected before the group goes in and taken out
 * after it comes out.
 */
async function readCell(
  page: Page,
  sink: Reading[],
  meta: Reading,
  view: 'diagram' | 'gantt',
  template: string,
  variants: readonly Variant[] = VARIANTS,
): Promise<void> {
  sink.push({ ...meta, variant: 'base', mode: 'base', ...(await read(page, 'base')) });
  sink.push({
    ...meta,
    variant: 'base',
    mode: 'base-grouped',
    ...(await readGrouped(page, 'base-grouped')),
  });
  for (const variant of variants) {
    await injectStrip(page, template, variant, 'own-row', view);
    const reading = await readGrouped(page, `${variant.id}/A-double-prime`);
    await removeStrip(page);
    sink.push({ ...meta, variant: variant.id, mode: 'A-double-prime', ...reading });
  }
}

/** Facts state, for the first line of every reading. */
const factsOf = (reading: Reading): unknown => reading['facts'];

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`follow-logic M0d (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`A-double-prime at 1024 and above, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(7_200_000);
      const name = `follow-logic-m0d-offer-row.${pointer}`;
      clearMeasurement(name);
      const readings: Reading[] = [];
      const record: Reading = {
        pointer,
        method:
          "A-double-prime injected: amendment 2 section 3's stylesheet (verbatim, as M0c), data-dock-row on the cloned strip, comfortable density, buttons in one data-dock-row-actions group, PLUS amendment 3 section 4's data-foot-trail group (rule verbatim; the facts' outlet and the toggle moved under it in the page and put back before anything React renders); nothing under apps/web/src changed",
        readings,
      };
      expect(LONG_A).toHaveLength(46);
      expect(LONG_B).toHaveLength(46);

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      const { orgSlug } = await signUp(
        page,
        Date.now() + (pointer === 'coarse' ? 7 : 0) + 277,
        'FollowD',
      );
      await openNewPlan(page);
      await startEditing(page);
      const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
      const count = (n: number) =>
        expect(diagram.getByRole('option')).toHaveCount(n, { timeout: 15_000 });

      // ── The real undo result strip, with a long name: draw, then Ctrl+Z.
      await drawActivity(page, 'Task', LONG_C, { x: 220, y: 360 });
      await count(1);
      await canvas(page).press('Control+z');
      await expect(page.getByTestId('canvas-history-result')).toBeVisible({ timeout: 10_000 });
      const historyTemplate = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-history-result"]')?.outerHTML ?? '',
      );
      const historySentence = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-history-result"] p')?.textContent ?? '',
      );
      const historyButtons = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="canvas-history-result"] button')].map((b) =>
          (b.textContent ?? '').trim(),
        ),
      );
      await page
        .getByTestId('canvas-history-result')
        .getByRole('button', { name: 'Dismiss' })
        .click();
      await count(0);

      // ── The fixture: Excavate and Pour slab (selection states, the flagged bar); two long-named bars.
      await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
      await count(1);
      await drawActivity(page, 'Task', 'Pour slab', { x: 440, y: 180 });
      await count(2);
      await drawActivity(page, 'Task', LONG_A, { x: 220, y: 240 });
      await count(3);
      await drawActivity(page, 'Task', LONG_B, { x: 440, y: 300 });
      await count(4);
      const drawn = await settle(
        page,
        orgSlug,
        (rows) => rows.length === 4 && rows.every((x) => x.visualEffectiveStart !== null),
        'four bars',
      );
      await canvas(page).press('Escape');
      await canvas(page).press('Escape');
      const byName = (n: string) => {
        const row = drawn.rows.find((x) => x.name === n);
        if (!row) throw new Error(`missing drawn row ${n}`);
        return row;
      };
      const sweepA = await sweepRow(page, byName(LONG_A).id, 240, 220);
      const sweepB = await sweepRow(page, byName(LONG_B).id, 300, 440);
      await canvas(page).press('Escape');

      // ── A real Link-tool link between the long-named bars: the live Linked band is the template.
      await page
        .getByRole('toolbar', { name: 'Plan commands' })
        .getByRole('button', { name: 'Link', exact: true })
        .click();
      await canvas(page).click({
        position: { x: Math.round((sweepA.min + sweepA.max) / 2), y: 240 },
      });
      await canvas(page).click({
        position: { x: Math.round((sweepB.min + sweepB.max) / 2), y: 300 },
      });
      await expect(page.getByTestId('canvas-mode-band')).toContainText('Linked', {
        timeout: 10_000,
      });
      const linkedTemplate = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-mode-band"]')?.outerHTML ?? '',
      );
      const linkedSentence = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-mode-band"] p')?.textContent ?? '',
      );
      expect(linkedTemplate).toContain('Undo');
      await canvas(page).press('Escape');
      record['sentences'] = { linkedSentence, historySentence, historyButtons };

      // Pour slab placed before its predecessor finishes: a placed, flagged bar (as M0).
      await linkActivities(page, orgSlug, byName('Excavate').id, byName('Pour slab').id);
      await placeViaApi(page, orgSlug, 'Pour slab', '2026-01-06');
      await recalculate(page, orgSlug);
      await ensurePen(page);
      const settled = await settle(
        page,
        orgSlug,
        (rows) =>
          rows.find((x) => x.name === 'Pour slab')?.visualConflictReason === 'EARLIER_THAN_LOGIC',
        'Pour slab flagged',
      );
      record['fixture'] = settled.rows.map((x) => ({
        name: x.name,
        placed: x.visualStart,
        reason: x.visualConflictReason,
      }));
      await installRules(page);
      writeMeasurement(name, record);

      const messageTemplates: { id: string; template: string; sentence: Sentence }[] = [
        {
          id: 'bare-linked',
          template: linkedTemplate,
          // The mode band renders before the selection bar (TsldPanel.tsx:3327).
          sentence: { text: linkedSentence, buttons: ['Undo'], dashed: false, beforeBar: true },
        },
        {
          id: 'undo-result',
          template: historyTemplate,
          sentence: {
            text: historySentence,
            buttons: historyButtons,
            dashed: false,
            beforeBar: false,
          },
        },
        {
          // `LayoutResolvedStrip` is `NoticeStrip tone="muted"` (compact, truncate), the same classes as the
          // Linked band, so the band's HTML stands in for it; the sentence is `sentenceFor`'s one-bar form.
          id: 'layout-resolved',
          template: linkedTemplate,
          sentence: {
            text: `Moved “${LONG_A}” to lane 3 so it no longer overlaps another activity.`,
            buttons: ['Undo', 'Dismiss'],
            dashed: false,
            beforeBar: false,
          },
        },
      ];

      // ── The Diagram: the regression grid and the 1150 to 1330 sweep, mouse or finger, all variants.
      for (const selection of SELECTIONS) {
        for (const cell of GRID) {
          await page.setViewportSize({ width: cell.w, height: cell.h });
          await page.waitForTimeout(600);
          await applySelection(page, orgSlug, 'diagram', selection);
          await readCell(
            page,
            readings,
            { set: 'grid', view: 'diagram', cell: cell.label, selection },
            'diagram',
            linkedTemplate,
          );
          log(`${pointer} diagram grid ${cell.label} ${selection} done`);
        }
        writeMeasurement(name, record);
      }
      for (const selection of BAR_SELECTIONS) {
        for (const cell of SWEEP) {
          await page.setViewportSize({ width: cell.w, height: cell.h });
          await page.waitForTimeout(500);
          await applySelection(page, orgSlug, 'diagram', selection);
          await readCell(
            page,
            readings,
            { set: 'sweep', view: 'diagram', cell: cell.label, selection },
            'diagram',
            linkedTemplate,
          );
        }
        log(`${pointer} diagram sweep ${selection} done`);
        writeMeasurement(name, record);
      }

      // ── Row 580's four messages (Diagram): shipped as the product renders them, the group alone, and
      // the own-row treatment (A-prime's markup) with the group.
      for (const cell of MESSAGE_WIDTHS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(600);
        for (const selection of ['none', 'flagged-bar-selected'] as const) {
          await applySelection(page, orgSlug, 'diagram', selection);
          const meta = { set: 'messages', view: 'diagram', cell: cell.label, selection };
          readings.push({
            ...meta,
            message: 'none',
            mode: 'base',
            ...(await read(page, 'base')),
          });
          readings.push({
            ...meta,
            message: 'none',
            mode: 'base-grouped',
            ...(await readGrouped(page, 'base-grouped')),
          });
          for (const message of messageTemplates) {
            await injectStrip(page, message.template, message.sentence, 'shipped', 'diagram');
            await page.waitForTimeout(300);
            const shipped = await read(page, `${message.id}/shipped`);
            await removeStrip(page);
            readings.push({
              ...meta,
              message: message.id,
              sentence: message.sentence.text,
              mode: 'shipped',
              ...shipped,
            });
            await injectStrip(page, message.template, message.sentence, 'own-row', 'diagram');
            const ownRow = await readGrouped(page, `${message.id}/own-row`);
            await removeStrip(page);
            readings.push({
              ...meta,
              message: message.id,
              sentence: message.sentence.text,
              mode: 'own-row',
              ...ownRow,
            });
          }
        }
        await selectPlural(page, orgSlug);
        const bulkSel = '[data-testid="bulk-selection-bar"]';
        const bulkMeta = {
          set: 'messages',
          view: 'diagram',
          cell: cell.label,
          selection: 'plural',
          message: 'bulk-bar',
        };
        readings.push({ ...bulkMeta, mode: 'base', ...(await read(page, 'base-bulk')) });
        readings.push({
          ...bulkMeta,
          mode: 'base-grouped',
          ...(await readGrouped(page, 'base-bulk-grouped')),
        });
        const sentence = await page.evaluate(
          (sel) => document.querySelector(`${sel} > p`)?.textContent ?? '',
          bulkSel,
        );
        await reshapeBulk(page, 'shipped');
        await page.waitForTimeout(300);
        const bulkShipped = await read(page, 'bulk-bar/shipped', bulkSel);
        await restoreBulk(page);
        readings.push({ ...bulkMeta, sentence, mode: 'shipped', ...bulkShipped });
        await reshapeBulk(page, 'own-row');
        const bulkOwn = await readGrouped(page, 'bulk-bar/own-row', bulkSel);
        await restoreBulk(page);
        readings.push({ ...bulkMeta, sentence, mode: 'own-row', ...bulkOwn });
        log(`${pointer} messages ${cell.label} done`);
        writeMeasurement(name, record);
      }

      // ── 200 % text at 1024 x 600 by the root font size. The selection is made at 100 %, because the
      // listbox cannot take focus once the root is 200 %.
      const readAt200 = async (
        set: string,
        selection: Selection,
        view: 'diagram' | 'gantt',
      ): Promise<void> => {
        await readCell(
          page,
          readings,
          { set, view, cell: '1024x600@200%', selection },
          view,
          linkedTemplate,
        );
      };
      for (const selection of SELECTIONS) {
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
        await page.waitForTimeout(300);
        await applySelection(page, orgSlug, 'diagram', selection);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        await page.setViewportSize({ width: 1030, height: 600 });
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.waitForTimeout(600);
        await readAt200('text200-root', selection, 'diagram');
        log(`${pointer} text200 ${selection} done`);
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(400);
      writeMeasurement(name, record);

      // ── The same by the route a browser's own text-size setting takes (`Page.setFontSizes`, which moves
      // the rem media queries as well), then put back.
      const planUrl = page.url();
      const cdp: CDPSession = await page.context().newCDPSession(page);
      const setFonts = (px: number, fixed: number): Promise<unknown> =>
        cdp.send('Page.setFontSizes', {
          fontSizes: { standard: px, fixed, serif: px, sansSerif: px },
        } as never);
      const rootPx = (): Promise<number> =>
        page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      await page.setViewportSize({ width: 1024, height: 600 });
      await setFonts(32, 26);
      await page.goto(planUrl);
      if ((await rootPx()) !== 32) {
        await setFonts(32, 26);
        await page.reload();
      }
      expect(await rootPx()).toBe(32);
      await page.waitForTimeout(800);
      await ensurePen(page);
      await installRules(page);
      for (const selection of SELECTIONS) {
        await applySelection(page, orgSlug, 'diagram', selection);
        await readAt200('text200-browser', selection, 'diagram');
        log(`${pointer} text200cdp ${selection} done`);
      }
      await setFonts(16, 13);
      await page.goto(planUrl);
      if ((await rootPx()) !== 16) {
        await setFonts(16, 13);
        await page.reload();
      }
      expect(await rootPx()).toBe(16);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(800);
      await ensurePen(page);
      await installRules(page);
      writeMeasurement(name, record);

      // ── The Gantt: the grid, the sweep and 200 %. It cannot clear a selection, so it goes
      // selection-major, with `none` first from a selection cleared in the diagram.
      const clearButton = page
        .getByRole('button', { name: 'Clear selection', exact: true })
        .first();
      await diagramList(page).focus();
      await page.keyboard.press('Escape');
      if (await clearButton.isVisible()) await clearButton.click();
      await expect(page.locator('[role="toolbar"][aria-label^="Actions for"]')).toHaveCount(0);
      await showGantt(page);
      for (const selection of SELECTIONS) {
        await page.setViewportSize({ width: 1646, height: 1097 });
        await page.waitForTimeout(500);
        await applySelection(page, orgSlug, 'gantt', selection);
        for (const cell of GRID) {
          await page.setViewportSize({ width: cell.w, height: cell.h });
          await page.waitForTimeout(600);
          await readCell(
            page,
            readings,
            { set: 'grid', view: 'gantt', cell: cell.label, selection },
            'gantt',
            linkedTemplate,
          );
        }
        if (selection !== 'none') {
          for (const cell of SWEEP) {
            await page.setViewportSize({ width: cell.w, height: cell.h });
            await page.waitForTimeout(500);
            await readCell(
              page,
              readings,
              { set: 'sweep', view: 'gantt', cell: cell.label, selection },
              'gantt',
              linkedTemplate,
            );
          }
        }
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        await page.setViewportSize({ width: 1030, height: 600 });
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.waitForTimeout(600);
        await readAt200('text200-gantt', selection, 'gantt');
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
        log(`${pointer} gantt ${selection} done`);
        writeMeasurement(name, record);
      }

      // ── R3s: the facts widened (mouse only). An activity created through the API after the last
      // calculation is "Edited since it was last calculated" plus a Recalculate button once the page is
      // reloaded; nothing recalculates it. Then the same plan held in "Recalculating..." by a request
      // that is not answered until the readings are taken.
      if (pointer === 'fine') {
        await page.setViewportSize({ width: 1646, height: 1097 });
        await page.getByRole('button', { name: 'Diagram', exact: true }).click();
        await seedActivities(page, orgSlug, [{ name: 'Stale probe', laneIndex: 6 }]);
        await page.reload();
        await ensurePen(page);
        await installRules(page);
        await page.waitForTimeout(1500);
        const stateNow = await read(page, 'r3-state');
        record['r3State'] = factsOf(stateNow);
        for (const cell of FACTS_WIDTHS) {
          await page.setViewportSize({ width: cell.w, height: cell.h });
          await page.waitForTimeout(600);
          for (const selection of ['none', 'flagged-bar-selected'] as const) {
            await applySelection(page, orgSlug, 'diagram', selection);
            await readCell(
              page,
              readings,
              {
                set: 'r3s',
                view: 'diagram',
                cell: cell.label,
                selection,
                factsVariant: 'stale-real',
              },
              'diagram',
              linkedTemplate,
              FACTS_VARIANTS,
            );
            // The widest honest sentence, put in by text (a failed calculation with edits pending).
            const realText = await page.evaluate(() => {
              const span = document.querySelector('[data-schedule-state] > span.ml-auto > span');
              const before = span?.textContent ?? '';
              if (span) span.textContent = 'Could not calculate — 12 edits still pending';
              return before;
            });
            await readCell(
              page,
              readings,
              {
                set: 'r3s',
                view: 'diagram',
                cell: cell.label,
                selection,
                factsVariant: 'stale-widest-injected',
              },
              'diagram',
              linkedTemplate,
              FACTS_VARIANTS,
            );
            await page.evaluate((text: string) => {
              const span = document.querySelector('[data-schedule-state] > span.ml-auto > span');
              if (span) span.textContent = text;
            }, realText);
            log(`${pointer} facts ${cell.label} ${selection} done`);
          }
          writeMeasurement(name, record);
        }

        // "Recalculating...", really: the Recalculate button pressed with the request held.
        await page.setViewportSize({ width: 1280, height: 800 });
        await applySelection(page, orgSlug, 'diagram', 'none');
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route('**/schedule/recalculate', async (route) => {
          await gate;
          await route.continue();
        });
        await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
        await expect(page.locator('[data-schedule-state="recalculating"]')).toBeVisible({
          timeout: 10_000,
        });
        for (const cell of HELD_WIDTHS) {
          await page.setViewportSize({ width: cell.w, height: cell.h });
          await page.waitForTimeout(500);
          for (const selection of BAR_SELECTIONS) {
            await applySelection(page, orgSlug, 'diagram', selection);
            await readCell(
              page,
              readings,
              {
                set: 'held',
                view: 'diagram',
                cell: cell.label,
                selection,
                factsVariant: 'recalculating-held',
              },
              'diagram',
              linkedTemplate,
              HELD_VARIANTS,
            );
          }
          log(`${pointer} held ${cell.label} done`);
        }
        // Answer the held request, wait for the plan to settle, and only then take the route away:
        // unrouting with the handler still waiting makes its `continue()` fail on a handled route.
        release();
        await expect(page.locator('[data-schedule-state="current"]')).toBeVisible({
          timeout: 20_000,
        });
        await page.unroute('**/schedule/recalculate');
        writeMeasurement(name, record);
      }
      writeMeasurement(name, record);
      expect(readings.length).toBeGreaterThan(0);
    });
  });
}
