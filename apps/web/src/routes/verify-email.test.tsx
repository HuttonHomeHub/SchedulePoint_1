import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pendingDescription, VerifyEmailScreen } from './verify-email';

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

  it('names no cause it cannot know, and offers the way out on the same screen', () => {
    renderAt({ error: 'token_expired' });
    // NOT "that link has been used": the token is a stateless JWT and a second visit to an
    // already-verified address takes the library's SUCCESS branch, so "used" is the one cause
    // that cannot produce this state (ADR-0074 M5-T1, UX review). The reachable ones — expired,
    // malformed, unknown user — are all fixed the same way, so the copy is cause-agnostic.
    expect(screen.getByRole('heading', { name: 'That link did not work' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send another/i })).toBeInTheDocument();
  });

  it('shows one outcome after a send, through exactly one live region', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ error: null });
    renderAt({ email: 'ada@example.com' });

    fireEvent.click(screen.getByRole('button', { name: /send another/i }));

    // Deliberately hedged: the endpoint answers identically for an unknown address, an
    // already-verified one and a real pending one. A UI that distinguished them would hand back
    // the account-enumeration oracle the server just closed.
    const outcome = await screen.findByRole('status');
    expect(outcome).toHaveTextContent(/an email is on its way/i);

    // **One** live region, not two. This paired the visible text with a `useAnnounce()` call, and
    // both are live regions — so the sentence was read twice (ADR-0074 M5-T1). The shared announcer
    // must therefore stay empty, and the visible element carries it.
    await waitFor(() => {
      expect(screen.getByTestId('announcer')).toBeEmptyDOMElement();
    });
    // And it takes focus, because the button that was pressed is gone.
    expect(document.activeElement).toBe(outcome);
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

/**
 * The waiting state stops asserting delivery (ADR-0075 M2). These are on the pure copy function
 * rather than the rendered screen because every screen test here mocks `useSearch` and so never
 * crosses the router's parser — the gap that hid `?verified=1` arriving as a number
 * (`docs/TECH_DEBT.md` #96). Testing the string directly means the assertions are about the words.
 */
describe('pendingDescription', () => {
  it('does not claim the message was sent', () => {
    // The defect in one assertion. "We sent you a link" is unknowable here: a send failure never
    // reaches the request, so this screen renders identically whether or not anything went out.
    const copy = pendingDescription('planner@example.com');
    expect(copy).not.toMatch(/we sent|we've sent|we have sent/i);
    expect(copy).toMatch(/should arrive/i);
  });

  it('names the address, because a typo at sign-up is the commonest cause of silence', () => {
    expect(pendingDescription('planner@example.com')).toContain('planner@example.com');
  });

  it('degrades to a generic phrase rather than a gap when no address is known', () => {
    // `?email=` is absent on a signed-out arrival, and is also dropped when the router's JSON
    // parsing mangles an all-digits local part (#96) — the guard upstream keeps it `undefined`.
    const copy = pendingDescription(undefined);
    expect(copy).toContain('your address');
    expect(copy).not.toContain('undefined');
  });

  it('says the fault may not be the reader’s, rather than leaving them to keep resending', () => {
    // If the transport is down, Resend fails too, so a screen whose only advice is "resend" sends
    // the reader round a loop that cannot terminate.
    //
    // **This assertion changed with the copy, and the reason matters.** It used to require the
    // words "ask whoever set up your organisation" — naming a human as the exit. The ADR-0075 UX
    // review pointed out that is a **dead end for a self-signup**, who has no such person; the
    // sentence sent exactly the reader most likely to be stuck to nobody. The exit is now an
    // honest statement that the failure is probably ours, which stops the resend loop by removing
    // the implication that the reader is doing something wrong.
    const copy = pendingDescription('a@b.test');
    expect(copy).toMatch(/our end rather than yours/i);
    expect(copy).not.toMatch(/ask whoever set up/i);
  });
});
