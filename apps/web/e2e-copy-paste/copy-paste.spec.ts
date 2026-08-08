import { expect, test } from '@playwright/test';

import {
  announced,
  announcer,
  apiActivities,
  apiDependencies,
  canvas,
  createHierarchy,
  diagramList,
  duplicateButton,
  ensurePen,
  newPlan,
  onboard,
  releasePen,
  seedActivities,
  seedLink,
  selectByName,
  selectedActivityId,
} from './support';

/**
 * **Activity copy / paste / duplicate, flag ON** (`docs/specs/activity-copy-paste/` M5-T2).
 *
 * Serial by design: one org, one project, and plans walked in order. Each test builds on the last
 * only through the plan it creates, never through a shared mutable selection.
 *
 * The governing rule is **assert the server's row, not the DOM under test** (ADR-0070 M6). Where a
 * test reads the interface instead, it is because the interface is the subject — what was
 * announced, what is selected, what a planner without the pen can reach.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
let orgSlug = '';

test.beforeAll(() => {
  // Nothing to do; `STAMP` is captured once so every plan in the run is uniquely named.
});

test('duplicate one activity carries its definition and nothing of its history', async ({
  page,
}) => {
  orgSlug = await onboard(page, STAMP);
  await createHierarchy(page);
  await newPlan(page, 'Single duplicate');
  await ensurePen(page);

  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Excavate', durationDays: 4 },
    { name: 'Pour slab', durationDays: 3 },
  ]);
  const excavate = seeded.find((a) => a.name === 'Excavate');
  expect(excavate, 'seed did not produce Excavate').toBeDefined();

  await selectByName(page, 'Excavate');
  await duplicateButton(page, 'Excavate').click();
  await announced(page, /1 activity duplicated/i);

  // The API is the oracle. A screen that renders "4d" proves the screen, not the write.
  const after = await apiActivities(page, orgSlug);
  expect(after).toHaveLength(3);
  const clone = after.find((a) => a.name !== 'Excavate' && a.name.includes('Excavate'));
  expect(clone, `no copy of Excavate among ${after.map((a) => a.name).join(', ')}`).toBeDefined();

  // Carried: the definition.
  expect(clone?.durationMinutes).toBe(excavate?.durationMinutes);
  expect(clone?.type).toBe(excavate?.type);
  // Transformed: a free name, and a lane below everything that existed.
  expect(clone?.name).not.toBe('Excavate');
  expect(clone?.laneIndex).toBeGreaterThan(Math.max(...seeded.map((a) => a.laneIndex)));
  // Withheld: history. A copy is the same work, not the same progress.
  expect(clone?.percentComplete).toBe(0);
  expect(clone?.version).toBe(1);
});

test('duplicating a band clones every internal link and none to the originals', async ({
  page,
}) => {
  await newPlan(page, 'Band duplicate');
  await ensurePen(page);

  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Level 2', type: 'WBS_SUMMARY', durationDays: 0 },
    { name: 'Strip out', parentOf: 0 },
    { name: 'First fix', parentOf: 0 },
    { name: 'Second fix', parentOf: 0 },
    // Deliberately OUTSIDE the band, and linked to a member: its edge must NOT be cloned, and the
    // clone must not end up constrained by work the planner did not select.
    { name: 'Handover' },
  ]);
  const id = (name: string): string => {
    const row = seeded.find((a) => a.name === name);
    if (row === undefined) throw new Error(`seed missing ${name}`);
    return row.id;
  };

  await seedLink(page, orgSlug, id('Strip out'), id('First fix'));
  await seedLink(page, orgSlug, id('First fix'), id('Second fix'));
  await seedLink(page, orgSlug, id('Second fix'), id('Handover')); // crosses the boundary
  await page.reload();

  const before = await apiDependencies(page, orgSlug);
  expect(before).toHaveLength(3);

  await selectByName(page, 'Level 2');
  await duplicateButton(page, 'Level 2').click();
  // The confirmation names the counts, and they come off the plan rather than the selection.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/3 activities in it/i);
  await expect(dialog).toContainText(/2 links between them/i);
  // M4 changed this sentence: assignments and steps are copied now, so it must not say otherwise.
  await expect(dialog).toContainText(/resource assignments and weighted steps/i);
  await dialog.getByRole('button', { name: /duplicate/i }).click();
  await announced(page, /4 activities duplicated/i);

  const activities = await apiActivities(page, orgSlug);
  const clones = activities.filter((a) => a.name.includes('(copy)'));
  expect(clones).toHaveLength(4); // the summary + its three members

  const cloneIds = new Set(clones.map((a) => a.id));
  const originalIds = new Set(seeded.map((a) => a.id));
  const links = await apiDependencies(page, orgSlug);

  // Exactly two NEW links, both entirely inside the copy.
  const newLinks = links.filter(
    (l) => cloneIds.has(l.predecessorId) || cloneIds.has(l.successorId),
  );
  expect(newLinks).toHaveLength(2);
  for (const link of newLinks) {
    expect(cloneIds.has(link.predecessorId), `${link.id} predecessor left the copy`).toBe(true);
    expect(cloneIds.has(link.successorId), `${link.id} successor left the copy`).toBe(true);
  }
  // And nothing crossed back: no edge joins a clone to an original, in either direction.
  const crossing = links.filter(
    (l) =>
      (cloneIds.has(l.predecessorId) && originalIds.has(l.successorId)) ||
      (originalIds.has(l.predecessorId) && cloneIds.has(l.successorId)),
  );
  expect(crossing, 'a cloned edge crosses the copy boundary').toHaveLength(0);
});

test('one Ctrl+Z removes the whole paste, links included, and does not navigate Back', async ({
  page,
}) => {
  const urlBefore = page.url();
  const beforeActivities = await apiActivities(page, orgSlug);
  const beforeLinks = await apiDependencies(page, orgSlug);

  await canvas(page).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');

  // The count returning is the assertion; the links coming back is the reason the undo is an
  // id-stable batch restore rather than N re-creates (ADR-0080 CQ-4).
  await expect
    .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
    .toBe(beforeActivities.length - 4);
  await expect
    .poll(async () => (await apiDependencies(page, orgSlug)).length)
    .toBe(beforeLinks.length - 2);

  // Ctrl+Z must not reach the browser's history (TECH_DEBT #25).
  expect(page.url()).toBe(urlBefore);
});

test('Ctrl+C with a live text selection does not capture activities', async ({ page }) => {
  await newPlan(page, 'Text selection');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Excavate' }, { name: 'Pour slab' }]);

  await selectByName(page, 'Excavate');

  // A REAL document selection, which is the whole reason this assertion lives in a browser:
  // `window.getSelection` is stubbed in the unit suite, so only here is the selection real.
  await page.evaluate(() => {
    const heading = document.querySelector('h1, h2');
    if (heading === null) throw new Error('no heading to select text in');
    const range = document.createRange();
    range.selectNodeContents(heading);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  expect(
    await page.evaluate(() => window.getSelection()?.isCollapsed ?? true),
    'the test failed to make a real text selection',
  ).toBe(false);

  await page.keyboard.press('Control+c');
  // Nothing was captured: pasting reports an empty clipboard rather than duplicating a bar.
  await page.keyboard.press('Control+v');
  await announced(page, /nothing has been copied yet/i);
  expect(await apiActivities(page, orgSlug)).toHaveLength(2);
});

test('Ctrl+C then Ctrl+V copies the canvas selection', async ({ page }) => {
  // Collapse the selection left over from the previous test, so this exercises the fires-branch.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await selectByName(page, 'Excavate');

  await page.keyboard.press('Control+c');
  await announced(page, /1 activity copied/i);
  await page.keyboard.press('Control+v');
  await announced(page, /1 activity duplicated/i);

  await expect.poll(async () => (await apiActivities(page, orgSlug)).length).toBe(3);
});

test('without the pen the Duplicate action is present, shaded, and says why', async ({ page }) => {
  await releasePen(page);
  await selectByName(page, 'Excavate');

  const duplicate = duplicateButton(page, 'Excavate');
  // Present, not hidden. A vanished action is a dead end: the planner cannot tell "not allowed"
  // from "not a thing", and there is nowhere for the reason to live (ADR-0062 M6).
  await expect(duplicate).toBeVisible();
  // `aria-disabled`, never the native attribute — a natively-disabled control drops focus to
  // `<body>` when it flips (ADR-0060 M6 / ADR-0063 M6).
  await expect(duplicate).toHaveAttribute('aria-disabled', 'true');
  await expect(duplicate).not.toHaveAttribute('disabled', /.*/);

  // And the reason is programmatically associated, not merely nearby.
  const describedBy = await duplicate.getAttribute('aria-describedby');
  expect(describedBy, 'no reason associated with the shaded Duplicate').not.toBeNull();
  await expect(page.locator(`#${describedBy ?? ''}`)).toContainText(/edit lock|permission/i);
});

