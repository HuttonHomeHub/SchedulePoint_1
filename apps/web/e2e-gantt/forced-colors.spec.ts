import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';
import { unfoldViewSections } from '../e2e-support/toolbar';

import {
  colourBehind,
  computed,
  differsFromAbsent,
  marksOf,
  pseudoOf,
  systemColours,
  type Computed,
  type SystemColour,
} from './forced-colors-support';
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
} from './support';

/**
 * **Under a Windows contrast theme the Gantt is still a chart, and a shaded control still looks
 * shaded** (`docs/TECH_DEBT.md` #505, ADR-0191; spec `docs/specs/pre-1-0-batch-2/` §4.1).
 *
 * Forced colours replaces author colours, drops `box-shadow`, and forces every `background-color`
 * to `Canvas`. The Gantt's bars were a fill and a 1-2 px inset ring, so they were the same colour
 * as the page; a shaded menu item or button is `aria-disabled` and muted by colour and opacity,
 * so it looked available. The fix is one global `GrayText` rule for shaded interactive roles
 * (`globals.css`) and `forced-colors:` forms on the Gantt's marks (`components/ui/forced-colors.ts`,
 * placed in `GanttPanel.tsx`).
 *
 * **Primary assertion: the computed system colour**, read from the browser and compared with the
 * same colour resolved from a probe, so nothing assumes a palette. **Supplementary: the mark's
 * box photographed with the mark and without it must differ**, so a rule that resolves to a
 * colour nobody can see cannot pass on the computed read alone (the way `e2e-forced-colors/
 * focus-ring.spec.ts` and `deck-tracks-forced-colors.spec.ts` do it).
 *
 * **Its control is `forcedColors: 'none'`.** The same page is read again in ordinary colours, and
 * none of the forced values may be present: a green forced half could otherwise be a rule that
 * leaked into both modes.
 *
 * **One onboarding for all of it.** The mode is switched on the live page with
 * `page.emulateMedia`, which is the same Chromium media emulation `test.use({ forcedColors })`
 * applies at context creation, so the plan, the seeded marks and the shaded states are shared
 * between the two readings. This is Chromium's emulation and not real Windows with a real theme:
 * `docs/TECH_DEBT.md` #154 is untouched and the device check sheet (steps 22-23) still confirms.
 *
 * **The selected row is an edge, not a fill (ADR-0191 D2).** A `Highlight` fill needs
 * `forced-color-adjust: none`, which inherits and would un-force every control and cell inside
 * the row, and a descendant's `Highlight` focus ring would sit on a `Highlight` fill. So the checks
 * here are that the row's mark is a `Highlight` pseudo-element edge, that nothing inside the row
 * was un-forced, and that a focus ring inside the row differs from what it is drawn on.
 *
 * **Not covered here, by decision (ADR-0191 D3):** the TSLD diagram keeps its own palette under a
 * contrast theme, so it has no assertion; `docs/TECH_DEBT.md` #508 tracks that choice.
 *
 * **Verified red** by removing the shaded-control rule from `globals.css` (the menu item and the
 * pending button keep `ButtonText`) and, separately, the `forced-colors:` classes from
 * `GanttPanel.tsx` (the bar, summary, milestone, progress and selected-row computed colours are
 * `Canvas` / the page's own).
 */
test.describe.configure({ mode: 'serial' });

/**
 * Buttons carry `transition-colors`, so a colour read in the frame after the mode switch is a point
 * on a transition from the previous mode's value, not the value the rules resolve to.
 */
const NO_TRANSITIONS = '*,*::before,*::after{transition:none!important;animation:none!important}';

/** Hold the create request open so the dialog's submit stays `aria-disabled`, then let it go. */
function holdCreateRequest(page: Page): Promise<() => void> {
  return new Promise((resolveHandle) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void page
      .route('**/api/v1/organizations/*/plans/*/activities', async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        await gate;
        await route.continue();
      })
      .then(() => resolveHandle(release));
  });
}

