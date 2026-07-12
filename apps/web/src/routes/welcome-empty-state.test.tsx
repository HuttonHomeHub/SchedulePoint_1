import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WelcomeEmptyState } from './welcome-empty-state';

// Stub the router Link so the card renders without a full router context.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof to === 'string' ? to : '/'}>{children}</a>
  ),
}));

describe('WelcomeEmptyState', () => {
  it('always shows the welcome card pointing at the Project Explorer', () => {
    render(<WelcomeEmptyState orgSlug="acme" isNewOrg={false} />);
    expect(screen.getByRole('heading', { name: 'Welcome to SchedulePoint' })).toBeInTheDocument();
    expect(screen.getByText(/Select a plan/i)).toBeInTheDocument();
    // Copy must not say "on the left" — the rail is a drawer below lg.
    expect(screen.queryByText(/on the left/i)).not.toBeInTheDocument();
  });

  it('offers "Add a client" for a brand-new org', () => {
    render(<WelcomeEmptyState orgSlug="acme" isNewOrg />);
    expect(screen.getByRole('link', { name: 'Add a client' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Browse clients' })).not.toBeInTheDocument();
  });

  it('offers a "Browse clients" fallback action when the org already has clients', () => {
    render(<WelcomeEmptyState orgSlug="acme" isNewOrg={false} />);
    expect(screen.getByRole('link', { name: 'Browse clients' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add a client' })).not.toBeInTheDocument();
  });
});
