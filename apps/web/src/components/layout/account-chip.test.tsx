import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountChip } from '@/components/layout/account-chip';
import {
  HelpActionProvider,
  useRegisterShortcutsAction,
} from '@/components/layout/chrome/help-action';
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
  /** `null` is the answer for almost everybody — the guard 404s every non-staff caller. */
  staff: null as { userId: string; email: string; dualHatted: boolean } | null,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => h.navigate,
}));

// Mocked rather than wrapped in a QueryClientProvider: this file is about the chip, and a real
// query would make every assertion here wait on a fetch that has nothing to do with it. The two
// branches that matter get their own tests below.
vi.mock('@/features/staff/api/staff-identity', () => ({
  useStaffIdentity: () => ({ data: h.staff }),
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { email: 'ada@example.com', name: 'Ada Lovelace' } } }),
  useSignOut: () => ({ mutate: h.signOutMutate, isPending: h.isPending }),
}));

function renderChip(shortcuts?: () => void): void {
  render(
    <ThemeProvider>
      <HelpActionProvider>
        {shortcuts ? <ShortcutsRegistrar open={shortcuts} /> : null}
        <AccountChip />
      </HelpActionProvider>
    </ThemeProvider>,
  );
}

function ShortcutsRegistrar({ open }: { open: () => void }): null {
  useRegisterShortcutsAction(open);
  return null;
}

beforeEach(() => {
  h.navigate.mockReset();
  h.signOutMutate.mockReset();
  h.isPending = false;
  h.staff = null;
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

  it('offers the staff console only to staff, from runtime evidence', async () => {
    // The gate is a `GET /staff/me` that answered 200 — never a `VITE_` constant, because
    // staff-ness is a server fact the bundle cannot see (ADR-0074's rule, ADR-0086's case).
    h.staff = { userId: 'u1', email: 'ops@schedulepoint.test', dualHatted: true };
    renderChip();
    fireEvent.click(screen.getByRole('button', { name: /account/i }));

    const item = await screen.findByRole('menuitem', { name: /staff console/i });
    fireEvent.click(item);

    expect(h.navigate).toHaveBeenCalledWith({ to: '/staff' });
  });

  it('shows nothing at all to everybody else — not a shaded item', async () => {
    // A disabled "Staff console" would tell a reader the surface exists and that they are not
    // allowed near it, which is precisely the oracle the API's uniform 404 refuses to be. This is
    // the ADR-0082 "omit, do not shade" case: the action does not apply to this reader at all.
    h.staff = null;
    renderChip();
    fireEvent.click(screen.getByRole('button', { name: /account/i }));

    await screen.findByRole('menu');
    expect(screen.queryByText(/staff/i)).not.toBeInTheDocument();
  });

  describe('the keyboard-shortcuts item (ADR-0091 M7-S5)', () => {
    it('is absent when no surface offers a shortcuts sheet', () => {
      // Outside a plan there is no diagram to describe shortcuts for, so the action does not apply
      // to the object and is omitted rather than shaded (ADR-0082's discriminator). A shaded item
      // here would be a refusal with no state the reader could act on.
      renderChip();
      fireEvent.click(screen.getByRole('button', { name: /Account/ }));
      expect(screen.queryByRole('menuitem', { name: 'Diagram keyboard shortcuts' })).toBeNull();
    });

    it('appears and opens the registered sheet when a plan offers one', () => {
      const open = vi.fn();
      renderChip(open);
      fireEvent.click(screen.getByRole('button', { name: /Account/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram keyboard shortcuts' }));
      expect(open).toHaveBeenCalledOnce();
    });
  });
});
