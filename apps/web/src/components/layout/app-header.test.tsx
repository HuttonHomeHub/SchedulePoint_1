import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeaderRow } from '@/components/layout/app-header';
import { ThemeProvider } from '@/hooks/use-theme';

/**
 * The header's **layout** (feature-spec.md §4.9, ADR-0056 M6). These tests pin the one thing it must
 * never break: the DOM order (drawer → brand → identity → org switcher → account), which is what the
 * `e2e-designed-chrome` tab-order journey depends on.
 *
 * **This docblock said "the header's `1fr auto 1fr` grid" until 2026-08-26, and there has been no
 * grid there since the one-row header.** That change rewrote the component's own docblock to say so
 * in as many words, edited every line inside the `describe` below to add a prop, and left the block
 * name, this paragraph and one test title all still asserting a grid — a comment above working code
 * describing what used to be true, which is this repository's most-recorded drift shape, committed
 * in the diff that removed the thing. Found by the component review, not by a gate; it is checkable
 * in one grep, since `grid-cols-[minmax` no longer appears in `app-header.tsx` at all.
 *
 * There used to be two shell variants and a case pinning that both rendered the identical inner
 * `HeaderContents`. `AppHeader` was the `VITE_DESIGNED_CHROME` flag-off header and went with the
 * flag (Graphite M2), so `AppHeaderRow` is now the header, full stop.
 */
// The account chip now asks whether the reader is staff (ADR-0086). Stubbed to "no" — the answer
// for almost everybody — so these tests stay about what they are about, and so no real fetch
// escapes into jsdom. `account-chip.test.tsx` owns both branches of that gate.
vi.mock('@/features/staff/api/staff-identity', () => ({
  useStaffIdentity: () => ({ data: null }),
}));

/**
 * The route the header believes it is on. Mutable so the wordmark's four cases (ADR-0098 M4) can
 * be driven from one mock: an organisation route, the landing itself, and a route with no
 * organisation in the path at all.
 */
let route: { orgSlug?: string | undefined; pathname: string } = {
  orgSlug: 'acme',
  pathname: '/orgs/acme/clients',
};

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => (route.orgSlug === undefined ? {} : { orgSlug: route.orgSlug }),
  useRouterState: () => route.pathname,
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params: _params,
    activeOptions: _activeOptions,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
    activeOptions?: unknown;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/features/organizations/api/use-organizations', () => ({
  useOrganizations: () => ({
    data: [{ id: 'org-1', slug: 'acme', name: 'Acme Co', role: 'ORG_ADMIN' }],
  }),
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { email: 'ada@example.com', name: 'Ada Lovelace' } } }),
  useSignOut: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  route = { orgSlug: 'acme', pathname: '/orgs/acme/clients' };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

