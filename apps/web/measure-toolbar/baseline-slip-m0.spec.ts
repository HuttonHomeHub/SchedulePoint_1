import { expect, test, type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import { footFigures, selectInList } from '../e2e-workspace-chrome/follow-logic-support';
import {
  createHierarchy,
  diagramList,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Baseline slip M0 — what "3 working days later than baseline" costs the bottom bar** (ADR-0142:
 * a remedy is measured before it is built; `docs/specs/baseline-slip-and-pinned-names/` section 4.3).
 *
 * The stop rule is in the plan and was written before this file: if the fact costs the diagram height
 * (or adds a dock line) in any state on a MOUSE at 1024 x 768 or larger, or at 1024 x 600 with nothing
 * selected, M2 stops. The finger cells are recorded and never gating (ADR-0216 D6).
 *
 * **Machine-independent by construction.** Nothing here is a pixel figure compared with a constant:
 * every verdict is the same cell read twice on the same machine, with and without the fact, and the
 * three checks are equalities or containment: the diagram's height and the dock's line count are
 * unchanged, every box is inside the box that holds it, every button answers a pointer at its centre,
 * and the page does not scroll sideways. The raw figures go to the JSON for the owner to read.
 *
 * **The fact is injected, by cloning the real Finish fact**, for the reason `cq3-facts-chip.spec.ts`
 * records (a hand-styled probe measures the probe): the clone carries the real classes, font and gap.
 * Once M2 ships the real fact the same spec still works: where the page already carries a
 * `[data-baseline-slip]` fact, the absent reading hides it and the present reading retexts it to
 * the worst case, so one harness reads today's code and M2's. (A real fact is never moved to the
 * population row, so that cell is not read on M2's code.)
 *
 * The worst realistic text is a two-digit slip with its unit: ADR-0097 Landing C's harness proceeded
 * on a 37 px name where the real worst case was 227 px.
 *
 * The non-vacuity controls throw rather than report a reassuring zero: a dock that holds nothing
 * cannot show a wrapped line, so each selected or armed state first proves it is populated.
 */
const SLIP_TEXT = '12 working days earlier than baseline';

const WINDOWS = [
  { width: 1024, height: 600 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
] as const;

type Placement = 'absent' | 'dates' | 'population';

interface Reading {
  foot: number;
  stage: number;
  canvas: number | null;
  dockHeight: number;
  dockLines: number;
  factsHeight: number;
  factBox: { inside: boolean; width: number; shown: boolean; real: boolean } | null;
  unpressable: string[];
  outsideFoot: string[];
  pageSideways: boolean;
  footSideways: boolean;
}

type Step = 'apply' | 'measure' | 'clear';

async function step(page: Page, which: Step, placement: Placement): Promise<Reading | null> {
  return page.evaluate(
    ({ stepName, where, text }) => {
      const ID = 'slip-m0-injected';
      if (stepName !== 'measure') document.getElementById(ID)?.remove();
      const round = (n: number): number => Math.round(n * 10) / 10;

      const list = document.querySelector<HTMLElement>('[data-plan-fact-list]');
      if (!list) throw new Error('slip m0: the facts list could not be located');
      const rows = [...list.children] as HTMLElement[];
      const finish = list.querySelector<HTMLElement>('[aria-label^="Finish:"]');
      if (!finish) throw new Error('slip m0: the Finish fact could not be located');
      const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
      const stage = document.querySelector<HTMLElement>(
        'section[aria-label="Time-scaled logic diagram"]',
      );
      const outlet = foot?.querySelector<HTMLElement>('div[class*="not-empty:min-w-"]');
      if (!foot || !stage || !outlet) throw new Error('slip m0: the foot row is not on screen');

      const real = list.querySelector<HTMLElement>('[data-baseline-slip]');
      if (stepName === 'clear') {
        if (real) real.style.display = '';
        return null;
      }
      if (stepName === 'apply') {
        if (real) {
          if (where === 'absent') {
            real.style.display = 'none';
          } else {
            real.style.display = '';
            real.innerHTML = `<span class="sr-only">Finish: </span>${text}`;
          }
        } else if (where !== 'absent') {
          const target = rows[where === 'dates' ? 0 : 1];
          if (!target) throw new Error(`slip m0: fact row for ${where} could not be located`);
          const clone = finish.cloneNode(true) as HTMLElement;
          clone.id = ID;
          clone.removeAttribute('aria-label');
          const [labelEl, valueEl] = [...clone.children] as HTMLElement[];
          if (!labelEl || !valueEl)
            throw new Error('slip m0: the cloned fact has an unexpected shape');
          // The slip is one sentence, not a label and a value: drop the label span and its gap.
          labelEl.remove();
          valueEl.textContent = text;
          target.appendChild(clone);
        }
        return null;
      }
      if (real && where === 'population') return null;
      const fact: HTMLElement | null =
        document.getElementById(ID) ?? (real && real.style.display !== 'none' ? real : null);

      const listBox = list.getBoundingClientRect();
      const footBox = foot.getBoundingClientRect();
      const inside = (inner: DOMRect, outer: DOMRect): boolean =>
        inner.left >= outer.left - 1 &&
        inner.right <= outer.right + 1 &&
        inner.top >= outer.top - 1 &&
        inner.bottom <= outer.bottom + 1;

      const buttons = [...foot.querySelectorAll<HTMLElement>('button')].filter(
        (b) => b.getBoundingClientRect().width > 0 && getComputedStyle(b).visibility !== 'hidden',
      );
      const unpressable: string[] = [];
      const outsideFoot: string[] = [];
      for (const b of buttons) {
        const box = b.getBoundingClientRect();
        const name = b.getAttribute('aria-label') ?? (b.textContent ?? '').trim().slice(0, 40);
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (!top || !b.contains(top)) unpressable.push(name);
        if (!inside(box, footBox)) outsideFoot.push(name);
      }

      const lineTops = new Set(
        [...outlet.querySelectorAll<HTMLElement>('button, p')]
          .filter((el) => el.getBoundingClientRect().height > 0)
          .map((el) => Math.round(el.getBoundingClientRect().top)),
      );
      const canvas = document.querySelector('canvas');
      const scrolling = document.scrollingElement ?? document.documentElement;

      const result = {
        foot: round(footBox.height),
        stage: round(stage.getBoundingClientRect().height),
        canvas: canvas ? round(canvas.getBoundingClientRect().height) : null,
        dockHeight: round(outlet.getBoundingClientRect().height),
        dockLines: lineTops.size,
        factsHeight: round(listBox.height),
        factBox: fact
          ? {
              inside: inside(fact.getBoundingClientRect(), listBox) && inside(listBox, footBox),
              width: round(fact.getBoundingClientRect().width),
              // A yielded fact is `sr-only`, a 1 px box: shown means it takes room in the row.
              shown: fact.getBoundingClientRect().width > 2,
              real: real !== null,
            }
          : null,
        unpressable,
        outsideFoot,
        pageSideways: scrolling.scrollWidth > scrolling.clientWidth,
        footSideways: foot.scrollWidth > foot.clientWidth,
      };
      return result;
    },
    { stepName: which, where: placement, text: SLIP_TEXT },
  );
}

/**
 * Wait until the geometry stops changing. The toolbar promotes what fits from its own observer
 * (ADR-0185), so a reading taken straight after a resize or an injection can catch it half-way: the
 * first M0 run's "stage got TALLER with the fact" cells were that, not the fact.
 */
async function settle(page: Page): Promise<void> {
  let previous = '';
  let same = 0;
  for (let i = 0; i < 40 && same < 4; i += 1) {
    await page.waitForTimeout(120);
    const now = await page.evaluate(() => {
      const foot = document.querySelector('[data-activities-bar]');
      const stage = document.querySelector('section[aria-label="Time-scaled logic diagram"]');
      return `${String(foot?.getBoundingClientRect().height)}|${String(stage?.getBoundingClientRect().height)}|${String(document.querySelector('[data-activities-bar]')?.querySelectorAll('button, p').length)}`;
    });
    same = now === previous ? same + 1 : 0;
    previous = now;
  }
  if (same < 4) throw new Error('slip m0: the layout never settled, so no reading is trustworthy');
}

/** Apply, let the page settle WITH the fact (as a user would see it), read, put it back, settle. */
async function read(page: Page, placement: Placement): Promise<Reading | null> {
  await step(page, 'apply', placement);
  await settle(page);
  const reading = await step(page, 'measure', placement);
  await step(page, 'clear', placement);
  await settle(page);
  return reading;
}

interface Cell {
  state: string;
  window: string;
  pointer: string;
  gating: boolean;
  absent: Reading;
  dates: Reading;
  population: Reading | null;
  datesFree: boolean;
  populationFree: boolean | null;
  datesIntact: boolean;
  reproducible: boolean;
  /** `probe`: no baseline, the fact injected. `real`: an active baseline, the shipped fact. */
  phase: string;
  /** The real fact (M2 code) took room in the row; false when it yielded. Null: injected probe. */
  slipShown: boolean | null;
}

const free = (a: Reading, b: Reading): boolean =>
  a.stage === b.stage && a.canvas === b.canvas && a.dockLines === b.dockLines;

const intact = (r: Reading): boolean =>
  (r.factBox?.shown === false || r.factBox?.inside === true) &&
  r.unpressable.length === 0 &&
  r.outsideFoot.length === 0 &&
  !r.pageSideways;

async function cell(
  page: Page,
  state: string,
  size: { width: number; height: number },
  pointer: 'mouse' | 'finger',
): Promise<Cell> {
  await page.setViewportSize(size);
  await settle(page);
  const absent = await read(page, 'absent');
  const dates = await read(page, 'dates');
  const population = await read(page, 'population');
  // The control the first run lacked: the same cell with the fact absent, read again, must agree
  // with the first reading, or the two readings were not taken from one state.
  const absentAgain = await read(page, 'absent');
  if (!absent || !dates || !absentAgain) throw new Error('slip m0: a reading could not be taken');
  const reproducible = free(absent, absentAgain);
  expect(dates.factBox, `${state} ${String(size.width)}: the fact did not render`).not.toBeNull();
  if (!dates.factBox) throw new Error('unreachable');
  const gating =
    pointer === 'mouse' &&
    ((size.width >= 1024 && size.height >= 768) || (size.height === 600 && state === 'nothing'));
  return {
    state,
    window: `${String(size.width)}x${String(size.height)}`,
    pointer,
    gating,
    absent,
    dates,
    population,
    datesFree: free(absent, dates),
    populationFree: population ? free(absent, population) : null,
    datesIntact: intact(dates),
    reproducible,
    phase: '',
    slipShown: dates.factBox.real ? dates.factBox.shown : null,
  };
}

for (const { pointer, touch } of [
  { pointer: 'mouse', touch: false },
  { pointer: 'finger', touch: true },
] as const) {
  test.describe(`baseline slip M0, ${pointer}`, () => {
    test.use({ hasTouch: touch });

    test('the slip fact against the foot row, in each gating state', async ({ page }) => {
      test.setTimeout(900_000);
      clearMeasurement(`baseline-slip-m0-${pointer}`);

      await page.setViewportSize({ width: 1366, height: 768 });
      const orgSlug = await onboard(page, Date.now() + (touch ? 1 : 0));
      await createHierarchy(page);
      await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
      await holdThePen(page);
      await seedActivities(page, orgSlug, [
        { name: 'Dig footings', laneIndex: 0, durationDays: 12 },
        { name: 'Steel frame', laneIndex: 1, durationDays: 18 },
        { name: 'Pour slab', laneIndex: 2, durationDays: 9 },
      ]);
      await recalculate(page, orgSlug);
      await holdThePen(page);
      await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(touch);

      const cells: Cell[] = [];
      const populated = async (state: string): Promise<void> => {
        const figures = await footFigures(page);
        const dock = await page.evaluate(
          () =>
            document
              .querySelector('[data-activities-bar] div[class*="not-empty:min-w-"]')
              ?.getBoundingClientRect().height ?? 0,
        );
        expect(
          dock,
          `${state}: the dock is empty, so its reading would be vacuous`,
        ).toBeGreaterThan(0);
        expect(figures.foot).toBeGreaterThan(0);
      };
      let phase = 'probe';
      const sweep = async (state: string): Promise<void> => {
        for (const size of WINDOWS)
          cells.push({ ...(await cell(page, state, size, pointer)), phase });
      };
      const clear = async (): Promise<void> => {
        await diagramList(page).focus();
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('toolbar', { name: /^Actions for / })).toHaveCount(0);
        await expect(page.getByTestId('bulk-selection-bar')).toHaveCount(0);
      };

      const sequence = async (staleName: string): Promise<void> => {
        await page.setViewportSize(WINDOWS[0]);
        await expect(page.locator('[data-schedule-state="current"]')).toBeVisible();
        await sweep('nothing');

        await selectInList(page, orgSlug, 'Steel frame');
        await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
        await populated('single selection');
        await sweep('single selection');
        await clear();

        await diagramList(page).focus();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+ArrowDown');
        await expect(page.getByTestId('bulk-selection-bar')).toContainText(/^2 selected/);
        await populated('plural selection');
        await sweep('plural selection');
        await clear();

        await page
          .getByRole('toolbar', { name: 'Plan commands' })
          .getByRole('button', { name: 'Select', exact: true })
          .click();
        await expect(page.getByText(/^Marquee select/).first()).toBeVisible();
        await page.waitForTimeout(250);
        await populated('armed Select');
        await sweep('armed Select');
        await page.keyboard.press('Escape');

        // A stale schedule sentence, the widest thing the facts row ever carries beside the facts: an
        // activity created after the last calculation, then a reload (the dock.spec.ts route).
        await holdThePen(page);
        await seedActivities(page, orgSlug, [{ name: staleName, laneIndex: 3 }]);
        await page.reload();
        await holdThePen(page);
        await expect(page.locator('[data-schedule-state="stale"]')).toBeVisible({
          timeout: 20_000,
        });
        await sweep('stale schedule sentence');
        await selectInList(page, orgSlug, 'Steel frame');
        await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
        await sweep('stale schedule sentence with a selection');
      };

      // Phase 1: no baseline, so the fact is the injected probe, and it is NOT yielded: this is what
      // the fact would cost if it never stepped aside (the reading that fired the stop rule).
      await sequence('Late addition');

      // Phase 2: an active baseline, so the plan shows the shipped fact with its yield. Recalculate
      // first so the plan is current, capture, and read the same states again.
      await holdThePen(page);
      await recalculate(page, orgSlug);
      await holdThePen(page);
      const planId = openPlanId(page);
      await page.evaluate(
        async ({ org, id }: { org: string; id: string }) => {
          const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/baselines`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Contract Baseline' }),
          });
          if (!response.ok) throw new Error(`capture baseline ${String(response.status)}`);
        },
        { org: orgSlug, id: planId },
      );
      await page.reload();
      await holdThePen(page);
      await expect(page.locator('[data-baseline-slip]')).toHaveCount(1, { timeout: 20_000 });
      phase = 'real';
      await sequence('Late addition two');

      const real = cells.filter((c) => c.phase === 'real');
      const stops = real.filter((c) => c.gating && (!c.datesFree || !c.datesIntact));
      // On M2's code (the real fact) the rule is "shown when it fits, yielded when it would cost":
      // every cell must read the same twice, and the idle cells, where nothing else is on the row,
      // must actually show it, or "free" would be true because the fact was never there.
      const unreproducible = cells.filter((c) => !c.reproducible);
      const hiddenWhenIdle = real.filter((c) => c.state === 'nothing' && c.slipShown === false);
      writeMeasurement(`baseline-slip-m0-${pointer}`, {
        slipText: SLIP_TEXT,
        rule:
          'STOP iff, on a mouse at 1024 x 768 or larger, or at 1024 x 600 with nothing selected, the fact ' +
          'changes the diagram height or the dock line count, cuts anything off, makes a button ' +
          'unpressable or scrolls the page sideways. Finger cells are recorded, not gating (ADR-0216 D6).',
        cells,
        gatingFailures: stops.map((c) => `${c.state} ${c.window}`),
        unreproducible: unreproducible.map((c) => `${c.state} ${c.window}`),
        hiddenWhenIdle: hiddenWhenIdle.map((c) => `${c.state} ${c.window}`),
      });
      for (const c of cells) {
        console.warn(
          `${pointer} ${c.phase} ${c.state} ${c.window}${c.gating ? ' [gating]' : ''}: ` +
            `dates ${c.datesFree ? 'FREE' : 'COSTS'}${c.slipShown === null ? '' : c.slipShown ? ' (shown)' : ' (yielded)'}, population ${
              c.populationFree === null ? 'n/a' : c.populationFree ? 'FREE' : 'COSTS'
            }, intact ${String(c.datesIntact)}, stage ${String(c.absent.stage)} -> ${String(c.dates.stage)}, ` +
            `dockLines ${String(c.absent.dockLines)} -> ${String(c.dates.dockLines)}`,
        );
      }
      expect(
        unreproducible.map((c) => `${c.state} ${c.window}`),
        'the same cell read twice with the fact absent must agree, or the readings are confounded',
      ).toEqual([]);
      expect(
        hiddenWhenIdle.map((c) => `${c.state} ${c.window}`),
        'the fact must be shown when nothing else is on the row',
      ).toEqual([]);
      expect(
        stops.map((c) => `${c.state} ${c.window}`),
        'M0 stop rule: the fact costs the diagram, or breaks the bar, in a gating cell',
      ).toEqual([]);
    });
  });
}
