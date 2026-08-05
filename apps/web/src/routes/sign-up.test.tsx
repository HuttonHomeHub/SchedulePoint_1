import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignUpScreen } from './sign-up';

import { authClient } from '@/lib/auth-client';

/**
 * ADR-0074 M2-T4 — the sign-up dead end, asserted on **both** enforcement branches.
 *
 * Fails against the pre-ADR-0074 screen, which pushed `/` unconditionally: with
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` on the server creates the account and issues no session, so
 * that navigation landed in the `_authed` guard, found `null`, and bounced the new member to
 * `/sign-in` with nothing said about why.
 */
const pushed = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    history: {
      push: (to: string) => {
        pushed.calls.push(to);
      },
    },
  }),
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signUp: { email: vi.fn() } },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn().mockResolvedValue(null) };
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignUpScreen />
    </QueryClientProvider>,
  );
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Lovelace' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-horse-battery' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

afterEach(() => {
  pushed.calls = [];
  vi.clearAllMocks();
});

describe('SignUpScreen', () => {
  it('goes into the app when the server issued a session', async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { token: 'session-token' },
      error: null,
    });
    renderScreen();
    fillAndSubmit();

    await waitFor(() => expect(pushed.calls).toEqual(['/']));
  });

  it('goes to /verify-email, carrying the address, when no session came back', async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { token: null, user: { id: 'u1' } },
      error: null,
    });
    renderScreen();
    fillAndSubmit();

    // The address rides along so the landing screen can offer the resend without asking for it
    // again — the difference between a dead end and an instruction.
    await waitFor(() => expect(pushed.calls).toEqual(['/verify-email?email=ada%40example.com']));
  });
});