test('the keyboard accelerators are inert without the pen too', async ({ page }) => {
  // The gate is shared with the toolbar item, so a keyboard path that stayed live would be the
  // "one control and not its neighbour" defect four consecutive epics have been caught by.
  const before = (await apiActivities(page, orgSlug)).length;
  await diagramList(page).focus();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);
  expect((await apiActivities(page, orgSlug)).length).toBe(before);
});

test('the clone is selected after a duplicate, so the next action has a subject', async ({
  page,
}) => {
  await ensurePen(page);
  await selectByName(page, 'Excavate');
  const sourceId = await selectedActivityId(page);

  await duplicateButton(page, 'Excavate').click();
  await announced(page, /1 activity duplicated/i);

  await expect
    .poll(async () => await selectedActivityId(page), { timeout: 10_000 })
    .not.toBe(sourceId);
  const selected = await selectedActivityId(page);
  const activities = await apiActivities(page, orgSlug);
  expect(activities.find((a) => a.id === selected)?.name).toMatch(/\(copy/);
});

test('the announcer says something for every outcome, never nothing', async ({ page }) => {
  // The channel a keyboard planner has. Silence on a refusal is the failure ADR-0073 C1 named:
  // "nothing recorded yet" and "nothing matched" collapsing into one, one surface along.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await diagramList(page).focus();
  await page.keyboard.press('Escape'); // clear the selection
  await page.keyboard.press('Control+c');
  await announced(page, /select an activity to copy/i);
  expect((await announcer(page).textContent())?.trim()).not.toBe('');
});
