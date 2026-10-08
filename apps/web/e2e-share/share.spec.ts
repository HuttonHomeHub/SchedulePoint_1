import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import {
  barExtentsByRow,
  canvas,
  drawActivity,
  memberActivities,
  onboard,
  openNewPlan,
  placeActivity,
  recalculatePlan,
  seedActivities,
  startEditing,
} from './support';

/**
 * Flag-ON **External-Guest per-plan share links** journey (`VITE_GUEST_SHARE_LINKS`, ADR-0051 F-M4).
 * Proves the whole share loop runs across TWO real browser contexts — the member's authenticated
 * session and a completely session-less "outsider with a link" context:
 *
 * 1. A Planner/Org Admin authors a plan on the canvas (one activity, so the guest view has something
 *    to show) and opens the **Share…** toolbar item, which opens the member `ShareLinksDialog`.
 * 2. Creating a link shows its one-time guest URL (read from the DOM, never the clipboard).
 * 3. A brand-new browser context — no cookies, no session — navigates to that `/share#<token>` URL and
 *    sees the plan's name, status and read-only diagram, with NONE of the member app-shell chrome
 *    (no top bar / Project Explorer navigator, no authoring toolbar). The token only ever rides in the
 *    URL fragment, never the query string.
 * 4. Back in the member context, revoking the link is immediate: reloading the guest context's exact
 *    same URL now shows the uniform "no longer available" message.
 *
 * Serial (the suite mutates one shared plan and drives a second context against it); Chromium only
 * (TECH_DEBT #25a).
 */
