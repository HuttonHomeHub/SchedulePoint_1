import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **The pen's three parts, and the three places they are read.**
 *
 * The one-row header split the block `CompactPenStatus` used to render — a badge, a live-region
 * sentence and every ADR-0028 hand-off control — by asking what each thing IS: the sentence is a
 * **fact** and portals to wherever the plan's facts are read, the rest are **actions** and stayed
 * beside the plan (ADR-0093's discriminator applied to a model rather than to a command).
 *
 * **The console epic's M5 split it once more, and this suite is the record of where the pieces
 * landed.** The pen's VERB — `Start editing` / `Stop editing` — is the control that unlocks the
 * eleven authoring commands, and it sat three sections away from them on the identity row; it is
 * now a registry item at the head of the command deck's `Author` card. Its badge and its seven
 * hand-off controls went the other way, to the plan's foot row beside the sentence they explain
 * (the product owner's answer to CQ-4).
 *
 * So the three parts are in three places and each case below names one. The header holds **none**
 * of them, which is the assertion most likely to be broken by a later change and the one this
 * suite would otherwise have kept asserting the opposite of.
 *
 * **Why a journey and not another unit case.** Three of the four assertions here are about *which
 * element contains which*, across a React portal, in a real layout — and the unit suite's answer to
 * that is structurally misleading, because with no outlet registered the sentence renders in place
 * *inside* the controls container, so "the sentence is inside the controls" is true there whether
 * the split works or not. Only a running product has both an outlet and a row.
 *
 * **Every assertion is scoped to an element, never to `page`.** ADR-0073 C2.5 records a journey
 * that passed on the prose alone because its assertion was scoped to the document; this suite's
 * whole subject is *where* something is, so a document-scoped query would assert nothing at all.
 *
 * It runs on the existing `workspace-fit` config and its existing CI step — 1646 CSS px, the
 * product owner's Surface Pro, with `PLAN_EDIT_LOCK_ENFORCED=true` so the pen is really enforced.
 */
test.describe('the pen sentence is a fact and the controls are actions', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1646, height: 1097 } });
    const orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    ]);
    await recalculate(page, orgSlug);
    // `recalculate` reloads, which drops the pen. Take it back — the whole subject here is what the
    // held state renders and where.
    await ensurePen(page);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the sentence is read beside the plan facts, and the hand-off controls are not', async () => {
    // The facts row is identified by a fact rather than by a class: `Activities` is rendered by
    // `FactList` and by nothing else on this screen. Locating the row by its copy is what
    // ADR-0091's retrospective warns against for a *toolbar control*, where copy changes with the
    // width; a fact's label does not.
    const factsRow = page.locator('[data-schedule-state]');
    await expect(factsRow).toBeVisible();

    const sentence = factsRow.getByRole('status');
    await expect(sentence).toHaveText(/editing this plan/i);
    await expect(sentence).toHaveAttribute('aria-live', 'polite');

    // **The pinned negative, and it is the assertion that means the most.** The VERB must not have
    // travelled with the sentence: it belongs at the head of the row it unlocks. Without this the
    // suite passes equally against a change that moved the whole cluster back into one block,
    // which is the shape both splits exist to avoid.
    await expect(factsRow.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);

    // **The badge DID travel, and the hand-off controls with it** (console epic M5, CQ-4). Asserted
    // positively rather than left as the absence above: "the verb is not here" is equally true of a
    // foot row that carries nothing at all.
    //
    // Located by `data-plan-pen` — the cluster's own stable hook — and not by the word `Editing`.
    // The sentence is `sr-only` in eight of the ten lock states and still contributes to
    // `textContent`, so a copy assertion here would be satisfied by the sentence that was already
    // in this row before M5, and would say nothing about the badge or the controls beside it. That
    // is the same class of false pass this suite's own header records (`data-plan-pen` exists
    // because a probe located the cluster by its sentence and silently changed subject).
    const cluster = factsRow.locator('[data-plan-pen]');
    await expect(cluster).toBeVisible();
    await expect(cluster.getByText('Editing', { exact: true })).toBeVisible();
  });

  /**
   * **The verb leads the row it unlocks, and the header keeps none of the three parts.**
   *
   * This replaces a case that asserted the badge and `Stop editing` are in the header — true until
   * M5 and false after it. It was NOT deleted and re-added: its own docblock recorded that it
   * passed in both states of the split it was written for, which is exactly the property that makes
   * a stale assertion survive a change. The version below is a discriminator in both directions.
   */
  test('the pen verb leads the command deck, and the header holds no part of the pen', async () => {
    // Located by the toolbar's role and name — never by copy, which is ADR-0091 M7's standing rule
    // after three journeys broke on a label change.
    const deck = page.getByRole('toolbar', { name: 'Plan commands' });
    await expect(deck.getByRole('button', { name: 'Stop editing' })).toBeVisible();

    // **First on the DO ROW**, not first in the deck — and the difference is what this assertion
    // got wrong on its first run, which is the reason it is worth a comment. The deck declares two
    // rows (M4): LOOK carries View and Find, DO carries Author and Plan. Querying the deck's first
    // roving stop returns the LOOK row's, which is `today`, and says nothing about the pen at all.
    //
    // Scoped to `[data-deck-row="do"]`, the claim is the milestone's: the control that opens the
    // authoring commands sits immediately before them. Read from DOM order, so it cannot be
    // satisfied by a control that merely renders somewhere on the row.
    const firstStop = await deck
      .locator('[data-deck-row="do"] [data-toolbar-item]')
      .first()
      .getAttribute('data-toolbar-item');
    expect(firstStop).toBe('pen');

    // **The header holds none of it.** The command deck is a sibling of `<header>` inside the chrome
    // band, so this is a real containment question rather than a restatement.
    const header = page.getByRole('banner');
    await expect(header.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);
    await expect(header).not.toContainText('Editing');

    // And the sentence is not ALSO here — one subject, one place. A host that portalled and kept
    // its in-place copy would put two live regions in the document, which a screen-reader user
    // meets and a sighted reader does not.
    await expect(page.getByRole('status').filter({ hasText: /editing this plan/i })).toHaveCount(1);
  });

  /**
   * **Focus stays on the control the planner pressed** (console epic M5-T4, WCAG 2.2 §2.4.3).
   *
   * `usePenLockView` has pulled focus back to its container since ADR-0028, because Start and Stop
   * were different members of `EditLockControls` and the successful action removed the button that
   * ran it. The deck's pen is ONE item that relabels, so the element survives and there is nothing
   * to restore — and restoring anyway throws focus to the foot row at the other end of the screen,
   * which also silently kills every workspace accelerator (a React `onKeyDown` on the workspace
   * root). A unit case pins the rule; only a browser has a real focus ring to ask about it.
   *
   * Asserted on the ELEMENT, never on "focus is not on `<body>`": the weaker assertion passes
   * against the defect, because the foot row is a perfectly good element to land on.
   */
  test('leaves focus on the deck pen after the lock changes hands', async () => {
    const deck = page.getByRole('toolbar', { name: 'Plan commands' });
    const verb = deck.getByRole('button', { name: 'Stop editing' });
    await verb.focus();
    await verb.click();

    await expect(deck.getByRole('button', { name: 'Start editing' })).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-toolbar-item')))
      .toBe('pen');

    await ensurePen(page);
  });

  test('releasing the pen updates the sentence in place, in the facts row', async () => {
    const factsRow = page.locator('[data-schedule-state]');
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Stop editing' })
      .click();

    await expect(factsRow.getByRole('status')).toHaveText(/no one is editing this plan/i, {
      timeout: 15_000,
    });
    // Still exactly one region, still in the facts row: the transition must not relocate it.
    await expect(factsRow.getByRole('status')).toHaveCount(1);

    // Put the pen back so this spec leaves the fixture as it found it, for any spec that follows.
    await ensurePen(page);
  });
});

