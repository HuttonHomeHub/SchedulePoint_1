import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from '@/components/layout/app-header';
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
 */
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
      <AppHeader />
    </ThemeProvider>,
  );
}

describe('flag OFF — the prior product, byte for byte', () => {
  beforeEach(() => {
    flag.enabled = false;
  });

  it('renders no Audit log entry, even for an Org Admin', () => {
    renderHeader();
    expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
    // Flag-off is not "audit hidden", it is the prior header: the rest of the nav is untouched.
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
    renderHeader();
    expect(screen.getByRole('link', { name: 'Audit log' })).toHaveAttribute(
      'href',
      '/orgs/$orgSlug/audit-log',
    );
  });

  it('hides it from a Planner — audit:read is Org Admin only', () => {
    role.current = 'PLANNER';
    renderHeader();
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
