import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as ReactRouter from '@tanstack/react-router';

import type * as NavigatorModule from '@/features/navigator';
import { NavigatorCrudProvider } from '@/features/navigator/lib/navigator-crud-context';

// The rail's bottom zone renders router `Link`s (ADR-0097 Landing D1). This suite mounts the rail
// without a router — its subject is the rail's own chrome — so `Link` becomes an anchor, the same
// stand-in `app-header.test.tsx` and `breadcrumbs.test.tsx` use. `org-destinations.test.tsx` owns
// the destinations' own assertions.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
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
});

describe('NavigatorRailCollapsed', () => {
  it('offers a single control to reopen the rail', () => {
    const onExpand = vi.fn();
    render(<NavigatorRailCollapsed onExpand={onExpand} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Project Explorer' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
