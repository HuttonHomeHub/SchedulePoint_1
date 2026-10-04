import AxeBuilder from '@axe-core/playwright';

import { activityEditor } from '../e2e-support/activity-editor';

import { expect, test } from './fixtures';
import {
  addActivity,
  createAndOpenPlan,
  ensurePen,
  enterOrg,
  openEditor,
  openProject,
  releasePen,
  showActivities,
} from './support';

/**
 * Flag-ON **tabbed activity editor** journey (`VITE_ACTIVITY_EDITOR_TABS`, ADR-0060), against the
 * real API with the plan edit-lock enforced.
 *
 * Three claims, each of which the unit suite can only assert against a stub:
 *
 * 1. **Two scopes save in one session.** The second save must carry the version the first produced.
 *    A mocked fetch will accept any version; a real API answers 409, so this is the only place the
 *    version trap is genuinely tested.
 * 2. **Steps are pen-gated all the way down** (ADR-0060 §5 / M0). The panel shades without the pen
 *    *and* the server refuses — the client/server disagreement this epic opened by fixing.
 * 3. **Progress survives losing the pen.** The capability a single merged Save would have destroyed,
 *    proved end to end rather than argued from a gating table.
 */
test('a planner edits two scopes in one session, and the second save carries the new version', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Erect frame');

  await openEditor(page, 'Erect frame', 'Edit');
  const editor = activityEditor(page);

  // General first.
  await expect(editor.getByRole('tab', { name: 'General', selected: true })).toBeVisible();
  await editor.getByLabel('Name').fill('Erect steel frame');
  await editor.getByRole('button', { name: 'Save general' }).click();

  // The editor STAYS OPEN — the agreed behaviour, and the premise of a multi-scope session.
  await expect(editor.getByRole('tablist', { name: 'Activity sections' })).toBeVisible();

  // Scheduling second, in the same session. Its PATCH must carry version 2, not the version the
  // dialog opened with — a stale one would 409 and surface an error instead of saving.
  await editor.getByRole('tab', { name: 'Scheduling' }).click();
  await editor.getByLabel('Schedule as late as possible').check();
  const saveScheduling = editor.getByRole('button', { name: 'Save scheduling' });
  await saveScheduling.click();
  await expect(saveScheduling).toBeDisabled(); // clean again ⇒ the save landed
  await expect(editor.getByRole('alert')).toBeHidden();

  // A sighted user is told the save landed. Without this the helper text goes blank and the button
  // greys — indistinguishable from a tab nobody ever touched.
  await expect(editor.getByText('Saved.').first()).toBeVisible();

  // Nothing dirty ⇒ Escape closes without a prompt, and both writes reached the row.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('cell', { name: 'Erect steel frame', exact: true })).toBeVisible();
});

