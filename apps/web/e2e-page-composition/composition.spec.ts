import { expect, test, type Page } from '@playwright/test';

/**
 * The **page composition** journey (ADR-0146).
 *
 * Every assertion here is a question about two boxes in a real layout, which is precisely what the
 * unit tier cannot answer: jsdom has no layout, so `getBoundingClientRect()` returns zeroes and a
 * test asking whether a heading and a table cell line up passes against any markup at all. The
 * structural gates that ship beside this journey assert that a screen *renders* a section and that
 * the tags co-occur; only a browser can say whether the rows are inside it and whether the thing
 * the reader sees is aligned.
 *
 * It lands with M1 rather than at the gate pass (ADR-0081 §2) and grows through M2–M7.
 *
 * Serial: one organisation's clients, calendars and resources are created and read throughout.
 */

test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const orgSlug = `composition-co-${stamp}`;

/** Sign up and create the organisation this file's screens belong to. */
async function onboard(page: Page): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Composition Tester');
  await page.getByLabel('Email').fill(`composition-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Composition Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
}

/**
 * The content column's width, read from whichever element carries the measure.
 *
 * **Not `main`'s width**, which is the shell's region and identical on every org-scoped screen
 * whatever the measure is — so an assertion on it would pass against the very drift this epic
 * exists to remove. The frame is the capped box inside it.
 */
async function contentWidth(page: Page): Promise<number> {
  /**
   * **Wait for the screen before measuring it.** `goto` resolves on `load`, which for a SPA is
   * before the route has rendered anything — so the first version of this helper threw "no page
   * frame found" on a perfectly correct screen, having measured the moment between navigation and
   * paint. The `<h1>` is the cheapest thing that means "this route is on screen".
   */
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return page.evaluate(() => {
    const frame = [...document.querySelectorAll('main div')].find((d) => {
      const cs = getComputedStyle(d);
      return (
        cs.maxWidth !== 'none' &&
        parseFloat(cs.maxWidth) > 400 &&
        d.getBoundingClientRect().width > 400
      );
    });
    if (!frame) throw new Error('no page frame found — the screen does not use the archetype');
    return Math.round(frame.getBoundingClientRect().width);
  });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await onboard(page);
  // One client, so the Clients screen has a row to frame and a count to state.
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Harbourside Estates');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByRole('link', { name: 'Harbourside Estates' })).toBeVisible();

  /**
   * **A library with the shapes that make a column hard.**
   *
   * Without this the Resources screen has no rows at all and the Calendars screen has the one
   * `Standard` row the API creates with the tenant — and an EMPTY table cannot wrap, so the
   * no-wrapping assertion below would have passed by having nothing to judge. That is the shape
   * this repository keeps recording (ADR-0093): a green result about nothing.
   *
   * The rows are chosen for shape rather than for number, and they are the two the epic was opened
   * on: a six-weekday working week, which is the longest list that column can render, and a
   * hyphenated code that breaks mid-token when its column is too narrow.
   */
  await page.evaluate(async (org) => {
    const post = async (path: string, body: unknown) => {
      const r = await fetch(`/api/v1/organizations/${org}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`POST ${path}: ${r.status} ${await r.text()}`);
    };
    await post('/calendars', {
      name: '6-Day Construction (10h, Mon-Sat)',
      workingWeekdays: 0b0111111,
    });
    await post('/resources', {
      name: 'Hydrotest Pump Unit',
      kind: 'EQUIPMENT',
      code: 'NL-HYDROPUMP',
    });
  }, orgSlug);

  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel(/email/i).fill(`composition-${stamp}@example.com`);
  await page.getByLabel(/password/i).fill('correct-horse-battery');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/orgs\//);
});

test('a list screen frames its rows in a named region', async ({ page }) => {
  await page.goto(`/orgs/${orgSlug}/clients`);

  const region = page.getByRole('region', { name: 'All clients' });
  await expect(region).toBeVisible();

  /**
   * **The rows are INSIDE the region, which is the half a string scan cannot see.**
   * `page-frame.structural.test.ts` asserts that a screen renders both tags; two siblings satisfy
   * that and look exactly wrong. This is the assertion that makes the pair meaningful.
   */
  await expect(region.getByRole('table')).toBeVisible();
  await expect(region.getByRole('link', { name: 'Harbourside Estates' })).toBeVisible();
});

