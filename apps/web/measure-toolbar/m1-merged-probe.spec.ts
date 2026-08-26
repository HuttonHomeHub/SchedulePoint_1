import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **M0-T3 — does the merged row FIT? A shrink-to-fit probe, not an arithmetic one.**
 *
 * `m0-merged-row.spec.ts` prices each occupant's ink and leaves the reader to add them up. That
 * answered "how much content is there" and deliberately did not answer "does it fit", because
 * **inter-element gaps were never measured** — `falsification.md` says so in its own Result section
 * and calls every figure there a best case. At 1440 the arithmetic leaves **46 px** of headroom over
 * the +120 px bar, which a handful of flex gaps would take.
 *
 * Its own hypothesis 3 named the remedy: _"if measured gaps turn out to dominate the occupant ink,
 * then this whole per-occupant approach is the wrong frame and the honest instrument is a
 * shrink-to-fit probe instead."_ This is that probe.
 *
 * **How it works, and why it is more honest than adding numbers up.** It builds the merged row from
 * the REAL occupant nodes — cloned out of the live page, mounted back inside the band so every
 * ancestor-dependent style (the `[data-surface]` scope, the band's own padding, the toolbar band
 * provider) resolves exactly as it does in the product — and sets the probe row to
 * `width: max-content`. Its `offsetWidth` is then the width that row REQUIRES: every child at its
 * natural width, every flex gap counted once, nothing shrunk and nothing truncated. Compared
 * against the container, that is the fit question asked directly rather than reconstructed.
 *
 * **Two readings per width**, because the decision under test is a re-scope:
 *
 * - `withSentence` — every occupant, the pen sentence included.
 * - `withoutSentence` — the pen's live-region sentence removed and its badge and hand-off controls
 *   kept, which is the shape the product owner approved: only the **sentence** moves to the status
 *   bar, because in eight of ten lock states it is the only thing naming who holds the pen, and
 *   `EditLockControls` must stay reachable beside the plan (ADR-0028).
 *
 * **What it still does not measure.** The pen sentence on screen during the run is whichever state
 * the harness can reach, not the widest of ten (`heldByOtherAdmin`, 432 px, which needs two peers
 * and a revoked lease to drive). So `withSentence` understates the worst case by the difference
 * between the two, which is reported as `sentenceOnScreen` rather than folded in silently.
 * `withoutSentence` is unaffected — removing a node removes whatever width it had.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

/** The same long-but-plausible name `m0-merged-row` uses. Short names are how the last budget lied. */
const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

/** The widest of the ten lock sentences (`lock-copy.ts`), priced in the pen element's own font. */
const WIDEST_SENTENCE = 'Alexandra is editing this plan. As an admin, you can take over editing.';

