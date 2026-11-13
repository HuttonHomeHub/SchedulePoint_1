import { holdThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';

import {
  createHierarchy,
  DATA_DATE,
  findBar,
  newPlan,
  onboard,
  placeViaApi,
  recalculate,
  seedActivities,
} from './support';

/**
 * **A refused progress save lands on its field, in plain words** (`docs/specs/progress-before-data-date/`
 * M2, ADR-0217).
 *
 * The walkthrough that started this found a planner typing an Actual finish after the plan's data
 * date, pressing **Save progress**, and seeing nothing happen: the refusal was a one-line alert at the
 * **top** of the Reported progress panel, and at the 1024 × 600 design floor (ADR-0179) the panel is
 * scrolled so that line sits above the fold, beside a Save the reader has just pressed. The journey
 * is at that size because that is the size at which the defect exists.
 *
 * **Why a journey and not a panel test**: jsdom has no viewport, no scroll container and no focus
 * ring, so "the message is in view and unclipped" and "the cursor is in the box" are statements it
 * structurally cannot make.
 *
 * Every assertion is an **invariant** — marked, focused, inside the viewport, inside its scroll
 * container, no sideways scroll, the draft kept, both dates named — never a pixel figure. A figure
 * that held on one machine failed on GitHub's runner the last time one was written here.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 2500;

/** Before the plan's data date (`DATA_DATE`) and after it, as the form's date inputs take them. */
const START_BEFORE = '2026-01-02';
const FINISH_AFTER = '2026-01-12';

test.describe('Progress refusal', () => {
  test('a finish after the data date is refused on its field, in view, at the design floor', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Progress refusal');
    await holdThePen(page);

    const seeded = await seedActivities(page, orgSlug, [{ name: 'Dig footings', laneIndex: 0 }]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await holdThePen(page);

    await findBar(page, dig.id);
    await page.setViewportSize({ width: 1024, height: 600 });

    const dock = page.getByRole('toolbar', { name: /^Actions for / });
    await dock.getByRole('button', { name: 'Progress' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('tab', { name: /Progress/, selected: true })).toBeVisible();

    await editor.getByLabel('Actual start').fill(START_BEFORE);
    await editor.getByLabel('Actual finish').fill(FINISH_AFTER);
    await editor.getByRole('button', { name: 'Save progress' }).click();

    const finish = editor.getByLabel('Actual finish');
    // The refusal sentence, found by what it says rather than where it sits: the Resume date's hint
    // also mentions "the data date", so the match is on the refusal's own opening.
    const refusal = editor.getByText(/is after the plan.s data date/);

    // 1. The field the reader must change is marked and has the cursor. Polled: the reply is async.
    await expect(finish, 'the refused field is marked invalid').toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(finish, 'and holds focus, so the reader can type the fix').toBeFocused();

    // 1b. Nothing covers the focused field: a sticky bar or the dock over it would leave the cursor in
    // a box the reader cannot see. The element at the field's centre is the field or inside it.
    const covered = await finish.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && (hit === el || el.contains(hit)) ? null : (hit?.tagName ?? 'nothing');
    });
    expect(covered, 'the focused field is not covered by anything').toBeNull();

    // 2. The refusal is on screen, not above the fold of a panel scrolled past it.
    await expect(refusal, 'the refusal is inside the viewport').toBeInViewport();

    // 3. …and not clipped by the editor's scroll container.
    const clipped = await refusal.evaluate((el) => {
      let scroller: HTMLElement | null = el.parentElement;
      while (scroller) {
        const overflow = getComputedStyle(scroller).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') break;
        scroller = scroller.parentElement;
      }
      if (!scroller) return 'no scroll container found';
      const inner = el.getBoundingClientRect();
      const outer = scroller.getBoundingClientRect();
      return inner.top >= outer.top && inner.bottom <= outer.bottom
        ? null
        : 'outside its container';
    });
    expect(clipped, 'the refusal lies inside the editor’s scroll container').toBeNull();

    // 4. Nothing pushed the page sideways.
    const sideways = await page.evaluate(() => {
      const root = document.scrollingElement;
      return root ? root.scrollWidth - root.clientWidth : 0;
    });
    expect(sideways, 'no sideways scroll at 1024 wide').toBeLessThanOrEqual(0);

    // 5. The draft is kept and the tab still says so.
    await expect(finish).toHaveValue(FINISH_AFTER);
    await expect(editor.getByLabel('Actual start')).toHaveValue(START_BEFORE);
    await expect(editor.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeVisible();

    // The sentence names both dates, and the field it hangs from is described by it.
    await expect(refusal).toContainText('12 Jan 2026');
    await expect(refusal).toContainText('05 Jan 2026');
    await expect(refusal).toContainText('in Edit plan details, then save again');
    await expect(refusal).not.toContainText('Planned start');
    expect(DATA_DATE, 'the fixture’s data date is the day the sentence quotes').toBe('2026-01-05');
    await expect(finish).toHaveAccessibleDescription(/data date/);
  });
  test('a refused definition save shows its refusal beside Save, and Save describes it', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Save refusal');
    await holdThePen(page);

    const seeded = await seedActivities(page, orgSlug, [{ name: 'Dig footings', laneIndex: 0 }]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await holdThePen(page);

    await findBar(page, dig.id);
    await page.setViewportSize({ width: 1024, height: 600 });

    const dock = page.getByRole('toolbar', { name: /^Actions for / });
    await dock.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('tab', { name: /General/, selected: true })).toBeVisible();

    // A real version conflict: somebody else saves this activity after the editor opened, so the
    // version the editor holds is stale when Save is pressed. The editor reads its version from the
    // list it fetched; nothing here invalidates it.
    await placeViaApi(page, orgSlug, 'Dig footings', '2026-01-12');

    await editor.getByLabel('Name').fill('Dig footings, north strip');
    const save = editor.getByRole('button', { name: 'Save general' });
    await save.focus();
    await save.press('Enter');

    // The refusal says what went wrong and offers the way out; it is found by its way out so the
    // wording of the server's sentence is not pinned here.
    const refresh = editor.getByRole('button', { name: 'Refresh this section' });
    await expect(refresh, 'the refusal offers Refresh this section').toBeVisible();
    const refusal = editor.getByRole('alert').filter({ hasText: /\S/ });
    await expect(refusal).toHaveCount(1);
    const message = ((await refusal.textContent()) ?? '').trim();
    expect(message, 'the refusal says something').not.toBe('');

    // 1. In the viewport, and not clipped by the editor's scroll container.
    await expect(refusal, 'the refusal is inside the viewport').toBeInViewport({ ratio: 1 });
    const clipped = await refusal.evaluate((el) => {
      let scroller: HTMLElement | null = el.parentElement;
      while (scroller) {
        const overflow = getComputedStyle(scroller).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') break;
        scroller = scroller.parentElement;
      }
      if (!scroller) return 'no scroll container found';
      const inner = el.getBoundingClientRect();
      const outer = scroller.getBoundingClientRect();
      return inner.top >= outer.top && inner.bottom <= outer.bottom
        ? null
        : 'outside its container';
    });
    expect(clipped, 'the refusal lies inside the editor’s scroll container').toBeNull();

    // 2. It sits beside the Save that was pressed: the same bar, so both are in view together.
    await expect(save, 'Save is in view with it').toBeInViewport({ ratio: 1 });
    const sameBar = await refusal.evaluate((el, saveLabel) => {
      const button = Array.from(el.closest('form')?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.trim() === saveLabel,
      );
      const bar = button?.closest('[data-scope-save-bar]');
      return bar?.contains(el) === true;
    }, 'Save general');
    expect(sameBar, 'the refusal is inside the Save button’s own bar').toBe(true);

    // 3. Save is described by it, for a screen reader.
    await expect(save).toHaveAccessibleDescription(message);

    // 4. Focus did not move: it is still on Save.
    await expect(save, 'focus stays on the Save that was pressed').toBeFocused();

    // 5. Nothing pushed the page sideways, and nothing in the bar is clipped.
    const sideways = await page.evaluate(() => {
      const root = document.scrollingElement;
      return root ? root.scrollWidth - root.clientWidth : 0;
    });
    expect(sideways, 'no sideways scroll at 1024 wide').toBeLessThanOrEqual(0);
    for (const control of [save, refresh]) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }

    // 6. The draft is kept, and the way out recovers the section.
    await expect(editor.getByLabel('Name')).toHaveValue('Dig footings, north strip');
    await refresh.click();
    await expect(save, 'Refresh hands focus to the Save that stays').toBeFocused();
    await expect(editor.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(editor.getByLabel('Name')).toHaveValue('Dig footings');
  });

  test('a planner moves the data date, the foot row shows it at once, and the refused save succeeds', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 2);
    await createHierarchy(page);
    await newPlan(page, 'Data date');
    await holdThePen(page);

    const seeded = await seedActivities(page, orgSlug, [{ name: 'Dig footings', laneIndex: 0 }]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await holdThePen(page);

    await findBar(page, dig.id);
    await page.setViewportSize({ width: 1024, height: 600 });

    // The refusal first, so the planner is sent to the plan's details by it.
    const dock = page.getByRole('toolbar', { name: /^Actions for / });
    await dock.getByRole('button', { name: 'Progress' }).click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Actual start').fill(START_BEFORE);
    await editor.getByLabel('Actual finish').fill(FINISH_AFTER);
    await editor.getByRole('button', { name: 'Save progress' }).click();
    await expect(editor.getByLabel('Actual finish')).toHaveAttribute('aria-invalid', 'true');
    await expect(editor.getByText(/is after the plan.s data date/)).toContainText(
      'Move the data date to 12 Jan 2026 or later in Edit plan details, then save again.',
    );
    // The draft is unsaved, so closing asks first; the planner has to discard it to go and move the date.
    await editor.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('alertdialog', { name: 'Discard unsaved changes?' })
      .getByRole('button', { name: 'Discard' })
      .click();
    await expect(editor).toBeHidden();

    // The foot row reads the day the schedule was last given, and says so under its own name.
    await expect(page.getByLabel('Data date: 05 Jan 2026')).toBeVisible();

    // The field is called what the sentence calls it, and the hint says what the date does.
    await page.getByRole('button', { name: 'Edit plan details' }).click();
    const details = page.getByRole('dialog');
    const dataDate = details.getByLabel('Data date');
    await expect(dataDate, 'the plan’s date box is labelled Data date').toHaveValue(DATA_DATE);
    await expect(dataDate).toHaveAccessibleDescription(/Progress can be reported up to it/);
    await dataDate.fill(FINISH_AFTER);
    await details.getByRole('button', { name: 'Save changes' }).click();
    await expect(details).toBeHidden();

    // Fresh without Recalculate and without a reload: the footer is not waiting for either.
    await expect(
      page.getByLabel('Data date: 12 Jan 2026'),
      'the foot row shows the new data date straight away',
    ).toBeVisible();

    // And the save that was refused now goes through, with the same dates.
    await findBar(page, dig.id);
    await dock.getByRole('button', { name: 'Progress' }).click();
    const again = page.getByRole('dialog');
    await again.getByLabel('Actual start').fill(START_BEFORE);
    await again.getByLabel('Actual finish').fill(FINISH_AFTER);
    await again.getByRole('button', { name: 'Save progress' }).click();
    await expect(again.getByText('Saved.')).toBeVisible();
    await expect(again.getByLabel('Actual finish')).not.toHaveAttribute('aria-invalid', 'true');
  });
});