test('Report progress and Steps open the same editor on the Progress tab', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Pour slab');

  await openEditor(page, 'Pour slab', 'Progress');
  const editor = activityEditor(page);
  await expect(editor.getByRole('tab', { name: 'Progress', selected: true })).toBeVisible();
  // The three panels the epic co-located, each headed by what it does to the schedule.
  await expect(editor.getByRole('heading', { name: 'Reported progress' })).toBeVisible();
  await expect(editor.getByRole('heading', { name: 'How value is measured' })).toBeVisible();
  await expect(editor.getByRole('heading', { name: 'Weighted steps' })).toBeVisible();

  // The whole surface is accessible with all three panels visible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');

  /*
   * **`Steps` used to be driven here, and it is gone** (`docs/specs/object-bar-defects/` M1). It
   * opened this editor on this tab, differing from `Progress` only in that focus landed on the
   * Weighted-steps heading rather than the top — two controls, one subject, one permission.
   *
   * What replaces the assertion is the one that matters after a removal: the row menu no longer
   * offers it, AND the panel it used to reach is still on the tab that remains. A suite that only
   * proved the absence could not tell "the duplicate is gone" from "the capability is gone", which
   * is the failure ADR-0081 records.
   */
  await page.getByRole('button', { name: 'Actions for Pour slab' }).click();
  await expect(page.getByRole('menuitem', { name: 'Steps' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await openEditor(page, 'Pour slab', 'Progress');
  await expect(editor.getByRole('tab', { name: 'Progress', selected: true })).toBeVisible();
  await expect(editor.getByRole('heading', { name: 'Weighted steps' })).toBeVisible();
});

test('weighted steps save, then take over the physical % with a reason', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Fit windows');

  await openEditor(page, 'Fit windows', 'Progress');
  const editor = activityEditor(page);

  // Before any steps, the manual physical % is the planner's to set.
  await expect(editor.getByLabel('Physical % complete')).toBeEnabled();

  await editor.getByRole('button', { name: 'Add step' }).click();
  await editor.getByLabel('Step 1 name').fill('Frames in');
  await editor.getByLabel('Step 1 % complete').fill('60');
  // The client previews the same weighted mean the server computes.
  await expect(editor.getByText('60%')).toBeVisible();
  await editor.getByRole('button', { name: 'Save steps' }).click();

  // Once saved, the steps WIN — and the manual field says so rather than silently being ignored,
  // which is the defect that started this epic. `readOnly`, not `disabled` (ADR-0083 D1): the
  // rolled-up figure is exactly what the reader came to see, and a disabled field takes it out of
  // the tab order and out of copy. Asserted both ways round, because "not disabled" alone would
  // also pass against a field that had simply come unlocked.
  const physical = editor.getByLabel('Physical % complete');
  await expect(physical).toHaveAttribute('readonly', '');
  await expect(physical).toBeEnabled();
  await expect(editor.getByText(/Weighted steps are setting this to 60%/)).toBeVisible();
});

test('losing the pen shuts the definition scopes and leaves progress open', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Strip formwork');
  await releasePen(page);

  await openEditor(page, 'Strip formwork', 'Progress');
  const editor = activityEditor(page);

  // Progress is never pen-gated (ADR-0028 Q-C) — and it really saves, against the enforcing API.
  await editor.getByLabel('Percent complete').fill('40');
  await editor.getByRole('button', { name: 'Save progress' }).click();
  await expect(editor.getByRole('button', { name: 'Save progress' })).toBeDisabled();
  await expect(editor.getByRole('alert')).toBeHidden();

  // …while every definition scope beside it is shut, with the sentence that says what to do about
  // it. Not a bare "Read-only": naming the action is what makes the dead end escapable — and it is
  // the app's existing sentence for this state, not a fourth variant of it.
  await expect(editor.getByRole('button', { name: 'Save measure' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Save steps' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Add step' })).toBeDisabled();
  // Nobody holds the pen here — `releasePen` above — so the frame is "Start editing", the one this
  // reader can act on. The peer-holds-it frame is proven in `e2e-edit/pen-handoff.spec.ts`, which
  // is the only place two real actors exist (ADR-0083 M7, `docs/TECH_DEBT.md` #115).
  await expect(editor.getByText(/Start editing to change this activity/i).first()).toBeVisible();

  await editor.getByRole('tab', { name: 'General' }).click();
  // Shut, and still readable: the name is the one field a reader most needs while the scope is
  // closed to them, and `disabled` would have taken it out of the tab order (ADR-0083 D1).
  const name = editor.getByLabel('Name');
  await expect(name).toHaveAttribute('readonly', '');
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('Strip formwork');
  await expect(editor.getByRole('button', { name: 'Save general' })).toBeDisabled();
});

test('asks before discarding unsaved work on Escape', async ({ account, page }) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Backfill');

  await openEditor(page, 'Backfill', 'Edit');
  const editor = activityEditor(page);
  await editor.getByLabel('Name').fill('Backfill and compact');

  /**
   * The Escape reflex is precisely the case this guard exists for — and with up to three scopes
   * independently dirty, it risks three forms' work rather than one.
   *
   * **This assertion went red at ADR-0099 M10 and was right the whole time.** Moving the editor into
   * the drawer took away the platform reflex it had been resting on: a `<dialog>`'s `cancel` fires
   * wherever focus is, and a drawer has no such thing, while the shell's own Escape rung defers to
   * text entry (ADR-0079) — so with the caret in this very field Escape did nothing at all. The
   * first fix was to rewrite this test to assert the new behaviour, which is the failure this
   * repository records most often: changing the test to match the code instead of deciding what the
   * product should do. Reverted, and the editor got the Escape rung the modal had for free.
   */
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/General has unsaved changes/)).toBeVisible();

  await confirm.getByRole('button', { name: 'Discard' }).click();
  // Discarded, not saved: the row keeps its original name.
  await expect(page.getByRole('cell', { name: 'Backfill', exact: true })).toBeVisible();
});

