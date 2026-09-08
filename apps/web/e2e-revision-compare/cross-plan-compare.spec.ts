import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { revealToolbarCommand } from '../e2e-support/toolbar';

import { createAndOpenPlan, onboard, openProject, seedCrossPlanPair } from './support';

/**
 * **Comparing two SEPARATELY IMPORTED revisions** — the first user-facing milestone of the
 * cross-plan epic, landing WITH it rather than at a gate pass (ADR-0081 §2).
 *
 * ONE test, deliberately: every claim reads one seeded pair of plans, and a fresh context per
 * claim would drop the session and re-seed twice.
 *
 * **What only this suite can prove**, and it is the shape this register keeps recording as the
 * shipped defect — a capability wired into one host and not the layout that renders it (ADR-0080),
 * a whole surface with no entry point (ADR-0099 M10):
 *
 * - the **Compare with** picker exists in the shipped panel and lists the project's other plan;
 * - choosing it reaches the real cross-plan route with real correlated data;
 * - the coverage block renders BEFORE the delta and states three distinct facts;
 * - a row present only in the other plan carries **no** activation control;
 * - the overlay **draws** for a cross-plan pair and the toggle offers no refusal;
 * - the "not shown" sentence is the CROSS-PLAN one, not the same-plan wording.
 *
 * Unit tests mount the panel with a literal and never cross the host, the query key or the route.
 *
 * The seeded pair has a **known, non-empty answer** (one entered, one left, one only-here, one
 * only-there, one uncoded, one changed link). Two identical plans would satisfy every "it
 * rendered" assertion while proving nothing — the non-vacuity rule this epic applies to its own
 * measurements, applied to its journey.
 */