type Mode = 'active' | 'none';

interface Readings {
  system: Record<SystemColour, string>;
  task: Computed;
  critical: Computed;
  summary: Computed;
  summaryProgress: Computed;
  milestone: Computed;
  progressOnTask: Computed;
  floatTail: Computed;
  selectedRow: Computed;
  selectedStickyCell: Computed;
  selectedEdge: Awaited<ReturnType<typeof pseudoOf>>;
  selectedNameCell: Computed;
  selectedBar: Computed;
  armedBar: Computed;
  grip: Computed;
  triggerFocus: Computed & { behind: string };
  openCell: Computed & { behind: string };
  ghost: Computed | null;
  visible: Record<'task' | 'critical' | 'summary' | 'milestone' | 'progress' | 'grip', boolean>;
}

async function readMarks(page: Page): Promise<Readings> {
  const task = marksOf(page, PLAN.float);
  const critical = marksOf(page, PLAN.critical);
  const summary = marksOf(page, PLAN.summary);
  const milestone = marksOf(page, PLAN.milestone);
  const child = marksOf(page, PLAN.child);
  const selected = marksOf(page, PLAN.task);
  const grip = selected.bar.locator('[data-bar-grip] > span').first();
  const sticky = selected.row.getByRole('gridcell').first().locator('xpath=..');
  const trigger = selected.row.getByRole('button', { name: /^Actions for/ });

  // A keyboard ring inside the selected row: focus the trigger the way a Tab would.
  await page.keyboard.press('Shift');
  await trigger.focus();
  await expect(trigger).toBeFocused();
  expect(await trigger.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
  const triggerFocus = { ...(await computed(trigger)), behind: await colourBehind(trigger) };

  // An open cell inside the selected row: its ink must differ from its fill.
  const durationCell = selected.row.getByRole('gridcell').nth(2);
  await durationCell.dblclick();
  const field = page.getByRole('textbox', { name: new RegExp(`Duration, ${PLAN.task}`) });
  await expect(field, 'the pinned open cell').toBeVisible();
  const openCell = { ...(await computed(field)), behind: await colourBehind(field) };
  await page.keyboard.press('Escape');
  await expect(field).toBeHidden();
  // Escape closes the editor; make sure it left the row selected for the reads that follow.
  if ((await selected.row.getAttribute('aria-selected')) !== 'true') await selected.row.click();

  const ghost = marksOf(page, PLAN.float).ghost;
  return {
    system: await systemColours(page),
    task: await computed(task.bar),
    critical: await computed(critical.bar),
    summary: await computed(summary.bar),
    summaryProgress: await computed(summary.progress),
    milestone: await computed(milestone.milestone),
    progressOnTask: await computed(child.progress),
    floatTail: await computed(task.floatTail),
    selectedRow: await computed(selected.row),
    selectedStickyCell: await computed(sticky),
    selectedEdge: await pseudoOf(sticky, '::before'),
    selectedNameCell: await computed(
      selected.row.getByRole('gridcell', { name: new RegExp(`^${PLAN.task}`) }),
    ),
    selectedBar: await computed(selected.bar),
    armedBar: await computed(selected.bar),
    grip: await computed(grip),
    triggerFocus,
    openCell,
    ghost: (await ghost.count()) > 0 ? await computed(ghost) : null,
    visible: {
      task: await differsFromAbsent(page, task.bar),
      critical: await differsFromAbsent(page, critical.bar),
      summary: await differsFromAbsent(page, summary.bar),
      milestone: await differsFromAbsent(page, milestone.milestone),
      progress: await differsFromAbsent(page, child.progress),
      grip: await differsFromAbsent(page, grip),
    },
  };
}

test('a contrast theme keeps the Gantt readable and a shaded control shaded', async ({ page }) => {
  test.setTimeout(480_000);

  // ---------------------------------------------------------------------------- one onboarding
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedForcedColoursPlan(page, orgSlug);
  await showGantt(page);
  await expect(ganttGrid(page)).toBeVisible();
  await ensurePen(page);
  await page.addStyleTag({ content: NO_TRANSITIONS });

  // The pinned positives: every mark the assertions below read exists, and is the kind of mark it
  // is named for. Without them a selector that matched nothing would read as "nothing vanished".
  const critical = marksOf(page, PLAN.critical);
  await expect(critical.bar, 'the critical task has a bar').toHaveCount(1);
  await expect(critical.bar, 'Bravo is on the longest path, so it is critical').toHaveClass(
    /ring-destructive/,
  );
  await expect(marksOf(page, PLAN.float).bar).toHaveCount(1);
  await expect(marksOf(page, PLAN.float).floatTail, 'Delta has float, so a tail').toHaveCount(1);
  await expect(marksOf(page, PLAN.summary).bar).toHaveCount(1);
  await expect(
    marksOf(page, PLAN.summary).progress,
    'the summary rolls its child up to a progress band, which is what the edge protects',
  ).toHaveCount(1);
  await expect(marksOf(page, PLAN.milestone).milestone).toHaveCount(1);
  await expect(marksOf(page, PLAN.child).progress, 'the child shows its 60 %').toHaveCount(1);
  await expect(marksOf(page, PLAN.task).progress, 'Alpha shows its 40 %').toHaveCount(1);

  // Select Alpha (a plain, movable task with progress): the selected row, and an armed bar with
  // grips. Turn the logic links on so the arrows exist to be looked at.
  await ganttRow(page, PLAN.task).click();
  await expect(ganttRow(page, PLAN.task)).toHaveAttribute('aria-selected', 'true');
  await expect(marksOf(page, PLAN.task).bar, 'the selected movable bar is armed').toHaveAttribute(
    'data-bar-armed',
    'true',
  );
  await expect(marksOf(page, PLAN.task).bar.locator('[data-bar-grip]')).toHaveCount(1);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await unfoldViewSections(page);
  await page.getByRole('checkbox', { name: 'Logic links' }).check();
  await page.keyboard.press('Escape');

  const readings = {} as Record<Mode, Readings>;
  const menu = {} as Record<Mode, { shaded: Computed; available: Computed }>;
  const button = {} as Record<Mode, Computed>;

  // ---------------------------------------------------------------- the row menu, both modes
  await test.step('a row menu: the shaded item and an available one', async () => {
    // Outdent on a top-level row is shaded with a reason (ADR-0082, `view-state.spec.ts`).
    for (const mode of ['active', 'none'] as const) {
      await page.emulateMedia({ forcedColors: mode });
      await ganttRow(page, PLAN.critical)
        .getByRole('button', { name: /^Actions for/ })
        .click();
      const open = page.getByRole('menu');
      await expect(open).toBeVisible();
      const shaded = open.getByRole('menuitem', { name: 'Outdent' });
      await expect(shaded, 'the pinned shaded item').toHaveAttribute('aria-disabled', 'true');
      const available = open.locator('[role="menuitem"]:not([aria-disabled="true"])').first();
      await expect(available, 'the pinned available item').toBeVisible();
      menu[mode] = { shaded: await computed(shaded), available: await computed(available) };
      await page.keyboard.press('Escape');
      await expect(open).toBeHidden();
    }
  });

  // ------------------------------------------------------------------------- the marks, both modes
  await test.step('the bars, marks, selected row and focus', async () => {
    for (const mode of ['active', 'none'] as const) {
      await page.emulateMedia({ forcedColors: mode });
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(
        mode === 'active',
      );
      readings[mode] = await readMarks(page);
    }
  });

  // ---------------------------------------------------------- a shaded Button (pending save)
  await test.step('a shaded Button: the create dialog while its save is in flight', async () => {
    const release = await holdCreateRequest(page);
    await ganttRow(page, PLAN.critical)
      .getByRole('button', { name: /^Actions for/ })
      .click();
    await page.getByRole('menuitem', { name: 'Insert activity below' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Name/).fill('Pending forced colours');
    await dialog.getByRole('button', { name: 'Create activity' }).click();
    const pending = dialog.getByRole('button', { name: 'Saving…' });
    await expect(pending, 'the pinned shaded Button').toHaveAttribute('aria-disabled', 'true');
    for (const mode of ['active', 'none'] as const) {
      await page.emulateMedia({ forcedColors: mode });
      button[mode] = await computed(pending);
    }
    release();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
  });

  // ================================================================== forced colours: active
  const on = readings.active;
  const sys = on.system;

  await test.step('active: the shaded item is GrayText and the available one is not', () => {
    expect(menu.active.shaded.color, 'a shaded menu item is GrayText').toBe(sys.GrayText);
    expect(menu.active.available.color, 'an available menu item is not').not.toBe(sys.GrayText);
  });

  await test.step('active: a shaded Button is GrayText at full opacity', () => {
    expect(button.active.color).toBe(sys.GrayText);
    expect(button.active.opacity, 'GrayText alone carries the state').toBe('1');
  });

  await test.step('active: a natively disabled control still reads GrayText (untouched by the rule)', async () => {
    // The page was left in ordinary colours by the last reading above.
    await page.emulateMedia({ forcedColors: 'active' });
    const native = await page.evaluate(() => {
      const probe = document.createElement('button');
      probe.disabled = true;
      probe.textContent = 'x';
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(native).toBe(sys.GrayText);
  });

  await test.step('active: a task bar is a 1 px CanvasText edge on Canvas', () => {
    expect(on.task.borderColor).toBe(sys.CanvasText);
    expect(on.task.borderWidth).toBe('1px');
    expect(on.task.backgroundColor).toBe(sys.Canvas);
    expect(on.visible.task, 'the task bar paints something a reader can see').toBe(true);
  });

  await test.step('active: a critical bar has an edge three times a task bar', () => {
    expect(on.critical.borderColor).toBe(sys.CanvasText);
    expect(on.critical.borderWidth).toBe('3px');
    expect(Number.parseFloat(on.critical.borderWidth)).toBeGreaterThanOrEqual(
      3 * Number.parseFloat(on.task.borderWidth),
    );
    expect(on.visible.critical).toBe(true);
  });

  await test.step('active: a summary bar is solid CanvasText and keeps an edge of its own', () => {
    expect(on.summary.backgroundColor).toBe(sys.CanvasText);
    expect(on.summary.borderLeftWidth, 'a summary with progress keeps a visible left edge').toBe(
      '1px',
    );
    expect(on.summary.borderColor).toBe(sys.CanvasText);
    expect(on.summaryProgress.backgroundColor, 'its progress is the page colour inside it').toBe(
      sys.Canvas,
    );
    expect(on.visible.summary).toBe(true);
  });

  await test.step('active: a milestone is solid CanvasText', () => {
    expect(on.milestone.backgroundColor).toBe(sys.CanvasText);
    expect(on.visible.milestone).toBe(true);
  });

  await test.step('active: progress is visible inside its bar, held 1 px inside the edge', () => {
    expect(on.progressOnTask.backgroundColor).toBe(sys.CanvasText);
    expect(on.progressOnTask.left, 'a full task still reads as an outlined bar').toBe('1px');
    expect(on.progressOnTask.top).toBe('1px');
    expect(on.visible.progress).toBe(true);
  });

  await test.step('active: the float tail and the baseline ghost are the dashed borders that survive', () => {
    expect(on.floatTail.borderStyle).toBe('dashed');
    expect(Number.parseFloat(on.floatTail.borderWidth)).toBeGreaterThan(0);
    // The ghost is drawn only where the baseline differs from the plan, which this fixture does
    // not guarantee, so it is checked where it exists.
    if (on.ghost !== null) expect(on.ghost.borderStyle).toBe('dashed');
  });

  await test.step('active: the armed bar has a CanvasText outline and visible grips', () => {
    expect(on.armedBar.outlineStyle).not.toBe('none');
    expect(Number.parseFloat(on.armedBar.outlineWidth)).toBeGreaterThan(0);
    expect(on.armedBar.outlineColor, 'CanvasText, not the selected edge or ring Highlight').toBe(
      sys.CanvasText,
    );
    expect(on.grip.backgroundColor).toBe(sys.CanvasText);
    expect(on.visible.grip, 'the grips paint on the bar').toBe(true);
  });

  await test.step('active: the selected row is a Highlight edge and nothing inside it is un-forced', () => {
    expect(on.selectedEdge.content).not.toBe('none');
    expect(on.selectedEdge.position).toBe('absolute');
    expect(on.selectedEdge.width).toBe('4px');
    expect(on.selectedEdge.backgroundColor).toBe(sys.Highlight);
    expect(on.selectedRow.backgroundColor, 'the row is not filled').not.toBe(sys.Highlight);
    expect(on.selectedRow.forcedColorAdjust).toBe('auto');
    expect(on.selectedStickyCell.forcedColorAdjust).toBe('auto');
    expect(on.selectedNameCell.forcedColorAdjust).toBe('auto');
    expect(on.selectedNameCell.color, 'text in the row is in the reader’s own ink').toBe(
      sys.CanvasText,
    );
    // A bar inside the selected row keeps its own forced form.
    expect(on.selectedBar.backgroundColor).toBe(sys.Canvas);
    expect(on.selectedBar.borderColor).toBe(sys.CanvasText);
  });

  await test.step('active: a focus ring inside the selected row differs from what it is drawn on', () => {
    expect(on.triggerFocus.outlineStyle).not.toBe('none');
    expect(on.triggerFocus.outlineColor).toBe(sys.Highlight);
    expect(on.triggerFocus.behind, 'the ring is not Highlight on Highlight').not.toBe(
      on.triggerFocus.outlineColor,
    );
  });

  await test.step('active: an open cell in the selected row has ink that differs from its fill', () => {
    expect(on.openCell.color).not.toBe(on.openCell.backgroundColor);
    expect(on.openCell.forcedColorAdjust).toBe('auto');
  });

  // ============================================================== forced colours: none (control)
  const off = readings.none;
  const plain = off.system;

  await test.step('control: ordinary colours show none of the forced values', () => {
    expect(menu.none.shaded.color, 'a shaded item keeps its muted colour').not.toBe(plain.GrayText);
    expect(button.none.opacity, 'a shaded Button still dims to 60 %').toBe('0.6');
    expect(off.task.borderWidth, 'a task bar has no border').toBe('0px');
    expect(off.critical.borderWidth).toBe('0px');
    expect(off.summary.borderLeftWidth).toBe('0px');
    expect(off.task.backgroundColor).not.toBe(plain.Canvas);
    expect(off.summary.backgroundColor).not.toBe(plain.CanvasText);
    expect(off.milestone.backgroundColor).not.toBe(plain.CanvasText);
    expect(off.progressOnTask.backgroundColor).not.toBe(plain.CanvasText);
    expect(off.progressOnTask.left, 'a progress band keeps its flush edge').toBe('0px');
    expect(off.selectedEdge.backgroundColor, 'the selected edge does not leak').not.toBe(
      plain.Highlight,
    );
    expect(off.selectedEdge.content === 'none' || off.selectedEdge.content === 'normal').toBe(true);
    expect(off.selectedRow.forcedColorAdjust).toBe('auto');
    expect(off.grip.backgroundColor).not.toBe(plain.CanvasText);
  });
});
