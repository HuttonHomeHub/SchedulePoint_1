import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountChip } from '@/components/layout/account-chip';
import { ThemeProvider } from '@/hooks/use-theme';

/**
 * The account chip is where two of the six Corporate contrast defects were fixed by deletion —
 * the always-visible email and the invisible `outline` Sign-out button. Both moved into a
 * portalled menu, which paints on the page's `--popover` rather than on the navy band.
 *
 * These tests pin what that move must not break: the identity is still reachable, sign-out still
 * runs its mutation and navigates, and its pending state still guards a second press.
 */
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  signOutMutate: vi.fn(),
  isPending: false,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => h.navigate,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { email: 'ada@example.com', name: 'Ada Lovelace' } } }),
  useSignOut: () => ({ mutate: h.signOutMutate, isPending: h.isPending }),
}));

function renderChip(): void {
  render(
    <ThemeProvider>
      <AccountChip />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  h.navigate.mockReset();
  h.signOutMutate.mockReset();
  h.isPending = false;
  window.localStorage.clear();
  document.documentElement.className = '';
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

describe('AccountChip', () => {
  it('names the signed-in user on the trigger, since initials identify nobody', () => {
    renderChip();
    expect(screen.getByRole('button', { name: 'Account: ada@example.com' })).toHaveTextContent(
      'AL',
    );
  });

  it('keeps the email out of the header and inside the menu', () => {
    renderChip();
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
    expect(screen.getByTestId('user-email')).toHaveTextContent('ada@example.com');
  });

  it('offers every theme as a radio item and applies the choice', async () => {
    renderChip();
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
    // A cycling button never told the user what the other options were; a radio group does.
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(4);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Corporate/ }));
    await waitFor(() => expect(document.documentElement.classList).toContain('corporate'));
  });

  it('names the theme options as a group, not four loose radios', () => {
    renderChip();
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
    // The visible "Theme" heading sits above the options; without this group its relationship to
    // them is conveyed by proximity alone, so a screen-reader user arrowing the menu meets four
    // radios choosing between nothing they were told about (WCAG 1.3.1).
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(within(group).getAllByRole('menuitemradio')).toHaveLength(4);
  });

  it('returns focus to the trigger when the menu closes', async () => {
    renderChip();
    const trigger = screen.getByRole('button', { name: /Account:/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('signs out and navigates to /sign-in on success', () => {
    h.signOutMutate.mockImplementation((_input, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.(),
    );
    renderChip();
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(h.signOutMutate).toHaveBeenCalledTimes(1);
    // The confirmation rides the navigation (ADR-0077 §9). Signing out was the one deliberate
    // action in the product that said nothing when it worked: the reader pressed a menu item and
    // landed on a sign-in form, which is also exactly what an expired session looks like. The
    // param is asserted here because it is the only thing carrying that fact across the screens.
    expect(h.navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { signedOut: 'true' } });
  });

  it('disables sign out while the mutation is in flight', () => {
    h.isPending = true;
    renderChip();
    fireEvent.click(screen.getByRole('button', { name: /Account:/ }));
    const item = screen.getByRole('menuitem', { name: 'Signing out…' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    // A second press mid-request would fire a duplicate sign-out.
    expect(h.signOutMutate).not.toHaveBeenCalled();
  });
});
