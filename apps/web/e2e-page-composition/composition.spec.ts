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
   * The count renders `aria-hidden` on purpose — the screen already announces its settled result
   * count through a live region, and two announcements of one number is how a reader hears "1"
   * twice and has to work out whether they are two facts. So it is read as TEXT rather than by
   * role, which is also the honest way to assert something deliberately outside the a11y tree.
   */
  const heading = region.getByRole('heading', { name: 'All clients' });
  const headerText = await heading.evaluate((el) => el.parentElement?.textContent ?? '');
  expect(headerText).toContain('1');
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
