import { expect, test } from '@playwright/test';

import {
  announced,
  announcer,
  armLink,
  canvas,
  createHierarchy,
  diagramList,
  ensurePen,
  ganttGrid,
  jumpNext,
  jumpPrevious,
  linkIsArmed,
  matchReadout,
  newPlan,
  onboard,
  pickZoomPreset,
  reportedZoomLevel,
  search,
  searchField,
  seedActivities,
  selectedActivityId,
  showDiagram,
  showGantt,
  zoomPresetControl,
} from './support';

/**
 * The flag-ON journey for **search that navigates** (`VITE_CANVAS_SEARCH_NAV`,
 * `docs/specs/canvas-search-navigation/` M5-T2).
 *
 * Every assertion here is one a unit suite **structurally cannot make**. The component tests mock
 * `@/config/env`, mount the toolbar in isolation and hand it a fabricated context: they prove the
 * field calls `goToMatch`, and nothing about whether a real Enter, in a real browser, through the
 * **portalled** chrome band (ADR-0055), against a plan whose bars have real computed dates, moves
 * the viewport, the selection and the live region together — or whether the canvas's own native
 * `window` key listener steals the Escape that ADR-0064's amended contract gives to the field.
 *
 * **One journey on one plan**, mirroring the other flag-on suites: the claims are sequential (you
 * cannot assert a wrap without first having walked to the end) and Playwright gives each `test` its
 * own context, so a split suite would sign up five times to prove one cycle.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();

/** Three matching activities, and two that must never match — so a wrap is provable by counting. */
const PILE_COUNT = 3;

