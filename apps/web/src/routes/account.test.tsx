import type { MeResponse } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountScreen } from './account';

import { apiFetch } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';

/** ADR-0074 M3 — the account screen's states. */
vi.mock('@/lib/auth-client', () => ({
  authClient: { changePassword: vi.fn(), sendVerificationEmail: vi.fn() },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn() };
});

function me(emailVerified: boolean): MeResponse {
  return {
    user: { id: 'u1', email: 'ada@example.com', name: 'Ada', emailVerified, image: null },
    memberships: [],
  };
}

function renderScreen(session: MeResponse | 'pending' = me(true)) {
  vi.mocked(apiFetch).mockImplementation(() =>
    session === 'pending' ? new Promise(() => {}) : Promise.resolve(session),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );
}

function fillPasswords({
  current = 'old-password-here',
  next = 'brand-new-password',
  confirm = 'brand-new-password',
}: { current?: string; next?: string; confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

afterEach(() => vi.clearAllMocks());

describe('AccountScreen — email section', () => {
  it('shows the address as verified with nothing to do', async () => {
    renderScreen(me(true));
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('— verified')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send another/i })).not.toBeInTheDocument();
  });

  it('offers a resend when the address is unverified', async () => {
    vi.mocked(authClient.sendVerificationEmail).mockResolvedValue({ error: null });
    renderScreen(me(false));

    expect(await screen.findByText('— not verified yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /send another verification email/i }));

    await waitFor(() =>
      expect(authClient.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ada@example.com' }),
      ),
    );
  });

  it('withholds the address while the session is loading rather than printing a placeholder', () => {
    renderScreen('pending');
    // An em dash where an address belongs reads as "you have no email", which is never true.
    expect(screen.getByText('Loading your details…')).toBeInTheDocument();
  });
});

describe('AccountScreen — change password', () => {
  it('states the session consequence before submit, not after', async () => {
    renderScreen();
    expect(await screen.findByText(/signs you out everywhere else/i)).toBeInTheDocument();
  });

  it('refuses a mismatched confirmation without calling the server', async () => {
    renderScreen();
    await screen.findByLabelText('Current password');
    fillPasswords({ confirm: 'something-else-here' });

    expect((await screen.findAllByText('The two passwords do not match')).length).toBeGreaterThan(
      0,
    );
    expect(authClient.changePassword).not.toHaveBeenCalled();
  });

  it('refuses a new password identical to the current one — the server accepts it silently', async () => {
    renderScreen();
    await screen.findByLabelText('Current password');
    fillPasswords({
      current: 'same-password-twice',
      next: 'same-password-twice',
      confirm: 'same-password-twice',
    });

    expect(
      (await screen.findAllByText('Choose a password you are not already using')).length,
    ).toBeGreaterThan(0);
    expect(authClient.changePassword).not.toHaveBeenCalled();
  });

  it('always revokes the other sessions — there is no checkbox to get wrong', async () => {
    vi.mocked(authClient.changePassword).mockResolvedValue({ error: null });
    renderScreen();
    await screen.findByLabelText('Current password');
    fillPasswords();

    await waitFor(() =>
      expect(authClient.changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password-here',
        newPassword: 'brand-new-password',
        revokeOtherSessions: true,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      /other sessions have been signed out/i,
    );
  });

  it('attaches a wrong current password to that field, not to a form banner', async () => {
    vi.mocked(authClient.changePassword).mockResolvedValue({
      error: { message: 'Invalid password', code: 'INVALID_PASSWORD' },
    });
    renderScreen();
    await screen.findByLabelText('Current password');
    fillPasswords();

    // Three inputs are on screen and only one is wrong; a banner above all three makes the reader
    // work out which (the ADR-0060 M6 finding, one control along).
    const field = await screen.findByLabelText('Current password');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(document.activeElement).toBe(field);
    expect(screen.getAllByText('That is not your current password').length).toBeGreaterThan(0);
    expect(screen.queryByText('Invalid password')).not.toBeInTheDocument();
  });

  it('keeps a non-field failure (a rate limit) in the form-level alert', async () => {
    vi.mocked(authClient.changePassword).mockResolvedValue({
      error: { message: 'Too many requests. Try again in a moment.' },
    });
    renderScreen();
    await screen.findByLabelText('Current password');
    fillPasswords();

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByLabelText('Current password')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the submit focused while saving (never native `disabled`)', async () => {
    vi.mocked(authClient.changePassword).mockReturnValue(new Promise(() => {}));
    renderScreen();
    await screen.findByLabelText('Current password');
    screen.getByRole('button', { name: 'Change password' }).focus();
    fillPasswords();

    const pending = await screen.findByRole('button', { name: /changing password/i });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(pending);
  });
});
