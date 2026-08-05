import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignInForm } from './SignInForm';

import { authClient } from '@/lib/auth-client';

/**
 * ADR-0074 M2-T5 — `EMAIL_NOT_VERIFIED` as a first-class state, asserted on **both** branches.
 *
 * Fails against the pre-ADR-0074 form, which dropped the library's raw message into a bare
 * `<p role="alert">` with no way forward: the one error a signed-out person can actually fix,
 * presented as a dead end.
 */
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: vi.fn() }, sendVerificationEmail: vi.fn() },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn().mockResolvedValue(null) };
});

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignInForm onSuccess={vi.fn()} />
    </QueryClientProvider>,
  );
}

function submit(email = 'ada@example.com') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

afterEach(() => vi.clearAllMocks());

describe('SignInForm — the unverified branch', () => {
  it('replaces the form with an explained state and a resend', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' },
    });
    renderForm();
    submit();

    expect(await screen.findByText('Confirm your email address first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send another verification email/i })).toBeVisible();
    // No field: the address is the one just typed, so asking for it again would be a re-entry
    // task and a chance to get it wrong.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('sends to the address the person just typed', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' },
    });
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ error: null });
    renderForm();
    submit('grace@example.com');

    fireEvent.click(
      await screen.findByRole('button', { name: /send another verification email/i }),
    );

    await waitFor(() =>
      expect(authClient.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'grace@example.com' }),
      ),
    );
  });

  it('keeps the ordinary credential failure as today’s paragraph', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: 'Invalid email or password' },
    });
    renderForm();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    // Still a form — a wrong password is retried in place.
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /send another verification email/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the submit focused while signing in (never native `disabled`)', async () => {
    vi.mocked(authClient.signIn.email).mockReturnValue(new Promise(() => {}));
    renderForm();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    const button = screen.getByRole('button', { name: 'Sign in' });
    button.focus();
    fireEvent.click(button);

    const pending = await screen.findByRole('button', { name: /signing in/i });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(pending);
  });
});
