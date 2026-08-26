import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeaderRow } from '@/components/layout/app-header';
import { ThemeProvider } from '@/hooks/use-theme';

/**
 * The rollback contract for `VITE_ACCOUNT_SETTINGS` (ADR-0074 M3).
 *
 * Kept rather than weakened once the flag flips (the ADR-0053 M6 rule): flag-off must stay
 * byte-for-byte the prior product, and the day someone needs the rollback is the day this suite has
 * to still mean something.
 *
 * The route half of the contract is pinned by construction rather than here — `accountRoute` joins
 * the tree only inside `...(ACCOUNT_SETTINGS_ENABLED ? [accountRoute] : [])`, so flag-off there is
 * not a hidden screen but no screen. What a test can add is the reachable half: no menu entry, and
 * the rest of the menu untouched.
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

const flag = vi.hoisted(() => ({ enabled: false }));

// A getter, not a value, and no `vi.resetModules()` — see `audit-nav.parity.test.tsx` for why
// re-importing under a fresh module graph produces a second ThemeContext and fails for the wrong
// reason.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get ACCOUNT_SETTINGS_ENABLED() {
    return flag.enabled;
  },
}));

vi.mock('@/features/organizations/api/use-organizations', () => ({
  useOrganizations: () => ({
    data: [{ id: 'org-1', slug: 'acme', name: 'Acme Co', role: 'PLANNER' }],
  }),
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { email: 'ada@example.com', name: 'Ada Lovelace' } } }),
  useSignOut: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
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

function openAccountMenu(): void {
  render(
    <ThemeProvider>
      <AppHeaderRow identitySlotRef={() => undefined} />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
}

describe('flag OFF — the prior account menu, byte for byte', () => {
  beforeEach(() => {
    flag.enabled = false;
  });

  it('offers no Your account entry', () => {
    openAccountMenu();
    expect(screen.queryByRole('menuitem', { name: 'Your account' })).toBeNull();
  });

  it('leaves the rest of the menu exactly as it was', () => {
    openAccountMenu();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByTestId('user-email')).toHaveTextContent('ada@example.com');
    // This case used to assert a `Light` theme radio here as well, and the assertion went with
    // the picker in ADR-0097. What this suite exists to prove is that turning
    // `VITE_ACCOUNT_SETTINGS` off removes ONE entry and disturbs nothing else — so the neighbours
    // it checks have to be things that still exist, or it stops proving that and starts failing
    // for an unrelated reason.
  });
});

describe('flag ON — the entry appears for everyone', () => {
  beforeEach(() => {
    flag.enabled = true;
  });

  it('offers Your account regardless of organisation role', () => {
    // No permission gate, and there should not be one: everything on that screen is the reader's
    // own account, and the endpoints behind it accept no user id.
    openAccountMenu();
    expect(screen.getByRole('menuitem', { name: 'Your account' })).toBeInTheDocument();
  });
});
