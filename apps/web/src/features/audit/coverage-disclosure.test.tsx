import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Env from '@/config/env';

/**
 * **The coverage rule is relocated, not cut** — M3 of the page-consistency epic.
 *
 * Both audit screens used to open with two or three paragraphs of standing prose, ~128 px of a list
 * a reader came to read, permanently in front of every reader including the ones who already know
 * the rule. It moves behind a `What this records` disclosure and stays `aria-describedby`-linked to
 * the table.
 *
 * **What this file exists to prove is the "not cut" half**, in both states, because that is the
 * risk the milestone named: the audit log's coverage rule went wrong twice in opposite directions
 * before reaching its present wording, and it is the one fact on that screen a reader cannot infer.
 * A test asserting only that the summary renders would pass just as happily against a disclosure
 * that lost its contents.
 *
 * It also pins the `my-activity` split, which is a decision rather than a consequence: the coverage
 * paragraph moves and the **security caveat stays visible**. Burying "what a Not signed in row does
 * and does not prove" behind a press was named as the riskiest single change in the epic and was
 * declined; without an assertion, a later tidy-up would make it silently.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof Env>()),
  AUDIT_SELF_SECURITY_ENABLED: true,
  AUDIT_LOG_ENABLED: true,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'acme' }),
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/features/organizations', () => ({
  useOrganizations: () => ({ isPending: false, data: [] }),
}));

vi.mock('@/hooks/use-org-role', () => ({ useOrgRole: () => 'ORG_ADMIN' }));

const fetchMock = vi.fn();

/**
 * One row, because an **empty** list renders the empty state rather than the scroll region, and the
 * scroll region is the element `DataTable` puts `aria-describedby` on. A fixture of `[]` made the
 * description assertion fail against a perfectly correct product — the second time in this file
 * that the test was wrong and the screen was not.
 */
const ROWS = [
  {
    id: '1',
    occurredAt: '2026-08-04T10:00:00.000Z',
    action: 'auth.signed_in',
    outcome: 'SUCCESS',
    actorType: 'USER',
    actorLabel: 'me@example.com',
    subjectType: 'USER',
    subjectId: 'u1',
    subjectLabel: 'me@example.com',
    changes: null,
    correlationId: null,
  },
];

async function renderScreen(which: 'audit-log' | 'my-activity'): Promise<void> {
  const mod =
    which === 'audit-log'
      ? await import('@/routes/audit-log')
      : await import('@/routes/my-activity');
  const Screen = 'AuditLogScreen' in mod ? mod.AuditLogScreen : mod.MyActivityScreen;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Screen />
    </QueryClientProvider>,
  );
  // **Wait for a ROW, not for a `<table>`.** `DataTable`'s pending state renders a skeleton that is
  // itself a table (`data-table.tsx:120-125` — the shape is known, so a skeleton beats a spinner),
  // so `getByRole('table')` resolves before the data arrives and every assertion after it runs
  // against the loading state. That cost two false failures before it was noticed.
  await waitFor(() => {
    expect(screen.getByText('Signed in')).toBeInTheDocument();
  });
}

