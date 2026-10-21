import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResetPasswordScreen } from './reset-password';

import { authClient } from '@/lib/auth-client';

/** ADR-0074 M4-T3 — setting a new password from an emailed token. */
const search = vi.hoisted((): { current: Record<string, unknown> } => ({ current: {} }));
const navigate = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.current,
  useNavigate: () => navigate.fn,
  Link: ({ children, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={typeof rest.to === 'string' ? rest.to : '/'}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { resetPassword: vi.fn() },
}));

/** `replaceState`, not `location.hash =`: the latter fires an async `hashchange` the screen would hear. */
function setHash(hash: string): void {
  window.history.replaceState(null, '', `/${hash}`);
}

/** Arrive on a fragment link, as the emailed one does. */
function withToken(token: string) {
  setHash(`#token=${token}`);
  return renderScreen({});
}

function renderScreen(params: Record<string, unknown> = {}) {
  search.current = params;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResetPasswordScreen />
    </QueryClientProvider>,
  );
}

function fill({ next = 'brand-new-password', confirm = 'brand-new-password' } = {}) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
  navigate.fn.mockReset();
  vi.clearAllMocks();
});

describe('ResetPasswordScreen — arriving', () => {
  it('strips the token from the URL immediately, with replace', () => {
    withToken('tok-123');
    // A live token must not survive in history or ride along in a later referrer, and `replace`
    // is what stops Back from restoring it.
    expect(navigate.fn).toHaveBeenCalledWith({
      to: '/reset-password',
      search: {},
      replace: true,
    });
  });

  it('renders the form when the token was valid', () => {
    withToken('tok-123');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('explains a spent link and offers a fresh one, rather than a form that cannot work', () => {
    renderScreen({ error: 'INVALID_TOKEN' });
    expect(
      screen.getByRole('heading', { name: 'That link is no longer valid' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send a new link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('treats a bare URL the same way, and never crashes on one', () => {
    renderScreen({});
    expect(
      screen.getByRole('heading', { name: 'That link is no longer valid' }),
    ).toBeInTheDocument();
  });

  it('adds a noindex meta while mounted and removes it on unmount', () => {
    const { unmount } = withToken('tok-123');
    expect(document.querySelector('meta[name="robots"]')).not.toBeNull();
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});

describe('ResetPasswordScreen — the fragment link (TECH_DEBT #537)', () => {
  it('reads the token from the fragment and strips it with replace', async () => {
    setHash('#token=frag-123');
    vi.mocked(authClient.resetPassword).mockResolvedValue({ error: null });
    renderScreen({});

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(navigate.fn).toHaveBeenCalledWith({ to: '/reset-password', search: {}, replace: true });
    fill();
    await waitFor(() =>
      expect(authClient.resetPassword).toHaveBeenCalledWith({
        token: 'frag-123',
        newPassword: 'brand-new-password',
      }),
    );
  });

  it('ignores a query token: the link no longer carries it there', () => {
    renderScreen({ token: 'query-456' });

    expect(
      screen.getByRole('heading', { name: 'That link is no longer valid' }),
    ).toBeInTheDocument();
  });

  it('picks up a link pasted into the tab already showing the page', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({ error: null });
    renderScreen({});
    expect(
      screen.getByRole('heading', { name: 'That link is no longer valid' }),
    ).toBeInTheDocument();

    act(() => {
      window.location.hash = '#token=pasted-789';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    fill();
    await waitFor(() =>
      expect(authClient.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'pasted-789' }),
      ),
    );
  });

  it.each(['INVALID_TOKEN', 'USER_NOT_FOUND'])(
    'reports a link the server refused (%s) as "no longer valid", with focus moved to the outcome',
    async (code) => {
      vi.mocked(authClient.resetPassword).mockResolvedValue({
        error: { message: 'Invalid token', code },
      });
      setHash('#token=spent');
      renderScreen({});
      fill();

      expect(
        await screen.findByRole('heading', { name: 'That link is no longer valid' }),
      ).toBeInTheDocument();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('your password has not been changed');
      await waitFor(() => expect(document.activeElement).toBe(alert));
      expect(screen.getByRole('link', { name: 'Send a new link' })).toBeInTheDocument();
      expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    },
  );

  it('does not treat other failures as a dead link (the form stays)', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({
      error: { message: 'Too many requests', code: 'RATE_LIMITED' },
    });
    setHash('#token=still-good');
    renderScreen({});
    fill();

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });
});

describe('ResetPasswordScreen — submitting', () => {
  it('refuses a mismatched confirmation without calling the server', async () => {
    withToken('tok-123');
    fill({ confirm: 'something-else-here' });

    expect((await screen.findAllByText('The two passwords do not match')).length).toBeGreaterThan(
      0,
    );
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });

  it('sends the captured token with the new password', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({ error: null });
    withToken('tok-123');
    fill();

    await waitFor(() =>
      expect(authClient.resetPassword).toHaveBeenCalledWith({
        token: 'tok-123',
        newPassword: 'brand-new-password',
      }),
    );
  });

  it('ends at "sign in", not inside the app — the reset issues no session', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({ error: null });
    withToken('tok-123');
    fill();

    // The heading is part of the state (ADR-0077 M2-T3): it used to stay "Choose a new password"
    // over a body that had already told the reader the password was different.
    // **The announced region carries the outcome itself**, not only its consequence (ADR-0077
    // M6-T2). Focus moves in here, and a screen reader reads the focused element — the `<h1>`
    // beside it is never announced, so "your password has been changed" has to be in this string
    // or it is spoken to nobody.
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your password has been changed, and every other session has been signed out.',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Password changed');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    // Only the token-stripping navigation — pushing `/` would land in the `_authed` guard and
    // bounce, which is the dead end this epic exists to remove.
    expect(navigate.fn).toHaveBeenCalledTimes(1);
  });

  it('surfaces a server rejection as an alert and keeps the form', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({
      error: { message: 'Password too short', code: 'PASSWORD_TOO_SHORT' },
    });
    withToken('tok-123');
    fill();

    expect(await screen.findByRole('alert')).toHaveTextContent('Password too short');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('keeps the submit focused while saving (never native `disabled`)', async () => {
    vi.mocked(authClient.resetPassword).mockReturnValue(new Promise(() => {}));
    withToken('tok-123');
    screen.getByRole('button', { name: 'Set new password' }).focus();
    fill();

    const pending = await screen.findByRole('button', { name: /setting your password/i });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(pending);
  });
});
