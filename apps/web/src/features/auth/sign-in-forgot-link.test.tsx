import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SignInScreen } from '@/routes/sign-in';

/**
 * The sign-in screen's "Forgot your password?" link (ADR-0074 M4) points at the route the router
 * registers. `pnpm typecheck` cannot check that: a `Link` to an unregistered route compiles too.
 */
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { push: vi.fn() } }),
  useSearch: () => ({}),
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { email: vi.fn() } } }));

function renderSignIn() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SignInScreen />
    </QueryClientProvider>,
  );
}

describe('sign-in screen', () => {
  it('renders the link beside the form, pointing at the forgot-password route', () => {
    renderSignIn();
    expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
