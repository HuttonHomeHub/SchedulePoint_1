import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as NavigatorModule from '@/features/navigator';
import { NavigatorCrudProvider } from '@/features/navigator/lib/navigator-crud-context';
import type * as OrganizationsModule from '@/features/organizations';

// The rail's bottom zone renders router `Link`s (ADR-0097 Landing D1) and, since Graphite M3, its
// top zone renders the brand link — which reads the pathname to decide whether it is the current
// page. This suite mounts the rail without a router — its subject is the rail's own chrome — so
// `Link` becomes an anchor and `useRouterState` returns a path, the same stand-ins
// `app-header.test.tsx` and `breadcrumbs.test.tsx` use. `org-destinations.test.tsx` owns the
// destinations' own assertions.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useRouterState: () => '/',
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

// The identity and account zones Graphite M3 moved into the rail have suites of their own
// (`account-chip.test.tsx`, `OrgSwitcher`'s), and the chip alone reaches a session query, a staff
// query and a `Menu` portal. Stubbed to their landmarks so this suite stays about WHERE the rail
// puts them.
vi.mock('@/components/layout/account-chip', () => ({
  AccountChip: () => (
    <button type="button" aria-label="Account: ada@example.com">
      AL
    </button>
  ),
}));
vi.mock('@/features/organizations', async (importOriginal) => ({
  ...(await importOriginal<typeof OrganizationsModule>()),
  OrgSwitcher: ({ title }: { title?: string }) => (
    <select aria-label="Active organisation" title={title}>
      <option>Acme</option>
    </select>
  ),
}));

// The tree reads route params, so it needs a router this suite has no reason to mount — the
// subject here is the rail's own header chrome. Everything else from the barrel is real.
vi.mock('@/features/navigator', async (importOriginal) => ({
  ...(await importOriginal<typeof NavigatorModule>()),
  HierarchyTree: (): React.ReactElement => <div data-testid="tree-stub" />,
}));

const { NavigatorRail } = await import('./navigator-rail');

// The rail's version footer reads the API version via TanStack Query, so it needs a client
// in scope (in the app it's always inside the shell's QueryClientProvider).
function renderRail(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('NavigatorRail', () => {
  /**
   * **This asserted the org-less hint until 2026-08-22, and that hint was the defect.**
   *
   * `docs/TECH_DEBT.md` #165a: the paragraph this used to pin — "Select an organisation to
   * browse." — was what a reader met on `/onboarding`, `/account` and `/me/activity`, where there
   * is no organisation to select. `orgSlug` is now required and the branch is gone, so what is
   * left to assert is the landmark and the tree it exists to hold.
   *
   * It is the **third** suite in this area found pinning a state the product can no longer
   * produce, after `app-shell.test.tsx` and `drawer-entry-point.test.tsx` — which is most of the
   * answer to why three live routes sat in that state without anyone noticing.
   */
  it('renders the Project Explorer landmark around the organisation tree', () => {
    renderRail(<NavigatorRail orgSlug="acme" />);
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(screen.getByTestId('tree-stub')).toBeInTheDocument();
  });

  it('shows a close control (drawer) that fires onClose', () => {
    const onClose = vi.fn();
    renderRail(<NavigatorRail orgSlug="acme" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Project Explorer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * **The destinations are carried at every width** (workspace redesign M3-T2).
   *
   * The case this replaces asserted the opposite — present in the `Sheet`, absent otherwise —
   * because Graphite M4 split them across two surfaces, this list below `lg` and an icon strip on
   * the tool rail above it, and rendering both put "Clients" on screen twice. That rail is deleted;
   * this component is the persistent navigator at every width, so there is nothing left to
   * discriminate and the `onClose` condition went with the second surface.
   *
   * Still asserted in both shapes, for the reason the old case gave: pinning one passes equally
   * against a component that renders them nowhere.
   */
  it('carries the organisation destinations in both shapes', () => {
    const { unmount } = renderRail(<NavigatorRail orgSlug="acme" onClose={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Organisation' })).toBeInTheDocument();
    unmount();

    renderRail(<NavigatorRail orgSlug="acme" />);
    expect(screen.getByRole('navigation', { name: 'Organisation' })).toBeInTheDocument();
  });

  /**
   * **The fold control appears only when this rail IS the docked column** (M3-T1). Below `lg` the
   * `Sheet` has a Close instead, and offering both would be two controls for one dismissal that
   * persist differently — one writes a width preference, the other does not.
   */
  it('offers the fold control only when the column asks for one', () => {
    const { unmount } = renderRail(<NavigatorRail orgSlug="acme" />);
    expect(screen.queryByRole('button', { name: 'Hide Project Explorer' })).not.toBeInTheDocument();
    unmount();

    const onCollapse = vi.fn();
    renderRail(<NavigatorRail orgSlug="acme" onCollapse={onCollapse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Project Explorer' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('names the root create control "New client", not just "Client"', () => {
    // The VISIBLE label is shortened to fit the rail header, which makes the accessible name
    // a separate decision rather than a by-product: "Client" alone names a noun and never says
    // what pressing it does. This is pinned because the short label silently renamed the button
    // once already, and nothing below the e2e journey noticed.
    const onCreateClient = vi.fn();
    renderRail(
      <NavigatorCrudProvider
        value={{ canWrite: true, onCreateClient, onNodeAction: vi.fn(), afterDelete: null }}
      >
        <NavigatorRail orgSlug="acme" />
      </NavigatorCrudProvider>,
    );
    const create = screen.getByRole('button', { name: 'New client' });
    // WCAG 2.5.3 Label in Name: the visible word must be inside the accessible name, so voice
    // control ("click Client") still reaches the control.
    expect(create).toHaveTextContent('Client');
    fireEvent.click(create);
    expect(onCreateClient).toHaveBeenCalledTimes(1);
  });
});
