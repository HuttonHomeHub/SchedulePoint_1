import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **The control-height inventory** — M0-T1 of `docs/specs/touch-and-control-height/`, the one
 * artefact every later decision in that epic reads from.
 *
 * It answers a question no instrument in this repository can answer today: **what height does each
 * pointer target actually render at, under each pointer type, on every surface a touch user
 * reaches.** `docs/UX_STANDARDS.md` publishes ≥ 44 px, `DESIGN_SYSTEM.md:453` says ≥ 24 px
 * preferring 44, and `DESIGN_SYSTEM.md:113` publishes a scale whose default is 36 — three
 * statements, and nothing has ever measured which one the product obeys.
 *
 * **It lives in `measure-toolbar/` while its subject is product-wide**, and that is a knowing
 * compromise rather than a muddle: `combobox-coarse.spec.ts` is already a non-toolbar harness in
 * this directory, so this follows the existing precedent, and reusing the directory means **no new
 * Playwright config** — which is also what keeps M0 outside ADR-0105's config trigger, so the
 * measurement can run before the epic's first surface-adding milestone.
 *
 * **The sweep is inherited verbatim from `e2e-workspace-fit/command-surface.spec.ts:73-106`**, not
 * rewritten: one pass over `button, a, [role=button], input`, never per-`[data-toolbar-item]`.
 * ADR-0110 D5 records why that distinction is the whole ballgame — a split button spreads
 * `data-toolbar-item` onto its PRIMARY button and its caret is a sibling, so a per-item sweep
 * reported green over a control shipping at 23 × 36. A second implementation of this sweep would
 * drift from the gate it is meant to inform, which is the ADR-0065 argument.
 *
 * **The `matchMedia` assertion is not optional and runs before anything is measured.** Playwright's
 * `hasTouch` is a *fixture option*: it configures the page the fixture builds, and does not reach a
 * page built by `browser.newPage()` elsewhere. A fixture option silently not applying yields a
 * green run about nothing — this register's most frequently recorded failure shape — so a run that
 * cannot prove which pointer it measured **throws** rather than reporting a verdict it cannot
 * justify (the rule `combobox-coarse.spec.ts` earned by producing two plausible numbers about the
 * wrong element).
 *
 * **What it does NOT cover**, inherited from `combobox-coarse.spec.ts` rather than re-litigated:
 * a real platform picker (Chromium renders its own), a virtual keyboard taking half the viewport,
 * and any engine other than Chromium (`docs/TECH_DEBT.md` #25a). It measures geometry, which is
 * the half a desk cannot see; how a control *feels* under a thumb stays a judgement for the
 * specialist reviewers M4 names.
 *
 * Asserts no product property — it is a harness (ADR-0081 §3). The only things it throws on are its
 * own integrity: the wrong pointer, or a named surface that rendered nothing.
 */

interface Target {
  surface: string;
  id: string;
  tag: string;
  w: number;
  h: number;
  visible: boolean;
  reachable: boolean;
  /** Whether the rendered height traces to `var(--control-h*)` or to a literal — what M2's
   * structural test needs in order to know which call sites the token actually governs. */
  cssHeightSource: string;
  /**
   * What `elementFromPoint` returned when it was not the control — **absent when reachable**.
   *
   * Added at M3 rather than at M0, because M0's report said only that two plan-header controls at
   * 390 were unreachable and every diagnosis then needed a second, hand-written run to ask what
   * was on top of them. An instrument that can detect a defect and cannot describe it makes its
   * own finding expensive to act on, which is how a finding gets deferred.
   */
  hitBy?: string;
  /** Viewport-relative position, reported ONLY when unreachable — where it actually is. */
  at?: string;
}

/** WCAG 2.2 §2.5.8 Target Size (Minimum), AA. 44 is §2.5.5 AAA and is the HOUSE rule, not this. */
const MIN_TARGET = 24;
const HOUSE_TARGET = 44;

/**
 * Sweep every pointer target under `root`. Inherited from `command-surface.spec.ts`; the only
 * additions are `surface` (this harness spans many) and `cssHeightSource`.
 */
async function sweep(page: Page, surface: string, root: string): Promise<Target[]> {
  return page.evaluate(
    ({ surface: s, root: rootSelector }) => {
      const host = document.querySelector(rootSelector);
      if (!host) return [];
      const out: Target[] = [];
      const all = [
        ...host.querySelectorAll('button,a,[role="button"]'),
        ...host.querySelectorAll('input'),
      ];
      for (const el of all) {
        const item = el.closest('[data-toolbar-item]');
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0;
        let reachable = false;
        let hitBy: string | undefined;
        if (visible) {
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          reachable = hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
          if (!reachable) {
            // Enough to find it in the source: tag, id/class, and the accessible name if it has
            // one. A bare "unreachable" sends the reader back to the browser.
            hitBy = hit
              ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}` +
                `${typeof hit.className === 'string' && hit.className ? `.${hit.className.split(/\s+/).slice(0, 6).join('.')}` : ''}` +
                `${hit.getAttribute('aria-label') ? ` [${hit.getAttribute('aria-label')}]` : ''}`
              : '(nothing — the point is outside the viewport)';
          }
        }
        // Which declaration produced the height.
        //
        // **The obvious comparison is wrong and the first run shipped it.** `getPropertyValue`
        // returns the custom property's *declared text* (`2.25rem`) while `height` is resolved
        // (`36px`), so `cs.height === cs.getPropertyValue('--control-h')` can never match and
        // reports `governedByToken: 0` for the whole product — a plausible number about nothing,
        // and it would have been read as "the token governs nothing", which is a design finding
        // rather than a typo. The token is therefore RESOLVED against a probe in the element's own
        // subtree, so inherited overrides of `--control-h` are honoured.
        const cs = getComputedStyle(el);
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--control-h)';
        (el.parentElement ?? document.body).appendChild(probe);
        const tokenPx = getComputedStyle(probe).height;
        probe.remove();
        const source =
          tokenPx !== 'auto' && cs.height === tokenPx
            ? `--control-h(${tokenPx})`
            : tokenPx !== 'auto' && cs.minHeight === tokenPx
              ? `--control-h:min(${tokenPx})`
              : `literal:${cs.height || 'auto'}/min=${cs.minHeight || 'auto'} (token=${tokenPx})`;
        out.push({
          surface: s,
          id:
            item?.getAttribute('data-toolbar-item') ??
            el.getAttribute('aria-label') ??
            (el.textContent ?? '').trim().slice(0, 28) ??
            '(unnamed)',
          tag: el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          visible,
          reachable,
          cssHeightSource: source,
          ...(hitBy ? { hitBy, at: `${Math.round(r.left)},${Math.round(r.top)}` } : {}),
        });
      }
      return out;
    },
    { surface, root },
  );
}

/** The pointer self-check. Throws rather than measuring the wrong geometry silently. */
async function assertPointer(page: Page, expected: 'coarse' | 'fine'): Promise<void> {
  const actual = await page.evaluate(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  if (actual !== expected) {
    throw new Error(
      `control-heights: asked for a ${expected} pointer and the page reports ${actual}. ` +
        `Playwright's hasTouch is a fixture option and does not reach a page built elsewhere — ` +
        `measuring on would produce a plausible number about the wrong thing.`,
    );
  }
}

/** The surfaces a touch user reaches. Each one must render targets or the run says so. */
const SURFACES: ReadonlyArray<{ name: string; root: string; optional?: boolean }> = [
  { name: 'command-deck', root: '[role="toolbar"][aria-label="Plan commands"]' },
  { name: 'plan-header', root: 'header' },
  { name: 'explorer', root: '[data-panel-border]' },
  { name: 'workspace-foot', root: '[data-plan-foot-row]', optional: true },
];

async function inventory(page: Page, pointer: 'coarse' | 'fine', width: number, height: number) {
  await assertPointer(page, pointer);
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(250);
  const rows: Target[] = [];
  for (const s of SURFACES) {
    const found = await sweep(page, s.name, s.root);
    if (found.length === 0 && !s.optional) {
      throw new Error(
        `control-heights: surface "${s.name}" (${s.root}) rendered no targets at ` +
          `${width}x${height} ${pointer} — a list assembled by reading is not a list derived by ` +
          `running (#188's own finding about itself).`,
      );
    }
    rows.push(...found);
  }
  return rows;
}

function summarise(rows: readonly Target[]) {
  const shown = rows.filter((r) => r.visible);
  const heights = [...new Set(shown.map((r) => r.h))].sort((a, b) => a - b);
  return {
    targets: rows.length,
    visible: shown.length,
    distinctHeights: heights,
    belowWcagAA: shown.filter((r) => r.h < MIN_TARGET || r.w < MIN_TARGET).length,
    belowHouse44: shown.filter((r) => r.h < HOUSE_TARGET).length,
    unreachable: shown.filter((r) => !r.reachable).map((r) => `${r.surface}/${r.id}`),
    governedByToken: shown.filter((r) => r.cssHeightSource.startsWith('--control-h')).length,
  };
}

/**
 * A real plan with one activity, through the real journey. The seed is NOT wrapped in a `catch`:
 * a swallowed failure here would produce an inventory of an empty workspace that looks like an
 * inventory of a populated one, which is the "green run about nothing" this harness's own
 * `assertPointer` exists to prevent, one step earlier.
 */
async function openPlan(page: Page, stamp: number): Promise<void> {
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, 'Control heights');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 8 }]);
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`${pointer} pointer`, () => {
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M0-T1 — control-height inventory (${pointer})`, async ({ page }) => {
      test.setTimeout(300_000);
      const name = `m0-control-heights-${pointer}`;
      clearMeasurement(name);
      await openPlan(page, Date.now() + (pointer === 'coarse' ? 21 : 22));

      // 1646 is the product owner's Surface Pro (2880x1920 at 175%), the width ADR-0091's
      // retrospective established this product is judged at. 390x844 is the phone the
      // narrow-shell journey uses, so the two harnesses frame the same device set.
      const wide = await inventory(page, pointer, 1646, 1097);
      const narrow = await inventory(page, pointer, 390, 844);

      writeMeasurement(name, {
        pointer,
        wcagAAFloor: MIN_TARGET,
        houseRule: HOUSE_TARGET,
        contexts: {
          '1646x1097': { summary: summarise(wide), targets: wide },
          '390x844': { summary: summarise(narrow), targets: narrow },
        },
      });
      expect(wide.length).toBeGreaterThan(0);
    });
  });
}
