import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as OrganizationsModule from '@/features/organizations';

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

// The chip reaches a session query, a staff query and a `Menu` portal; the switcher reaches an
// organisations query. Both have suites of their own, so they are stubbed to their landmarks and
// this one stays about WHERE the rail puts things.
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

const { ToolRail } = await import('./tool-rail');

function renderRail(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

const props = {
  orgSlug: 'acme',
  explorerAvailable: true,
  subject: 'explorer' as const,
  drawerOpen: true,
  onSelectSubject: vi.fn(),
};

describe('ToolRail', () => {
  /**
   * **Everything survives at 46 px, which is the constraint that shaped the rail.** ADR-0097
   * Landing D1 moved six organisation destinations out of a header a rail collapse could not
   * reach, and `OrgDestinationsCollapsed` exists because leaving them behind a toggle would have
   * hidden the product's whole secondary navigation. Graphite M3 moved the brand, the switcher and
   * the account out of that same header, and M4 shrank the rail to 46 px. Each step is one where
   * something could have been dropped for want of room, so all of it is asserted in one place.
   */
  it('carries the brand, the switcher, the destinations and the account at 46 px', () => {
    renderRail(<ToolRail {...props} />);
    expect(screen.getByRole('link', { name: /SchedulePoint/ })).toBeInTheDocument();
    // `title` carries the organisation where the control is too narrow to show it; the accessible
    // name is still the `sr-only <label>`, never the title.
    expect(screen.getByLabelText('Active organisation')).toHaveAttribute('title', 'acme');
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    expect(within(nav).getByRole('link', { name: 'Clients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Account:/ })).toBeInTheDocument();
  });

  /**
   * **The same rule, and the button four rows above the destinations was exempt from it**
   * (`docs/TECH_DEBT.md` #165a).
   *
   * This case's title has stated the rule since the rail was built, and it asserted it of one of
   * the rail's two organisation-dependent clusters. The Project Explorer button was the other, and
   * it rendered on `/onboarding`, `/account` and `/me/activity` opening a ~298 px panel whose whole
   * content was "Select an organisation to browse." Both halves are asserted here now, in one case,
   * because the defect was precisely that they were separable.
   *
   * Verified red first: the button resolved against the pre-fix rail.
   */
  it('renders no organisation navigation outside an organisation — there is none to show', () => {
    renderRail(<ToolRail {...props} orgSlug={undefined} explorerAvailable={false} />);
    expect(screen.queryByRole('navigation', { name: 'Organisation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Project Explorer' })).not.toBeInTheDocument();
  });

  /**
   * **Availability is not the same question as which subject is active**, and the rail must not
   * conflate them: the account controls and the brand survive an unavailable Explorer, because they
   * are the reader's only route off a screen that now offers no navigation at all.
   */
  it('keeps the brand and the account chip when the Explorer is unavailable', () => {
    renderRail(<ToolRail {...props} orgSlug={undefined} explorerAvailable={false} />);
    expect(screen.getByRole('link', { name: /SchedulePoint/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Account:/ })).toBeInTheDocument();
  });

  /**
   * `aria-pressed` rather than `aria-current`: the button is a toggle over what the drawer shows,
   * not a statement about where the reader is.
   *
   * Both states are asserted, and the second is the one that matters — a button lit beside a
   * **closed** panel is a control claiming something the screen contradicts, and an assertion that
   * only pins the lit case passes equally against a button that is always lit.
   */
  it('reads as pressed only when the drawer is open on its subject', () => {
    const { rerender } = renderRail(<ToolRail {...props} />);
    expect(screen.getByRole('button', { name: 'Project Explorer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ToolRail {...props} drawerOpen={false} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Project Explorer' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('asks the shell for its subject and does not decide the outcome itself', () => {
    const onSelectSubject = vi.fn();
    renderRail(<ToolRail {...props} onSelectSubject={onSelectSubject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project Explorer' }));
    // The rail knows which button was pressed; only the shell knows whether that opens the drawer,
    // re-points it, or closes it because the reader pressed the one already showing.
    expect(onSelectSubject).toHaveBeenCalledWith('explorer');
  });
});