test('a framed list states how many rows it holds', async ({ page }) => {
  await page.goto(`/orgs/${orgSlug}/clients`);
  const region = page.getByRole('region', { name: 'All clients' });
  await expect(region.getByRole('table').getByRole('row')).toHaveCount(2); // header + one client

  /**
   * **This docblock said the count renders `aria-hidden` "on purpose" and it was wrong when it was
   * written.** The premise — that the screen already announces its settled result count — was
   * demolished in the SAME milestone, at ADR-0146 M8: `SectionCard.count` is exposed to assistive
   * technology (`section-card.tsx`), one of the four screens passing it has no announcement hook
   * at all, and the hook the other three use is silent on first paint by its own docblock.
   * `page-archetypes.test.tsx` asserts the opposite of this paragraph and was verified red.
   *
   * Nothing went red here because the assertion reads `textContent`, which is true of an exposed
   * count and of a hidden one alike — a test that passes either way cannot report which world it
   * is in. It now reads the count by role, so the paragraph and the assertion agree.
   */
  const heading = region.getByRole('heading', { name: 'All clients' });
  const headerText = await heading.evaluate((el) => el.parentElement?.textContent ?? '');
  expect(headerText).toContain('1');
  await expect(region.getByText('1', { exact: true })).toBeVisible();
});

test('Clients states when each client was created', async ({ page }) => {
  // `docs/TECH_DEBT.md` #343(a). After ADR-0146 D4 moved the description under the name, this
  // table rendered a name at one end and an `Edit ⋯` at the other with 1012px of measured slack
  // between them — `createdAt` was on the wire throughout and shown nowhere.
  await page.goto(`/orgs/${orgSlug}/clients`);
  const region = page.getByRole('region', { name: 'All clients' });

  await expect(region.getByRole('columnheader', { name: 'Created' })).toBeVisible();
  // A real date, not an em dash: the column exists because the fact was already there.
  await expect(region.getByRole('cell', { name: /\d{4}/ }).first()).toBeVisible();
});

test('both Members sections state how many rows they hold', async ({ page }) => {
  // `docs/TECH_DEBT.md` #343(b) — specified in page-composition §4.6 and never built, with no
  // decision recorded either way.
  await page.goto(`/orgs/${orgSlug}/members`);

  for (const name of ['Roster', 'Pending invitations']) {
    const region = page.getByRole('region', { name }).first();
    const heading = region.getByRole('heading', { name });
    await expect(heading).toBeVisible();
    // The number sits beside the title in the card's header, and is exposed to AT (ADR-0146 M8).
    const headerText = await heading.evaluate((el) => el.parentElement?.textContent ?? '');
    expect(headerText).toMatch(/\d/);
  }
});

test('a heading and the first cell beneath it share a left edge', async ({ page }) => {
  await page.goto(`/orgs/${orgSlug}/clients`);
  const region = page.getByRole('region', { name: 'All clients' });
  await expect(region.getByRole('table')).toBeVisible();

  /**
   * **The defect this asserts against shipped and was reported in exactly these words**: "the
   * wording in the boxes is hard against margins". Measured on the deployed product, a card's edge
   * sat at x=551, its heading at 575, and the first cell of its table at **551** — the table flush
   * to the border while the heading respected the padding.
   *
   * The cause was `flush` setting the card body to `p-0` while the header kept `p-6`, and
   * `DataTable`'s cells carrying no left padding at all. A 2px tolerance, because a heading's glyph
   * box and a cell's are not required to agree to the pixel.
   */
  const box = await page.evaluate(() => {
    const section = document.querySelector('section[aria-labelledby]');
    const heading = section?.querySelector('h2');
    const cell = section?.querySelector('tbody tr td');
    if (!heading || !cell) throw new Error('no heading or first cell to compare');
    return {
      heading: heading.getBoundingClientRect().left,
      cell: cell.getBoundingClientRect().left,
    };
  });
  expect(Math.abs(box.heading - box.cell)).toBeLessThanOrEqual(2);
});

