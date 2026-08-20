import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

const { NavigatorRail, NavigatorRailCollapsed } = await import('./navigator-rail');

// The rail's version footer reads the API version via TanStack Query, so it needs a client
// in scope (in the app it's always inside the shell's QueryClientProvider).
function renderRail(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('NavigatorRail', () => {
  it('renders the Project Explorer landmark, hinting to pick an org when none is active', () => {
    renderRail(<NavigatorRail />);
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(screen.getByText(/select an organisation/i)).toBeInTheDocument();
  });

  it('shows a collapse control (pinned rail) that fires onCollapse', () => {
    const onCollapse = vi.fn();
    renderRail(<NavigatorRail onCollapse={onCollapse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Project Explorer' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Close Project Explorer' }),
    ).not.toBeInTheDocument();
  });

  it('shows a close control (drawer) that fires onClose', () => {
    const onClose = vi.fn();
    renderRail(<NavigatorRail onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Project Explorer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
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

  /**
   * **Graphite M3 deleted the top bar, so the rail carries what it held.** These three are the
   * whole reason that deletion is affordable: brand, organisation switcher and account menu.
   */
  it('carries the brand, the organisation switcher and the account menu on the pinned rail', () => {
    renderRail(<NavigatorRail orgSlug="acme" onCollapse={vi.fn()} />);
    expect(screen.getByRole('link', { name: /SchedulePoint/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Active organisation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Account:/ })).toBeInTheDocument();
  });

  /**
   * **And the DRAWER does not**, which is the half a "just render them in the rail" change gets
   * wrong. Below `lg` the rail opens as a `Sheet` from a top bar that already carries all three;
   * repeating them inside would put two brand links and two account menus in one accessibility
   * tree, both reachable, one of them under a landmark that is not a banner.
   *
   * `onClose` rather than `onCollapse` is the discriminator, because it is the one the shell
   * already passes to distinguish the two surfaces — not a new prop meaning "am I the drawer".
   */
  it('does not repeat them in the drawer, where a top bar already has them', () => {
    renderRail(<NavigatorRail orgSlug="acme" onClose={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /SchedulePoint/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Active organisation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Account:/ })).not.toBeInTheDocument();
  });
});

describe('NavigatorRailCollapsed', () => {
  // Named for the control, not for how many there are: Graphite M3 put the brand, the switcher
  // and the account menu in here too, so "a single control" stopped being true the moment the top
  // bar was deleted.
  it('offers a control to reopen the rail', () => {
    const onExpand = vi.fn();
    renderRail(<NavigatorRailCollapsed onExpand={onExpand} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Project Explorer' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  /**
   * **The identity survives the collapse, and that is the point.** Until Graphite M3 the brand,
   * the switcher and the account lived in a top bar that a rail collapse could not reach.
   * Collapsing is exactly what a planner does to gain canvas width, so a collapsed rail carrying
   * only a toggle would have put all three behind a control they had never been behind — the
   * argument `OrgDestinationsCollapsed` records for the six destinations, one epic earlier.
   */
  it('keeps the brand, the switcher and the account reachable when collapsed', () => {
    renderRail(<NavigatorRailCollapsed onExpand={vi.fn()} orgSlug="acme" />);
    expect(screen.getByRole('link', { name: /SchedulePoint/ })).toBeInTheDocument();
    // `title` carries the organisation where the control is too narrow to show it. The accessible
    // name is still the `sr-only <label>`, never the title.
    expect(screen.getByLabelText('Active organisation')).toHaveAttribute('title', 'acme');
    expect(screen.getByRole('button', { name: /^Account:/ })).toBeInTheDocument();
  });

  /**
   * The state ADR-0097 Landing D1 owed (`migration.md`): before D1 the six organisation
   * destinations lived in the app header and survived a rail collapse. Collapsing is exactly what a
   * planner does to gain canvas width, so a collapsed rail with only a toggle would have put the
   * whole secondary navigation behind one control it had never been behind.
   */
  it('keeps the organisation destinations reachable as an icon strip', () => {
    renderRail(<NavigatorRailCollapsed onExpand={vi.fn()} orgSlug="acme" />);
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    // Named, not just present: an icon link with no accessible name is not a link anyone can use,
    // and the name has to be the SAME word the expanded rail shows (WCAG 2.5.3 Label in Name) or a
    // speech-input user says one thing when the rail is open and another when it is shut.
    expect(within(nav).getByRole('link', { name: 'Clients' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Members' })).toBeInTheDocument();
    // Icon-only: no destination renders its label as text, or the strip is not a strip.
    expect(within(nav).getByRole('link', { name: 'Clients' })).toHaveTextContent('');
  });

  it('renders no destinations outside an organisation — there are none to show', () => {
    renderRail(<NavigatorRailCollapsed onExpand={vi.fn()} />);
    expect(screen.queryByRole('navigation', { name: 'Organisation' })).toBeNull();
  });
});
