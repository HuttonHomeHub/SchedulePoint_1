import { expect, test } from '../e2e-support/test';

import {
  createHierarchy,
  DATA_DATE,
  ensurePen,
  findBar,
  newPlan,
  onboard,
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
    await ensurePen(page);

    const seeded = await seedActivities(page, orgSlug, [{ name: 'Dig footings', laneIndex: 0 }]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await ensurePen(page);

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
    expect(DATA_DATE, 'the fixture’s data date is the day the sentence quotes').toBe('2026-01-05');
    await expect(finish).toHaveAccessibleDescription(/data date/);
  });
});