test('a planner compares the open plan against another plan in the same project', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  const planId = await createAndOpenPlan(page, 'Riverside programme');
  const {
    otherPlanName,
    enteringName,
    leavingName,
    otherPlanOnlyName,
    thisPlanOnlyName,
    uncodedName,
  } = await seedCrossPlanPair(page, orgSlug, planId);
  // The seeding is invisible to the page's query cache — the caller reloads, which is this suite's
  // documented rule rather than a lean on `Recalculate` (`docs/TECH_DEBT.md` #208).
  await page.reload();

  // ── 1 · The entry point, in the shipped layout — the SAME one, not a new door ───────────────
  await revealToolbarCommand(page, 'analysis');
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-item="analysis"]')
    .click();
  await page.getByRole('menuitem', { name: 'Compare revisions…' }).click();

  const panel = page.getByRole('region', { name: 'Compare revisions' });
  await expect(panel).toBeVisible();

  // ── 2 · The Compare with picker, defaulting to THIS plan ───────────────────────────────────
  //
  // The default is named rather than blank: a blank option meaning "this plan" would make the
  // commonest choice the one with no name.
  const planPicker = panel.getByLabel('Compare with');
  await expect(planPicker).toHaveValue('');
  await expect(planPicker.getByRole('option', { name: /This plan/ })).toHaveCount(1);

  // ── 3 · Choosing the other plan reaches the real cross-plan route ──────────────────────────
  await planPicker.selectOption({ label: otherPlanName });

  // **Both plans named on the identity line** — with two on screen a reader can infer neither, and
  // the project is named too because two re-imports of one programme routinely share a plan name.
  //
  // Located by the ARROW that joins them rather than by the plan name alone: the name legitimately
  // appears three times in this panel (the picker's option, this line, and the measurement frame),
  // so a bare name assertion is ambiguous — which is exactly how it failed on the first run.
  await expect(
    panel.getByText(new RegExp(`${otherPlanName} \\(Riverside\\) → Riverside programme`)),
  ).toBeVisible();

  // ── 4 · The coverage block, ABOVE the delta and stating THREE distinct facts ────────────────
  //
  // Every number below it is worth exactly what it says they are: "one left the critical path"
  // means one thing at full coverage and something else at half.
  const coverage = panel.getByRole('region', { name: 'Match coverage' });
  await expect(coverage).toBeVisible();
  await expect(coverage.getByText(/matched by activity code/i)).toBeVisible();
  /*
   * Present on one side only, and rows with no code at all — the two disclosures, located by ROLE
   * rather than by text.
   *
   * The first version asserted the text and hit a strict-mode violation, because the coverage
   * SENTENCE also contains "only in the earlier plan": the summary states the counts in prose and
   * the disclosures repeat the labels. That is not a defect — the sentence is what a reader takes
   * in first and the lists are what they open — but it makes a text locator ambiguous, and the
   * fix is to name what each control IS.
   */
  const earlierOnly = coverage.getByRole('button', { name: /only in the earlier plan/i });
  // The THIRD state: an uncoded row is neither added nor removed. Collapsing it into either count
  // would be two facts arriving in one channel as one.
  const noCode = coverage.getByRole('button', { name: /^no activity code/i });
  await expect(earlierOnly).toBeVisible();
  await expect(noCode).toBeVisible();

  // The disclosures really list the rows rather than only counting them.
  await earlierOnly.click();
  await expect(coverage.getByText(otherPlanOnlyName)).toBeVisible();
  await noCode.click();
  await expect(coverage.getByText(uncodedName)).toBeVisible();

  // The re-code caveat — the one honest limit of matching on code, stated rather than left to be
  // discovered by a planner reading an added row that is really a renamed one.
  await expect(panel.getByText(/an activity whose code changed/i)).toBeVisible();

  // And the measurement frame, named because two plans need not share a calendar.
  await expect(panel.getByText(/Movement is measured in working days on/i)).toBeVisible();

  // ── 5 · The delta itself, with the seeded answer ───────────────────────────────────────────
  const entered = panel.getByRole('region', { name: /entered the critical path/i });
  const left = panel.getByRole('region', { name: /left the critical path/i });
  await expect(entered.getByText(enteringName)).toBeVisible();
  await expect(left.getByText(leavingName)).toBeVisible();
  // Asserted BOTH ways: a panel listing everything in both sections would satisfy either alone.
  await expect(entered.getByText(leavingName)).toHaveCount(0);
  await expect(left.getByText(enteringName)).toHaveCount(0);

  // A row that IS in this plan keeps its control, and activating it announces.
  await expect(
    panel.getByRole('button', { name: new RegExp(enteringName) }),
    'a row in the open plan must be activatable',
  ).toHaveCount(1);
  await panel.getByRole('button', { name: new RegExp(enteringName) }).click();
  await expect(page.getByText(new RegExp(`${enteringName} selected in the plan`))).toBeVisible();

  /*
   * ── 6 · The omission rule, asserted WHERE THE NULL-ID ROWS ACTUALLY ARE ────────────────────
   *
   * ADR-0082's discriminator: revealing a row that lives only in the other plan does not apply to
   * the object, because there is no bar in this diagram to reveal — so the control is OMITTED, not
   * shaded. Shading is reserved for the same-plan case, where the activity IS in the comparison and
   * has since been deleted, which is a state.
   *
   * **This assertion was first written against the critical-path delta and the journey proved it
   * could never fire there.** `entered` and `left` hold only MATCHED activities — a row is in one
   * of them because it exists on both sides — so cross-plan every one of them resolves in the
   * anchor plan. The rows that genuinely carry a null id are the change list's `REMOVED` class,
   * and the presence rows, which this panel renders as counts rather than as rows. The first
   * version threaded a plan-name prop into the delta's sections and it never rendered: a prop
   * scaffolded for a caller that does not exist, which is exactly the defect this panel's own
   * docblock records catching once. Found by driving the product, not by reading it.
   */
  await panel.getByRole('button', { name: 'Changes' }).click();
  const changes = panel.getByRole('group', { name: /Changes between/i });
  await expect(changes).toBeVisible();
  const removedClass = changes.getByRole('region', { name: /Removed/i });
  await expect(removedClass.getByText(otherPlanOnlyName)).toBeVisible();
  await expect(
    removedClass.getByRole('button', { name: new RegExp(otherPlanOnlyName) }),
    'a row that lives only in the other plan must offer NO activation control',
  ).toHaveCount(0);
  // The plan named in the control's place: an omission with nothing there is indistinguishable
  // from a control that failed to render.
  await expect(removedClass.getByText(new RegExp(`Only in ${otherPlanName}`))).toBeVisible();

  // The mirror case: a row present only in THIS plan is an ADDITION and DOES have a bar here, so
  // it keeps its control. Asserted beside the omission because one passing does not imply the
  // other — a blanket "no control on any presence row" would satisfy the assertion above.
  const addedClass = changes.getByRole('region', { name: /^Added/i });
  await expect(
    addedClass.getByRole('button', { name: new RegExp(thisPlanOnlyName) }),
    'a row added in the open plan must still be activatable',
  ).toHaveCount(1);

  await panel.getByRole('button', { name: 'Critical path' }).click();
  await expect(panel.getByRole('region', { name: /entered the critical path/i })).toBeVisible();

  // ── 7 · The OVERLAY draws for a cross-plan pair, and the toggle refuses nothing ─────────────
  //
  // The whole reason the overlay ships WITH the panel: there must never be a release in which the
  // toggle is present and declines for a comparison the product can perfectly well draw.
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const compareToggle = page.getByRole('checkbox', { name: 'Compare on diagram' });
  await expect(compareToggle).toBeVisible();
  await expect(compareToggle, 'the toggle must not be shaded for a cross-plan pair').toBeEnabled();
  await compareToggle.check();
  await page.keyboard.press('Escape');

  // The overlay's own summary states what it drew — the proof the ghosts reached the canvas, which
  // they can only have done because the host asked for `?include=ghosts` on the CROSS-PLAN route.
  await expect(page.getByText(/Comparison overlay:/i)).toBeVisible();
  // The changed link, counted — and this is the assertion that would have caught a link handed
  // back under a correlation key the painter cannot resolve.
  await expect(page.getByText(/1 changed link\b/i)).toBeVisible();

  // ── 8 · The "not shown" sentence is the CROSS-PLAN one ─────────────────────────────────────
  //
  // The same-plan wording — "the old revision did not record where they were" — is FALSE here: the
  // other plan did record it, and the position is not comparable because two independently
  // imported plans derive their lane order separately. This is the milestone's likeliest defect
  // precisely because the mechanism is correct and reusing it feels like reuse.
  const summary = page.getByText(/Comparison overlay:/i);
  await expect(summary).not.toContainText('did not record where they were');

  /*
   * ── 8b · M3: the HANDOVER ARTEFACT names both plans and prints the coverage ────────────────
   *
   * The printed document is the version somebody pays for, and its rule runs both ways: it states
   * no fact the screen withholds and withholds none the screen states. The unit symmetry test
   * asserts that over the shared sentence module, verified red in both directions; what only this
   * can prove is that pressing the SHIPPED button reaches a document carrying them — the seam
   * between the panel's payload and the print surface.
   *
   * `window.print` is stubbed, so teardown's `afterprint` never fires and the detached container
   * stays mounted long enough to read, exactly as the sibling journey does it.
   */
  await page.evaluate(() => {
    window.print = () => {};
  });
  await panel.getByRole('button', { name: 'Print comparison' }).click();
  const printed = await page.evaluate(
    () => document.querySelector('.tsld-print-container .revision-print')?.textContent ?? '',
  );
  // Both plans — a printed comparison of two plans naming one is a false statement to exactly the
  // reader the document exists for.
  expect(printed).toContain(otherPlanName);
  expect(printed).toContain('Riverside programme');
  // The coverage, the frame and the re-code caveat, on paper as on screen.
  expect(printed).toMatch(/matched by activity code/i);
  expect(printed).toMatch(/Movement is measured in working days on/i);
  expect(printed).toMatch(/an activity whose code changed/i);
  // The rows print IN FULL — paper has no disclosure to open, so a collapsed list is unreadable.
  expect(printed).toContain(otherPlanOnlyName);
  expect(printed).toContain(uncodedName);
  // And no reason code reaches paper, which is the rule the whole feature turns on.
  expect(printed).not.toContain('NO_COMMON_CODES');

  // ── 9 · The accessibility scan, scoped by the STRUCTURAL attribute ─────────────────────────
  //
  // Never by copy: `:text-is()` is a Playwright selector-engine extension and is not valid CSS, so
  // axe-core THROWS on it rather than scanning nothing — which is the right way round and is how
  // `[data-revision-compare-panel]` came to exist.
  const results = await new AxeBuilder({ page })
    .include('[data-revision-compare-panel]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

  // ── 10 · Back to THIS plan restores the shipped surface exactly ────────────────────────────
  //
  // The rollback contract, since there is no flag: choosing **This plan** must return the two
  // revision pickers and the shipped route's own empty state, not a cross-plan surface with the
  // coverage block hidden.
  await planPicker.selectOption('');
  await expect(panel.getByRole('region', { name: 'Match coverage' })).toHaveCount(0);
  /*
   * **This plan holds no baselines**, so the shipped same-plan surface is its EMPTY state — and
   * that is the assertion, not the two revision pickers.
   *
   * The first version asserted the pickers and went red. It was my premise that was wrong, not the
   * product: this seed captures no baseline anywhere, because comparing against another plan needs
   * none — which is itself the reason the **Compare with** picker renders independently of the
   * baseline state. A planner who imported two revisions and captured neither is exactly who this
   * milestone is for, and gating the picker behind a baseline would have put the capability out of
   * their reach. So the honest rollback assertion is that the shipped empty state returns, with its
   * own sentence and its own exit.
   */
  await expect(panel.getByText(/no saved revisions yet/i)).toBeVisible();
  await expect(panel.getByRole('button', { name: /capture a baseline/i })).toBeVisible();
  // And the picker itself is still there, so the reader can go back.
  await expect(planPicker).toBeVisible();
});
