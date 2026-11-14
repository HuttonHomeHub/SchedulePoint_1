import { type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';
import { openShare } from '../e2e-support/toolbar';

import { onboard, openNewPlan, recalculatePlan, seedActivities } from './support';

/**
 * **M0 of `docs/specs/guest-activity-details/` — measure the hint row before building on it
 * (ADR-0142).** Not a feature journey: it takes readings the plan's stop rule is written against.
 *
 * The shared page reserves one 20 px line above the diagram for the instruction. The planned change
 * puts a selected activity's facts in that line (subject plus Start, Finish, Total float, Progress,
 * Status). That is only free if the line does not make the diagram shorter, so this injects a
 * stand-in of the final markup in the instruction's place and reads, for each viewport and each
 * pointer: the canvas height, the row's height, whether the line wrapped, and whether anything is
 * cut off or scrolls sideways.
 *
 * **Machine-independent by construction.** Every assertion is an equality or an inequality between
 * two readings taken on the same machine in the same run (canvas height with and without the
 * stand-in; a child inside its row; scroll width against the viewport). No pixel figure is
 * asserted. The readings themselves are attached to the report as JSON so they can be read off the report (`--reporter=json` or the HTML report) and copied into
 * `docs/specs/guest-activity-details/m0-measurement.md`.
 *
 * **The stand-in is inline-styled** because Tailwind emits only the utilities the source already
 * uses, and `min-h-5` / `gap-y-0` may not be in the bundle yet; the inline values are the same
 * declarations M1's markup will carry (`text-xs`, `min-h-5`, `flex-wrap`, `gap-y-0`, nowrap facts).
 *
 * **Stop rule (plan, M0):** if a 40-character name changes the canvas height at 1024 x 600 on
 * either pointer, stop and put the readings to the owner. A wrap past 40 characters is the accepted
 * cost (ADR-0184: a name is never cut), recorded here and not refused.
 */

const NAME_LENGTHS = [10, 20, 40, 80] as const;
// The longest activity name in a catalogue plan (65 characters; packages/seed, the Logic catalogue
// entry). `docs/TEST_PLAYBOOK.md` names no activity that long, so this is the seed's own plan name,
// used here as the realistic upper bound a planner actually types.
const CATALOGUE_LONGEST = 'Logic: redundant links across calendars and between the same pair';

const VIEWPORTS = [
  { name: '1024x600', width: 1024, height: 600 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '320x720', width: 320, height: 720 },
] as const;

const POINTERS = [
  { name: 'mouse', hasTouch: false },
  { name: 'finger', hasTouch: true },
] as const;

interface Reading {
  canvasHeight: number;
  rowHeight: number;
  lineHeight: number;
  wrapped: boolean;
  cutOff: boolean;
  pageScrollWidth: number;
  viewportWidth: number;
}

function standInName(length: number): string {
  return `${'Pour slab '.repeat(Math.ceil(length / 10)).slice(0, length - 1)}x`;
}

/** Baseline: the instruction as it stands, nothing selected. */
async function readInstruction(
  page: Page,
): Promise<Pick<Reading, 'canvasHeight' | 'rowHeight'> & { lineHeight: number }> {
  return page.evaluate(() => {
    const hint = [...document.querySelectorAll('p')].find((p) =>
      (p.textContent ?? '').startsWith('Drag to pan'),
    );
    const canvas = document.querySelector('section[aria-label="Time-scaled logic diagram"] canvas');
    if (!hint?.parentElement || !canvas)
      throw new Error('the instruction row or canvas is missing');
    return {
      canvasHeight: canvas.getBoundingClientRect().height,
      rowHeight: hint.parentElement.getBoundingClientRect().height,
      lineHeight: hint.getBoundingClientRect().height,
    };
  });
}

/** Swap the instruction for a stand-in of the final markup, read, then put the instruction back. */
async function readStandIn(page: Page, name: string, baselineLine: number): Promise<Reading> {
  return page.evaluate(
    ({ subject, baseline }) => {
      const hint = [...document.querySelectorAll('p')].find((p) =>
        (p.textContent ?? '').startsWith('Drag to pan'),
      );
      const canvas = document.querySelector(
        'section[aria-label="Time-scaled logic diagram"] canvas',
      );
      const row = hint?.parentElement;
      if (!hint || !row || !canvas) throw new Error('the instruction row or canvas is missing');

      const dl = document.createElement('dl');
      dl.setAttribute('aria-label', 'Selected activity');
      dl.style.cssText =
        'display:flex;flex-wrap:wrap;align-items:baseline;column-gap:0.75rem;row-gap:0;' +
        'min-height:1.25rem;margin:0;font-size:0.75rem;line-height:1rem;';
      const add = (label: string | null, value: string, strong: boolean): void => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;gap:0.25rem;white-space:nowrap;';
        if (label !== null) {
          const dt = document.createElement('dt');
          dt.textContent = label;
          dt.style.opacity = '0.7';
          item.append(dt);
        }
        const dd = document.createElement('dd');
        dd.textContent = value;
        dd.style.cssText = `margin:0;${strong ? 'font-weight:600;white-space:normal;' : ''}`;
        item.append(dd);
        // The subject may wrap (ADR-0184); every fact is nowrap.
        if (strong) item.style.whiteSpace = 'normal';
        dl.append(item);
      };
      add(null, `${subject}, A1020`, true);
      add('Start', '3 Mar 2026', false);
      add('Finish', '14 Mar 2026', false);
      add('Total float', '4 d · Near-critical', false);
      add('Progress', '40%', false);
      add('Status', 'In progress', false);

      hint.style.display = 'none';
      row.insertBefore(dl, hint);
      const dlRect = dl.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const cutOff =
        dl.scrollWidth > dl.clientWidth + 1 ||
        dlRect.right > window.innerWidth + 1 ||
        dlRect.left < -1 ||
        [...dl.children].some((c) => {
          const r = c.getBoundingClientRect();
          return r.right > dlRect.right + 1 || r.left < dlRect.left - 1;
        });
      const reading: Reading = {
        canvasHeight: canvas.getBoundingClientRect().height,
        rowHeight: rowRect.height,
        lineHeight: dlRect.height,
        wrapped: dlRect.height > baseline + 1,
        cutOff,
        pageScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
      dl.remove();
      hint.style.display = '';
      return reading;
    },
    { subject: name, baseline: baselineLine },
  );
}

test('the hint row takes the selected activity facts without costing the diagram height (M0)', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await holdThePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Excavate', laneIndex: 0, durationDays: 3 }]);
  await recalculatePlan(page, orgSlug);

  await openShare(page);
  const dialog = page.getByRole('dialog', { name: 'Share links' });
  await dialog.getByLabel('Label').fill('Hint row measurement');
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const shareUrl = await dialog.getByLabel('Guest link').inputValue();

  const readings: Record<string, unknown> = {};
  const names = [
    ...NAME_LENGTHS.map((n) => ({ label: `${String(n)} chars`, text: standInName(n) })),
    { label: 'catalogue longest (65 chars)', text: CATALOGUE_LONGEST },
  ];

  for (const pointer of POINTERS) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: pointer.hasTouch,
      });
      const guest = await context.newPage();
      await guest.goto(shareUrl);
      await expect(guest.getByRole('option', { name: /Excavate/ })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        guest.locator('section[aria-label="Time-scaled logic diagram"] canvas').first(),
      ).toBeVisible();

      // The finger leg is only a finger leg if the browser says so; a mouse reading filed under
      // "finger" would be the inherited-claim failure this suite exists to avoid.
      const coarse = await guest.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
      expect(coarse, `${pointer.name}: (pointer: coarse)`).toBe(pointer.hasTouch);

      const baseline = await readInstruction(guest);
      const key = `${pointer.name} ${viewport.name}`;
      const perName: Record<string, Reading> = {};
      for (const entry of names) {
        const reading = await readStandIn(guest, entry.text, baseline.lineHeight);
        perName[entry.label] = reading;

        // Always: nothing cut off, nothing scrolls sideways (WCAG 1.4.10 at 320).
        expect(reading.cutOff, `${key} ${entry.label}: nothing cut off`).toBe(false);
        expect(
          reading.pageScrollWidth,
          `${key} ${entry.label}: no sideways scroll`,
        ).toBeLessThanOrEqual(reading.viewportWidth + 4);
      }

      // The first name length at which the line wraps, for the record (not asserted).
      let firstWrap: number | null = null;
      for (let length = 10; length <= 120; length += 5) {
        const r = await readStandIn(guest, standInName(length), baseline.lineHeight);
        if (r.wrapped) {
          firstWrap = length;
          break;
        }
      }

      readings[key] = { baseline, firstWrapAtNameLength: firstWrap, perName };

      if (viewport.width >= 1024) {
        // The `min-h-5` premise: the facts line is the instruction line's height when it does not
        // wrap, so selecting cannot grow or shrink the row.
        const short = perName['10 chars'];
        if (!short) throw new Error('missing the 10-character reading');
        expect(short.wrapped, `${key}: a 10-character name does not wrap`).toBe(false);
        expect(short.lineHeight, `${key}: facts line equals the instruction line`).toBe(
          baseline.lineHeight,
        );
        expect(short.rowHeight, `${key}: the row keeps its height`).toBe(baseline.rowHeight);
        expect(short.canvasHeight, `${key}: the diagram keeps its height`).toBe(
          baseline.canvasHeight,
        );
      }

      if (viewport.name === '1024x600') {
        // THE STOP RULE: a 40-character name must not change the diagram's height.
        const forty = perName['40 chars'];
        if (!forty) throw new Error('missing the 40-character reading');
        expect(
          forty.canvasHeight,
          `STOP RULE ${key}: a 40-character name changes the canvas height`,
        ).toBe(baseline.canvasHeight);
      }

      await context.close();
    }
  }

  await testInfo.attach('hint-row-readings.json', {
    body: JSON.stringify(readings, null, 2),
    contentType: 'application/json',
  });
});
