import { type Locator, type Page } from '@playwright/test';

import {
  colourBehind,
  computed,
  differsFromAbsent,
  marksOf,
  pseudoOf,
  systemColours,
  type Computed,
} from '../e2e-gantt/forced-colors-support';
import {
  createClient,
  createPlan,
  createProject,
  ensurePen,
  FORCED_COLOURS_PLAN as PLAN,
  ganttGrid,
  ganttRow,
  onboard,
  seedForcedColoursPlan,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';
import { expect, test } from '../e2e-support/test';
import { unfoldViewSections } from '../e2e-support/toolbar';
import { clearMeasurement, writeMeasurement } from '../measure-toolbar/output';

/**
 * **Contrast themes, M2-T1: measure the problem before building the remedy**
 * (`docs/specs/pre-1-0-batch-2/`, spec §4.1, ADR-0113 / ADR-0142; `docs/TECH_DEBT.md` #505).
 *
 * A harness, **not a gate**: not a CI step, and nothing fails a build on its numbers. It writes
 * `measure-output/forced-colors-m2.json` for a human to read, and the verdicts go into
 * `docs/specs/pre-1-0-batch-2/m2-measurement.md`. The only assertions are the **pinned positives**
 * (the instrument found what it set out to measure), because a measurement that silently measured
 * nothing reads as a clean pass (ADR-0110 D5).
 *
 * ## What it reads, for `forcedColors: 'active'` and then `'none'` on the same live page
 *
 * 1. Every Gantt mark (task bar, critical bar, float tail, summary bar, milestone, progress on a
 *    task and on a summary, the baseline ghost where the plan draws one): computed `color`,
 *    `background-color`, border, `box-shadow`, `opacity`, `forced-color-adjust`, and whether the
 *    mark's box differs from the same box with the mark hidden (the "does it vanish" question).
 * 2. The selected row. The `Highlight` FILL was tried first and withdrawn (ADR-0191 D2): it needs
 *    `forced-color-adjust: none`, which inherits and un-forces every control and cell inside the row,
 *    and a descendant's `Highlight` focus ring sits on a `Highlight` fill. So this reads the shipped
 *    form, a 4 px `Highlight` pseudo-element edge on the sticky first cell, plus the row, its name
 *    cell, a menu trigger and a bar inside it (all expected in the reader's own colours,
 *    `forced-color-adjust: auto`), and a focused control inside it (does the `Highlight` ring show
 *    against what is behind it).
 *
 * 3. A dependency arrow's stroke with the logic links on.
 * 4. A row menu with a shaded item and an available one; a `Button` shaded by an in-flight save
 *    (default variant, live) and an outline-variant clone of the dialog's Cancel button with
 *    `aria-disabled` set (the other variants share the same unlayered rule and differ only in
 *    fill, which forced colours replaces).
 * 5. **Every existing forced-colours rule against the global rule**, empirically: each element in
 *    the workspace carrying `aria-disabled="true"` (the toolbar's shaded members, its pressed and
 *    shaded member, the split button's caret) with its computed colour and fill. The pressed
 *    exclusion is the known case: a pressed and shaded member must keep `Canvas` ink on a
 *    `GrayText` fill. `viewport-notice.tsx` and `conflict-readout.ts` are read, not driven: the
 *    notice is a `div` card and the readout an icon, neither an interactive role carrying
 *    `aria-disabled`, so the global selector cannot match them.
 *
 * ## The fixture
 *
 * `seedForcedColoursPlan` (`e2e-gantt/support.ts`): an ordinary task with progress, a critical
 * task, a task with float, a summary with a child with progress, a finish milestone, FS links and
 * a captured baseline.
 *
 * Emulation is Chromium's, not real Windows with a real theme (`docs/TECH_DEBT.md` #154).
 */

const OUT = 'forced-colors-m2';

interface Limb<T> {
  value?: T;
  error?: string;
}

async function limb<T>(fn: () => Promise<T>): Promise<Limb<T>> {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: e instanceof Error ? (e.message.split('\n')[0] ?? String(e)) : String(e) };
  }
}

