import type { MeResponse } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordScreen } from './forgot-password';

import { apiFetch } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

/** ADR-0074 M4-T2 — asking for a reset link. */
const search = vi.hoisted((): { current: Record<string, unknown> } => ({ current: {} }));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.current,
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { requestPasswordReset: vi.fn() },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

const SIGNED_IN: MeResponse = {
  user: { id: 'u1', email: 'ada@example.com', name: 'Ada', emailVerified: true, image: null },
  memberships: [],
};

function renderScreen(params: Record<string, unknown> = {}, session: MeResponse | null = null) {
  search.current = params;
  vi.mocked(apiFetch).mockResolvedValue(session);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ForgotPasswordScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('ForgotPasswordScreen', () => {
  it('prefills the address from ?email=', async () => {
    renderScreen({ email: 'ada@example.com' });
    expect(await screen.findByLabelText('Email')).toHaveValue('ada@example.com');
  });

  it('sends the request with a same-origin redirect target', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({ error: null });
    renderScreen();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send a reset link' }));

    // `redirectTo` is origin-checked server-side, which is why CORS_ORIGINS is an M0 deployment
    // precondition rather than a nicety.
    await waitFor(() =>
      expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
        email: 'ada@example.com',
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
  });

  it('shows one hedged outcome and never promises delivery', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({ error: null });
    renderScreen();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send a reset link' }));

    // "If that address has an account" is true whether or not it does — and true on a deployment
    // where the mail port only logs (TECH_DEBT #94), which "we've emailed you" would not be.
    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument();
    expect(screen.queryByText(/we've emailed you/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('reads RESET_PASSWORD_DISABLED as a server fact, never as "no such account"', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({
      error: { message: 'Password reset is disabled', code: 'RESET_PASSWORD_DISABLED' },
    });
    renderScreen();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send a reset link' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not available on this installation/i);
    expect(alert).toHaveTextContent(/contact your administrator/i);
  });

  it('preserves the typed address when the request fails', async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({
      error: { message: 'Too many requests. Try again in a minute.' },
    });
    renderScreen();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send a reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
  });

  it('points a signed-in reader at /account instead of the emailed round trip', async () => {
    renderScreen({}, SIGNED_IN);
    expect(await screen.findByRole('link', { name: 'Go to your account' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('adds a noindex meta while mounted and removes it on unmount', async () => {
    const { unmount } = renderScreen();
    await screen.findByLabelText('Email');
    expect(document.querySelector('meta[name="robots"]')).not.toBeNull();
    unmount();
    // Without the cleanup, `noindex` rides into the authenticated app for the rest of the session.
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