test('an outsider with a share link views a plan read-only, and revoking it is immediate', async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // Author one activity on the canvas so the guest view has a non-empty diagram to render.
  await startEditing(page);
  await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });

  // (1) Open the Share… toolbar item (Row 2 · Do deliverables cluster) — the member management dialog.
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  // Share is a row inside the `Share & export` menu since ADR-0090 M2-T4.
  await toolbar.getByRole('button', { name: /Share & export/ }).click();
  await page.getByRole('menuitem', { name: 'Share…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share links' });
  await expect(dialog).toBeVisible();

  // The open dialog stays WCAG 2.2 AA before anything is created.
  const dialogAxe = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(dialogAxe.violations).toEqual([]);

  // (2) Create a labelled link; its one-time guest URL surfaces in a read-only field (never rely on
  // clipboard permissions — read the value straight out of the DOM).
  await dialog.getByLabel('Label').fill('Client review');
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const urlField = dialog.getByLabel('Guest link');
  await expect(urlField).toBeVisible();
  const shareUrl = await urlField.inputValue();
  expect(shareUrl).toMatch(/\/share#\S+/);
  const token = new URL(shareUrl).hash.replace(/^#/, '');
  expect(token.length).toBeGreaterThan(0);

  // The list refreshes to show the just-created link (react-query invalidates on create success).
  await expect(dialog.getByText('Client review')).toBeVisible();

  // (3) A completely session-less context — no cookies, no auth state — opens the guest URL.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(shareUrl);

  // The plan's header renders (name/status), and the read-only diagram shows the one authored activity.
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toBeVisible();
  await expect(guestPage.getByText('Read-only shared view')).toBeVisible();
  const guestDiagram = guestPage.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(guestDiagram).toBeVisible();
  await expect(guestDiagram.getByRole('option', { name: /Excavate/ })).toBeVisible();

  // NO member chrome at all: the guest view's own slim `<header>` is expected (it's the plan header
  // above), but none of the authenticated app-shell's landmarks/controls are present — no Project
  // Explorer navigator, no org-switcher nav, no authoring toolbar, no pen control.
  await expect(guestPage.getByRole('navigation', { name: 'Project Explorer' })).toHaveCount(0);
  await expect(guestPage.getByRole('navigation', { name: 'Organisation' })).toHaveCount(0);
  await expect(guestPage.getByRole('toolbar')).toHaveCount(0);
  await expect(guestPage.getByRole('button', { name: 'Start editing' })).toHaveCount(0);

  // The token rides ONLY in the URL fragment — never the query string — and the page URL still carries
  // the literal `#`.
  const guestUrl = new URL(guestPage.url());
  expect(guestUrl.search).toBe('');
  expect(guestUrl.hash).toBe(`#${token}`);
  expect(guestPage.url()).toContain('#');

  // The canvas has REAL HEIGHT. Every other assertion in this file reads the parallel focusable DOM
  // layer ADR-0026 D7 builds for assistive tech — `getByRole('option')` finds a bar there whether or
  // not a single pixel was painted. This view shipped with a canvas measured at **1886 × 1**: the
  // header, toolbar and legend all rendered, the listbox held every activity, and a reader saw an
  // empty box. `TsldPanel fill` is `h-full` over a `flex-1` container, and the guest view's
  // `min-h-dvh` column gave that percentage nothing definite to resolve against.
  //
  // So this asserts the one thing the a11y layer cannot stand in for. The floor is deliberately well
  // below the ~807 px measured here and well above the 240 px `min-h-[240px]` fallback the collapsed
  // container lands on, so it catches the collapse without pinning an exact viewport-dependent size.
  const canvasHeight = await guestPage.evaluate(
    () => document.querySelector('canvas')?.getBoundingClientRect().height ?? 0,
  );
  expect(canvasHeight).toBeGreaterThan(400);

  // **The tokens `EmptyState` reaches for resolve HERE**
  // (`docs/specs/empty-state-consolidation/` M5). That milestone converts this view's empty state
  // to the shared archetype, which uses `text-muted-foreground` and `bg-muted` — page-family names
  // declared at `:root`. `reset-fills.structural.test.ts` already records this file as "a page in
  // its own right, outside every scope", so those should apply.
  //
  // **Asserted rather than inherited, because ADR-0102's finding was exactly an inherited claim**:
  // the canvas painter resolved its palette from a root it was not mounted under, painted the wrong
  // family, and every gate stayed green — jsdom returns `''` from either root, so no unit test can
  // see this. The check is that the values are real colours, and that nothing on the ancestor chain
  // has quietly acquired a `[data-surface]` that would rebind them.
  const tokens = await guestPage.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return null;
    const style = getComputedStyle(main);
    return {
      muted: style.getPropertyValue('--muted-foreground').trim(),
      mutedBg: style.getPropertyValue('--muted').trim(),
      scoped: main.closest('[data-surface]') !== null,
    };
  });
  expect(tokens).not.toBeNull();
  expect(tokens?.muted).not.toBe('');
  expect(tokens?.mutedBg).not.toBe('');
  expect(tokens?.scoped, 'the guest page is outside every surface scope').toBe(false);

  // …and the canvas still has height at 320 px. `h-dvh` is what makes it fill, and a DEFINITE
  // viewport height is exactly what can start clipping once the header wraps on a narrow screen —
  // so the fix's own mechanism is the thing to re-check at the small end, not assume.
  //
  // **The assertion this comment used to withhold** (`docs/TECH_DEBT.md` #98, now closed).
  //
  // The history is worth keeping, because it is a case of reasoning losing to measurement. The
  // accessibility review reasoned from the CSS that nothing on this chain sets `overflow-hidden`,
  // so the page would simply scroll and pass WCAG 1.4.10. The assertion written from that reasoning
  // **failed**: `documentElement.scrollWidth` was 436 at a 320 px viewport, because the TSLD
  // zoom-preset group (`flex items-center gap-1`, no `flex-wrap`) is 420 px wide and cannot shrink.
  // Pre-existing rather than caused by the height fix — simply unobservable while the canvas was
  // 1 px and nobody had measured.
  //
  // It was recorded rather than fixed at the time because a shared canvas control cuts across
  // ADR-0031's overflow tiers and needed the member workspace re-checked at the same widths. That
  // re-check is done; `TsldViewControls` wraps the group, on both surfaces, from one change.
  await guestPage.setViewportSize({ width: 320, height: 720 });
  const narrowCanvas = await guestPage.evaluate(
    () => document.querySelector('canvas')?.getBoundingClientRect().height ?? 0,
  );
  expect(narrowCanvas, 'the canvas must not collapse when the header wraps').toBeGreaterThan(100);

  // WCAG 1.4.10 Reflow: no horizontal scroll at 320 px. Measured, not reasoned — a 4 px tolerance
  // absorbs sub-pixel layout rounding without admitting a 116 px overflow, which is what this
  // caught. Asserted at 320 and 360, because 320 is the criterion's own floor and 360 is a
  // 1440 window at 400 % zoom, and a fix that only satisfies the narrower one is a coincidence.
  for (const width of [320, 360]) {
    await guestPage.setViewportSize({ width, height: 720 });
    const scrollWidth = await guestPage.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `no horizontal overflow at ${String(width)} px`).toBeLessThanOrEqual(
      width + 4,
    );
  }
  await guestPage.setViewportSize({ width: 1280, height: 800 });

  // A refresh of a LIVE link still shows the plan. This is not padding: step (4) below reloads this
  // same page and asserts the "no longer available" copy — which is exactly what a token lost on
  // reload would also produce. Without this assertion, a regression that dropped the fragment would
  // make that check pass for the wrong reason, and the suite would go on reporting green while the
  // guest surface was broken for everyone who pressed F5.
  await guestPage.reload();
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toBeVisible();
  await expect(guestDiagram.getByRole('option', { name: /Excavate/ })).toBeVisible();
  expect(new URL(guestPage.url()).hash).toBe(`#${token}`);

  // The guest view itself is accessible.
  expect(
    (await new AxeBuilder({ page: guestPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  // (4) Back in the member context, revoke the link. Confirming the nested `ConfirmDialog` leaves the
  // `Share links` dialog standing — the `Dialog` primitive ignores a `close` event whose target is a
  // descendant dialog (TECH_DEBT #50, fixed) — so the revoked state is visible without reopening.
  await dialog.getByRole('button', { name: 'Revoke Client review' }).click();
  const confirmDialog = page.getByRole('alertdialog', { name: 'Revoke share link' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Revoke' }).click();
  await expect(confirmDialog).toBeHidden();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Revoked').first()).toBeVisible();

  // Revocation is immediate: reloading the guest context's exact same URL now shows the uniform
  // "no longer available" message (no existence oracle for a dead token).
  await guestPage.reload();
  await expect(guestPage.getByText('This share link is no longer available.')).toBeVisible();
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toHaveCount(0);

  await guestContext.close();
});

/**
 * The date-span + lane clause of a Tier-1 listbox sentence (`describeActivity`,
 * `render/a11y.ts:100-233`): `, DD Mon YYYY(?: to DD Mon YYYY)?, lane N`. Deliberately **not** the
 * whole sentence — the float and conflict clauses differ between the member and the guest on
 * purpose, because `remainingFloat`/`visualConflict*` stay excluded from `SCHEDULE_READ`
 * (`guest-dto.spec.ts`) and `a11y.ts:176-215` leaves those clauses out for the guest accordingly.
 * Comparing the whole string would therefore fail the case FC-5 exists to prove.
 */
const DATE_LANE_CLAUSE = /, (\d{2} \w{3} \d{4}(?: to \d{2} \w{3} \d{4})?), lane (\d+)/;

function dateLaneClause(optionText: string): { dates: string; lane: string } {
  const match = DATE_LANE_CLAUSE.exec(optionText);
  if (!match?.[1] || !match[2]) {
    throw new Error(
      `no ", <dates>, lane <n>" clause in the listbox option text: ${JSON.stringify(optionText)}`,
    );
  }
  return { dates: match[1], lane: match[2] };
}

/**
 * Poll the painted canvas until two bar bands exist, returning
 * `(topBand.left − nextBand.left) / (nextBand.right − nextBand.left)` — the scale-free ratio FC-6
 * compares. Lane 0 paints above lane 1 (`barExtentsByRow`'s own docblock), so the topmost band is
 * Excavate's (lane 0) and the next is Pour's (lane 1).
 *
 * **`expect.poll(...)` resolves to `void`, not the polled value** — a value produced only inside
 * the callback would otherwise be unreachable outside it, so a closure-captured `ratio` carries the
 * last computed number out once the poll's own `.not.toBeNull()` has passed.
 */
async function fitRatio(target: Page): Promise<number> {
  let ratio: number | null = null;
  await expect
    .poll(
      async () => {
        const bands = await barExtentsByRow(target);
        const topBand = bands[0];
        const nextBand = bands[1];
        if (!topBand || !nextBand) {
          ratio = null;
          return null;
        }
        const span = nextBand.right - nextBand.left;
        ratio = span > 0 ? (topBand.left - nextBand.left) / span : null;
        return ratio;
      },
      { message: 'waiting for two painted bar bands after Fit to plan' },
    )
    .not.toBeNull();
  if (ratio === null) throw new Error('unreachable: the poll passed on a null ratio');
  return ratio;
}

/**
 * **ADR-0163 (spec §2, FC-1/FC-5/FC-6).** A guest reads the SAME placed span as the member, in
 * both the picture (the canvas) and the spoken sentence (the parallel accessible listbox,
 * ADR-0026 D7) — not the CPM early dates the guest canvas drew before this fix.
 *
 * The fixture is seeded through the REAL API rather than drawn by click pixels (`drawActivity`'s
 * own docblock: a click position cannot land on an exact date), giving a **precise, falsifiable**
 * placement: Pour is 5 working days from the plan's data date (Monday 2026-01-05, `openNewPlan`),
 * finishing Friday 2026-01-09; Excavate is hand-placed 3 working days into that span
 * (Thursday 2026-01-08) in a different lane, so `(Excavate.left − Pour.left) / (Pour.right −
 * Pour.left) ≈ 3/5 = 0.6` — a ratio, not an absolute pixel position, so it holds regardless of the
 * zoom/DPI a runner happens to use.
 *
 * **FC-1's precondition is asserted before anything else is compared**: a placement identical to
 * the early date would prove nothing, since early and placed would coincide by accident and every
 * assertion downstream would pass for the wrong reason.
 *
 * Serial with the suite's other journey (shares nothing — a fresh org per `stamp` — but the config
 * runs one worker); Chromium only (TECH_DEBT #25a).
 */
test('a guest reads the SAME placed span the member does — the picture and the spoken sentence agree (ADR-0163)', async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Pour', laneIndex: 1, durationDays: 5 },
    { name: 'Excavate', laneIndex: 0, durationDays: 2 },
  ]);
  const pour = seeded[0];
  const excavate = seeded[1];
  if (!pour || !excavate) throw new Error('seeding did not return both activities');
  // Monday 2026-01-05 + 3 working days = Thursday 2026-01-08 (`support.ts:openNewPlan`).
  await placeActivity(page, orgSlug, excavate, '2026-01-08');
  // Recalculates AND reloads (the write above bypasses the page's own TanStack Query cache).
  await recalculatePlan(page, orgSlug);
  await expect(canvas(page)).toBeAttached({ timeout: 15_000 });

  // FC-1's precondition, read straight off the member API rather than the UI: the placement must
  // provably differ from the network's own answer, or nothing below demonstrates anything.
  const members = await memberActivities(page, orgSlug);
  const memberExcavate = members.find((r) => r.id === excavate.id);
  const memberPour = members.find((r) => r.id === pour.id);
  if (!memberExcavate || !memberPour)
    throw new Error('seeded activity missing from the member read');
  expect(memberExcavate.visualEffectiveStart).not.toBeNull();
  expect(memberExcavate.visualEffectiveStart).not.toBe(memberExcavate.earlyStart);
  expect(memberExcavate.visualEffectiveStart).toBe('2026-01-08');

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // FC-5, member half: the date-span + lane clause the member is told.
  const memberOptionText =
    (await diagram.getByRole('option', { name: /Excavate/ }).textContent()) ?? '';
  const memberClause = dateLaneClause(memberOptionText);
  expect(memberClause.dates).toContain('08 Jan 2026');
  expect(memberClause.lane).toBe('1'); // laneIndex 0 → "lane 1" (`describeActivity`, 1-indexed)

  // FC-6, member half: press Fit, then read the painted ink (scale-free — a RATIO, not a pixel
  // position, so it does not depend on the runner's zoom/DPI). Lane 0 (Excavate) paints above
  // lane 1 (Pour, `barExtentsByRow`'s own docblock), so the topmost two bands are, in order,
  // Excavate's and Pour's.
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .getByRole('button', { name: 'Fit to plan' })
    .click();
  const memberR = await fitRatio(page);
  expect(memberR).toBeGreaterThan(0.4);

  // (1) Share the plan and read the guest link — same flow as the base journey.
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  await toolbar.getByRole('button', { name: /Share & export/ }).click();
  await page.getByRole('menuitem', { name: 'Share…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share links' });
  await dialog.getByLabel('Label').fill('Placed-bars check');
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const urlField = dialog.getByLabel('Guest link');
  await expect(urlField).toBeVisible();
  const shareUrl = await urlField.inputValue();
  // Close the dialog — it is a modal `<dialog>` and would otherwise sit over the canvas this test
  // still has to read pixels from (unlike the base journey, which never presses Fit).
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toBeHidden();

  // (2) A completely session-less context — no cookies, no auth state — opens the guest URL.
  const guestContext = await browser.newContext();
  const guestPage: Page = await guestContext.newPage();
  await guestPage.goto(shareUrl);
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toBeVisible();
  const guestDiagram = guestPage.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(guestDiagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // FC-5, guest half: the SAME clause. **This is the red case (spec §2 table)**: before ADR-0163
  // the guest adapter set `visualEffectiveStart: null` unconditionally, so `describeActivity` took
  // the `drawn.start === null` branch and this option read "…, not yet scheduled" — no
  // ", <dates>, lane <n>" substring at all, and `dateLaneClause` above throws on it.
  const guestOptionText =
    (await guestDiagram.getByRole('option', { name: /Excavate/ }).textContent()) ?? '';
  const guestClause = dateLaneClause(guestOptionText);
  expect(guestClause.dates).toBe(memberClause.dates);
  expect(guestClause.lane).toBe(memberClause.lane);

  // FC-6, guest half: the guest's own Fit button (`TsldViewControls`, not the member's toolbar —
  // the guest view mounts no `role="toolbar"` at all, asserted in the sibling journey above).
  await guestPage.getByRole('button', { name: 'Fit to plan' }).click();
  const guestR = await fitRatio(guestPage);

  // **This is the other red case (spec §2 table)**: before ADR-0163 the guest canvas drew every
  // bar at the CPM early dates (`GuestPlanView` passed no `barDateSource`, so `TsldPanel` fell
  // back to `'early'`), and with no predecessor link both Pour and Excavate start at the data
  // date — so `guestR ≈ 0`, failing the `> 0.4` bound below.
  expect(guestR).toBeGreaterThan(0.4);
  expect(Math.abs(guestR - memberR)).toBeLessThan(0.1);

  // FC-3 (spec §4.5/ADR-0163): no forbidden field leaked on the guest surface either — the fix
  // widens the scope by exactly two fields, not by relaxing the boundary generally.
  expect(
    (await new AxeBuilder({ page: guestPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  await guestContext.close();
});
