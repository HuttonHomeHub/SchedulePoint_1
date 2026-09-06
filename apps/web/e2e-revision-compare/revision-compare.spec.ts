import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { revealToolbarCommand } from '../e2e-support/toolbar';

import { createAndOpenPlan, onboard, openProject, seedRevision } from './support';

/**
 * **The Compare revisions journey** (revision M2-T4) — against a real API and a real database,
 * landing with the FIRST user-facing milestone and not at a gate pass (ADR-0081 §2).
 *
 * ONE test, deliberately: every claim reads one seeded plan, and a fresh context per claim would
 * drop the session and re-seed four times.
 *
 * What only this suite can prove is the seam this register keeps recording as the shipped defect —
 * ADR-0080's `bulk` wired into one host and not the layout the flag selects, ADR-0099's drawer with
 * no entry point at all: that the menu item exists **in the shipped layout**, that pressing it
 * opens a panel which really renders the API's comparison, and that the two pickers reach a real
 * route. Unit tests mount the panel with a literal; the defect lives in the seam between the panel
 * and the shell.
 *
 * The seeded delta is deliberately **non-empty** (one entered, two left). A comparison of two
 * identical schedules would satisfy "the panel rendered" while proving nothing about the feature —
 * the non-vacuity rule this epic applies to its own measurements, applied to its journey.
 */

