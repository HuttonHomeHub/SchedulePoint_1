import { expect, test, type Page } from '@playwright/test';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **ADR-0097 Landing C, M0** — does a single menu-bar band fit at 1646?
 *
 * `command-surface.md` §6 writes the falsification condition **before** the measurement, which is
 * the one discipline three toolbar epics converged on after being wrong four times running:
 *
 * > If the band does not fit at 1646 with **≥ 120 px of slack**, this proposal is withdrawn and the
 * > fourth-fitting option returns.
 *
 * §3.1's arithmetic rests on **two estimates** and labels them as such — "five labelled menu
 * triggers ~425 px" and "eight icon-only commands + gaps ~285 px". This replaces both with
 * readings, and it does so **without building the band**, because building it first and measuring
 * afterwards is how a proposal survives its own falsification condition.
 *
 * **The method, and its one assumption, stated.** Every term below is read off the shipped product
 * in a real browser at the real width in the real typeface:
 *
 * - A **proposed menu trigger** is priced from the REAL labelled triggers the toolbar already
 *   renders (`View ▾`, `Analysis ▾`, `Share & export ▾`, …). Each gives a box width and a
 *   visible-text width measured with its own computed font; the difference is that trigger's
 *   chrome. The assumption is that chrome is **constant across triggers**, and it is not assumed —
 *   the spread is reported, and the verdict is computed at the **min and max** as well as the
 *   median, so a wide spread shows up as a range of slacks rather than being averaged away.
 *
 *   **A trigger is identified by `aria-haspopup`, not by "it paints text".** The first run took
 *   every labelled item and got a 40–65 px spread, because that set includes the two segmented
 *   controls' halves (`mode-early`, `view-gantt` …) and the `finish-chip` read-out — none of which
 *   is a menu trigger and none of which carries a caret. Pricing a menu from a segment is pricing
 *   the wrong control.
 * - The **strip** is priced from the real icon-only controls the toolbar already renders, at their
 *   real widths and their real inter-item gap, read from adjacent bounding boxes rather than from
 *   a class name.
 * - **Identity, reduced** is re-measured here rather than taken from ADR-0092 M0: the plan name and
 *   its badge, with the breadcrumb path and the pen badge/sentence excluded by measuring the parts
 *   that stay rather than subtracting the parts that go.
 *
 *   **The plan is created with a realistically long name**, because the first run used `Logic` —
 *   five characters, 37 px — and `command-surface.md` §5 risk 2 is *"165 px of slack is thin, and a
 *   long plan name eats it"*. Measuring the one term that risk is about at its most favourable
 *   value would answer a question nobody asked.
 * - The **mode switches** and the **pen button** are read whole, because they survive unchanged.
 *
 * Asserts nothing about the outcome; it is a harness (ADR-0081 §3). The gate is a number in the
 * report, which a person reads and acts on.
 */
const WIDTHS = [1920, 1646, 1440, 1280, 1024, 768];

/** The five triggers §3 proposes, in the registry's own group order. */
const PROPOSED_MENUS = ['Plan', 'Edit', 'View', 'Insert', 'Analyse'];

/** §6's falsification condition, at the product owner's width. */
const GATE = { width: 1646, minSlackPx: 120 };