test('search that navigates: cycle, count, announce, frame — in both views', async ({ page }) => {
  test.slow();

  const orgSlug = await onboard(page, STAMP);
  await createHierarchy(page);
  await newPlan(page, 'Search plan');
  await ensurePen(page);

  // ------------------------------------------------------------------ seed
  // Through the API: this journey is about what a planner does with activities that already exist,
  // not about how they were typed in. `seedActivities` recalculates, because the cycle orders by
  // computed early start and centres on it — an unscheduled plan would walk in id order and pan
  // nowhere, which passes a weaker version of every assertion below.
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Pile cap A' },
    { name: 'Excavate east' },
    { name: 'Pile cap B' },
    { name: 'Steel frame' },
    { name: 'Pile cap C' },
  ]);
  expect(seeded.filter((a) => a.name.startsWith('Pile'))).toHaveLength(PILE_COUNT);
  await expect(canvas(page)).toBeVisible();
  await ensurePen(page);

  // ------------------------------------------------------- forwards, and the wrap
  await search(page, 'Pile');
  // Before the first jump the read-out counts; it does not claim a position.
  await expect(matchReadout(page)).toHaveText(`${PILE_COUNT} matches`);

  const walked: string[] = [];
  for (let i = 0; i < PILE_COUNT; i += 1) {
    const said = await jumpNext(page);
    expect(said).toMatch(new RegExp(`^Match ${String(i + 1)} of ${String(PILE_COUNT)}: `));
    await expect(matchReadout(page)).toHaveText(`${String(i + 1)} of ${String(PILE_COUNT)}`);
    const id = await selectedActivityId(page);
    expect(id, 'every jump lifts the canvas selection').not.toBeNull();
    walked.push(id ?? '');
  }
  // Three distinct activities, not the same one three times — the assertion that a cursor exists.
  expect(new Set(walked).size).toBe(PILE_COUNT);

  // The wrap. This is why the plan seeds a KNOWN count rather than "some activities": a cycle that
  // silently stopped at the last match would satisfy every assertion above.
  expect(await jumpNext(page)).toMatch(new RegExp(`^Match 1 of ${String(PILE_COUNT)}: `));
  expect(await selectedActivityId(page)).toBe(walked[0]);

  // ---------------------------------------------------------- backwards, and its wrap
  // The cursor is on match 1. Stepping back must land on the last, not stop at the start.
  expect(await jumpPrevious(page)).toMatch(
    new RegExp(`^Match ${String(PILE_COUNT)} of ${String(PILE_COUNT)}: `),
  );
  await expect(matchReadout(page)).toHaveText(`${String(PILE_COUNT)} of ${String(PILE_COUNT)}`);
  expect(await jumpPrevious(page)).toMatch(
    new RegExp(`^Match ${String(PILE_COUNT - 1)} of ${String(PILE_COUNT)}: `),
  );

  // ------------------------------------------------------------- focus never moves
  // The difference between a find control and one that works exactly once. `goToMatch` selects with
  // `focusListbox: false` precisely so a planner can press Enter again without reaching for the
  // field — and only a real browser can say whether the selection lift moved focus anyway.
  await searchField(page).focus();
  for (let i = 0; i < PILE_COUNT + 1; i += 1) {
    await searchField(page).press('Enter');
    await expect(searchField(page)).toBeFocused();
  }
  await searchField(page).press('Shift+Enter');
  await expect(searchField(page)).toBeFocused();

  // ------------------------------------------------- the announcement names what it landed on
  // Not "an announcement happened": the name in the live region is the only thing telling a
  // screen-reader user WHICH bar the viewport moved to, since the canvas itself says nothing.
  const said = await jumpNext(page);
  const spokenName = /^Match \d+ of \d+: (.+)\.$/.exec(said)?.[1];
  expect(spokenName, 'the announcement carries a name').toBeTruthy();
  const selectedId = await selectedActivityId(page);
  expect(seeded.find((a) => a.id === selectedId)?.name).toBe(spokenName);

  // One Enter says ONE thing. The debounced filter count and the jump speak into the same polite
  // region; two utterances per keystroke is the failure this epic cancelled the pending timer for.
  await expect(announcer(page)).toHaveText(/^Match \d+ of \d+: .+\.$/);

  // -------------------------------------------------------------- a query matching nothing
  const beforeNoMatch = await selectedActivityId(page);
  await searchField(page).fill('nothing-matches-this');
  await expect(matchReadout(page)).toHaveCount(0);
  await searchField(page).press('Enter');
  // Nothing to jump to, so nothing jumps — and the previous selection is not cleared as a side
  // effect of a no-op, which is what "moves nothing" has to mean to be worth asserting.
  expect(await selectedActivityId(page)).toBe(beforeNoMatch);

  // ------------------------------------------------------------------ clear
  await search(page, 'Pile');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(searchField(page)).toHaveValue('');
  // Never `<body>`: the planner cleared in order to type something else.
  await expect(searchField(page)).toBeFocused();

  // ------------------------------------------------------- Escape belongs to the field
  // **The highest-value assertion in this suite.** This epic amended an ADR-0064 contract — the
  // canvas's `window` Escape listener gained a target guard — and a regression is a planner losing
  // an armed tool to a keystroke in a text field. It is only observable in a real browser: that
  // listener is native and on `window`, while the toolbar reaches the chrome band through a React
  // portal, and React events follow the React tree rather than the DOM one.
  await ensurePen(page);
  await armLink(page);
  await search(page, 'Pile');
  await searchField(page).focus();

  // Step 1: the query is cleared and the tool survives.
  await searchField(page).press('Escape');
  await expect(searchField(page)).toHaveValue('');
  expect(await linkIsArmed(page), 'Escape in the field belongs to the field').toBe(true);
  await announced(page, /^Search cleared\.$/);

  // Step 2: the field is empty, so the same key hands the planner to the diagram — still armed.
  await searchField(page).press('Escape');
  await expect(diagramList(page)).toBeFocused();
  expect(await linkIsArmed(page), 'leaving the field does not cost the tool either').toBe(true);

  // Step 3: now that focus is out of the text field, Escape means what ADR-0064 says it means. This
  // is the epic's **accepted consequence** driven end to end — the way out is two Escapes, not none.
  // Asserting the amendment without asserting the route it leaves open would prove half a contract.
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => await linkIsArmed(page), { message: 'the second Escape disarms' })
    .toBe(false);

  // ------------------------------------------------------------ Zoom to selection
  await search(page, 'Pile');
  await jumpNext(page);
  const zoom = page.getByRole('button', { name: /^Zoom to selection/ });
  await expect(zoom).not.toHaveAttribute('aria-disabled', 'true');
  // Zoom out first, deliberately: a freshly-seeded plan already opens at the Day preset, so framing
  // one activity would leave the scale where it was and the assertion below would pass without the
  // command having done anything. Starting coarse is what makes "the viewport moved" observable.
  await pickZoomPreset(page, 'Year');
  const scaleBefore = await reportedZoomLevel(page);
  await zoom.click();
  await announced(page, /^Zoomed to /);
  // The control must not misreport. Framing one activity lands inside the ADR-0056 preset
  // vocabulary, so `presetOf` has an answer and the trigger shows it; a silent disagreement between
  // the viewport and the control naming it is the lit-but-inert defect class inverted.
  const scaleAfter = await reportedZoomLevel(page);
  expect(scaleAfter).toBeTruthy();
  expect(scaleAfter).not.toBe(scaleBefore);
  await expect(zoomPresetControl(page)).toHaveAttribute('aria-label', `Zoom level: ${scaleAfter}`);

  // ---------------------------------------------------------------- the Gantt half
  await showGantt(page);
  // **Absent, not shaded** — and that is a strengthening, not a relaxation. Until ADR-0090 M2-T1
  // this command sat on Row 1 and the assertion here was that the Gantt shaded it with "Only in the
  // diagram view" (the ADR-0059 M6 defect, guarded in the first version of this journey). It now
  // lives on the canvas selection bar, which the Gantt does not render at all, so the lit-but-inert
  // failure this line was written to catch is impossible by construction rather than prevented by a
  // predicate somebody has to maintain.
  await expect(zoom).toHaveCount(0);

  // The same match set, walked from the same field (M4). The row is brought into view and focus
  // stays put — a Gantt that focused the row would end the search after one match, which is the
  // canvas path's guarded defect one view along.
  await search(page, 'Pile');
  // The cursor SURVIVES the view switch, which is M4's point — one match set, two views — so the
  // read-out carries on from where the diagram left it rather than resetting to a bare count. That
  // is asserted as the grammar plus the same total, not as a fixed position: pinning the position
  // would be pinning how many times the earlier half of this journey happened to press Enter.
  await expect(matchReadout(page)).toHaveText(new RegExp(`^\\d+ of ${String(PILE_COUNT)}$`));
  await searchField(page).focus();
  const ganttSaid = await jumpNext(page);
  expect(ganttSaid).toMatch(new RegExp(`^Match \\d+ of ${String(PILE_COUNT)}: `));
  await expect(searchField(page)).toBeFocused();
  const ganttName = /^Match \d+ of \d+: (.+)\.$/.exec(ganttSaid)?.[1] ?? '';
  await expect(ganttGrid(page).getByText(ganttName, { exact: true }).first()).toBeVisible();

  await showDiagram(page);
});
