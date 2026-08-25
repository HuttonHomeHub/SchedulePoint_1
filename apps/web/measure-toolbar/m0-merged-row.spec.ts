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
 * **M0-T2 — the merged row's budget, from ink and in the WORST pen state.**
 *
 * Two defects in the superseded run, both of which flatter the merge:
 *
 * 1. **It reported tracks, not ink.** `identityParts[*].w` for the breadcrumb is a `flex-1` track
 *    (404 / 564 / 770 / 1044 px at the four widths), so "357 px is left for the plan name at 1440"
 *    was really "357 px is left for the whole breadcrumb block" — project crumb, separator, name,
 *    status badge and the Edit-plan pencil. The ~227 px figure it was compared against came from a
 *    different harness measuring a different string in a different epic.
 *
 * 2. **It measured ONE pen state, and it was the narrowest.** `recalculate` reloads and drops the
 *    pen, so the run captured `No one is editing this plan.` — one of only two shapes that are
 *    redundant with the button beside them. `resolveLockView` returns ten, and the widest is the
 *    admin case, which concatenates two sentences:
 *    `<First> is editing this plan. As an admin, you can take over editing.`
 *    A merged row costed against the narrowest of ten states is not a budget.
 *
 * **How the ten states are priced.** Driving all ten needs two peers, an expired lease and a
 * revoked pen, which is a fixture this task does not justify. Instead every sentence is taken from
 * `lockCopy` and rendered through `measureText` **in the pen element's own resolved font**, read off
 * the live page. That prices the text exactly; what it does NOT price is each state's surrounding
 * chrome (a second button, a countdown aside), so the cluster's non-text furniture is measured
 * separately in the state the harness can reach and reported as an addend rather than folded in.
 * Stated here because a number whose method is invisible gets quoted as if it were driven.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

/** A long-but-plausible construction plan name. Short names are how the last budget lied. */
const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

/**
 * Every sentence `resolveLockView` can put in the pen cluster, lifted from `lock-copy.ts`.
 * `Alexandra` stands in for a first name — longer than average, not absurd.
 */
const PEN_SENTENCES: Record<string, string> = {
  free: 'No one is editing this plan.',
  loading: 'Checking who’s editing this plan…',
  holding: 'You’re editing this plan.',
  expired: 'Alexandra was editing (inactive).',
  incomingRequest: 'Alexandra is asking to edit this plan.',
  heldByOther: 'Alexandra is editing this plan.',
  waitingForHandover: 'Requested — waiting for Alexandra to hand over.',
  canTakeOver: 'You can take over editing from Alexandra.',
  heldByOtherAdmin: 'Alexandra is editing this plan. As an admin, you can take over editing.',
  lostTakenOver: 'Editing control was taken over — you’re now read-only.',
  lostNotEditor: 'You’re not the current editor — take the pen to edit.',
};

test('M0-T2: the merged row from ink, priced against the widest pen state', async ({ page }) => {
  clearMeasurement('m0-merged-row');
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

  const report: Record<string, unknown> = { planName: PLAN_NAME };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    report[`${viewport.width}`] = await page.evaluate(
      ([sentences]) => {
        const round = (n: number): number => Math.round(n);
        const inkOf = (el: Element | null): number | null => {
          if (!el) return null;
          const tag = el.tagName;
          if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA')
            return round(el.getBoundingClientRect().width);
          const own = el.getBoundingClientRect().width;
          const leaves = [...el.querySelectorAll('*')].filter((d) => d.children.length === 0);
          const rects = leaves
            .map((d) => d.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0);
          if (rects.length === 0) return round(own);
          const union =
            Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
          // **A degenerate union means the leaves are not where the ink is.** The organisation
          // switcher reported 1 px twice — its visible text lives on a control whose leaf children
          // are zero-width decorations, so the union collapses. When the union is implausibly small
          // against the element's own box, the box IS the honest answer.
          return round(union < own * 0.2 ? own : union);
        };

        const header = document.querySelector('header');
        const modeToolbar = document.querySelector('[role="toolbar"][aria-label="Plan mode"]');
        // The identity row is the mode toolbar's nearest ancestor spanning most of the header.
        let identityRow: Element | null = modeToolbar;
        const target = (header?.getBoundingClientRect().width ?? 0) * 0.8;
        while (identityRow?.parentElement) {
          identityRow = identityRow.parentElement;
          if (identityRow.getBoundingClientRect().width > target) break;
        }

        // The pen cluster: the block holding one of the ten sentences.
        // **A LEAF element whose OWN text is the sentence.** The first version searched every
        // span/p/div and took the first match in document order — which is an ancestor of the whole
        // page, so it reported the entire UI (7,526 px) as the pen sentence and read the font off
        // the wrong element. Ancestors match a text test; only leaves carry the text.
        const penSentence = [...document.querySelectorAll('span,p,div')]
          .filter((el) => el.children.length === 0)
          .find((el) =>
            /(editing this plan|take over|hand over|current editor|was editing)/.test(
              (el.textContent ?? '').trim(),
            ),
          );
        const penCluster =
          penSentence?.closest('[role="status"]') ?? penSentence?.parentElement ?? null;

        // Price every sentence in the pen element's OWN resolved font, read off the live page.
        const font = penSentence
          ? (() => {
              const s = getComputedStyle(penSentence);
              return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} / ${s.lineHeight} ${s.fontFamily}`;
            })()
          : null;
        const ctx = document.createElement('canvas').getContext('2d');
        const penStates: Record<string, number> = {};
        if (ctx && font) {
          ctx.font = font;
          for (const [k, v] of Object.entries(sentences))
            penStates[k] = round(ctx.measureText(v).width);
        }
        const widestState = Object.entries(penStates).sort((a, b) => b[1] - a[1])[0] ?? null;
        const currentSentence = (penSentence?.textContent ?? '').trim();
        const currentTextWidth = ctx && font ? round(ctx.measureText(currentSentence).width) : null;

        // The cluster's non-text furniture: chip, button, gaps. Measured in the reachable state and
        // reported as an addend, never folded into the text figure.
        const penFurniture =
          penCluster && currentTextWidth !== null
            ? round((inkOf(penCluster) ?? 0) - currentTextWidth)
            : null;

        const breadcrumbBlock = identityRow?.children[0] ?? null;

        return {
          container: round(header?.getBoundingClientRect().width ?? 0),
          headerInk: inkOf(header?.firstElementChild ?? null),
          headerCells: [...(header?.firstElementChild?.children ?? [])].map((c) => ({
            text: (c.textContent ?? '').trim().slice(0, 20),
            track: round(c.getBoundingClientRect().width),
            ink: inkOf(c),
          })),
          breadcrumb: {
            track: breadcrumbBlock ? round(breadcrumbBlock.getBoundingClientRect().width) : null,
            ink: inkOf(breadcrumbBlock),
            text: (breadcrumbBlock?.textContent ?? '').trim().slice(0, 60),
          },
          modeCluster: inkOf(modeToolbar?.parentElement ?? null),
          modeToolbar: inkOf(modeToolbar),
          pen: {
            currentSentence,
            currentTextWidth,
            furniture: penFurniture,
            clusterInk: inkOf(penCluster),
            font,
            states: penStates,
            widestState: widestState ? { state: widestState[0], width: widestState[1] } : null,
          },
        };
      },
      [PEN_SENTENCES] as const,
    );
  }

  const path = writeMeasurement('m0-merged-row', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