async function measureBand(page: Page): Promise<unknown> {
  return page.evaluate(
    ({ proposed }: { proposed: string[] }) => {
      const round = (n: number): number => Math.round(n);
      const box = (el: Element): DOMRect => el.getBoundingClientRect();

      /** The visible text of a node, skipping `sr-only` and `aria-hidden` subtrees. */
      const visibleText = (node: Element): string => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text = '';
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const parent = n.parentElement;
          if (!parent) continue;
          if (parent.closest('.sr-only, [aria-hidden="true"]')) continue;
          text += n.textContent ?? '';
        }
        return text.trim();
      };

      const textWidth = (text: string, font: string): number | null => {
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx || typeof ctx.measureText !== 'function' || !text) return null;
        ctx.font = font;
        return round(ctx.measureText(text).width);
      };

      const items = [
        ...document.querySelectorAll<HTMLElement>('[role="toolbar"] [data-toolbar-item]'),
      ].filter((el) => el.getAttribute('data-toolbar-item') !== '__overflow__');

      // ---- 1. The real labelled triggers, and what a label costs beyond its text ---------------
      //
      // A trigger is an item that PAINTS text. Whether it opens a menu is irrelevant to width, and
      // asking the DOM would exclude the plain labelled buttons that price a label just as well.
      const labelled = items
        .map((el) => {
          const text = visibleText(el);
          if (!text) return null;
          // A menu trigger, not merely something that paints text — see the docblock.
          const control = el.matches('[aria-haspopup]')
            ? el
            : (el.querySelector('[aria-haspopup]') ?? el.closest('[aria-haspopup]'));
          if (!control) return null;
          const font = getComputedStyle(el).font || '14px sans-serif';
          const width = round(box(el).width);
          const label = textWidth(text, font);
          return label === null
            ? null
            : {
                id: el.getAttribute('data-toolbar-item') ?? '',
                text,
                font,
                width,
                labelWidth: label,
                chrome: width - label,
              };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const chromes = labelled.map((l) => l.chrome).sort((a, b) => a - b);
      const chromeSpread =
        chromes.length === 0
          ? null
          : {
              min: chromes[0]!,
              max: chromes[chromes.length - 1]!,
              median: chromes[Math.floor(chromes.length / 2)]!,
              range: chromes[chromes.length - 1]! - chromes[0]!,
              samples: chromes.length,
            };

      // ---- 2. What the five PROPOSED triggers would cost ---------------------------------------
      //
      // Text measured in a real trigger's own computed font; chrome taken from the median of the
      // real spread. A caret is already inside that chrome, because every sample carries one or
      // does not and the spread reports the difference.
      const triggerFont = labelled[0]?.font ?? '14px sans-serif';
      const proposedTriggers = proposed.map((name) => {
        const label = textWidth(name, triggerFont) ?? 0;
        return { name, labelWidth: label, width: label + (chromeSpread?.median ?? 0) };
      });

      // ---- 3. The strip: real icon-only controls, and the real gap between them -----------------
      const iconOnly = items
        .filter((el) => visibleText(el) === '')
        .map((el) => ({
          id: el.getAttribute('data-toolbar-item') ?? '',
          width: round(box(el).width),
          left: round(box(el).left),
          right: round(box(el).right),
        }))
        .sort((a, b) => a.left - b.left);

      // The gap is read from adjacent pairs inside one group rather than from a class, because the
      // group rule and the group's own padding sit between groups and would be counted as gap.
      const gaps: number[] = [];
      for (let i = 1; i < iconOnly.length; i += 1) {
        const gap = iconOnly[i]!.left - iconOnly[i - 1]!.right;
        if (gap >= 0 && gap < 24) gaps.push(gap);
      }
      const gapMedian =
        gaps.length === 0 ? 0 : [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
      const iconWidths = iconOnly.map((i) => i.width).sort((a, b) => a - b);
      const iconMedian =
        iconWidths.length === 0 ? 0 : iconWidths[Math.floor(iconWidths.length / 2)]!;

      // ---- 4. Identity, reduced — measured by what STAYS, not by subtracting what goes ----------
      const toolbarEl = document.querySelector('[role="toolbar"][aria-label="View and navigate"]');
      const commandBand = toolbarEl?.parentElement?.parentElement ?? null;
      const identityRow = (() => {
        const first = commandBand?.firstElementChild ?? null;
        if (!first) return null;
        return first.querySelector('nav') ? first : null;
      })();

      const identity = (() => {
        if (!identityRow) return null;
        const nav = identityRow.querySelector('nav');
        // The plan name is the LAST breadcrumb crumb — the one with no link, which is exactly what
        // §3 keeps. Reading it as "the last crumb" rather than by class survives a restyle.
        const crumbs = nav ? [...nav.querySelectorAll('li, a, span')] : [];
        const lastCrumb = crumbs[crumbs.length - 1] ?? null;
        const badge = identityRow.querySelector('[class*="rounded-full"]');
        return {
          rowContentWidth: [...identityRow.children].reduce((s, c) => s + round(box(c).width), 0),
          navWidth: nav ? round(box(nav).width) : null,
          planNameWidth: lastCrumb ? round(box(lastCrumb).width) : null,
          planNameText: lastCrumb ? visibleText(lastCrumb) : null,
          badgeWidth: badge ? round(box(badge).width) : null,
          badgeText: badge ? visibleText(badge) : null,
        };
      })();

      // ---- 5. The survivors: the mode cluster and the pen ---------------------------------------
      const modeRow = document.querySelector('[role="toolbar"][aria-label="Plan mode"]');
      const pen = [...document.querySelectorAll<HTMLElement>('button')].find((b) =>
        /^(Start|Stop) editing$/.test((b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
      );

      // ---- 6. The container the band has to fit into --------------------------------------------
      const container = toolbarEl?.parentElement ?? null;

      return {
        containerWidth: container ? round(box(container).width) : null,
        chromeSpread,
        labelledSamples: labelled,
        proposedTriggers,
        strip: {
          realIconCount: iconOnly.length,
          medianIconWidth: iconMedian,
          medianGap: gapMedian,
          samples: iconOnly.slice(0, 12),
        },
        identity,
        modeRowWidth: modeRow ? round(box(modeRow).width) : null,
        penWidth: pen ? round(box(pen).width) : null,
      };
    },
    { proposed: PROPOSED_MENUS },
  );
}

test('Landing C M0 — the menu band, measured before it is built', async ({ page }) => {
  clearMeasurement('landing-c-m0-menu-band');
  const stamp = Date.now();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Band Tester');
  await page.getByLabel('Email').fill(`band-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Band Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  // A realistic plan name, not `Logic`. §5 risk 2 is about exactly this term.
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside — Phase 2 Substructure');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Riverside — Phase 2 Substructure' }).click();
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();

  // The pen is taken because half the command surface is shaded without it, and a shaded control
  // is still a control of the same width — but the pen BUTTON's own label changes, and that is one
  // of the terms. Measured in the state a planner is in while authoring.
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();

  const report: Record<string, unknown> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(600);
    const band = (await measureBand(page)) as {
      containerWidth: number | null;
      chromeSpread: {
        min: number;
        max: number;
        median: number;
        range: number;
        samples: number;
      } | null;
      proposedTriggers: { name: string; labelWidth: number; width: number }[];
      strip: { medianIconWidth: number; medianGap: number };
      identity: { planNameWidth: number | null; badgeWidth: number | null } | null;
      modeRowWidth: number | null;
      penWidth: number | null;
    };

    const labelSum = band.proposedTriggers.reduce((sum, t) => sum + t.labelWidth, 0);
    const spread = band.chromeSpread;
    // Priced at the median AND at the ends of the measured spread, so a wide spread reads as a
    // range of answers rather than disappearing into an average.
    const triggersAt = (chrome: number): number => labelSum + PROPOSED_MENUS.length * chrome;
    const triggers = triggersAt(spread?.median ?? 0);

    // **Eight is the PROPOSAL's count, not a measurement.** Only four icon-only controls exist to
    // measure today, so the unit price is measured and the multiplier is §3's.
    const strip = 8 * band.strip.medianIconWidth + 7 * band.strip.medianGap;
    const identity = (band.identity?.planNameWidth ?? 0) + (band.identity?.badgeWidth ?? 0);
    // Group rules and gaps between the five clusters — identity | menus | strip | modes | pen.
    const separators = 4 * (13 + 4);
    const fixed = strip + identity + (band.modeRowWidth ?? 0) + (band.penWidth ?? 0) + separators;
    const total = triggers + fixed;
    const container = band.containerWidth ?? 0;

    report[String(width)] = {
      ...band,
      derived: {
        triggers,
        strip,
        stripCountIsProposed: true,
        identity,
        separators,
        total,
        slack: container - total,
        // The honest bound: the same arithmetic at the widest and narrowest trigger chrome the
        // toolbar actually exhibits.
        slackAtWidestChrome: container - (triggersAt(spread?.max ?? 0) + fixed),
        slackAtNarrowestChrome: container - (triggersAt(spread?.min ?? 0) + fixed),
      },
    };
  }

  const atGate = report[String(GATE.width)] as {
    derived: { slack: number; total: number; slackAtWidestChrome: number };
  };
  // **Judged on the WORST case the measurement supports**, not the median. A gate answered from the
  // middle of a spread is a gate that passes on average, and this proposal's own §6 exists because
  // three epics were wrong about numbers exactly this size.
  const worst = atGate.derived.slackAtWidestChrome;
  // **A gate that cannot see its own input must throw, not answer.** The first corrected run
  // reported WITHDRAWN from `undefined >= 120` — right by accident, because an edit adding this
  // field had silently failed to apply. A verdict produced by a missing number is a vacuous gate
  // whichever way it lands.
  if (typeof worst !== 'number' || Number.isNaN(worst)) {
    throw new Error(
      `the gate has no slackAtWidestChrome to judge at ${GATE.width}px — the measurement did not ` +
        `produce the field, so there is no verdict to report`,
    );
  }
  report.gate = {
    condition: `command-surface.md §6: fits at ${GATE.width} with >= ${GATE.minSlackPx}px of slack`,
    width: GATE.width,
    slack: atGate.derived.slack,
    slackAtWidestChrome: worst,
    total: atGate.derived.total,
    judgedOn: 'slackAtWidestChrome',
    verdict: worst >= GATE.minSlackPx ? 'PROCEED' : 'WITHDRAWN',
  };

  writeMeasurement('landing-c-m0-menu-band', report);
});
