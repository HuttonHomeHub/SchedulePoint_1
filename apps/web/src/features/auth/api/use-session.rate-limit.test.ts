import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authErrorMessage,
  isRateLimited,
  useChangePassword,
  useRequestPasswordReset,
  useResetPassword,
  useSendVerificationEmail,
  useSignIn,
  useSignUp,
  type AuthError,
} from './use-session';

import { authClient } from '@/lib/auth-client';

/**
 * ADR-0077 M1-T4 — every auth mutation carries the HTTP status, so a 429 can be told apart from
 * everything else.
 *
 * Better Auth's rate-limit body has **no `code`**, so before this each of the six fell through to
 * the library's own "Too many requests. Please try again later." in a bare red paragraph. The
 * status was on the error object all along (`@better-fetch/fetch@1.3.1`, `index.js:733-739`) and
 * was simply dropped when `AuthError` was constructed.
 *
 * **Six hooks, one test each, deliberately.** The plan called for threading `statusFrom()` through
 * all of them rather than the one that prompted the work, and "all six" is only a claim until a
 * test says so per hook — this is the shape of defect where the correct pattern gets applied to one
 * control and not its neighbour (ADR-0064, ADR-0067).
 */
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    sendVerificationEmail: vi.fn(),
    changePassword: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const THROTTLED = {
  data: null,
  error: { message: 'Too many requests. Please try again later.', status: 429 },
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Run a mutation that will be refused, and hand back the `AuthError` it produced. */
async function refusedBy<TVars>(
  useHook: () => { mutate: (vars: TVars) => void; error: AuthError | null; isError: boolean },
  variables: TVars,
): Promise<AuthError> {
  const { result } = renderHook(useHook, { wrapper });
  result.current.mutate(variables);
  await waitFor(() => expect(result.current.isError).toBe(true));
  const error = result.current.error;
  if (error === null) throw new Error('the mutation reported an error but carried none');
  return error;
}

afterEach(() => vi.clearAllMocks());

describe('the 429 reaches the screen as a 429', () => {
  it('useSignIn', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useSignIn, { email: 'a@b.com', password: 'x' });
    expect(error.status).toBe(429);
    expect(isRateLimited(error)).toBe(true);
  });

  it('useSignUp', async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useSignUp, { name: 'Ada', email: 'a@b.com', password: 'x' });
    expect(error.status).toBe(429);
  });

  it('useSendVerificationEmail', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useSendVerificationEmail, 'a@b.com');
    expect(error.status).toBe(429);
  });

  it('useChangePassword', async () => {
    vi.mocked(authClient.changePassword).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useChangePassword, {
      currentPassword: 'old',
      newPassword: 'new',
    });
    expect(error.status).toBe(429);
  });

  it('useRequestPasswordReset', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useRequestPasswordReset, 'a@b.com');
    expect(error.status).toBe(429);
  });

  it('useResetPassword', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useResetPassword, { token: 't', newPassword: 'new' });
    expect(error.status).toBe(429);
  });

  it('a non-throttled failure keeps its own status and message', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: null,
      error: { message: 'Invalid email or password', status: 401 },
    });
    const error = await refusedBy(useSignIn, { email: 'a@b.com', password: 'x' });
    expect(error.status).toBe(401);
    expect(isRateLimited(error)).toBe(false);
    expect(authErrorMessage(error)).toBe('Invalid email or password');
  });
});

describe('authErrorMessage', () => {
  it('names no number of seconds — the header carrying one is discarded before we see it', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useSignIn, { email: 'a@b.com', password: 'x' });

    expect(authErrorMessage(error)).toBe('Too many attempts. Wait a moment and try again.');
    expect(authErrorMessage(error)).not.toMatch(/\d/);
  });

  it('says "a minute" on the two 60-second email routes', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue(THROTTLED);
    const error = await refusedBy(useRequestPasswordReset, 'a@b.com');

    expect(authErrorMessage(error, 'email')).toBe(
      'Too many requests. Wait a minute before asking for another email.',
    );
  });
});