/**
 * **M2 — the merged header row: one line at 1646, two at 1440.**
 *
 * The epic's headline acceptance condition, and it is asserted in a browser because nothing else can
 * ask it. The row's shape is a flex-wrap outcome — no breakpoint, no `matchMedia`, no observer — so
 * there is no value to unit-test and jsdom has no layout to measure. Written before the merge was
 * built and **verified red against both wrong states**: a surviving `flex-1` on the identity block
 * (one line at every width, plan name truncating towards nothing) and a shrinkable mode cluster
 * (two ragged lines where one clean one was expected).
 *
 * Measured with the same instrument the design was chosen on: the row requires 1482 px, its wrap
 * point is a container of 1480, and the containers at these two viewports are 1588 and 1382
 * (`docs/specs/one-row-header/m2-measurement.md`).
 */
test.describe('the merged header row', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1646, height: 1097 } });
    const orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
    // A long-but-plausible construction plan name. A short one is how three prior costings of this
    // row reported slack that a real plan did not have (ADR-0091 M7).
    await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
    await recalculate(page, orgSlug);
    await ensurePen(page);
    await expect(page.getByRole('toolbar', { name: 'Plan mode and view' })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  /** The row's height in line boxes, derived from its tallest child rather than from a constant. */
  const lines = async (p: Page): Promise<number> =>
    p.evaluate(() => {
      const row = document.querySelector('header')?.firstElementChild as HTMLElement | null;
      if (!row) return 0;
      const tallest = Math.max(
        0,
        ...[...row.children].map((c) => (c as HTMLElement).getBoundingClientRect().height),
      );
      return tallest > 0 ? Math.round(row.getBoundingClientRect().height / tallest) : 0;
    });

  test('is one line at 1646 and two below it, with the plan name readable at every width', async () => {
    // **1280 is here on the accessibility review's recommendation, and the reason is this epic's
    // own record.** `falsification.md` warns that a 37 px placeholder plan name once hid a real
    // overflow, and that a real project crumb makes the identity block larger than the figure the
    // design was priced on. 1280's arithmetic is the tightest of the three, so it is the width where
    // a short fixture would be most likely to report a fit the product does not have — and the
    // fixture above deliberately uses a long name and a real project.
    for (const [width, expected] of [
      [1646, 1],
      [1440, 2],
      [1280, 2],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(400);

      expect(await lines(page), `line count at ${width}`).toBe(expected);

      // **Readable, not merely present.** A `flex-1` identity block keeps the row one line by
      // shrinking the plan name towards nothing — which passes a "the row is one line" assertion
      // and is the exact failure the design turns on. So the name's own box is measured.
      const name = page.locator('[data-plan-identity]').getByText('Riverside Quarter', {
        exact: false,
      });
      await expect(name).toBeVisible();
      const box = await name.boundingBox();
      expect(box?.width ?? 0, `plan name width at ${width}`).toBeGreaterThan(80);

      // The four modes stay on one line inside the row: a mode cluster that folds turns one clean
      // row into two ragged ones, which is the hazard ADR-0109 D1 left behind when it replaced
      // demotion with wrapping.
      const modes = page.getByRole('toolbar', { name: 'Plan mode and view' });
      const modeBox = await modes.boundingBox();
      const firstMode = await modes.getByRole('button').first().boundingBox();
      expect(
        Math.round((modeBox?.height ?? 0) / (firstMode?.height ?? 1)),
        `mode cluster lines at ${width}`,
      ).toBe(1);

      /**
       * **The two switches are named, at both line counts** (`docs/TECH_DEBT.md` #201).
       *
       * The row holds two independent two-way switches and the seven-group taxonomy put all four
       * items in one `lens` group — one region, one name, four identical gaps — so nothing said
       * where one switch ended. `segmentLabels` splits it, and the split is **all-or-nothing**: an
       * item added later without a `segment` makes the whole group fall back to one region, silently
       * and correctly. `plan-mode-segments.structural.test.ts` fails CI on that; this is the half a
       * structural test cannot reach, which is that the names survive a real render at a width where
       * the row has wrapped.
       *
       * Located by role and name inside the toolbar, never by copy — ADR-0091 M7's standing rule
       * after three journeys broke on a label change.
       */
      await expect(modes.getByRole('group', { name: 'Scheduling mode' })).toBeVisible();
      await expect(modes.getByRole('group', { name: 'Plan view' })).toBeVisible();
      // The compound name it replaces is gone rather than left beside the new ones — three names for
      // one row would be invisible on screen and audible to nobody but a screen-reader user.
      await expect(modes.getByRole('group', { name: 'Scheduling and view' })).toHaveCount(0);
    }
  });

  /**
   * **On the widths where the row is one line**, and the qualifier is the finding rather than a
   * hedge.
   *
   * The row was `ml-auto` on its trailing group until the three sections landed; it is now
   * `justify-between`, which splits the free width between all three rather than banking it in one
   * gap. **A lone item on a WRAPPED line is placed at flex-start by `justify-between`**, so at 1440
   * and 1280 — where section 3 is the only thing on line 2 — the organisation and account sit at the
   * left of that line, measured 1126 px from the row's trailing edge. This case asserted "at every
   * width" and caught it.
   *
   * It is a consequence rather than a defect, and there is no CSS that has both: `ml-auto` on
   * section 3 right-aligns the wrapped line and, on a full line, absorbs all the free space before
   * `justify-content` sees any — which collapses the two gaps and restores exactly the crammed look
   * this change was made to fix. Those widths are below the stated fallback (1646), so the one-line
   * states are what this pins, and the wrapped behaviour is written down here rather than left for
   * someone to rediscover.
   */
  test('keeps the account chip as the row trailing control while the row is one line', async () => {
    for (const width of [1920, 1646]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(400);
      const account = await page.getByRole('banner').getByRole('button').last().boundingBox();
      const row = await page.getByRole('banner').boundingBox();
      expect(
        (row?.x ?? 0) + (row?.width ?? 0) - ((account?.x ?? 0) + (account?.width ?? 0)),
        `account chip inset from the trailing edge at ${width}`,
      ).toBeLessThan(40);
    }
  });
});
