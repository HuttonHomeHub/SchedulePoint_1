import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VerifyEmailScreen } from './verify-email';

import { authClient } from '@/lib/auth-client';

/**
 * The six arrivals `/verify-email` serves (ADR-0074 M2-T3). The screen is a **landing** screen —
 * it never holds or spends a token — so every state here is driven by search params the auth
 * handler put in the URL, plus the resend it offers.
 */
const search = vi.hoisted((): { current: Record<string, unknown> } => ({ current: {} }));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.current,
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { sendVerificationEmail: vi.fn() },
}));

function renderAt(params: Record<string, unknown>) {
  search.current = params;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VerifyEmailScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('VerifyEmailScreen', () => {
  it('confirms success when the handler redirects back with ?verified=1', () => {
    renderAt({ verified: '1' });
    expect(screen.getByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    // Nothing to resend — offering it here would invite a second, pointless email.
    expect(screen.queryByRole('button', { name: /send another/i })).not.toBeInTheDocument();
  });

  it('offers a resend without asking, when the address is in the URL', () => {
    renderAt({ email: 'ada@example.com' });
    expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send another/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('asks for the address when there is none — a bookmarked arrival has no other way through', () => {
    renderAt({});
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('frames a spent link as "used", not as a failure — a mail scanner can burn it', () => {
    renderAt({ error: 'token_expired' });
    expect(screen.getByRole('heading', { name: 'That link has been used' })).toBeInTheDocument();
    // The whole point of the framing: the way out is offered on the same screen.
    expect(screen.getByRole('button', { name: /send another/i })).toBeInTheDocument();
  });

  it('shows one outcome after a send, whatever the address was', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ error: null });
    renderAt({ email: 'ada@example.com' });

    fireEvent.click(screen.getByRole('button', { name: /send another/i }));

    // Deliberately hedged: the endpoint answers identically for an unknown address, an
    // already-verified one and a real pending one. A UI that distinguished them would hand back
    // the account-enumeration oracle the server just closed.
    expect(await screen.findByText(/an email is on its way/i)).toBeInTheDocument();
    // The shared announcer clears then re-sets on the next frame, so this settles asynchronously.
    await waitFor(() => {
      expect(screen.getByTestId('announcer')).toHaveTextContent(/an email is on its way/i);
    });
  });

  it('surfaces a send failure in an alert and leaves the button available', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({
      error: { message: 'Too many requests. Try again in a minute.' },
    });
    renderAt({ email: 'ada@example.com' });

    fireEvent.click(screen.getByRole('button', { name: /send another/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByRole('button', { name: /send another/i })).toBeInTheDocument();
  });

  it('keeps the submit focused while the send is in flight (never native `disabled`)', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockReturnValue(new Promise(() => {}));
    renderAt({ email: 'ada@example.com' });

    const button = screen.getByRole('button', { name: /send another/i });
    button.focus();
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });
    // A native `disabled` here would blur to `<body>` and hand focus back when the request
    // settles — the keyboard user loses their place twice per send (TECH_DEBT #17a).
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /sending/i }));
  });
});