function renderWithTheme(ui: React.ReactElement): void {
  render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('header layout (feature-spec.md §4.9)', () => {
  it('keeps the brand → org switcher → account DOM order', () => {
    // The nav used to sit between the switcher and the account chip. It moved to the Project
    // Explorer rail in ADR-0097 Landing D1; what remains is identity and account — plus, since the
    // one-row header, the plan's identity slot between the brand and the trailing group. The slot is
    // `empty:hidden` and nothing portals into it here, which is why this assertion is unchanged.
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    const header = screen.getByRole('banner');
    const brand = screen.getByText('SchedulePoint');
    const orgSwitcher = screen.getByLabelText('Active organisation');
    const account = screen.getByRole('button', { name: /Account:/ });

    // DOCUMENT_POSITION_FOLLOWING (4) means the argument comes AFTER the node it's called on.
    expect(brand.compareDocumentPosition(orgSwitcher) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(orgSwitcher.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(header).toContainElement(brand);
    expect(header).toContainElement(account);
  });

  it('AppHeaderRow renders the identical inner structure (same children, same order)', () => {
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    expect(screen.getByText('SchedulePoint')).toBeInTheDocument();
    expect(screen.getByLabelText('Active organisation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Account:/ })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Organisation' })).toBeNull();
  });

  it('carries NO navigation at all — one navigator, and it is the rail', () => {
    // The D1 gate. The header's job is identity and account; every organisation destination is a
    // place in the organisation and lives in the Project Explorer, where "where am I in this
    // organisation" is answered. Asserted as an ABSENCE because that is what the change is — a
    // test for the rail's copy would pass equally with both copies present.
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    expect(screen.queryByRole('navigation', { name: 'Organisation' })).toBeNull();
    for (const name of ['Clients', 'Calendars', 'Members', 'Recently deleted']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
  });

  it('caps the org switcher width so a long org name shifts the centre by a bounded amount', () => {
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    expect(screen.getByLabelText('Active organisation')).toHaveClass('max-w-[12rem]', 'truncate');
  });
});

/**
 * The wordmark is the route home (ADR-0098 M4).
 *
 * It matters most for what it does NOT do: `brand-panel.tsx` renders the same `BrandMark` on the
 * public screens, where there is no session and no route home, and a link inside the primitive
 * would put one there pointing at a route the visitor cannot reach. That case is asserted in
 * `public-screens.landmarks.test.tsx`; these cover the header's own four.
 */
describe('the organisation nav', () => {
  it('has no Overview item anywhere — the wordmark is the route home', () => {
    // ADR-0098 M5, and the ORDER is the decision: the item went only after the landing had
    // content (M2) and the wordmark linked to it (M4). Removing the only labelled route home
    // while the destination was still a blank welcome card would have been a regression wearing a
    // cleanup's clothes.
    //
    // The nav itself then left the header entirely (ADR-0097 Landing D1), so this can no longer
    // scope itself to it. The roster assertion moved with the nav, to `org-destinations.test.tsx`.
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });
});

describe('the wordmark as the route home', () => {
  it('links to the organisation overview from an organisation route', () => {
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    const link = screen.getByRole('link', { name: 'SchedulePoint — organisation overview' });
    expect(link).toHaveAttribute('href', '/orgs/$orgSlug');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks itself the current page on the landing', () => {
    // The affordance the "Overview" nav item provided via `activeOptions={{ exact: true }}`, which
    // has to survive that item's removal.
    route = { orgSlug: 'acme', pathname: '/orgs/acme' };
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    expect(
      screen.getByRole('link', { name: 'SchedulePoint — organisation overview' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('goes to the home resolver off an organisation route', () => {
    // `/account`, `/me/activity`, `/onboarding`, `/staff` carry no `orgSlug`; `/` resolves to the
    // reader's last-active organisation or onboarding, which is the one route that knows.
    route = { orgSlug: undefined, pathname: '/account' };
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    const link = screen.getByRole('link', { name: 'SchedulePoint — home' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('keeps the visible text inside the accessible name (WCAG 2.5.3)', () => {
    // A speech-input user saying "SchedulePoint" must still match the control. An `aria-label`
    // that replaced the wordmark rather than extending it would break that silently.
    renderWithTheme(<AppHeaderRow identitySlotRef={() => undefined} />);
    const link = screen.getByRole('link', { name: 'SchedulePoint — organisation overview' });

    // The visible label is the wordmark, NOT `textContent` — the "S" badge beside it is
    // `aria-hidden` and therefore not part of the visible label 2.5.3 talks about. Asserting
    // `textContent` reads 'SSchedulePoint' and fails against a control that is perfectly correct,
    // which is what the first version of this test did.
    const visible = [...link.querySelectorAll('span')]
      .filter((span) => span.getAttribute('aria-hidden') !== 'true' && span.children.length === 0)
      .map((span) => span.textContent)
      .join('');
    expect(visible).toBe('SchedulePoint');
    expect(link.getAttribute('aria-label')).toContain(visible);
  });
});
