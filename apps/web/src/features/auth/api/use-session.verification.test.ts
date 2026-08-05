import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EMAIL_NOT_VERIFIED,
  useChangePassword,
  useSendVerificationEmail,
  useSignIn,
  useSignUp,
} from './use-session';

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
    changePassword: vi.fn(),
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

  it('points the FIRST verification email at the landing route, like every later one', async () => {
    // The other half of the same dead end (ADR-0074 M5). `sign-up.mjs:244` defaults `callbackURL`
    // to `/` when the caller sends none, so the very first verification link verified the address
    // and then dropped the reader on the app root — where the `_authed` guard bounced them to
    // `/sign-in` saying nothing. Only the flag-on journey could see it: with the switch off,
    // sign-up returns a session and nobody follows the link at all.
    vi.mocked(authClient.signUp.email).mockResolvedValue({ data: { token: null }, error: null });
    vi.mocked(apiFetch).mockResolvedValue(null);
    const { wrapper } = harness();

    const { result } = renderHook(() => useSignUp(), { wrapper });
    await result.current.mutateAsync({
      name: 'Ada',
      email: 'a@b.com',
      password: 'correct-horse-battery',
    });

    expect(authClient.signUp.email).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/verify-email?verified=1' }),
    );
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

describe('useChangePassword', () => {
  it('always revokes the other sessions, and re-reads /me afterwards', async () => {
    // The revocation is the ADR's stated guarantee. The refetch is the part nothing covered: the
    // server re-issues this session's token on a successful change, so a cached session is stale
    // the moment it returns — and deleting the `onSuccess` line failed no test in the repository
    // (ADR-0074 M5-T1, test-engineer review).
    vi.mocked(authClient.changePassword).mockResolvedValue({ error: null });
    vi.mocked(apiFetch).mockResolvedValue(null);
    const { wrapper } = harness();

    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await result.current.mutateAsync({ currentPassword: 'old-one', newPassword: 'a-new-one' });

    expect(authClient.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-one',
      newPassword: 'a-new-one',
      revokeOtherSessions: true,
    });
    expect(apiFetch).toHaveBeenCalledWith('/me');
  });
});
