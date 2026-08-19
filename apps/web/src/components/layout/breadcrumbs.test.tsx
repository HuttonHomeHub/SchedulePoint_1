import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from './breadcrumbs';

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
  }) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

describe('Breadcrumbs', () => {
  it('links ancestors and marks the last crumb as the current page', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug: 'acme' } },
          { label: 'Northgate' },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
    // Ancestor is a link; the current page is plain text with aria-current.
    expect(screen.getByRole('link', { name: 'Clients' })).toBeInTheDocument();
    const current = screen.getByText('Northgate');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
  });

  // `variant="nowrap"` is the ADR-0097 D1b chrome-band trail. Its whole point is that a
  // long plan name must not wrap: a wrapped crumb grows a fixed-height band and silently
  // gives back the vertical space the merge was measured to win. So the classes below are
  // the contract, not incidental styling — and `title` is what keeps the truncated string
  // readable.
  it('nowrap: refuses to wrap, truncates each crumb, and carries the full label in `title`', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Northgate', to: '/orgs/$orgSlug/clients', params: { orgSlug: 'acme' } },
          { label: 'A programme with a very long name indeed' },
        ]}
        variant="nowrap"
      />,
    );

    const list = screen.getByRole('list');
    expect(list.className).toContain('flex-nowrap');
    expect(list.className).toContain('min-w-0');
    expect(list.className).not.toContain('flex-wrap');

    // Both the linked ancestor and the current page truncate.
    const link = screen.getByRole('link', { name: 'Northgate' });
    expect(link.className).toContain('truncate');
    const current = screen.getByText('A programme with a very long name indeed');
    expect(current.className).toContain('truncate');

    // `title` sits on the <li>, so it covers the crumb whichever branch rendered it.
    expect(link.closest('li')).toHaveAttribute('title', 'Northgate');
    expect(current.closest('li')).toHaveAttribute(
      'title',
      'A programme with a very long name indeed',
    );
  });

  // The default is the hierarchy-screen trail, which SHOULD wrap. Asserted in both
  // directions so a future change cannot make one variant the other by accident.
  it('wrap (default): wraps and adds neither truncation nor `title`', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug: 'acme' } },
          { label: 'Northgate' },
        ]}
      />,
    );

    const list = screen.getByRole('list');
    expect(list.className).toContain('flex-wrap');
    expect(list.className).not.toContain('flex-nowrap');

    const current = screen.getByText('Northgate');
    expect(current.className).not.toContain('truncate');
    expect(current.closest('li')).not.toHaveAttribute('title');
  });
});
