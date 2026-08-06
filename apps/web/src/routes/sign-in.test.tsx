import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignInScreen } from './sign-in';

import { apiFetch } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

/**
 * ADR-0077 M0-T1 — the sign-in **route**, which had no suite of its own.
 *
 * `SignInForm.test.tsx` and `SignInForm.verification.test.tsx` cover the form; nothing covered what
 * the route adds around it. That matters most for the one thing only the route knows: **where a
 * successful sign-in goes**. `search.redirect` is what returns an invitee to
 * `/accept-invite?token=…` after they sign in — the hand-off `AcceptInvitationCard` composes — and
 * a regression there strands them on the org home with the invitation apparently gone.
 *
 * The `PASSWORD_RESET_ENABLED` link gating is deliberately **not** re-asserted here: it is already
 * pinned, on both branches, by `features/auth/password-reset.parity.test.tsx`, which exists as the
 * flag's rollback contract. A second copy would drift from it rather than reinforce it (ADR-0062).
 *
 * Written against the **pre-M4 screen** and asserting behaviour and accessible names only, never
 * structure or class names — which is what has to make it survive the brand-surface redesign
 * unchanged. That property is the point: ADR-0062's extraction was proved correct by every
 * pre-existing suite passing through it untouched.
 */
const pushed = vi.hoisted(() => ({ calls: [] as string[] }));
const search = vi.hoisted<{ value: Record<string, unknown> }>(() => ({ value: {} }));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    history: {
      push: (to: string) => {
        pushed.calls.push(to);
      },
    },
  }),
  useSearch: () => search.value,
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: vi.fn() } },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignInScreen />
    </QueryClientProvider>,
  );
}

function signIn() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-horse-battery' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

afterEach(() => {
  pushed.calls = [];
  search.value = {};
  vi.clearAllMocks();
});

describe('SignInScreen', () => {
  it('offers the form and the way to create an account', () => {
    renderScreen();

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('goes home when nothing asked for somewhere else', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({ data: {}, error: null });
    vi.mocked(apiFetch).mockResolvedValue({ user: { id: 'u1' }, memberships: [] });
    renderScreen();
    signIn();

    await waitFor(() => expect(pushed.calls).toEqual(['/']));
  });

  it('returns to the page that sent the reader here', async () => {
    // The invitation hand-off: `AcceptInvitationCard` links to `/sign-in` carrying exactly this,
    // so that accepting survives the detour through sign-in. Nothing else in the repo asserts it.
    search.value = { redirect: '/accept-invite?token=tok' };
    vi.mocked(authClient.signIn.email).mockResolvedValue({ data: {}, error: null });
    vi.mocked(apiFetch).mockResolvedValue({ user: { id: 'u1' }, memberships: [] });
    renderScreen();
    signIn();

    await waitFor(() => expect(pushed.calls).toEqual(['/accept-invite?token=tok']));
  });
});