test('every list screen is as wide as the organisation landing', async ({ page }) => {
  /**
   * FC-1b. Measured at M0: the nine org-scoped screens rendered 1104px of content while the
   * landing rendered 1321 at this very viewport — the most literal reason they "felt different",
   * because nothing on them could line up with the page they were being aligned to.
   *
   * These screens share a shell region (they all sit behind the Project Explorer), which is why
   * their rendered widths are comparable at all. `/me/activity` and `/staff` render outside it and
   * have 277px more room, so they are compared on their declared measure instead — see
   * `falsification.md` FC-1a, restated at M0 for exactly this reason.
   */
  await page.goto(`/orgs/${orgSlug}`);
  const landing = await contentWidth(page);

  for (const path of ['clients', 'calendars', 'resources', 'members', 'audit-log']) {
    await page.goto(`/orgs/${orgSlug}/${path}`);
    expect(await contentWidth(page), `${path} is not as wide as the landing`).toBe(landing);
  }
});

test('no table cell wraps while its table has room', async ({ page }) => {
  /**
   * FC-2, in the one place it can be judged. Measured at M0, eleven columns across five screens
   * wrapped — three of them a few pixels short inside a table with 271–518px of slack, which is the
   * defect this epic was opened on. The cause was the previous epic's own remedy: it capped those
   * columns at fixed widths, correctly measuring that they were taking slack they did not want, and
   * never asked whether the content still fitted on one line inside the cap.
   *
   * **The question is asked directly rather than by counting line boxes.** A cell holding two
   * stacked elements — a name above a description, which this epic now renders deliberately — has
   * two line boxes and wraps nothing. So each cell is cloned at its own width, measured, forced to
   * `nowrap` through its whole subtree and measured again: if it gets SHORTER when nothing may
   * wrap, it was wrapping. The M0 probe's first version counted rects and reported the single word
   * `Edit` as two lines.
   */
  for (const path of ['calendars', 'resources', 'clients']) {
    await page.goto(`/orgs/${orgSlug}/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    const wrapped = await page.evaluate(() => {
      const out: string[] = [];
      for (const table of document.querySelectorAll('table')) {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
        for (const row of table.querySelectorAll('tbody tr')) {
          [...row.querySelectorAll('td')].forEach((td, i) => {
            if ((td.getAttribute('colspan') ?? '1') !== '1') return;
            const host = document.createElement('div');
            Object.assign(host.style, {
              position: 'absolute',
              left: '-99999px',
              width: `${td.getBoundingClientRect().width}px`,
              font: getComputedStyle(td).font,
            });
            const clone = td.cloneNode(true) as HTMLElement;
            clone.style.boxSizing = 'border-box';
            clone.style.width = '100%';
            host.appendChild(clone);
            document.body.appendChild(host);
            const height = host.getBoundingClientRect().height;
            for (const node of [clone, ...clone.querySelectorAll('*')]) {
              (node as HTMLElement).style.whiteSpace = 'nowrap';
            }
            const nowrap = host.getBoundingClientRect().height;
            host.remove();
            // 1px of tolerance: sub-pixel line-height rounding is not a wrap.
            if (height > nowrap + 1)
              out.push(`${heads[i] ?? '?'}: ${td.textContent?.trim() ?? ''}`);
          });
        }
      }
      return out;
    });

    expect(wrapped, `${path} has a cell wrapping inside a table with room`).toEqual([]);
  }
});

test('the outcome filter reads as a control at rest', async ({ page }) => {
  /**
   * M3. The product owner reported the audit filters as "out of place and not designed to be part
   * of the page", and reading the two controls side by side showed something sharper than framing:
   * `ToggleChip` unpressed is a bordered pill and `SegmentedControl` unselected was
   * `text-muted-foreground` with no border and no fill. Same row, same job, 20px apart. With
   * nothing chosen — the default — all three options were bare text beside four pills.
   *
   * **The spec asked for a boundary on each option and this asserts one on the GROUP instead**,
   * which is a deliberate departure: three borders inside a bordered group is the comb ADR-0065 M3
   * describes one surface along. The group's edge identifies the control; the selected option's
   * ring identifies the state.
   *
   * **This assertion's first version was vacuous and the accessibility review said so.** It checked
   * `backgroundColor !== 'transparent'` — which passes at 1.01:1 exactly as happily as at 21:1, and
   * the fill it was checking measured 1.01–1.26:1 across the seven scopes. A gate that cannot fail
   * for the defect it was written for is not a gate (ADR-0110 D5).
   *
   * The division of labour is now explicit: **the RATIO is `token-contrast.test.ts`'s job**, where
   * the `--muted`/`--input` pair is asserted at 3:1 across every scope, and **the PRESENCE is this
   * browser's job**, because a token pair can be perfect while the utility that carries it never
   * compiles — which is ADR-0100 M4's recorded defect, where a pair missing from `@theme inline`
   * painted nothing in a real browser while the contrast gate stayed green.
   */
  await page.goto(`/orgs/${orgSlug}/audit-log`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const group = page.getByRole('radiogroup').first();
  await expect(group).toBeVisible();

  /**
   * **At rest, with NOTHING selected — which is the state the whole finding was about**, and which
   * this assertion's own first version could not reach: it read the selected option's ring, and on
   * arrival there is no selected option, so it failed against a correct control. The default
   * outcome filter is unset; that is exactly why the unselected treatment mattered enough to be a
   * blocking review finding.
   */
  const atRest = await group.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      borderWidth: parseFloat(cs.borderTopWidth),
      borderColor: cs.borderTopColor,
      background: cs.backgroundColor,
      selectedCount: el.querySelectorAll('[aria-checked="true"]').length,
    };
  });

  expect(atRest.selectedCount, 'the filter should arrive with nothing chosen').toBe(0);
  // The group is bounded by something real — a zero-width or fully transparent border is the state
  // this milestone exists to leave behind.
  expect(atRest.borderWidth).toBeGreaterThan(0);
  expect(atRest.borderColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(atRest.background).not.toBe('rgba(0, 0, 0, 0)');

  // And once something IS chosen, the state is marked by more than its fill.
  await group.getByRole('radio').first().click();
  const marker = await group.evaluate((el) => {
    const selected = el.querySelector('[aria-checked="true"]');
    // Tailwind paints a ring as a box-shadow, so `none` means the marker is not painted at all.
    return selected ? getComputedStyle(selected).boxShadow : 'none';
  });
  expect(marker).not.toBe('none');
});

test('Members shows three named regions and when each member joined', async ({ page }) => {
  /**
   * M4 — the product owner asked for BOTH the landing's two-column layout and richer sections.
   *
   * `Joined` is the richer half and it cost nothing: `OrgMemberSummary.joinedAt` has been on the
   * wire the whole time and was never rendered. The roles panel is the other half, and it is here
   * rather than in a unit test because its reason for existing is compositional — without it the
   * second column holds one short section beside a table four times its height, which is the ragged
   * column this epic is supposed to be removing rather than spreading.
   */
  await page.goto(`/orgs/${orgSlug}/members`);
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();

  await expect(page.getByRole('region', { name: 'Roster' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pending invitations' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'What each role can do' })).toBeVisible();

  const roster = page.getByRole('region', { name: 'Roster' });
  await expect(roster.getByRole('columnheader', { name: 'Joined' })).toBeVisible();
  // A real date, not an em dash: the column exists because the fact was already there.
  await expect(roster.getByRole('cell', { name: /\d{4}/ }).first()).toBeVisible();
});

test('no column header stands over an empty column', async ({ page }) => {
  await page.goto(`/orgs/${orgSlug}/audit-log`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const table = page.getByRole('table').first();

  /**
   * **Wait for a real row, not for a row.** `DataTable`'s LOADING `<thead>` prints no header text
   * at all (`data-table.tsx:236-239` renders the header only for an `srHeader` column), and its
   * skeleton rows are three visible `<tr>`s — so `row.nth(1)` is visible the instant the route
   * mounts, and a scan taken there finds nothing to examine and passes. It did: this assertion
   * went green against the very column it was written to catch, twice, before the debug dump that
   * exposed it. The control below is what stops that recurring; this wait is what makes it rare.
   */
  await expect(table.getByRole('cell', { name: /Organisation created/ })).toBeVisible();

  /**
   * **A header with nothing under it, which is what the product owner reported.**
   *
   * The audit log carried an `Outcome` column whose every cell was empty on a healthy
   * installation — SUCCESS renders `sr-only`, because saying "Succeeded" on every row would drown
   * the two outcomes worth noticing — beside a filter offering to narrow by it. Folding it into
   * the Event row removes the blank column and keeps every outcome legible.
   *
   * Asserted as the general rule rather than as "there is no column called Outcome", because the
   * defect is the shape and not the name: the next always-empty column will be called something
   * else. `sr-only` headers are deliberately exempt — `DataTable`'s `srHeader` exists for a column
   * of actions, which has a name for a screen reader and nothing to print.
   */
  const scan = await table.evaluate((el) => {
    const rows = [...el.querySelectorAll('tr')];
    const head = rows[0];
    if (!head) throw new Error('no header row');
    const body = rows.slice(1);
    const empties: string[] = [];
    let examined = 0;
    [...head.querySelectorAll('th')].forEach((th, i) => {
      const label = (th.textContent ?? '').trim();
      // A header that prints nothing is not standing over anything, so it is not this defect.
      // Measured rather than read off a class name: `sr-only` clips to a 1px box, and the point is
      // whether a reader SEES a heading — `offsetParent` is no use, because an absolutely
      // positioned element has one.
      if (label === '' || th.getBoundingClientRect().width <= 1) return;
      examined += 1;
      const printed = body.some((tr) => {
        const cell = tr.children[i];
        return cell instanceof HTMLElement && (cell.textContent ?? '').trim() !== '';
      });
      if (!printed) empties.push(label);
    });
    return { empties, examined, bodyRows: body.length };
  });

  // The pinned control (ADR-0093): "every column prints something" is satisfied perfectly by a
  // table with no columns and no rows, and that is exactly the state this test kept measuring.
  expect(scan.bodyRows, 'no rows — the scan below would be vacuous').toBeGreaterThan(0);
  expect(scan.examined, 'no visible headers — the scan below would be vacuous').toBeGreaterThan(2);

  expect(scan.empties, 'these column headers print nothing in any row').toEqual([]);
});

/**
 * M8 — the two questions the unit tier structurally cannot answer about `PageHeader`'s `aside`.
 *
 * The slot shipped with `basis-full md:basis-auto` on the aside itself. A `basis-full` item on a
 * wrapping flex line does not merely take a line — it consumes the line, so **everything after it
 * is pushed onto another one**: below `md` the screen's primary action landed on a third row at
 * `justify-between`'s flex-start, left-aligned and disconnected from the title. Both of the slot's
 * real consumers pass `aside` and `actions` together, so that was not an edge case; it was the only
 * shape in use. Found by the M8 component review, reproduced in Chromium at 375px.
 *
 * Nothing could have caught it here: `page-archetypes.test.tsx` had no `aside` case at all (the
 * plan's M5-T1 promised "unit at two widths" and none was written), and jsdom would not have
 * answered it if it had. The unit cases added at M8 pin the composition; these pin the layout.
 */
test('the subject facts and the primary action share one line below md', async ({ page }) => {
  await page.goto(`/orgs/${orgSlug}/clients`);
  await page.getByRole('link', { name: 'Harbourside Estates' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Harbourside Estates' })).toBeVisible();

  const action = page.getByRole('button', { name: /new project/i });
  const facts = page.getByText(/\d+ projects?$/);
  await expect(action).toBeVisible();
  await expect(facts).toBeVisible();

  await page.setViewportSize({ width: 375, height: 900 });
  const narrow = { action: await action.boundingBox(), facts: await facts.boundingBox() };
  if (!narrow.action || !narrow.facts)
    throw new Error('nothing measured — the assertion below would be vacuous');

  // Same line: the two boxes overlap vertically. Verified red against the two-sibling version,
  // where the action sat 32px below the facts on a line of its own.
  const sameLine =
    narrow.action.y < narrow.facts.y + narrow.facts.height &&
    narrow.facts.y < narrow.action.y + narrow.action.height;
  expect(sameLine, 'the action shares the aside’s line rather than taking a third one').toBe(true);

  // And it closes that line rather than opening it. `x` alone would pass against both layouts when
  // the line holds one item, which is why this asserts the ORDER of two measured boxes.
  expect(
    narrow.action.x,
    'the action sits at the trailing end, the facts at the leading one',
  ).toBeGreaterThan(narrow.facts.x);

  // Above `md` nothing about the pair changes — the wrapper shrink-wraps and the row is one line.
  await page.setViewportSize({ width: 1646, height: 1000 });
  const wide = { action: await action.boundingBox(), facts: await facts.boundingBox() };
  if (!wide.action || !wide.facts) throw new Error('nothing measured at 1646');
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
  if (!h1) throw new Error('no h1 measured');
  expect(wide.action.y, 'the action is on the title’s own line at 1646').toBeLessThan(
    h1.y + h1.height,
  );
});

/**
 * M8 — the `fit` column's whole justification, asserted rather than measured once by hand.
 *
 * `fit` is `md:w-px md:whitespace-nowrap`, and the `md:` prefix is not stylistic: M0 measured a
 * table whose columns are all `fit` rendering **793px inside a 320px container**, because
 * `white-space: nowrap` has no fallback. That is FC-6, WCAG 2.2 §1.4.10, and until now its only
 * evidence was a one-off artefact (`m0/drift-320.json`) rather than a gate — so a future author
 * dropping the prefix would break reflow on the two screens whose content motivates `fit`, and
 * nothing in CI would say so. Raised by the M8 component review.
 */
test('no list screen overflows a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ['calendars', 'resources', 'clients', 'recently-deleted']) {
    await page.goto(`/orgs/${orgSlug}/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The `fit` columns live in the table, so wait for one before measuring — a skeleton has no
    // `whitespace-nowrap` cell in it and would report a comfortable zero (the M6 lesson).
    await expect(page.getByRole('table')).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `${path} overflows 320px by ${String(over)}px`).toBeLessThanOrEqual(0);
  }
});

