import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **on-canvas advanced activity types** suite
 * (`VITE_CANVAS_ACTIVITY_TYPES`, Stage D, `docs/specs/canvas-activity-types/`). Mirrors the
 * canvas-first authoring helpers (`e2e-authoring/support.ts`) verbatim for onboarding + drawing —
 * this surface layers directly on top of that one (the LOE tool arms from the same Add split-button)
 * — and adds the LOE endpoint-pick helper.
 */

/** Sign up + create an organisation; returns the org slug (name "LOE Co" → "loe-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `loe-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('LOE Tester');
  await page.getByLabel('Email').fill(`loe-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`LOE Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open it (mounts the canvas-first authoring workspace). */
export async function openNewPlan(page: Page): Promise<void> {
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
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
}

/** Take the pen so the authoring affordances (Add, and the LOE tool it arms) go live. */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/**
 * Draw a task on the canvas via the Add split-button (ADR-0032 M4): open the `Add▾` menu, pick Task
 * (which arms add mode), click the canvas at `pos`, then name + commit in the drop popover.
 */
export async function drawTask(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  // The Add split-button reads "Add" / "Adding <kind>"; anchor the regex so it doesn't also match the
  // inline "Add note" placeholder on the same row (Playwright name matching is substring).
  await page.getByRole('button', { name: /^Add(ing .+)?$/ }).click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByRole('textbox', { name: 'New activity name' }).fill(name);
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(form).toBeHidden();
}

/**
 * Arm the **Level of Effort (hammock)** endpoint-pick tool from the Add split-button's "Span between
 * activities" section (Stage D). Flag-on this collapses the two disabled "Soon" placeholders into
 * ONE live item.
 */
export async function armLoeTool(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Add(ing .+)?$/ }).click();
  await page.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ }).click();
}

/**
 * Pick the LOE tool's two endpoints through the **parallel-DOM keyboard path** (WCAG 2.1.1): focus
 * the diagram's accessible listbox, move to each named activity, and press Enter to pick it (first
 * press = start driver, second press on a different option = finish driver, committing the span).
 * Exercising the keyboard path — rather than clicking the narrow on-canvas bars — is deterministic
 * regardless of zoom/pixel geometry and doubles as the tool's WCAG 2.1.1 operability proof (mirrors
 * the unit-level keyboard-pick coverage in `TsldPanel.loe-span.test.tsx`).
 */
export async function pickLoeSpan(
  page: Page,
  startName: string,
  finishName: string,
): Promise<void> {
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  const listbox = diagram.getByRole('listbox', { name: 'Activities in the diagram' });
  await listbox.focus();

  const focusOption = async (name: string): Promise<void> => {
    // Options carry a longer descriptive sentence ("Excavate, 1 working day, …"); match the
    // activity's identity as a leading prefix. Walk down from the top with ArrowDown until the
    // named option is the selected one (a small, fixed activity count in this journey, so a
    // bounded loop is deterministic).
    for (let i = 0; i < 10; i += 1) {
      const selected = diagram.getByRole('option', { selected: true });
      const text = (await selected.textContent()) ?? '';
      if (text.startsWith(name)) return;
      await page.keyboard.press('ArrowDown');
    }
    throw new Error(`could not focus the "${name}" option in the diagram listbox`);
  };

  await focusOption(startName);
  await page.keyboard.press('Enter'); // picks the start driver
  await focusOption(finishName);
  await page.keyboard.press('Enter'); // picks the finish driver → commits the span
}
