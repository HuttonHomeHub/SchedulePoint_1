import type * as ReactRouter from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OrgDestinations } from './org-destinations';

/**
 * The organisation destinations, relocated from the app header (ADR-0097 Landing D1).
 *
 * The roster assertion moved here with the nav — `app-header.test.tsx` held it until the nav left
 * that file, and it is worth keeping because it is the one place the product states, in order,
 * which places an organisation has.
 */
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

let role: string = 'ORG_ADMIN';
vi.mock('@/features/organizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'o1', slug: 'acme', name: 'Acme', role }] }),
}));

function renderDestinations(as: string): void {
  role = as;
  render(<OrgDestinations orgSlug="acme" />);
}

describe('OrgDestinations', () => {
  it('lists an organisation’s places, in order, for an Org Admin', () => {
    renderDestinations('ORG_ADMIN');
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Clients', 'Calendars', 'Resources', 'Members', 'Audit log', 'Recently deleted']);
  });

  it('withholds the audit log from everyone but an Org Admin', () => {
    // Hiding it is a courtesy, not the control — the API answers 403 either way (ADR-0072).
    renderDestinations('PLANNER');
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    expect(within(nav).queryByRole('link', { name: 'Audit log' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Recently deleted' })).toBeInTheDocument();
  });

  it('withholds the recycle bin from a reader who cannot restore', () => {
    renderDestinations('VIEWER');
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    expect(within(nav).queryByRole('link', { name: 'Recently deleted' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Clients' })).toBeInTheDocument();
  });

  it('names every destination in text, never by icon alone', () => {
    // These are places a planner reads down a list, not a toolbar of glyphs. Every icon is
    // decorative; if one ever became the only identifier, this fails.
    renderDestinations('ORG_ADMIN');
    const nav = screen.getByRole('navigation', { name: 'Organisation' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.textContent?.trim()).not.toBe('');
      for (const svg of link.querySelectorAll('svg')) {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      }
    }
  });
});
