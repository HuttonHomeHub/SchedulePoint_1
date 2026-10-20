import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pendingDescription, VerifyEmailScreen } from './verify-email';

import { ApiFetchError, apiFetch } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

/**
 * The arrivals `/verify-email` serves (ADR-0074 M2-T3, TECH_DEBT #88). The original six are driven
 * by search params; the emailed link's arrival is driven by the URL fragment, and nothing it
 * carries is spent until Confirm is pressed.
 */
const search = vi.hoisted((): { current: Record<string, unknown> } => ({ current: {} }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.current,
  useNavigate: () => navigate,
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

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

afterEach(() => {
  vi.clearAllMocks();
  window.location.hash = '';
});

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

/**
 * The emailed link (TECH_DEBT #88): `/verify-email#token=…`. The property under test is that
 * nothing is sent until the button is pressed — a page that confirmed on load would be the scanner
 * hazard again.
 */
describe('VerifyEmailScreen — the emailed link', () => {
  const ME = { user: { email: 'ada@example.com' }, memberships: [] };

  /** `/me` answers the given session; the confirm POST answers per `confirm`. */
  function arriveWithToken(
    confirm: () => Promise<unknown>,
    session: unknown = null,
    token = 'jwt.token.value',
  ) {
    window.location.hash = `#token=${token}`;
    vi.mocked(apiFetch).mockImplementation((path: string) =>
      path === '/me' ? Promise.resolve(session) : confirm(),
    );
    return renderAt({});
  }

  const press = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Confirm my email address' }));
  const confirmCalls = () =>
    vi.mocked(apiFetch).mock.calls.filter(([path]) => path === '/email-verification/confirm');

  it('asks for a press and sends nothing on arrival', async () => {
    arriveWithToken(() => Promise.resolve({ verified: true }));

    expect(screen.getByRole('heading', { name: 'Confirm your email address' })).toBeInTheDocument();
    expect(screen.getByText(/finish setting up your SchedulePoint account/)).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me'));
    expect(confirmCalls()).toHaveLength(0);
  });

  it('strips the token from the address bar once it has been captured', () => {
    arriveWithToken(() => Promise.resolve({ verified: true }));

    expect(navigate).toHaveBeenCalledWith({ to: '/verify-email', search: {}, replace: true });
  });

  it('posts the token on the press and reports success, with a way to sign in', async () => {
    arriveWithToken(() => Promise.resolve({ verified: true }));

    press();

    expect(
      await screen.findByRole('heading', { name: 'Email address confirmed' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your email address is confirmed. You can sign in now.',
    );
    expect(confirmCalls()).toEqual([
      [
        '/email-verification/confirm',
        { method: 'POST', body: JSON.stringify({ token: 'jwt.token.value' }) },
      ],
    ]);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    // Focus follows the outcome: the Confirm button that was pressed is gone.
    expect(document.activeElement).toBe(screen.getByRole('status'));
  });

  it('says who is signed in, and offers Continue rather than Sign in, when there is a session', async () => {
    arriveWithToken(() => Promise.resolve({ verified: true }), ME);

    expect(await screen.findByText(/You're signed in as ada@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/won't change who is signed in/)).toBeInTheDocument();

    press();

    expect(await screen.findByRole('link', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('keeps the button focused and busy while the press is in flight', async () => {
    arriveWithToken(() => new Promise(() => {}));

    const button = screen.getByRole('button', { name: 'Confirm my email address' });
    button.focus();
    fireEvent.click(button);

    const busy = await screen.findByRole('button', { name: 'Confirming…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(busy);
    // A second press while pending must not send a second request.
    fireEvent.click(busy);
    expect(confirmCalls()).toHaveLength(1);
  });

  it('offers a fresh link when the link has expired', async () => {
    arriveWithToken(() =>
      Promise.reject(new ApiFetchError(410, { code: 'VERIFICATION_LINK_EXPIRED', message: 'old' })),
    );

    press();

    expect(
      await screen.findByRole('heading', { name: 'That link has expired' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Confirmation links work for an hour.');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('alert'));
  });

  it('says the link did not work for a malformed or unknown token', async () => {
    arriveWithToken(
      () =>
        Promise.reject(
          new ApiFetchError(400, { code: 'VERIFICATION_LINK_INVALID', message: 'bad' }),
        ),
      null,
      'garbage',
    );

    press();

    expect(
      await screen.findByRole('heading', { name: 'That link did not work' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Send yourself a fresh one');
  });

  it('keeps the button, and says why, when the service is unreachable', async () => {
    arriveWithToken(() => Promise.reject(new TypeError('Failed to fetch')));

    press();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't confirm your address just now. Try again in a moment.",
    );
    expect(screen.getByRole('button', { name: 'Confirm my email address' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm your email address' })).toBeInTheDocument();
  });

  it('asks the reader to wait on a 429, and lets them press again', async () => {
    arriveWithToken(() =>
      Promise.reject(new ApiFetchError(429, { code: 'RATE_LIMITED', message: 'slow down' })),
    );

    press();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait a minute, then try again.',
    );
    press();
    await waitFor(() => expect(confirmCalls()).toHaveLength(2));
  });

  it('treats an empty token as no token — the waiting state, not a button with nothing to send', () => {
    window.location.hash = '#token=';
    renderAt({});

    expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm my email address' }),
    ).not.toBeInTheDocument();
  });
});