test('a planner compares a revision against live and reads what entered the critical path', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  // Not named after the feature: a plan called "Revision plan" would make a name-based locator
  // ambiguous with its own row menu (the float-paths lesson).
  const planId = await createAndOpenPlan(page, 'Riverside programme');
  const { enteringName, leavingName } = await seedRevision(page, orgSlug, planId);
  // The seeding above is invisible to the page's query cache — the caller reloads, stated in the
  // helper's docblock rather than left as an undocumented reliance (TECH_DEBT #208).
  await page.reload();

  // ── 1 · The entry point, in the shipped layout ─────────────────────────────────────────────
  // Located by `[data-toolbar-item]` and by role+name, never by copy: every layout epic here has
  // broken a copy-based locator, and the deck's labels change with width.
  await revealToolbarCommand(page, 'analysis');
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-item="analysis"]')
    .click();
  await page.getByRole('menuitem', { name: 'Compare revisions…' }).click();

  const panel = page.getByRole('region', { name: 'Compare revisions' });
  await expect(panel).toBeVisible();

  // ── 2 · Both pickers, with Live NAMED as the default later side ────────────────────────────
  const laterSide = panel.getByLabel('Compared with');
  await expect(laterSide).toHaveValue('live');
  // Before a pair is chosen the panel asks for one — it does NOT show a failed request.
  await expect(panel.getByText(/choose an earlier revision/i)).toBeVisible();

  // ── 3 · The comparison itself, against the real route ──────────────────────────────────────
  await panel.getByLabel('Earlier revision').selectOption({ label: 'Contract Baseline' });

  const entered = panel.getByRole('region', { name: /entered the critical path/i });
  const left = panel.getByRole('region', { name: /left the critical path/i });
  await expect(entered.getByText(enteringName)).toBeVisible();
  await expect(left.getByText(leavingName)).toBeVisible();
  // The direction is asserted BOTH ways: a panel that listed everything in both sections would
  // satisfy either assertion alone.
  await expect(entered.getByText(leavingName)).toHaveCount(0);
  await expect(left.getByText(enteringName)).toHaveCount(0);

  // The completion statement names the carrier and its frame — the honesty the carrier's
  // same-day-tie residual requires.
  await expect(panel.getByText(/on the plan calendar/)).toBeVisible();

  // ── 4 · The honesty footer is present and says what the product will not claim ──────────────
  await expect(panel.getByText(/does not say what caused it/i)).toBeVisible();

  // ── 4b · The CHANGE LIST — and this claim's real subject is the ENTRY POINT ────────────────
  //
  // The view switch renders only when the payload carries a change list, and the payload carries
  // one only because the workspace asked for `?include=changes`. So the button being here is the
  // proof that the host's request and the panel's render agree — the seam that ADR-0081 records
  // five separate milestones shipping dark behind. A unit test cannot make that claim: it mounts
  // the panel with a fixture and never crosses the host, the query key or the route.
  const changesButton = panel.getByRole('button', { name: 'Changes' });
  await expect(changesButton).toBeVisible();
  await changesButton.click();
  await expect(changesButton).toHaveAttribute('aria-pressed', 'true');

  const changes = panel.getByRole('group', { name: 'Changes between these revisions' });
  await expect(changes).toBeVisible();

  // A class the snapshot never recorded says SO, in a sentence, rather than reporting no changes.
  // This is the epic in one assertion: an empty list and an un-looked-at list read identically
  // unless the product distinguishes them, and the reassuring reading is the false one.
  const logic = changes.getByRole('region', { name: 'Logic changed' });
  await expect(logic.getByText(/cannot be compared/i)).toBeVisible();
  await expect(logic.getByText(/no changes in this revision/i)).toHaveCount(0);

  // And an assessable class reports what it found rather than a reason.
  const dates = changes.getByRole('region', { name: 'Dates moved' });
  await expect(dates.getByText(/cannot be compared/i)).toHaveCount(0);

  // The list's own footer refuses causation IN THE READER'S WORDS — a change list beside a moved
  // completion is precisely where a reader joins the two, so the refusal has to be on this view
  // and not only on the delta's.
  await expect(
    changes.getByText(/does not say which change moved the completion date/i),
  ).toBeVisible();

  // Back to the delta, so the rest of the journey runs against the view it was written for.
  await panel.getByRole('button', { name: 'Critical path' }).click();
  await expect(panel.getByRole('region', { name: /entered the critical path/i })).toBeVisible();

  // ── 5 · One dock at a time, against the REAL sibling rather than a stub ────────────────────
  await revealToolbarCommand(page, 'analysis');
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-item="analysis"]')
    .click();
  await page.getByRole('menuitem', { name: 'Health check…' }).click();
  await expect(page.getByRole('region', { name: 'Health check' })).toBeVisible();
  await expect(panel).toHaveCount(0);

  // ── 6 · CQ-3's owed half: REACHABILITY, not boxes ──────────────────────────────────────────
  // The CQ-3 harness measured that the facts chip costs the foot row no height, and recorded that
  // it proves BOXES and not reachability — ADR-0114 M1 shipped a foot-row control that was painted
  // and pointer-unreachable while every height assertion passed. So this sweeps the dock's own
  // controls with `elementFromPoint` at the width where the dock is squeezed hardest.
  await revealToolbarCommand(page, 'analysis');
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-item="analysis"]')
    .click();
  await page.getByRole('menuitem', { name: 'Compare revisions…' }).click();
  await expect(panel).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 900 });
  // Proven to still bite after the scroll-into-view change: a full-viewport overlay injected here
  // makes the sweep name all seven controls (Print, Close, both pickers and three rows). Recorded
  // because widening a gate's tolerance is exactly when it quietly stops catching anything.
  const unreachable = await page.evaluate(() => {
    // Located by its STRUCTURAL attribute, never by copy — the rule every layout epic here has
    // broken. A panel that cannot be found must FAIL rather than sweep nothing and report clean.
    const scope = document.querySelector('[data-revision-compare-panel]');
    if (!scope) return ['the panel itself could not be located'];
    const controls = [...scope.querySelectorAll('button, select, a[href]')];
    if (controls.length === 0) return ['NO CONTROLS FOUND — the sweep would pass vacuously'];
    return controls
      .filter((el) => {
        // **Scrolled into view FIRST, then hit-tested.** A control below its own scroller's fold is
        // reachable — a planner scrolls to it — and testing it where it currently sits reports the
        // scroller, not a defect. ADR-0114's discriminator is exactly this: whether there is
        // anything scrollable to move. This suite's first version omitted it and went red on a
        // legitimately-below-the-fold row the moment the rows grew a line, which is the same
        // instrument defect the ADR-0118 gate records hitting; recorded rather than worked around
        // by shortening the rows.
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        // A zero-size box has no point to hit and is a different defect; report it as one rather
        // than letting it pass the hit test the way ADR-0090 M5's gate once did.
        if (r.width === 0 || r.height === 0) return true;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit === null || !(el === hit || el.contains(hit) || hit.contains(el));
      })
      .map(
        (el) => `${el.tagName}[${el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''}]`,
      );
  });
  expect(unreachable).toEqual([]);

  // ── 7 · M3-T1: activating a row reaches the workspace selection ────────────────────────────
  // Back to the width the rest of the journey runs at, so this claim is not judged on a viewport
  // claim 6 narrowed for its own reason.
  await page.setViewportSize({ width: 1646, height: 1080 });
  await entered.getByRole('button', { name: new RegExp(enteringName) }).click();
  // The canvas's parallel listbox is the a11y surface the reveal has to reach — the same seam the
  // health epic's offender jump is asserted through, not a new one.
  const listbox = page.getByRole('listbox', { name: 'Activities in the diagram' });
  await expect(listbox.getByRole('option', { selected: true })).toContainText(enteringName);

  // ── 8 · M3-T2: the printed comparison ──────────────────────────────────────────────────────
  // `window.print` stubbed; the detached container stays mounted (teardown waits on `afterprint`,
  // which a stub never fires), so its DOM can be read even though the screen stylesheet hides it.
  await page.evaluate(() => {
    window.print = () => {};
  });
  await panel.getByRole('button', { name: 'Print comparison' }).click();
  const printed = await page.evaluate(() => {
    const doc = document.querySelector('.tsld-print-container .revision-print');
    const rows = (sel: string) => doc?.querySelectorAll(sel).length ?? 0;
    return {
      // **Counted APART, and that is the repair rather than a loosening.** This was one
      // document-wide `tbody tr` count asserting "every delta row printed, nothing cropped to a
      // scroll position". Adding the change list's tables took it from 3 to 8 and CI caught it —
      // a real regression in a pushed commit. A document-wide count stops expressing that
      // invariant the moment the document grows a second kind of table, so each kind is now
      // counted against its own expectation and both keep their meaning.
      deltaRows: rows('table:not([data-change-class]) tbody tr'),
      changeRows: rows('table[data-change-class] tbody tr'),
      text: doc?.textContent ?? '',
    };
  });
  // Every DELTA row printed — a print that emitted only what was scrolled into view is the
  // founding defect `lib/print-document.ts` exists to prevent, and it looks complete.
  expect(printed.deltaRows).toBe(3);
  // And the change list reaches paper too (M3). Asserted as "some", not as an exact count: the
  // seeded plan's change set is a property of the fixture, and pinning it here would make this
  // assertion fail whenever the seed changed for an unrelated reason.
  expect(printed.changeRows).toBeGreaterThan(0);
  // The class that could not be assessed says so ON PAPER, not silently nothing.
  expect(printed.text).toMatch(/cannot be compared/i);
  expect(printed.text).toContain(enteringName);
  expect(printed.text).toContain(leavingName);
  // The honesty footer reaches PAPER, which outlives the conversation it came from.
  expect(printed.text).toMatch(/does not say what caused it/i);
  // A comparison against live is dated by the instant it was taken, or it is unreadable next week.
  expect(printed.text).toMatch(/as at \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  // No code reaches paper, asserted against the REAL rendered document rather than a jsdom one.
  expect(printed.text).not.toMatch(/PLAN_NOT_SCHEDULED|CARRIER_REMOVED|UNKNOWN|DIFFERS/);

  // ── 9 · No axe violations on a POPULATED comparison ────────────────────────────────────────
  // Populated deliberately: an all-empty scan certifies nothing (the ADR-0116 M5 finding).
  const scan = await new AxeBuilder({ page })
    .include('[data-revision-compare-panel]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
});
