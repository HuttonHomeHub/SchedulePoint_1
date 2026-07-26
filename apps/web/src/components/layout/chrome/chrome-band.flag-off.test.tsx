import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChromeBand } from './chrome-band';
import { ChromePortal } from './chrome-slot';

/**
 * **The rollback contract.** `VITE_DESIGNED_CHROME=false` must render today's shell exactly: the
 * header is its own chrome surface, centred at `max-w-6xl`; there is no band wrapper and no slot;
 * and `ChromePortal` is an identity wrapper, so a plan's toolbar renders where it is written.
 *
 * Kept and pinned rather than weakened when the flag flips (the ADR-0053 M6 precedent). A rollback
 * nobody tests is a rollback nobody can take.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DESIGNED_CHROME_ENABLED: false,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({}),
  useRouterState: () => '/',
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { email: 'ada@example.com' } } }),
  useSignOut: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/organizations', () => ({ OrgSwitcher: () => null }));
vi.mock('@/hooks/use-org-role', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrgRole: () => 'PLANNER',
}));
// The band suites are about STRUCTURE; the chip has its own suite and needs a theme provider.
vi.mock('@/components/layout/account-chip', () => ({
  AccountChip: () => <button type="button">Account</button>,
}));

describe('ChromeBand (flag off) — the rollback contract', () => {
  it('renders the header as its own chrome surface, measure-capped', () => {
    render(
      <ChromeBand>
        <div data-testid="below" />
      </ChromeBand>,
    );
    const header = screen.getByRole('banner');
    expect(header.tagName).toBe('HEADER');
    expect(header).toHaveAttribute('data-surface', 'chrome');
    expect(header).toHaveClass('sticky', 'top-0');
    expect(header.querySelector('.max-w-6xl')).not.toBeNull();
  });

  it('adds no band wrapper and no slot', () => {
    const { container } = render(
      <ChromeBand>
        <div data-testid="below" />
      </ChromeBand>,
    );
    expect(container.querySelector('[data-chrome-slot]')).toBeNull();
    // The header and the children are siblings — no extra element between them.
    expect(screen.getByRole('banner').nextElementSibling).toBe(screen.getByTestId('below'));
  });

  it('makes ChromePortal an identity wrapper — children render where they are written', () => {
    render(
      <ChromeBand>
        <div data-testid="workspace">
          <ChromePortal>
            <button type="button">Recalculate</button>
          </ChromePortal>
        </div>
      </ChromeBand>,
    );
    expect(screen.getByTestId('workspace')).toContainElement(
      screen.getByRole('button', { name: 'Recalculate' }),
    );
  });
});
