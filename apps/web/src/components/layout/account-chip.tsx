import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, Keyboard, ScrollText, UserCog, Wrench } from 'lucide-react';

import { useShortcutsAction } from '@/components/layout/chrome/help-action';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import { ACCOUNT_SETTINGS_ENABLED, AUDIT_LOG_ENABLED } from '@/config/env';
import { useSession, useSignOut } from '@/features/auth';
import { useStaffIdentity } from '@/features/staff/api/staff-identity';
import { cn } from '@/lib/utils';

/** Initials from a name or, failing that, an email — never more than two characters. */
function initialsOf(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.split('@')[0] || '';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * The **account chip**: an initials avatar that opens a menu holding the signed-in identity, the
 * account screen, keyboard shortcuts and Sign out.
 *
 * It replaces three separate header controls — a theme-cycling icon button, an always-visible
 * email `<span>`, and an `outline` Sign-out button. Two of the six contrast defects that theme
 * shipped with are fixed here by **deletion**: the email that was 2.8:1 on navy and the outline
 * button that was 1.01:1 no longer exist as header elements. What replaces them lives in a
 * portalled {@link Menu}, which renders outside every surface scope and therefore paints on
 * `--popover` — the page's own, already-validated pairing.
 *
 * **There is no theme control, and this docblock said there was until 2026-08-19.** It described a
 * radio group of four themes, with a paragraph arguing why a radio group beats a cycling button —
 * for a control ADR-0097 removed when the product collapsed to one theme. The file had zero
 * references to `useTheme`, `setTheme` or `THEMES` at the time; only the comment still believed in
 * it. The argument it made was right and is kept in `ADR-0097` rather than here, because it is the
 * reason a future theme picker should not be a cycle either.
 */
export function AccountChip({ className }: { className?: string }): React.ReactElement {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  // Asked only while the menu is open — see the hook for why the deferral is not an optimisation.
  const staff = useStaffIdentity({ enabled: open });
  const openShortcuts = useShortcutsAction();

  const email = session?.user?.email;
  const name = session?.user?.name;
  const initials = initialsOf(name, email);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // The name has to carry who is signed in: the avatar shows initials, which on their own
        // identify nobody. Previously the header printed the email in full; now the accessible
        // name does the same work without a low-contrast line of text on the band.
        aria-label={email ? `Account: ${email}` : 'Account'}
        onClick={toggle}
        className={cn(
          // `pointer-coarse:min-h-(--control-h)` (ADR-0118 M3) — measured 52 x 32 on touch, under
          // the house rule. Fine is unchanged: the chip's height comes from its 28 px avatar, and
          // the axis is the input device rather than the screen.
          'focus-visible:ring-ring hover:bg-accent flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-1 pl-0.5 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 pointer-coarse:min-h-(--control-h)',
          className,
        )}
      >
        <span className="bg-accent text-accent-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold">
          {initials}
        </span>
        {/* A caret, not decoration: a bare circle of initials is indistinguishable from an
            avatar, so without it the account menu is something you have to already know is
            there. The email is still only in the accessible name — this is the sighted cue. */}
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Account"
        restoreFocusRef={triggerRef}
      >
        {email ? (
          <p
            className="text-muted-foreground truncate px-2 py-1.5 text-xs"
            data-testid="user-email"
          >
            {email}
          </p>
        ) : null}
        {/* Directly above My activity: both are the reader's own, and this menu is already the
            account's — there is nowhere else the account screen could live without inventing a
            settings IA the product does not have. ADR-0074 M3. ("and above the theme group" until
            2026-08-19, naming a group ADR-0097 had removed.) */}
        {ACCOUNT_SETTINGS_ENABLED ? (
          <MenuItem
            onSelect={() => {
              void navigate({ to: '/account' });
            }}
          >
            <UserCog aria-hidden="true" className="size-4" />
            Your account
          </MenuItem>
        ) : null}
        {/* `/me/activity` is not org-scoped — it spans every organisation the reader belongs to and
            includes the org-less authentication rows — so the organisation nav is the wrong home
            for it and this menu, which is already the account's, is the right one. Without it the
            screen existed with no route to it but a typed URL, while the audit log's own refusal
            told the reader their activity was "on My activity" — a sentence naming a place the
            product did not take them. ADR-0072. */}
        {AUDIT_LOG_ENABLED ? (
          <MenuItem
            onSelect={() => {
              void navigate({ to: '/me/activity' });
            }}
          >
            <ScrollText aria-hidden="true" className="size-4" />
            My activity
          </MenuItem>
        ) : null}
        {/* **The staff console, for the one person in the installation who has one.**
            Shown from RUNTIME EVIDENCE — a `GET /staff/me` that answered 200 — and never from a
            `VITE_` constant, which is ADR-0074's rule applied to its natural case: staff-ness is a
            server fact read from `STAFF_EMAILS`, invisible to the bundle and changed by an
            operator without a release. A build-time flag would be worse than none, granting the
            link to everybody on one mistake and hiding it from the only staff member on the other.

            It is also not an oracle. A non-staff caller's `/staff/me` is the same 404 an unmapped
            route gives, so `data` is `null` and this renders nothing — indistinguishable from a
            product that has no staff console at all, which is the point.

            Added because the console shipped reachable only by typing `/staff`, and the product
            owner met exactly that: deployed, working, and invisible. ADR-0086 declined a link in
            the ORGANISATION nav — that shell is org-scoped and the console deliberately is not —
            but this menu is the account's own, which is the right home for a surface that follows
            the person rather than the organisation. */}
        {staff.data ? (
          <MenuItem
            onSelect={() => {
              void navigate({ to: '/staff' });
            }}
          >
            <Wrench aria-hidden="true" className="size-4" />
            Staff console
          </MenuItem>
        ) : null}
        {/* **The diagram's keyboard-shortcuts sheet** (ADR-0091 M7-S5), moved off the TSLD toolbar.
            It was a tier-3 command reachable only through the `⋯`, in a row rationing width between
            twenty-eight commands — and it is not a command about the plan at all, it is a reference
            about the application, which is what this menu already holds.

            Rendered from a **registered callback**, never from plan state: the header is
            plan-unaware (ADR-0029) and stays that way, exactly as it does for the toolbar itself,
            which reaches the band through a portal rather than by the shell learning about plans.

            Absent — not shaded — when nothing has registered one. Outside a plan there is no diagram
            to describe shortcuts for, so the action does not apply to the object (ADR-0082's
            discriminator); a shaded item here would be a refusal with no state the reader could act
            on. */}
        {openShortcuts ? (
          <MenuItem onSelect={openShortcuts}>
            <Keyboard aria-hidden="true" className="size-4" />
            Diagram keyboard shortcuts
          </MenuItem>
        ) : null}
        <div className="border-border my-1 border-t" />
        <MenuItem
          // The sign-out mutation's pending state has to survive the move into a menu: a second
          // press mid-request would fire a duplicate call.
          disabled={signOut.isPending}
          onSelect={() => {
            signOut.mutate(undefined, {
              onSuccess: () => {
                // `signedOut` carries the confirmation across the navigation. Signing out was the
                // one deliberate action in the product that said nothing at all when it worked —
                // the reader pressed a menu item and landed on a sign-in form, which is also what
                // an expired session looks like (ADR-0077 §9; the old app flashed "You have been
                // logged out" here).
                void navigate({ to: '/sign-in', search: { signedOut: 'true' } });
              },
            });
          }}
        >
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </MenuItem>
      </Menu>
    </>
  );
}
