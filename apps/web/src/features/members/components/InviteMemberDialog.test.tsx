import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InviteMemberDialog } from './InviteMemberDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn().mockResolvedValue([]),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <InviteMemberDialog orgSlug="acme" />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('InviteMemberDialog after the invitation is sent', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({
      id: 'i1',
      acceptUrl: 'https://app.test/accept-invite?token=abc',
    });
  });

  /**
   * Sending unmounts the form (and the button that held focus) and mounts the link block, so a
   * keyboard user was left on nothing and a screen-reader user heard nothing, about a link that is
   * shown exactly once.
   */
  it('moves focus to the link, announces it, and says on screen that it is shown once', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    const link = await screen.findByLabelText('Invitation link');
    await waitFor(() => expect(document.activeElement).toBe(link));

    const sentence = 'Invitation sent. Copy the link now: it is shown only once.';
    expect(within(screen.getByRole('dialog')).getByText(new RegExp(sentence))).toBeVisible();
    expect(link).toHaveAccessibleDescription(new RegExp(sentence));
    await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent(sentence));
  });
});

describe('InviteMemberDialog role choice', () => {
  it('says what the chosen role can do, and follows the choice', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));

    const role = screen.getByLabelText('Role');
    expect(role).toHaveAccessibleDescription(
      'Read-only access to shared plans in this organisation.',
    );

    fireEvent.change(role, { target: { value: 'CONTRIBUTOR' } });
    expect(role).toHaveAccessibleDescription(
      'Updates progress and adds notes on assigned plans. Cannot change logic or dates.',
    );
  });
});

describe('InviteMemberDialog when the invitation is refused', () => {
  it('shows the refusal inside the dialog and keeps the form for another try', async () => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockRejectedValue(new Error('There is already a pending invitation.'));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dup@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    const alert = await screen.findByRole('alert');
    expect(within(screen.getByRole('dialog')).getByText(/already a pending invitation/)).toBe(
      alert,
    );
    expect(screen.queryByLabelText('Invitation link')).toBeNull();
    expect(screen.getByLabelText('Email')).toBeVisible();
  });
});
