import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeaderRow } from '@/components/layout/app-header';
import { OrgDestinations } from '@/components/layout/navigator/org-destinations';
import { ThemeProvider } from '@/hooks/use-theme';

/**
 * The role gate on the audit log's nav entry, and the account menu's My activity item (ADR-0072).
 *
 * The nav entry is a courtesy, never the control — the API answers 403 whether or not it renders,
 * which is why this file pins visibility and the API e2e pins authorisation.
 *
 * **The nav entry moved, and this suite followed it rather than being relaxed** (ADR-0097 Landing
 * D1a, 2026-08-19): the six organisation destinations left the app header for the Project
 * Explorer's bottom zone, so the cases about the link render `OrgDestinations` and the one about
 * the account menu still renders the header row. Widening `getByRole` to search a whole shell, or
 * dropping the `Members` control assertion, would have left a suite that passes whether or not the
 * entry exists at all.
 */
// The account chip now asks whether the reader is staff (ADR-0086). Stubbed to "no" — the answer
// for almost everybody — so these tests stay about what they are about, and so no real fetch
// escapes into jsdom. `account-chip.test.tsx` owns both branches of that gate.
vi.mock('@/features/staff/api/staff-identity', () => ({
  useStaffIdentity: () => ({ data: null }),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'acme' }),
  useRouterState: () => '/orgs/acme/clients',
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

const role = vi.hoisted(() => ({ current: 'ORG_ADMIN' }));
vi.mock('@/features/organizations/api/use-organizations', () => ({
  useOrganizations: () => ({
    data: [{ id: 'org-1', slug: 'acme', name: 'Acme Co', role: role.current }],
  }),
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { email: 'ada@example.com', name: 'Ada Lovelace' } } }),
  useSignOut: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  role.current = 'ORG_ADMIN';
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

function renderHeader(): void {
  render(
    <ThemeProvider>
      <AppHeaderRow identitySlotRef={() => undefined} modeSlotRef={() => undefined} />
    </ThemeProvider>,
  );
}

/** Where the entry lives since Landing D1a. No theme provider needed — it renders no chip. */
function renderDestinations(): void {
  render(<OrgDestinations orgSlug="acme" />);
}

describe('the entry appears for the role that can use it', () => {
  it('shows Audit log to an Org Admin', () => {
    renderDestinations();
    expect(screen.getByRole('link', { name: 'Audit log' })).toHaveAttribute(
      'href',
      '/orgs/$orgSlug/audit-log',
    );
  });

  it('hides it from a Planner — audit:read is Org Admin only', () => {
    role.current = 'PLANNER';
    renderDestinations();
    expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Members' })).toBeInTheDocument();
  });

  it('offers My activity in the account menu to EVERY role, including a Planner', () => {
    // `/me/activity` needs no permission — the actor id comes from the session and the route takes
    // no user id, so there is nothing to gate. It sits in the account menu rather than the
    // organisation nav because it is not org-scoped: it spans every organisation the reader
    // belongs to and carries the org-less authentication rows too.
    role.current = 'PLANNER';
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
    expect(screen.getByRole('menuitem', { name: 'My activity' })).toBeInTheDocument();
  });
});
