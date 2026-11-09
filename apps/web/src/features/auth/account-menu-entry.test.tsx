import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeaderRow } from '@/components/layout/app-header';
import { ThemeProvider } from '@/hooks/use-theme';

/**
 * The account menu's **Your account** entry (ADR-0074 M3): offered to every reader, whatever their
 * organisation role.
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
      <AppHeaderRow identitySlotRef={() => undefined} modeSlotRef={() => undefined} />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
}

describe('the account menu', () => {
  it('offers Your account regardless of organisation role', () => {
    // No permission gate, and there should not be one: everything on that screen is the reader's
    // own account, and the endpoints behind it accept no user id.
    openAccountMenu();
    expect(screen.getByRole('menuitem', { name: 'Your account' })).toBeInTheDocument();
  });
});
