import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  navigate.fn.mockReset();
  vi.clearAllMocks();
});

describe('ResetPasswordScreen — arriving', () => {
  it('strips the token from the URL immediately, with replace', () => {
    renderScreen({ token: 'tok-123' });
    // A live token must not survive in history or ride along in a later referrer, and `replace`
    // is what stops Back from restoring it.
    expect(navigate.fn).toHaveBeenCalledWith({
      to: '/reset-password',
      search: {},
      replace: true,
    });
  });

  it('renders the form when the token was valid', () => {
    renderScreen({ token: 'tok-123' });
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
    const { unmount } = renderScreen({ token: 'tok-123' });
    expect(document.querySelector('meta[name="robots"]')).not.toBeNull();
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});

describe('ResetPasswordScreen — submitting', () => {
  it('refuses a mismatched confirmation without calling the server', async () => {
    renderScreen({ token: 'tok-123' });
    fill({ confirm: 'something-else-here' });

    expect((await screen.findAllByText('The two passwords do not match')).length).toBeGreaterThan(
      0,
    );
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });

  it('sends the captured token with the new password', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({ error: null });
    renderScreen({ token: 'tok-123' });
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
    renderScreen({ token: 'tok-123' });
    fill();

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    // Only the token-stripping navigation — pushing `/` would land in the `_authed` guard and
    // bounce, which is the dead end this epic exists to remove.
    expect(navigate.fn).toHaveBeenCalledTimes(1);
  });

  it('surfaces a server rejection as an alert and keeps the form', async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({
      error: { message: 'Password too short', code: 'PASSWORD_TOO_SHORT' },
    });
    renderScreen({ token: 'tok-123' });
    fill();

    expect(await screen.findByRole('alert')).toHaveTextContent('Password too short');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('keeps the submit focused while saving (never native `disabled`)', async () => {
    vi.mocked(authClient.resetPassword).mockReturnValue(new Promise(() => {}));
    renderScreen({ token: 'tok-123' });
    screen.getByRole('button', { name: 'Set new password' }).focus();
    fill();

    const pending = await screen.findByRole('button', { name: /setting your password/i });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(pending);
  });
});
