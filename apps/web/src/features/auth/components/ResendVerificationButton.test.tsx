import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResendVerificationButton } from './ResendVerificationButton';

import { authClient } from '@/lib/auth-client';

/**
 * ADR-0077 M1-T1 — the resend confirmation stops replacing the control it confirms.
 *
 * The defect: on success this returned the `<p role="status">` **alone**, unmounting the form and
 * its button, and `send.isSuccess` never clears — so only a page reload got it back. The sentence
 * it rendered told the reader to "check your spam folder before trying again" and then removed the
 * thing to try again with. Reachable from three surfaces: `/verify-email`, sign-in's
 * `EMAIL_NOT_VERIFIED` branch, and the invitation-accept refusal.
 *
 * Every test below fails against that version.
 */
vi.mock('@/lib/auth-client', () => ({
  authClient: { sendVerificationEmail: vi.fn() },
}));

function renderButton(props: { email?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResendVerificationButton {...props} />
    </QueryClientProvider>,
  );
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Send another verification email' }));
}

afterEach(() => vi.clearAllMocks());

describe('ResendVerificationButton', () => {
  it('keeps the button after a successful send, and sends again', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: {}, error: null });
    renderButton({ email: 'ada@example.com' });
    submit();

    expect(await screen.findByRole('status')).toHaveTextContent('an email is on its way');
    const button = screen.getByRole('button', { name: 'Send another verification email' });
    expect(button).toHaveAttribute('aria-disabled', 'false');

    button.click();
    await waitFor(() => expect(authClient.sendVerificationEmail).toHaveBeenCalledTimes(2));
  });

  it('announces the outcome exactly once — one live region, not two', async () => {
    // The ADR-0074 M5-T1 regression this must not reintroduce: pairing the rendered `role="status"`
    // with a `useAnnounce()` call had assistive tech read the same sentence twice, because both are
    // live regions.
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: {}, error: null });
    renderButton({ email: 'ada@example.com' });
    submit();

    await screen.findByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('moves focus to the confirmation, which is the new information', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: {}, error: null });
    renderButton({ email: 'ada@example.com' });
    submit();

    const outcome = await screen.findByRole('status');
    await waitFor(() => expect(document.activeElement).toBe(outcome));
  });

  it('clears a stale confirmation when the address is edited', async () => {
    // In the ask-for-an-address branch the confirmation is about the address that was sent to. Left
    // standing over a changed field it quietly stops being true.
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: {}, error: null });
    renderButton();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    submit();
    await screen.findByRole('status');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'grace@example.com' } });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('says something useful when the rate limiter answers, and keeps the control', async () => {
    // ADR-0077 M1-T4. Better Auth's 429 body carries no `code`, so this used to fall through to the
    // library's own "Too many requests. Please try again later." in a bare red paragraph. This
    // endpoint is on the 60-second rule, so the copy says "wait a minute" — and names no exact
    // number of seconds, because the header carrying it is discarded before we see the error.
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({
      data: null,
      error: { message: 'Too many requests. Please try again later.', status: 429 },
    });
    renderButton({ email: 'ada@example.com' });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Wait a minute before asking for another email.',
    );
    expect(
      screen.getByRole('button', { name: 'Send another verification email' }),
    ).toBeInTheDocument();
  });
});