describe('the coverage rule is behind a disclosure and still says everything it said', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: ROWS, meta: { hasMore: false, nextCursor: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe.each([
    {
      screen: 'audit-log' as const,
      // The two halves of ADR-0073's coverage rule, and the exclusion that is the commonest
      // question a reader arrives with.
      phrases: [/removes/, /changes the rules other people/, /deliberately not recorded/],
    },
    {
      screen: 'my-activity' as const,
      phrases: [/Scoped to you as the person who/, /deliberately not recorded/],
    },
  ])('$screen', ({ screen: which, phrases }) => {
    it('keeps every sentence of the rule, and keeps it in the DOM while collapsed', async () => {
      await renderScreen(which);
      const toggle = screen.getByRole('button', { name: 'What this records' });
      // Collapsed is the state a reader arrives in, and it is the state in which a relocated fact
      // is likeliest to have been lost.
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      const contentId = toggle.getAttribute('aria-controls') ?? '';
      const content = document.getElementById(contentId);
      expect(content, 'the toggle controls nothing').not.toBeNull();
      for (const phrase of phrases) {
        expect(within(content!).getByText(phrase, { exact: false })).toBeInTheDocument();
      }
    });

    /**
     * **The property the first version of this screen got wrong.**
     *
     * M3 put the rule inside a `<details>`, on the stated-but-unverified belief that
     * `aria-describedby` resolves into a collapsed one. Probed in Chromium, it does not — the
     * description is `null` while closed — so the rule was announced only when the disclosure was
     * already open, which is exactly when a reader can see it anyway.
     *
     * jsdom computes no accessibility tree, so this cannot assert the description directly. What
     * it CAN assert is the structural property that makes the description resolvable, and which
     * the `<details>` version failed: the target is in the DOM, is not `hidden`, and is not inside
     * an element whose subtree a browser skips.
     */
    it('leaves the described element reachable while collapsed — not hidden, not in a <details>', async () => {
      await renderScreen(which);
      const toggle = screen.getByRole('button', { name: 'What this records' });
      const content = document.getElementById(toggle.getAttribute('aria-controls') ?? '');

      expect(content).not.toBeNull();
      expect(content).not.toHaveAttribute('hidden');
      expect(
        content!.closest('details'),
        'a closed <details> is skipped by the accessible-description computation (probed in ' +
          'Chromium) — the rule would be announced only once it is already visible',
      ).toBeNull();
      // Clipped rather than removed: sr-only is the one state that hides it from sight and leaves
      // it in the accessibility tree.
      expect(content!.className).toContain('sr-only');
    });

    it('describes the list it qualifies, while collapsed', async () => {
      await renderScreen(which);

      // **Found from the toggle's own `aria-controls`, not from a role.** `DataTable` carries
      // `aria-describedby` on the scroll region when there are rows and on a plain wrapper when
      // there are none (`data-table.tsx:207`, `:221`), so a role-based query asserts the fixture's
      // state rather than the wiring. Two earlier versions of this assertion went red against a
      // perfectly correct product for exactly that reason, once on the `<table>` and once on the
      // region.
      const toggle = screen.getByRole('button', { name: 'What this records' });
      const id = toggle.getAttribute('aria-controls') ?? '';
      expect(id, 'the toggle controls nothing').not.toBe('');
      const content = document.getElementById(id);
      expect(content, 'the disclosure holds no identified content to point at').not.toBeNull();

      const describers = [...document.querySelectorAll('[aria-describedby]')].filter((el) =>
        (el.getAttribute('aria-describedby') ?? '').split(/\s+/).includes(id),
      );
      expect(
        describers.length,
        'nothing points at the relocated rule, so it is behind a press AND unannounced',
      ).toBeGreaterThan(0);

      // Non-empty is the point: an `aria-describedby` resolving to an empty node is a link to
      // nothing, and reads identically to a correct one in every DOM-shape assertion.
      expect((content!.textContent ?? '').trim().length).toBeGreaterThan(40);
    });
  });

  it('leaves my-activity’s security caveat visible, outside the disclosure', async () => {
    await renderScreen('my-activity');
    const caveat = screen.getByText(/Failed sign-ins against your email address/);
    const toggle = screen.getByRole('button', { name: 'What this records' });
    const content = document.getElementById(toggle.getAttribute('aria-controls') ?? '');

    expect(content, 'the toggle controls nothing').not.toBeNull();
    // **Asked of the disclosure's controlled element, not of a `<details>`.** The first version of
    // this assertion read `caveat.closest('details')`, which was meaningful while the disclosure
    // WAS a `<details>` and became vacuously true the moment it stopped being one — a guard that
    // keeps passing while no longer able to fail, which is the one failure mode a green suite
    // cannot report.
    expect(
      content!.contains(caveat),
      'the security caveat was moved behind a press — it is a decision that it is not',
    ).toBe(false);
    // And visible, not merely outside: `sr-only` on an ancestor would satisfy the containment test
    // above while taking the sentence off the screen it was written for.
    expect(caveat.closest('.sr-only')).toBeNull();
  });
});