/** Computed values plus whether the box paints anything a reader can see. */
async function mark(page: Page, target: Locator) {
  // A mark that is absent is a finding, not a wait: `evaluate` on nothing blocks until the test times out.
  if ((await target.count()) === 0) return { count: 0 };
  return {
    count: await target.count(),
    computed: await computed(target.first()),
    differsFromAbsent: await differsFromAbsent(page, target.first()),
  };
}

/** Every `aria-disabled` element in the document, classified, with what it computes to. */
async function shadedElements(page: Page) {
  return page.evaluate(() => {
    const rows: Record<string, unknown>[] = [];
    for (const el of document.querySelectorAll('[aria-disabled="true"]')) {
      const style = getComputedStyle(el);
      rows.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        pressed: el.getAttribute('aria-pressed'),
        item: el.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ?? null,
        label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderTopColor,
        opacity: style.opacity,
        forcedColorAdjust: style.forcedColorAdjust,
      });
    }
    return rows;
  });
}

test('M2-T1: contrast-theme readings of the Gantt, shaded controls and existing rules', async ({
  page,
}) => {
  test.setTimeout(600_000);
  clearMeasurement(OUT);

  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedForcedColoursPlan(page, orgSlug);
  await showGantt(page);
  await expect(ganttGrid(page)).toBeVisible();
  await ensurePen(page);
  // Buttons carry `transition-colors`: a read right after a mode switch is a point on a transition.
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important}',
  });

  // Pinned positives: the marks exist and the critical one is critical.
  await expect(marksOf(page, PLAN.critical).bar).toHaveCount(1);
  await expect(marksOf(page, PLAN.critical).bar).toHaveClass(/ring-destructive/);
  await expect(marksOf(page, PLAN.float).floatTail).toHaveCount(1);
  await expect(marksOf(page, PLAN.milestone).milestone).toHaveCount(1);
  await expect(marksOf(page, PLAN.summary).bar).toHaveCount(1);
  await expect(marksOf(page, PLAN.child).progress).toHaveCount(1);

  await ganttRow(page, PLAN.task).click();
  await expect(ganttRow(page, PLAN.task)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await unfoldViewSections(page);
  await page.getByRole('checkbox', { name: 'Logic links' }).check();
  await page.keyboard.press('Escape');

  const result: Record<string, unknown> = {};

  for (const mode of ['active', 'none'] as const) {
    await page.emulateMedia({ forcedColors: mode });
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(
      mode === 'active',
    );
    const reading: Record<string, unknown> = { system: await systemColours(page) };

    // ------------------------------------------------------------------------------- marks
    const task = marksOf(page, PLAN.float);
    const critical = marksOf(page, PLAN.critical);
    const summary = marksOf(page, PLAN.summary);
    const child = marksOf(page, PLAN.child);
    const milestone = marksOf(page, PLAN.milestone);
    const selected = marksOf(page, PLAN.task);
    reading.marks = {
      taskBar: await limb(() => mark(page, task.bar)),
      criticalBar: await limb(() => mark(page, critical.bar)),
      floatTail: await limb(() => mark(page, task.floatTail)),
      summaryBar: await limb(() => mark(page, summary.bar)),
      milestone: await limb(() => mark(page, milestone.milestone)),
      progressOnTask: await limb(() => mark(page, selected.progress)),
      progressOnChild: await limb(() => mark(page, child.progress)),
      progressOnSummary: await limb(() => mark(page, summary.progress)),
      baselineGhost: await limb(() => mark(page, task.ghost)),
    };

    // ------------------------------------------------------------------------- selected row
    const nameCell = selected.row.getByRole('gridcell', { name: new RegExp(`^${PLAN.task}`) });
    const sticky = selected.row.getByRole('gridcell').first().locator('xpath=..');
    reading.selectedRow = {
      row: await limb(() => computed(selected.row)),
      stickyCell: await limb(() => computed(sticky)),
      edge: await limb(() => pseudoOf(sticky, '::before')),
      armedBar: await limb(() => computed(selected.bar)),
      grip: await limb(() => computed(selected.bar.locator('[data-bar-grip] > span').first())),
      behindTrigger: await limb(() =>
        colourBehind(selected.row.getByRole('button', { name: /^Actions for/ })),
      ),
      nameCell: await limb(() => computed(nameCell)),
      // Descendants with their own colour classes, the risk named in spec §4.1: the variance
      // value (`text-destructive` when late) and the row menu trigger.
      menuTrigger: await limb(() =>
        computed(selected.row.getByRole('button', { name: /^Actions for/ })),
      ),
      barInsideIt: await limb(() => computed(selected.bar)),
      // Does a keyboard ring show on a control inside a Highlight row? The ring is an unlayered
      // `:focus-visible` outline in `Highlight`.
      focusedControl: await limb(async () => {
        const trigger = selected.row.getByRole('button', { name: /^Actions for/ });
        await page.keyboard.press('Shift');
        await trigger.focus();
        const read = await computed(trigger);
        return {
          ...read,
          focusVisible: await trigger.evaluate((n) => n.matches(':focus-visible')),
        };
      }),
    };

    // ---------------------------------------------------------------------------- an arrow
    reading.arrow = await limb(async () => {
      const path = page.locator('[data-testid="gantt-scroll"] svg path').first();
      const read = await path.evaluate((node) => {
        const style = getComputedStyle(node);
        return { stroke: style.stroke, strokeWidth: style.strokeWidth, fill: style.fill };
      });
      return { ...read, differsFromAbsent: await differsFromAbsent(page, path) };
    });

    // ---------------------------------------------------------------------- the row menu
    reading.menu = await limb(async () => {
      await ganttRow(page, PLAN.critical)
        .getByRole('button', { name: /^Actions for/ })
        .click();
      const open = page.getByRole('menu');
      await expect(open).toBeVisible();
      const shaded = open.locator('[role="menuitem"][aria-disabled="true"]').first();
      const available = open.locator('[role="menuitem"]:not([aria-disabled="true"])').first();
      const out = {
        shadedLabel: await shaded.textContent(),
        shaded: await computed(shaded),
        availableLabel: await available.textContent(),
        available: await computed(available),
      };
      await page.keyboard.press('Escape');
      await expect(open).toBeHidden();
      return out;
    });

    // ----------------------------------------------- the toolbar, shaded with the pen released
    reading.shadedWithPen = await limb(() => shadedElements(page));
    await page.getByRole('button', { name: 'Stop editing' }).click();
    await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
    reading.shadedWithoutPen = await limb(() => shadedElements(page));
    await page.getByRole('button', { name: 'Start editing' }).click();
    await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();

    result[mode] = reading;
  }

  // --------------------------------------------------- a shaded Button, in flight, both modes
  const buttons: Record<string, unknown> = {};
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/organizations/*/plans/*/activities', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await gate;
    await route.continue();
  });
  await ganttRow(page, PLAN.critical)
    .getByRole('button', { name: /^Actions for/ })
    .click();
  await page.getByRole('menuitem', { name: 'Insert activity below' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill('Pending forced colours');
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  const pending = dialog.getByRole('button', { name: 'Saving…' });
  await expect(pending).toHaveAttribute('aria-disabled', 'true');
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  for (const mode of ['active', 'none'] as const) {
    await page.emulateMedia({ forcedColors: mode });
    buttons[mode] = {
      defaultVariantPending: await limb(() => computed(pending)),
      outlineVariantShaded: await limb(async () => {
        await cancel.evaluate((n) => n.setAttribute('aria-disabled', 'true'));
        const read: Computed = await computed(cancel);
        await cancel.evaluate((n) => n.removeAttribute('aria-disabled'));
        return read;
      }),
      dialogShadedAction: await limb(() => shadedElements(page)),
    };
  }
  release();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  result.buttons = buttons;

  const path = writeMeasurement(OUT, {
    viewport: page.viewportSize(),
    note: 'forcedColors toggled with page.emulateMedia on one live page; see the docblock',
    ...result,
  });
  test.info().annotations.push({ type: 'measurement', description: path });
});
