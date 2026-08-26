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
 * **Can the command deck fit on one line, and what would it cost?**
 *
 * The product owner asked for View, Find and Plan on one line with Author moved to the canvas foot.
 * Measured card widths (identical at 1440/1646/1920, so the cards are content-sized): View 638,
 * Find 662, Author 608, Plan 674. Three of them plus two gaps is **1998 px against an 1862 px
 * container at 1920 — 136 px over.** Every three-card combination overflows.
 *
 * **The obvious source of that 136 px was named wrongly and this probe exists to replace a guess
 * with a number.** It was proposed as "finish ADR-0090 M2-T6's unshipped caption-gutter deletion" —
 * but that item was about ROW captions in the two-row `Toolbar`, a layout ADR-0109 D1 deleted. The
 * deck's captions are a different thing entirely: each is a focusable disclosure button that folds
 * its group and holds a roving tab stop, and `Deck.tsx` records turning the card on its side
 * specifically to spend the caption's WIDTH instead of its height, taking the deck 170 → 112 px.
 * Deleting them removes a feature and reverses a measured decision.
 *
 * So this measures what they cost, so the alternatives can be priced against something real:
 *   - each caption's own box, per card, and what the buttons beside it need;
 *   - the three header sections the product owner asked for, so the centred-middle design can be
 *     checked against the widths it would actually get;
 *   - the free width in the Activities handle row, which is where Author would go and which
 *     ADR-0092 reserved for transient strips.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
];

const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

test('M0: the deck cards, the header sections, and the handle row', async ({ page }) => {
  clearMeasurement('m4-one-line-deck');
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
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const report: Record<string, unknown> = { planName: PLAN_NAME };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    report[`${viewport.width}`] = await page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const w = (el: Element | null | undefined): number =>
        el ? round(el.getBoundingClientRect().width) : 0;

      const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      const cards = [...(deck?.querySelectorAll(':scope > [role="group"]') ?? [])];

      const cardRows = cards.map((card) => {
        const caption = card.querySelector('[data-toolbar-item^="caption:"]');
        const controls = [...card.children].filter((c) => c !== caption);
        // The card's own chrome: its border and padding, i.e. what is left once the caption and the
        // controls block are subtracted. Priced because a card that loses its caption does not lose
        // this, and a plan that assumes it does over-counts the saving.
        const controlsWidth = controls.reduce((sum, c) => sum + w(c), 0);
        return {
          caption: (caption?.textContent ?? '').trim(),
          cardWidth: w(card),
          captionWidth: w(caption),
          controlsWidth,
          chrome: w(card) - w(caption) - controlsWidth,
        };
      });

      // The header's three prospective sections, as the product owner described them.
      const header = document.querySelector('header');
      const headerChildren = [...(header?.firstElementChild?.children ?? [])];
      const identityBlock = document.querySelector('[data-plan-identity]');
      const modeToolbar = document.querySelector('[role="toolbar"][aria-label="Plan mode"]');
      const penCluster = document.querySelector('[data-plan-pen]');

      /** What a row REQUIRES: every child at natural width, gaps counted once, nothing shrunk. */
      const required = (nodes: Element[], gapPx: number): number => {
        const host = header?.parentElement ?? document.body;
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;top:-9999px;left:0;display:flex;align-items:center;width:max-content;gap:${gapPx}px;`;
        for (const n of nodes) probe.appendChild(n.cloneNode(true));
        host.appendChild(probe);
        const out = round(probe.offsetWidth);
        probe.remove();
        return out;
      };

      const brand = headerChildren[0] ?? null;
      const trailing = headerChildren[2] ?? null;
      const sections = {
        // 1. logo + name + breadcrumb
        one: brand && identityBlock ? required([brand, identityBlock], 12) : null,
        // 2. mode + editing
        two:
          modeToolbar?.parentElement && penCluster
            ? required([modeToolbar.parentElement, penCluster], 12)
            : null,
        // 3. org selector + avatar
        three: trailing ? required([trailing], 0) : null,
        container: w(header),
      };

      // The Activities handle row — where Author would go, and ADR-0092's dock.
      const handleRow = [...document.querySelectorAll('div')].find((d) => {
        const t = (d.textContent ?? '').trim();
        return t.startsWith('Activities') && t.includes('New activity') && d.children.length <= 6;
      });
      const handle = handleRow
        ? {
            width: w(handleRow),
            childrenWidth: [...handleRow.children].reduce((s, c) => s + w(c), 0),
            free: w(handleRow) - [...handleRow.children].reduce((s, c) => s + w(c), 0),
            text: (handleRow.textContent ?? '').trim().slice(0, 60),
          }
        : null;

      return {
        deckContainer: w(deck),
        cards: cardRows,
        totals: {
          allFourPlusGaps: cardRows.reduce((s, c) => s + c.cardWidth, 0) + 3 * 12,
          threeWithoutAuthor:
            cardRows.filter((c) => c.caption !== 'Author').reduce((s, c) => s + c.cardWidth, 0) +
            2 * 12,
          captionsTotal: cardRows.reduce((s, c) => s + c.captionWidth, 0),
        },
        sections,
        handle,
      };
    });
  }

  const path = writeMeasurement('m4-one-line-deck', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