test('M0-T3: the merged row, probed shrink-to-fit at four widths', async ({ page }) => {
  clearMeasurement('m1-merged-probe');
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORTS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, PLAN_NAME);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan mode' })).toBeVisible();

  const report: Record<string, unknown> = { planName: PLAN_NAME, widestSentence: WIDEST_SENTENCE };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    report[`${viewport.width}`] = await page.evaluate(
      ([widest]) => {
        const round = (n: number): number => Math.round(n);

        const header = document.querySelector('header');
        const modeToolbar = document.querySelector('[role="toolbar"][aria-label="Plan mode"]');
        const identityBlock = document.querySelector('[data-plan-identity]');
        if (!header || !modeToolbar || !identityBlock) return { error: 'occupants not found' };

        // The pen cluster is the live region holding one of the ten sentences.
        const penSentence = [...document.querySelectorAll('span,p,div')]
          .filter((el) => el.children.length === 0)
          .find((el) =>
            /(editing this plan|take over|hand over|current editor|was editing)/.test(
              (el.textContent ?? '').trim(),
            ),
          );
        // **The CONTROLS cluster, located by its own attribute — not by the sentence.** Until
        // 2026-08-26 this line read `penSentence?.closest('[role="status"]')`, which was right only
        // while the sentence and the controls were one element. The moment M1 portalled the sentence
        // to the plan's facts row, that expression resolved to the sentence's new home and the
        // merged-row figure came back 166 px lighter — because it no longer contained the pen at
        // all. An instrument that changes subject at precisely the change it exists to measure is
        // worse than no instrument, and this is the third time in this file (`inkOf` twice, now
        // this) that the thing being measured was not the thing named.
        const penCluster = document.querySelector('[data-plan-pen]');

        const headerGrid = header.firstElementChild;
        const modeCluster = modeToolbar.parentElement;
        if (!headerGrid || !modeCluster) return { error: 'containers not found' };

        // **Mounted inside the band, not in a detached document.** A clone measured outside its
        // ancestors resolves different styles — the surface scope, the band padding and the
        // toolbar band provider are all ancestor facts — and would report a width the product
        // never has.
        const host = header.parentElement ?? header;

        /**
         * Compose one row from the given nodes and return the width it REQUIRES.
         *
         * `width: max-content` is the whole instrument: it makes every child take its natural
         * width and counts each gap exactly once, so the result is "what this row needs", not
         * "what it was given". `position: absolute` keeps the probe out of the band's own layout
         * so mounting it cannot move the thing being measured.
         */
        const requiredWidth = (nodes: Element[], gapPx: number): number => {
          const probe = document.createElement('div');
          probe.style.cssText = `position:absolute;top:-9999px;left:0;display:flex;align-items:center;width:max-content;gap:${gapPx}px;`;
          for (const n of nodes) probe.appendChild(n.cloneNode(true));
          host.appendChild(probe);
          const w = probe.offsetWidth;
          probe.remove();
          return round(w);
        };

        const headerCells = [...headerGrid.children];
        const container = round(header.getBoundingClientRect().width);

        /**
         * **The composed hypothetical row is GONE, and its removal is the honest move.**
         *
         * Until M2 this probe built a merged row out of occupants that lived on two different rows,
         * because there was no merged row to measure. There is one now — and the composition became
         * a **double count** the moment there was: `headerCells[1]` is the identity slot, and the
         * identity block, the mode cluster and the pen cluster are all *inside* it, so adding them
         * beside it counted each one twice. It still returned a plausible number (1482, four pixels
         * off the truth by luck), which is exactly the kind of reading that gets quoted.
         *
         * What is measured instead is the row itself: what it requires, and what it is doing.
         */
        const headerRowRequired = requiredWidth(headerCells, 12);

        const ctx = document.createElement('canvas').getContext('2d');
        let sentenceOnScreen: number | null = null;
        let widestSentence: number | null = null;
        if (ctx && penSentence) {
          const s = getComputedStyle(penSentence);
          ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} / ${s.lineHeight} ${s.fontFamily}`;
          sentenceOnScreen = round(ctx.measureText((penSentence.textContent ?? '').trim()).width);
          widestSentence = round(ctx.measureText(widest).width);
        }

        // **The control that makes the figure checkable.** The identity block's own required width,
        // against the same container, by a reader who can see whether the plan name is truncating.
        const controls = {
          identityRowToday: requiredWidth(
            [identityBlock, modeCluster, ...(penCluster ? [penCluster] : [])],
            12,
          ),
        };

        // Per-occupant, so a trim can be priced against the thing it would cut rather than guessed.
        //
        // **The header row's children are listed by position and labelled with their own text**,
        // not mapped to fixed names. The first version named them `brand` / `orgSwitcher` /
        // `account` for the `1fr auto 1fr` grid that used to be here — and when M2 replaced that
        // grid with a wrapping flex row of `[brand] [identity slot] [org + account]`, the same
        // indices came back under the same names and reported the **identity slot** as
        // `orgSwitcher: 1063`. Plausible, wrong, and nothing in the reading said so. Third time
        // this harness has been caught measuring one thing under another thing's name.
        const perOccupant = {
          headerChildren: headerCells.map((c, i) => ({
            index: i,
            text: (c.textContent ?? '').trim().slice(0, 24),
            required: requiredWidth([c], 0),
          })),
          identity: requiredWidth([identityBlock], 0),
          mode: requiredWidth([modeCluster], 0),
          pen: penCluster ? requiredWidth([penCluster], 0) : null,
        };

        /**
         * **The LIVE row, not a clone.** Everything above prices what the row would need; this reads
         * what the shipped row is doing right now — its height, and how many lines that is. It is
         * the reading the journey asserts and the only one that can catch a wrap that does not
         * happen (a surviving `flex-1`) or one that happens where it should not.
         *
         * A line is the row's own `items-center` line box, so the count is derived from the
         * tallest child rather than from a constant: a fixed 56 would be an assumption about
         * padding that the `min-h-14 py-1` on the band makes false.
         */
        const headerRow = header.firstElementChild as HTMLElement | null;
        const tallestChild = headerRow
          ? Math.max(
              0,
              ...[...headerRow.children].map(
                (c) => (c as HTMLElement).getBoundingClientRect().height,
              ),
            )
          : 0;
        const live = headerRow
          ? {
              height: round(headerRow.getBoundingClientRect().height),
              tallestChild: round(tallestChild),
              lines:
                tallestChild > 0
                  ? Math.round(headerRow.getBoundingClientRect().height / tallestChild)
                  : null,
            }
          : null;

        /**
         * **Where a wrapping merged row actually breaks to two lines.**
         *
         * ADR-0109 D1's principle — a surface wraps, it never hides — is the alternative to a
         * breakpoint, and it has the property a breakpoint cannot: it degrades where the content
         * says, not where a constant says. This finds that width by sweeping the probe's own box
         * and watching its height, rather than deriving it from the 1482 px figure — because the
         * derivation assumes every occupant is unshrinkable, and one of them (the identity block)
         * is not.
         *
         * Every occupant is pinned `flex: none` for this reading, which is what makes it a wrap
         * measurement rather than a shrink measurement: with today's `flex-1 min-w-0` on the
         * identity block nothing wraps at all — the plan name truncates towards nothing while the
         * row stays one line.
         */
        const wrapBreakWidth = (nodes: Element[], gapPx: number): number | null => {
          const probe = document.createElement('div');
          probe.style.cssText = `position:absolute;top:-9999px;left:0;display:flex;flex-wrap:wrap;align-items:center;gap:${gapPx}px;`;
          for (const n of nodes) {
            const clone = probe.appendChild(n.cloneNode(true)) as HTMLElement;
            clone.style.flex = 'none';
          }
          host.appendChild(probe);
          probe.style.width = '4000px';
          const oneLine = probe.offsetHeight;
          let broke: number | null = null;
          for (let w = 2000; w >= 900; w -= 10) {
            probe.style.width = `${w}px`;
            if (probe.offsetHeight > oneLine) {
              broke = w;
              break;
            }
          }
          probe.remove();
          return broke;
        };

        return {
          container,
          headerChildCount: headerCells.length,
          sentenceOnScreen,
          widestSentence,
          headerRowRequired,
          wrapPoint: wrapBreakWidth(headerCells, 12),
          controls,
          perOccupant,
          live,
        };
      },
      [WIDEST_SENTENCE] as const,
    );
  }

  const path = writeMeasurement('m1-merged-probe', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
