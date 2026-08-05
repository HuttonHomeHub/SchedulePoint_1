import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMAIL_NOT_VERIFIED, useSendVerificationEmail, useSignIn, useSignUp } from './use-session';

import { apiFetch } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

/**
 * Regression coverage for ADR-0074 M2-T4/T5 — the two places the client read the server's answer
 * wrongly, both of which arm themselves only when an operator sets
 * `AUTH_REQUIRE_EMAIL_VERIFICATION`. Each assertion here fails against the pre-ADR-0074 hooks:
 * `useSignUp` returned `void` (so no caller could see a session was withheld) and `useSignIn` threw
 * a plain `Error` (so no caller could see the 403's code).
 */
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    sendVerificationEmail: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

afterEach(() => vi.clearAllMocks());

describe('useSignUp — the enforcement branch', () => {
  it('reports signedIn when the server issues a session token', async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { token: 'session-token' },
      error: null,
    });
    vi.mocked(apiFetch).mockResolvedValue(null);
    const { wrapper } = harness();

    const { result } = renderHook(() => useSignUp(), { wrapper });
    const outcome = await result.current.mutateAsync({
      name: 'Ada',
      email: 'a@b.com',
      password: 'correct-horse-battery',
    });

    expect(outcome).toEqual({ signedIn: true });
  });

  it('reports NOT signed in when verification is enforced and the token is null', async () => {
    // `sign-up.mjs:252-254` — with `requireEmailVerification` on, the account is created and the
    // route answers `{ token: null, user }`. There is no `error`, which is exactly why inspecting
    // only `error` reported success and sent the new member into a guard that bounced them out.
    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { token: null, user: { id: 'u1' } },
      error: null,
    });
    vi.mocked(apiFetch).mockResolvedValue(null);
    const { wrapper } = harness();

    const { result } = renderHook(() => useSignUp(), { wrapper });
    const outcome = await result.current.mutateAsync({
      name: 'Ada',
      email: 'a@b.com',
      password: 'correct-horse-battery',
    });

    expect(outcome).toEqual({ signedIn: false });
  });
});

describe('useSignIn — EMAIL_NOT_VERIFIED', () => {
  it('carries the library code so a caller can branch on it', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: 'Email not verified', code: EMAIL_NOT_VERIFIED },
    });
    const { wrapper } = harness();

    const { result } = renderHook(() => useSignIn(), { wrapper });
    await expect(
      result.current.mutateAsync({ email: 'a@b.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: EMAIL_NOT_VERIFIED });
  });

  it('leaves the code undefined for an ordinary credential failure', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: 'Invalid email or password' },
    });
    const { wrapper } = harness();

    const { result } = renderHook(() => useSignIn(), { wrapper });
    await expect(
      result.current.mutateAsync({ email: 'a@b.com', password: 'nope' }),
    ).rejects.toMatchObject({ code: undefined, message: 'Invalid email or password' });
  });
});

describe('useSendVerificationEmail', () => {
  it('sends the address it is given and points the callback at the landing route', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ error: null });
    const { wrapper } = harness();

    const { result } = renderHook(() => useSendVerificationEmail(), { wrapper });
    await result.current.mutateAsync('a@b.com');

    // Session-less by design: the people who need this cannot sign in, so the address is an
    // argument rather than something read from a session that does not exist.
    expect(authClient.sendVerificationEmail).toHaveBeenCalledWith({
      email: 'a@b.com',
      callbackURL: '/verify-email?verified=1',
    });
  });
});
