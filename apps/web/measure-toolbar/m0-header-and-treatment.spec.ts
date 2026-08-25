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
 * **M0 for the three post-release complaints** (product owner, 2026-08-25, on `web-v0.103.0`):
 * the header sits on two rows and must fit on one; the Activities handle row and the status bar
 * look combinable; and the toolbars' label baselines alternate.
 *
 * Written because this repository's most-repeated finding is that a width expectation is wrong —
 * six consecutive epics, always in the same direction — and because the merge in question has
 * already been withdrawn TWICE on measurement (ADR-0092 M5, ADR-0097 D1). Reasoning about it a
 * third time is not a plan.
 *
 * **The plan name is the trap this harness exists to avoid.** ADR-0097 Landing C's harness used a
 * 37 px name, reported 307 px of slack and returned a PROCEED; a real name measures ~227 px. So
 * this drives a deliberately long one and reports the breadcrumb's own width separately, letting
 * the reader see its contribution rather than inheriting it silently.
 *
 * **The inline-everything figure is a DOM PROBE, not a build.** It strips the stacked geometry off
 * the deck's `ToolbarButton`s at measure time and re-reads the row. That is honest about what it
 * is: it proves the geometry's cost, and it cannot prove that a real implementation would look the
 * same, because a real one would also have to decide where a split button's caret goes.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

/** Long on purpose. See the docblock — a short name is how the last harness lied. */
const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

