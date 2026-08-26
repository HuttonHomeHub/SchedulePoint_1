import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeaderRow } from '@/components/layout/app-header';
import { OrgDestinations } from '@/components/layout/navigator/org-destinations';
import { ThemeProvider } from '@/hooks/use-theme';

/**
 * The rollback contract for `VITE_AUDIT_LOG` (ADR-0072), and the role gate on the nav entry.
 *
 * Kept rather than weakened once the flag flips (the ADR-0053 M6 rule): flag-off must stay
 * byte-for-byte the prior product, and the day someone needs the rollback is the day this suite
 * has to still mean something.
 *
 * The nav entry is a courtesy, never the control — the API answers 403 whether or not it renders,
 * which is why this file pins visibility and the API e2e pins authorisation.
 *
 * **The nav entry moved, and this suite followed it rather than being relaxed** (ADR-0097 Landing
 * D1a, 2026-08-19): the six organisation destinations left the app header for the Project
 * Explorer's bottom zone, so the three cases about the link now render `OrgDestinations` and the
 * two about the account menu still render the header row. Widening `getByRole` to search a whole
 * shell, or dropping the `Members` control assertion, would have been the cheaper edit and would
 * have left a parity suite that passes whether or not the entry exists at all.
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
const flag = vi.hoisted(() => ({ enabled: false }));

/**
 * A GETTER, not a value, and no `vi.resetModules()`.
 *
 * Re-importing the header under a fresh module graph was tried first and produces a second
 * `ThemeContext` — the provider rendered from this file's graph is invisible to the component from
 * the new one, and every case fails inside `useTheme` for a reason that has nothing to do with the
 * flag. The getter lets one graph answer differently per test.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get AUDIT_LOG_ENABLED() {
    return flag.enabled;
  },
}));

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
      <AppHeaderRow identitySlotRef={() => undefined} />
    </ThemeProvider>,
  );
}

/** Where the entry lives since Landing D1a. No theme provider needed — it renders no chip. */
function renderDestinations(): void {
  render(<OrgDestinations orgSlug="acme" />);
}

describe('flag OFF — the prior product, byte for byte', () => {
  beforeEach(() => {
    flag.enabled = false;
  });

  it('renders no Audit log entry, even for an Org Admin', () => {
    renderDestinations();
    expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
    // Flag-off is not "audit hidden", it is the prior nav: the rest of it is untouched. Asserting
    // a sibling is what stops this passing against a component that renders nothing.
    expect(screen.getByRole('link', { name: 'Members' })).toBeInTheDocument();
  });

  it('renders no My activity item in the account menu', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
    expect(screen.queryByRole('menuitem', { name: 'My activity' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('flag ON — the entry appears for the role that can use it', () => {
  beforeEach(() => {
    flag.enabled = true;
  });

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
