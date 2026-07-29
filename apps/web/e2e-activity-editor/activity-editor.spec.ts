import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  addActivity,
  createAndOpenPlan,
  ensurePen,
  onboard,
  openEditor,
  openProject,
  releasePen,
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
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Erect frame');

  await openEditor(page, 'Erect frame', 'Edit');
  const editor = page.getByRole('dialog');

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

test('Report progress and Steps open the same editor on the Progress tab', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Pour slab');

  await openEditor(page, 'Pour slab', 'Report progress');
  const editor = page.getByRole('dialog');
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

  // Steps lands on the same tab — with focus in the panel, not at the top of it.
  await openEditor(page, 'Pour slab', 'Steps');
  await expect(editor.getByRole('tab', { name: 'Progress', selected: true })).toBeVisible();
  await expect(editor.getByRole('heading', { name: 'Weighted steps' })).toBeFocused();
});

test('weighted steps save, then take over the physical % with a reason', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Fit windows');

  await openEditor(page, 'Fit windows', 'Steps');
  const editor = page.getByRole('dialog');

  // Before any steps, the manual physical % is the planner's to set.
  await expect(editor.getByLabel('Physical % complete')).toBeEnabled();

  await editor.getByRole('button', { name: 'Add step' }).click();
  await editor.getByLabel('Step 1 name').fill('Frames in');
  await editor.getByLabel('Step 1 % complete').fill('60');
  // The client previews the same weighted mean the server computes.
  await expect(editor.getByText('60%')).toBeVisible();
  await editor.getByRole('button', { name: 'Save steps' }).click();

  // Once saved, the steps WIN — and the manual field says so rather than silently being ignored,
  // which is the defect that started this epic.
  await expect(editor.getByLabel('Physical % complete')).toBeDisabled();
  await expect(editor.getByText(/Weighted steps are setting this to 60%/)).toBeVisible();
});

test('losing the pen shuts the definition scopes and leaves progress open', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Strip formwork');
  await releasePen(page);

  await openEditor(page, 'Strip formwork', 'Report progress');
  const editor = page.getByRole('dialog');

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
  await expect(editor.getByText(/Start editing to change this activity/i).first()).toBeVisible();

  await editor.getByRole('tab', { name: 'General' }).click();
  await expect(editor.getByLabel('Name')).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Save general' })).toBeDisabled();
});

test('asks before discarding unsaved work on Escape', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Backfill');

  await openEditor(page, 'Backfill', 'Edit');
  const editor = page.getByRole('dialog').first();
  await editor.getByLabel('Name').fill('Backfill and compact');

  // The Escape reflex is precisely the case this guard exists for — and with up to three scopes
  // independently dirty, it now risks three forms' work rather than one.
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
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');

  await openEditor(page, 'Pour slab', 'Logic');
  const editor = page.getByRole('dialog');
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
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');
  await releasePen(page);

  await openEditor(page, 'Pour slab', 'Logic');
  const editor = page.getByRole('dialog');
  // Shaded with the reason, not hidden and not silently inert.
  const add = editor.getByRole('button', { name: 'Add link' });
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await expect(editor.getByText('Start editing to change this activity.')).toBeVisible();

  // The client's gate is a courtesy; the server is the trust boundary. A direct POST is 423 even
  // though the UI would not have sent it.
  const orgSlug = `editor-co-${stamp}`;
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

test('a resource assigned from the Resources tab persists', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
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
  }, orgSlug);

  await openEditor(page, 'Pour slab', 'Resources');
  const editor = page.getByRole('dialog');
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