test('M0: header merge budget, bottom bands, and the toolbar label treatment', async ({ page }) => {
  clearMeasurement('m0-header-and-treatment');
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORTS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, PLAN_NAME);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    { name: 'Blind and reinforce', laneIndex: 2, durationDays: 16 },
  ]);
  await recalculate(page, orgSlug);
  await expect(page.getByRole('toolbar', { name: 'Plan mode' })).toBeVisible();

  const report: Record<string, unknown> = { planName: PLAN_NAME };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    report[`${viewport.width}`] = await page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const box = (el: Element | null): { w: number; h: number } | null =>
        el
          ? {
              w: round(el.getBoundingClientRect().width),
              h: round(el.getBoundingClientRect().height),
            }
          : null;

      // ── Row 1: the app header. Its three cells are the grid's direct children.
      const header = document.querySelector('header');
      const headerCells = header
        ? [...(header.firstElementChild?.children ?? [])].map((c) => ({
            text: (c.textContent ?? '').trim().slice(0, 24),
            w: round(c.getBoundingClientRect().width),
            // The cell is a grid track; what matters for a merge is the INK inside it.
            ink: round(
              [...c.querySelectorAll('*')]
                .filter((d) => d.children.length === 0 && (d.textContent ?? '').trim() !== '')
                .reduce((max, d) => Math.max(max, d.getBoundingClientRect().right), 0) -
                Math.min(
                  ...[...c.children].map((d) => d.getBoundingClientRect().left),
                  c.getBoundingClientRect().right,
                ),
            ),
          }))
        : [];
      const headerInk = headerCells.reduce((sum, c) => sum + Math.max(0, c.w), 0);

      // ── Row 2: the identity/mode row — located by the toolbar it contains, never by class.
      const modeToolbar = document.querySelector('[role="toolbar"][aria-label="Plan mode"]');
      let identityRow: Element | null = modeToolbar;
      while (identityRow && identityRow.parentElement) {
        const p: Element = identityRow.parentElement;
        if (p.getBoundingClientRect().width > (header?.getBoundingClientRect().width ?? 0) * 0.8) {
          identityRow = p;
          break;
        }
        identityRow = p;
      }
      const identityParts = identityRow
        ? [...identityRow.children].map((c) => ({
            text: (c.textContent ?? '').trim().slice(0, 40),
            w: round(c.getBoundingClientRect().width),
          }))
        : [];
      const identityInk = identityParts.reduce((s, p) => s + p.w, 0);

      // ── The pen cluster's two redundant parts, by their own text.
      const allSpans = [...document.querySelectorAll('span,p,div')];
      const penSentence = allSpans.find((el) =>
        /^(No one is editing this plan\.|You're editing this plan\.)$/.test(
          (el.textContent ?? '').trim(),
        ),
      );
      const availableChip = allSpans.find(
        (el) => (el.textContent ?? '').trim() === 'Available' && el.children.length === 0,
      );
      const wordmark = allSpans.find(
        (el) => (el.textContent ?? '').trim() === 'SchedulePoint' && el.children.length === 0,
      );
      const breadcrumb = identityParts[0]?.w ?? 0;

      // ── The two bottom bands.
      // `[data-activities-bar]` is the collapsed rail's own hook. The first version of this probe
      // looked for `[aria-label="Activities panel"]`, which only exists EXPANDED, and reported
      // `null` — an absence that reads exactly like "there is no such row".
      const collapsedBar = document.querySelector('[data-activities-bar]');
      const expandedPanel = document.querySelector('[aria-label="Activities panel"]');
      const handleRow = collapsedBar ?? expandedPanel?.firstElementChild ?? null;
      const statusBar =
        [...document.querySelectorAll('*')].find(
          (el) =>
            /Data date/.test(el.textContent ?? '') &&
            el.children.length > 1 &&
            el.getBoundingClientRect().height > 0 &&
            el.getBoundingClientRect().height < 60,
        ) ?? null;

      // ── The deck's items: width, height, and whether the label stacks under the icon.
      const items = [...document.querySelectorAll('[data-toolbar-item]')].map((el) => {
        const r = el.getBoundingClientRect();
        const stacked = getComputedStyle(el).flexDirection === 'column';
        // The label's own top edge — the number the eye is actually tracking.
        const label = [...el.querySelectorAll('span')].filter(
          (s) => s.children.length === 0 && (s.textContent ?? '').trim() !== '',
        );
        const labelTop =
          label.length > 0 ? round(label[label.length - 1]!.getBoundingClientRect().top) : null;
        return {
          id: el.getAttribute('data-toolbar-item'),
          w: round(r.width),
          h: round(r.height),
          stacked,
          labelTop,
        };
      });
      const stackedItems = items.filter((i) => i.stacked);
      const inlineItems = items.filter((i) => !i.stacked);
      const labelTops = [...new Set(items.map((i) => i.labelTop).filter((t) => t !== null))].sort();

      return {
        viewport: window.innerWidth,
        header: { box: box(header), cells: headerCells, ink: headerInk },
        identity: { box: box(identityRow), parts: identityParts, ink: identityInk, breadcrumb },
        redundancy: {
          penSentence: penSentence ? round(penSentence.getBoundingClientRect().width) : null,
          availableChip: availableChip ? round(availableChip.getBoundingClientRect().width) : null,
          wordmark: wordmark ? round(wordmark.getBoundingClientRect().width) : null,
        },
        bottomBands: {
          activitiesHandleRow: box(handleRow),
          activitiesRowCollapsed: collapsedBar !== null,
          statusBar: box(statusBar),
          // The duplicated word, counted rather than asserted.
          activitiesWordOccurrences: [...document.querySelectorAll('span,h2,dt,dd')].filter(
            (el) => el.children.length === 0 && (el.textContent ?? '').trim() === 'Activities',
          ).length,
        },
        treatment: {
          total: items.length,
          stacked: stackedItems.length,
          inline: inlineItems.length,
          distinctLabelTops: labelTops.length,
          labelTops,
          stackedMeanW: stackedItems.length
            ? round(stackedItems.reduce((s, i) => s + i.w, 0) / stackedItems.length)
            : null,
          inlineMeanW: inlineItems.length
            ? round(inlineItems.reduce((s, i) => s + i.w, 0) / inlineItems.length)
            : null,
          maxItemH: items.reduce((m, i) => Math.max(m, i.h), 0),
        },
        items,
      };
    });
  }

  // ── The inline-everything probe, at the width this product is judged at.
  await page.setViewportSize(VIEWPORTS[1]!);
  await page.waitForTimeout(600);
  report.inlineProbe = await page.evaluate(() => {
    const round = (n: number): number => Math.round(n);
    const deck = document.querySelector('[data-toolbar-item]')?.closest('[class*="flex"]')
      ?.parentElement?.parentElement;
    const before = {
      deckH: deck ? round(deck.getBoundingClientRect().height) : null,
      itemsW: [...document.querySelectorAll('[data-toolbar-item]')].reduce(
        (s, el) => s + el.getBoundingClientRect().width,
        0,
      ),
    };
    // Strip the stacked geometry. This is the probe, and it is a probe: a real implementation
    // would also have to place a split button's caret, which this cannot answer.
    const stacked = [...document.querySelectorAll('[data-toolbar-item]')].filter(
      (el) => getComputedStyle(el).flexDirection === 'column',
    );
    for (const el of stacked) {
      (el as HTMLElement).style.setProperty('flex-direction', 'row', 'important');
      (el as HTMLElement).style.setProperty('height', '2.25rem', 'important');
      (el as HTMLElement).style.setProperty('gap', '0.375rem', 'important');
      (el as HTMLElement).style.setProperty('align-items', 'center', 'important');
    }
    void document.body.offsetHeight;
    const after = { deckH: deck ? round(deck.getBoundingClientRect().height) : null };
    const afterW = [...document.querySelectorAll('[data-toolbar-item]')].reduce(
      (s, el) => s + el.getBoundingClientRect().width,
      0,
    );
    const tops = [
      ...new Set(
        [...document.querySelectorAll('[data-toolbar-item]')]
          .map((el) => {
            const label = [...el.querySelectorAll('span')].filter(
              (s) => s.children.length === 0 && (s.textContent ?? '').trim() !== '',
            );
            return label.length
              ? round(label[label.length - 1]!.getBoundingClientRect().top)
              : null;
          })
          .filter((t) => t !== null),
      ),
    ].sort();
    return {
      converted: stacked.length,
      deckHeightBefore: before.deckH,
      deckHeightAfter: after.deckH,
      itemsWidthBefore: round(before.itemsW),
      itemsWidthAfter: round(afterW),
      distinctLabelTopsAfter: tops.length,
      labelTopsAfter: tops,
    };
  });

  const path = writeMeasurement('m0-header-and-treatment', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