/**
 * M8 — FC-8, made a gate rather than a one-off reading.
 *
 * The condition is "nothing this epic adds pushes the first content row below the fold at 1646".
 * Eight of the ten in-scope screens do not scroll at all at that width (`m0/drift-1646.json`,
 * `mainScrollHeight === mainClientHeight === 949`), so for those it cannot be violated without the
 * page growing past the viewport; the two that do scroll — the audit log and My activity — both got
 * **shorter** across M1 (2100 → 1935 and 2372 → 2275). That is the measurement.
 *
 * This is the part of it worth keeping. A measurement answers the question once, for the commit it
 * was taken on; the thing FC-8 is really protecting against is the NEXT section heading, summary
 * strip or filter bar added above a list — which is exactly what this epic added several of and
 * what decision 4 withdrew one of. So the property becomes an assertion that runs forever
 * (ADR-0058), and the fold is the viewport this project measures everything else at.
 */
test('every list screen shows its first row above the fold at 1646', async ({ page }) => {
  /**
   * Each screen is named with a row this fixture is known to hold. That is not decoration: the
   * skeleton renders three visible `<tr>`s, so `tbody tr` resolves instantly, and a handle taken
   * then goes stale the moment the data settles and the rows are replaced — which is how the first
   * version of this failed, with `toBeVisible()` passing and `boundingBox()` returning `null`. The
   * M6 assertion learnt the same lesson about the same primitive one test above. Waiting for
   * settled content first is what makes the measurement a measurement.
   *
   * `recently-deleted` is deliberately absent: nothing is deleted in this fixture, so it has no
   * rows to measure and including it would mean asserting against an empty state.
   */
  const SETTLED: [string, string][] = [
    ['clients', 'Harbourside Estates'],
    ['calendars', '6-Day Construction (10h, Mon-Sat)'],
    ['resources', 'Hydrotest Pump Unit'],
    ['members', 'Composition Tester'],
    ['audit-log', 'Organisation created'],
  ];

  await page.setViewportSize({ width: 1646, height: 1000 });
  for (const [path, settled] of SETTLED) {
    await page.goto(`/orgs/${orgSlug}/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(settled).first()).toBeVisible();

    const row = page.locator('tbody tr').first();
    const box = await row.boundingBox();
    if (!box) {
      throw new Error(`${path}: no first row measured — the assertion below would be vacuous`);
    }
    expect(
      box.y,
      `${path}'s first row starts at y=${String(Math.round(box.y))}, below the fold`,
    ).toBeLessThan(1000);
  }
});