/**
 * The convergence epic's own claims (`VITE_ACTIVITY_EDITOR_CONVERGENCE`), each of which needs a
 * **real API with the lock enforced** to mean anything:
 *
 * - A link is a pen-gated write. The tab shades without the pen *and* the server refuses.
 * - A cycle is refused by the engine, not by the client (ADR-0021) — untestable against a mock,
 *   which will happily "create" one.
 * - Two scopes in one session — a definition edit and a link — close with **no** discard prompt,
 *   because a link is durable the moment it is added. That is the save model, end to end.
 */
test('a planner adds a link from the Logic tab, and the row appears in Predecessors', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');

  await openEditor(page, 'Pour slab', 'Logic');
  const editor = activityEditor(page);
  await expect(editor.getByRole('tab', { name: /Logic/, selected: true })).toBeVisible();

  await editor.getByLabel('Predecessor activity').selectOption({ label: 'Excavate' });
  await editor.getByRole('button', { name: 'Add link' }).click();
  // The new row in the table above IS the feedback — no dialog closes over it.
  await expect(editor.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();

  // A link that closes a loop is refused by the engine, inline, with nothing created.
  await editor.getByLabel('Link it as').selectOption('successor');
  await editor.getByLabel('Successor activity').selectOption({ label: 'Excavate' });
  await editor.getByRole('button', { name: 'Add link' }).click();
  await expect(editor.getByRole('alert')).toContainText(/cycle/i);

  // Closing needs no confirmation: the link is already saved, so no scope is dirty.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('without the pen, the Logic tab is read-only and the server refuses a write', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');
  await releasePen(page);

  await openEditor(page, 'Pour slab', 'Logic');
  const editor = activityEditor(page);
  // Shaded with the reason, not hidden and not silently inert.
  const add = editor.getByRole('button', { name: 'Add link' });
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await expect(editor.getByText('Start editing to change this activity.')).toBeVisible();

  // The client's gate is a courtesy; the server is the trust boundary. A direct POST is 423 even
  // though the UI would not have sent it.
  const { orgSlug } = account;
  // The plan id comes from the URL rather than a list read: there is no org-level plans route, and
  // guessing at one is how a test ends up asserting its own fetch instead of the server's rule.
  const planId = /\/plans\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  expect(planId).not.toBe('');
  const status = await page.evaluate(
    async ({ slug, planId }) => {
      const acts = await fetch(`/api/v1/organizations/${slug}/plans/${planId}/activities`).then(
        (r) => r.json(),
      );
      const rows = acts.data as { id: string; name: string }[];
      const res = await fetch(`/api/v1/organizations/${slug}/plans/${planId}/dependencies`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          predecessorId: rows.find((a) => a.name === 'Excavate')!.id,
          successorId: rows.find((a) => a.name === 'Pour slab')!.id,
          type: 'FS',
          lagDays: 0,
          lagCalendar: 'PROJECT_DEFAULT',
        }),
      });
      return res.status;
    },
    { slug: orgSlug, planId },
  );
  expect(status).toBe(423);
});

