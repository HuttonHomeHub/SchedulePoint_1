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
});
