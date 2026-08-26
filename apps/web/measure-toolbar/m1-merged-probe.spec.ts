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
        const penCluster = penSentence?.closest('[role="status"]') ?? null;

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
        // The merged row's occupants, in the order a merged row would carry them.
        const occupants = [
          ...headerCells.slice(0, 1), // brand (+ the below-`lg` drawer trigger)
          identityBlock, // breadcrumb, status badge, Edit-plan pencil
          modeCluster, // `Mode` caption + the four mode buttons
          ...(penCluster ? [penCluster] : []), // pen badge + sentence + hand-off controls
          ...headerCells.slice(1), // organisation switcher, account chip
        ];

        // The same row with the pen's sentence removed and its badge and controls kept.
        const penWithoutSentence = penCluster?.cloneNode(true) as HTMLElement | null;
        if (penWithoutSentence && penSentence) {
          const clonedSentence = [...penWithoutSentence.querySelectorAll('span,p,div')]
            .filter((el) => el.children.length === 0 || el.querySelector('span[aria-hidden]'))
            .find((el) =>
              /(editing this plan|take over|hand over|current editor|was editing)/.test(
                (el.textContent ?? '').trim(),
              ),
            );
          // The sentence's own element is the `max-w-[22ch] truncate` wrapper, which is the
          // parent of the text node and the aria-hidden aside. Remove that whole wrapper.
          const wrapper = clonedSentence?.closest('span.truncate') ?? clonedSentence;
          wrapper?.remove();
        }
        const occupantsNoSentence = [
          ...headerCells.slice(0, 1),
          identityBlock,
          modeCluster,
          ...(penWithoutSentence ? [penWithoutSentence] : []),
          ...headerCells.slice(1),
        ];

        // The band's own row gaps: the header grid is `gap-4` (16), the identity row `gap-3` (12).
        // A merged row has to pick one; both are reported so the choice is priced rather than
        // assumed.
        const container = round(header.getBoundingClientRect().width);
        const ctx = document.createElement('canvas').getContext('2d');
        let sentenceOnScreen: number | null = null;
        let widestSentence: number | null = null;
        if (ctx && penSentence) {
          const s = getComputedStyle(penSentence);
          ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} / ${s.lineHeight} ${s.fontFamily}`;
          sentenceOnScreen = round(ctx.measureText((penSentence.textContent ?? '').trim()).width);
          widestSentence = round(ctx.measureText(widest).width);
        }

        const at = (gap: number) => ({
          gap,
          withSentence: requiredWidth(occupants, gap),
          withoutSentence: requiredWidth(occupantsNoSentence, gap),
        });

        // **Two controls, and they are what makes the merged figure believable.** A probe that
        // reports only the number under test cannot be checked: 1482 px is either the truth or an
        // over-count, and nothing in the reading says which. So the same instrument is pointed at
        // the two rows that are ON SCREEN RIGHT NOW. Their required widths can be compared against
        // the same container by a reader who can see whether those rows are truncating.
        const controls = {
          headerRowToday: requiredWidth(headerCells, 16),
          identityRowToday: requiredWidth(
            [identityBlock, modeCluster, ...(penCluster ? [penCluster] : [])],
            12,
          ),
        };

        // Per-occupant, so a trim can be priced against the thing it would cut rather than guessed.
        const perOccupant = {
          brand: requiredWidth(headerCells.slice(0, 1), 0),
          identity: requiredWidth([identityBlock], 0),
          mode: requiredWidth([modeCluster], 0),
          pen: penCluster ? requiredWidth([penCluster], 0) : null,
          penNoSentence: penWithoutSentence ? requiredWidth([penWithoutSentence], 0) : null,
          orgSwitcher: headerCells[1] ? requiredWidth([headerCells[1]], 0) : null,
          account: headerCells[2] ? requiredWidth([headerCells[2]], 0) : null,
        };

        return {
          container,
          occupantCount: occupants.length,
          sentenceOnScreen,
          widestSentence,
          gap12: at(12),
          gap16: at(16),
          controls,
          perOccupant,
        };
      },
      [WIDEST_SENTENCE] as const,
    );
  }

  const path = writeMeasurement('m1-merged-probe', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