test('a resource assigned from the Resources tab persists', async ({ account, page }) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Pour slab');

  // The library is org-level; create one row through the API rather than a second UI journey.
  await page.evaluate(async (slug) => {
    await fetch(`/api/v1/organizations/${slug}/resources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Crew A', kind: 'LABOUR' }),
    });
  }, account.orgSlug);

  await openEditor(page, 'Pour slab', 'Resources');
  const editor = activityEditor(page);
  await expect(editor.getByRole('tab', { name: /Resources/, selected: true })).toBeVisible();
  // The picker is the shared searched Combobox (`VITE_LIBRARY_SCOPING` is default-on), not a
  // native select — the `e2e-library` precedent.
  await editor.getByRole('combobox', { name: 'Resource', exact: true }).press('ArrowDown');
  await editor
    .getByRole('option', { name: /Crew A/ })
    .first()
    .click();
  await editor
    .getByRole('group', { name: 'Assign a resource' })
    .getByLabel('Budgeted units')
    .fill('8');
  await editor.getByRole('button', { name: 'Assign resource' }).click();

  // The assignment lands in the list above, with its units.
  await expect(editor.getByRole('listitem').filter({ hasText: 'Crew A' })).toBeVisible();
  // By role, not label: the row's Save carries `aria-label="Save budgeted units for Crew A"`, which
  // a label lookup matches too.
  await expect(
    editor.getByRole('listitem').getByRole('spinbutton', { name: 'Budgeted units' }),
  ).toHaveValue('8');
});

/**
 * **State that carries between openings, and a draft that dies on a tab switch**
 * (`docs/specs/activity-editor-seeding/`, journeys J2 and J4).
 *
 * J2 and J4 were `test.fail()` from M0: each asserts what the epic delivers, so it failed on the tree
 * that had the defect, and `test.fail()` kept the suite green while recording that. Playwright reports
 * a `test.fail()` that starts passing as a FAILURE, so the milestone that fixes one removes the marker
 * rather than finding out in review: J2's went with M3a, J4's with M4. Neither has been run by their
 * authors — the orchestrator runs them centrally (`scripts/e2e-local.sh web:activity-editor`).
 */
test('J2 — a discarded draft leaves nothing armed for the next opening', async ({
  account,
  page,
}, testInfo) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Backfill');

  await openEditor(page, 'Backfill', 'Edit');
  await activityEditor(page).getByLabel('Name').fill('Backfill and compact');
  await page.keyboard.press('Escape');
  await page
    .getByRole('alertdialog', { name: 'Discard unsaved changes?' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();
  // Focus returns to the opener. `openEditor` opens through the row's "Actions for …" menu and
  // clicks a menu item, so the item the dialog saw as focused at open is UNMOUNTED by the time it
  // closes — the trigger button is the only honest place for focus to land, and this asserts it.
  await expect(page.getByRole('button', { name: 'Actions for Backfill' })).toBeFocused({
    timeout: 5000,
  });

  // Reopen the SAME activity. Today the guard that watches for a changed subject ran while the
  // editor was closed and armed a confirmation nobody could see; it comes up with the editor, in
  // the same top layer, beneath it. The screenshot is the evidence of the stacking, which jsdom
  // cannot show.
  await openEditor(page, 'Backfill', 'Edit');
  await testInfo.attach('j2-reopened-editor', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await expect(page.getByRole('alertdialog')).toBeHidden();

  // And a dirty Escape on the reopened editor shows a confirmation the reader can operate.
  await activityEditor(page).getByLabel('Name').fill('Backfill again');
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Backfill', exact: true })).toBeVisible();
});

test('a clean Close returns focus to the control that opened the editor', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Compact fill');

  await openEditor(page, 'Compact fill', 'Edit');
  await activityEditor(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();
  // The opener is a menu item whose menu has unmounted, so the row's "Actions for …" trigger is the
  // expected landing place.
  await expect(page.getByRole('button', { name: 'Actions for Compact fill' })).toBeFocused({
    timeout: 5000,
  });
});

/**
 * **Chrome's close watcher** (descriptive, not prescriptive). A second Escape within a short window
 * can be delivered as a `close` without a preceding `cancel`, bypassing `confirmBeforeClose`. This
 * drives Escape, Escape (dismisses the confirmation), Escape and reports which of the two outcomes
 * the product reaches. Both are acceptable; a third — editor gone with a confirmation armed for the
 * next opening, or dirty work lost with no prompt — is the defect.
 */
test('Escape, Escape, Escape on a dirty editor ends in a consistent state', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Screed');

  await openEditor(page, 'Screed', 'Edit');
  const editor = activityEditor(page);
  const tablist = page.getByRole('tablist', { name: 'Activity sections' });
  const confirm = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  await editor.getByLabel('Name').fill('Screed and level');

  await page.keyboard.press('Escape');
  await expect(confirm, 'first Escape on a dirty editor must open the confirmation').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirm, 'second Escape must dismiss only the confirmation').toBeHidden();
  await expect(tablist, 'the editor must survive dismissing its confirmation').toBeVisible();
  await page.keyboard.press('Escape');

  // Let a late close event land before sampling.
  await page.waitForTimeout(500);
  const editorOpen = await tablist.isVisible();
  const confirmShown = await confirm.isVisible();
  if (editorOpen) {
    expect(
      confirmShown,
      'OUTCOME A: editor still open after the third Escape, so the guard must be showing its confirmation',
    ).toBe(true);
    await confirm.getByRole('button', { name: 'Discard' }).click();
    await expect(tablist).toBeHidden();
  } else {
    expect(
      confirmShown,
      'OUTCOME B: editor closed after the third Escape, so no confirmation may be left showing',
    ).toBe(false);
  }

  // Either way, reopening must come up clean: nothing armed, and the dirty name not carried over.
  await openEditor(page, 'Screed', 'Edit');
  await expect(
    page.getByRole('alertdialog'),
    `nothing may be armed on reopen (outcome ${editorOpen ? 'A' : 'B'})`,
  ).toBeHidden();
  await expect(
    editor.getByLabel('Name'),
    `a dirty draft must not survive reopening (outcome ${editorOpen ? 'A' : 'B'})`,
  ).toHaveValue('Screed');
});

test('J4 — a Progress draft and a weighted step survive a visit to another tab', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Fit windows');

  await openEditor(page, 'Fit windows', 'Progress');
  const editor = activityEditor(page);
  await editor.getByLabel('Percent complete').fill('55');
  await editor.getByRole('tab', { name: /^General/ }).click();
  await editor.getByRole('tab', { name: /^Progress/ }).click();
  await expect(editor.getByLabel('Percent complete')).toHaveValue('55');
  await editor.getByRole('button', { name: 'Save progress' }).click();
  await expect(editor.getByText('Saved.').first()).toBeVisible();

  // Closed and reopened: the value is the saved one, not a leftover draft.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();
  await openEditor(page, 'Fit windows', 'Progress');
  await expect(editor.getByLabel('Percent complete')).toHaveValue('55');

  await editor.getByRole('button', { name: 'Add step' }).click();
  await editor.getByLabel('Step 1 name').fill('Frames in');
  await editor.getByRole('tab', { name: /^General/ }).click();
  await editor.getByRole('tab', { name: /^Progress/ }).click();
  await expect(editor.getByLabel('Step 1 name')).toHaveValue('Frames in');
  await editor.getByRole('button', { name: 'Save steps' }).click();
  await expect(editor.getByLabel('Step 1 name')).toHaveValue('Frames in');
});

/**
 * **New activity starts clean on every opening** (`docs/specs/activity-editor-seeding/`, J5).
 *
 * A negative levelling priority is invalid and a milestone then hides the only field that holds it,
 * so the submit fails with nothing on screen to carry the message and the form says so itself in an
 * alert. That alert used to survive Cancel, Discard and the next opening; the form is now built per
 * opening, so the reopened dialog is clean and creating from it succeeds.
 */
test('J5 — New activity opens clean after a failed submit was discarded', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await showActivities(page);

  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog', { name: 'New activity' });
  await dialog.getByLabel('Name').fill('Pour slab');
  await dialog.getByLabel('Levelling priority').fill('-1');
  await dialog.getByLabel('Type', { exact: true }).selectOption('START_MILESTONE');
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Change the type back to see and correct it',
  );

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page
    .getByRole('alertdialog', { name: 'Discard unsaved changes?' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'New activity' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveValue('');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);

  await dialog.getByLabel('Name').fill('Pour slab');
  await dialog.getByLabel(/^Duration( \(working days\))?$/).fill('5');
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name: 'Pour slab', exact: true })).toBeVisible();
});

/**
 * **The editor is built per opening** (`docs/specs/activity-editor-seeding/`, journeys J1 and J3;
 * M3b). Written, not run, by their author — the orchestrator runs them centrally
 * (`scripts/e2e-local.sh web:activity-editor`).
 *
 * J1 is a regression guard: `fill` lands in the opening's first task and the value must still be
 * there to save. The jsdom window probe is the proof; M0 could not show a driver reaching it.
 */
test('J1 — a name typed the moment the editor opens is the name that saves', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Set out');

  await openEditor(page, 'Set out', 'Edit');
  const editor = activityEditor(page);
  // No wait between the opening and the keystroke: that gap is the whole point.
  await editor.getByLabel('Name').fill('Set out grid');
  await expect(editor.getByLabel('Name')).toHaveValue('Set out grid');
  await editor.getByRole('button', { name: 'Save general' }).click();
  await expect(editor.getByText('Saved.').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('cell', { name: 'Set out grid', exact: true })).toBeVisible();
});

test('J3 — "Saved." belongs to the opening that saved, not the next one', async ({
  account,
  page,
}) => {
  const stamp = Date.now();
  await enterOrg(page, account.orgSlug);
  await openProject(page, stamp);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Blind');

  await openEditor(page, 'Excavate', 'Edit');
  await activityEditor(page).getByLabel('Name').fill('Excavate basement');
  await activityEditor(page).getByRole('button', { name: 'Save general' }).click();
  // The control: the confirmation appears in the opening that made it.
  await expect(activityEditor(page).getByText('Saved.').first()).toBeVisible();
  await activityEditor(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();

  // Another activity, and then the same one: neither opening inherits the message.
  await openEditor(page, 'Blind', 'Edit');
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeVisible();
  await expect(activityEditor(page).getByText('Saved.')).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await activityEditor(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();

  await openEditor(page, 'Excavate basement', 'Edit');
  await expect(activityEditor(page).getByText('Saved.')).toHaveCount(0);
});
