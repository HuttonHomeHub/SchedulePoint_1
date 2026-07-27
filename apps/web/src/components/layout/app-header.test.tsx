import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeader, AppHeaderRow } from '@/components/layout/app-header';
import { ThemeProvider } from '@/hooks/use-theme';

/**
 * The header's `1fr auto 1fr` grid (feature-spec.md §4.9, ADR-0056 M6). These tests pin the
 * two things the grid must never break: the DOM order (drawer → brand → org switcher → nav →
 * account), which is what the `e2e-designed-chrome` tab-order journey depends on, and that both
 * shell variants (`AppHeader`, `AppHeaderRow`) render the identical inner `HeaderContents`.
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

describe('header grid (feature-spec.md §4.9)', () => {
  it('keeps the brand → org switcher → nav → account DOM order for AppHeader', () => {
    renderWithTheme(<AppHeader />);
    const header = screen.getByRole('banner');
    const brand = screen.getByText('SchedulePoint');
    const orgSwitcher = screen.getByLabelText('Active organisation');
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    const account = screen.getByRole('button', { name: /Account:/ });

    // DOCUMENT_POSITION_FOLLOWING (4) means the argument comes AFTER the node it's called on.
    expect(brand.compareDocumentPosition(orgSwitcher) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(orgSwitcher.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(nav.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(header).toContainElement(brand);
    expect(header).toContainElement(account);
  });

  it('AppHeaderRow renders the identical inner structure (same grid, same order)', () => {
    renderWithTheme(<AppHeaderRow />);
    expect(screen.getByText('SchedulePoint')).toBeInTheDocument();
    expect(screen.getByLabelText('Active organisation')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    expect(nav).toHaveClass('min-w-0', 'overflow-x-auto');
    expect(screen.getByRole('button', { name: /Account:/ })).toBeInTheDocument();
  });

  it('the nav keeps its shrink-and-scroll classes so it never pushes the account chip off', () => {
    renderWithTheme(<AppHeader />);
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    expect(nav).toHaveClass('min-w-0', 'overflow-x-auto');
    expect(nav).not.toHaveClass('flex-1');
  });

  it('caps the org switcher width so a long org name shifts the centre by a bounded amount', () => {
    renderWithTheme(<AppHeader />);
    expect(screen.getByLabelText('Active organisation')).toHaveClass('max-w-[12rem]', 'truncate');
  });
});
