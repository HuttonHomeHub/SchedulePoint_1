import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInScreen } from '@/routes/sign-in';

/**
 * The rollback contract for `VITE_PASSWORD_RESET` (ADR-0074 M4) — and, more importantly, **the only
 * gate that can catch the stranding failure.**
 *
 * `pnpm typecheck` cannot: `...(FLAG ? [route] : [])` widens the registered-route union to include
 * the route in **both** branches, so `<Link to="/forgot-password">` compiles whether or not the
 * route exists. Flag-off, that link would render and go nowhere — and nothing else in the repo
 * would say so. This file asserts the link's absence **specifically**, which is why it pins the
 * link rather than the routes: the route half holds by construction, the link half does not.
 *
 * Kept rather than weakened when the flag flips (the ADR-0053 M6 rule).
 */
const flag = vi.hoisted(() => ({ enabled: false }));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { push: vi.fn() } }),
  useSearch: () => ({}),
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

// A getter, not a value — see `audit-nav.parity.test.tsx` for why `vi.resetModules()` is wrong here.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get PASSWORD_RESET_ENABLED() {
    return flag.enabled;
  },
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

describe('flag OFF — the prior sign-in screen, byte for byte', () => {
  beforeEach(() => {
    flag.enabled = false;
  });

  it('renders NO "Forgot your password?" link', () => {
    renderSignIn();
    expect(screen.queryByRole('link', { name: /forgot your password/i })).toBeNull();
  });

  it('leaves the rest of the screen exactly as it was', () => {
    renderSignIn();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create one' })).toBeInTheDocument();
  });
});

describe('flag ON — the link appears beside the form it belongs to', () => {
  beforeEach(() => {
    flag.enabled = true;
  });

  it('renders the link, pointing at the route the same constant registers', () => {
    renderSignIn();
    expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
