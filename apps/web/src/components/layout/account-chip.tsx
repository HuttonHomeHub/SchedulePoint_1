import { useNavigate } from '@tanstack/react-router';
import { Building2, Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { useId } from 'react';

import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import { useSession, useSignOut } from '@/features/auth';
import { useTheme, type Theme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const THEME_META: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: 'Light' },
  dark: { icon: Moon, label: 'Dark' },
  system: { icon: Monitor, label: 'System' },
  corporate: { icon: Building2, label: 'Corporate' },
};
const THEMES: Theme[] = ['light', 'dark', 'system', 'corporate'];

/** Initials from a name or, failing that, an email — never more than two characters. */
function initialsOf(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.split('@')[0] || '';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * The **account chip**: an initials avatar that opens a menu holding the theme choice, the
 * signed-in identity and Sign out.
 *
 * It replaces three separate header controls — a theme-cycling icon button, an always-visible
 * email `<span>`, and an `outline` Sign-out button. Two of the six Corporate contrast defects are
 * fixed here by **deletion**: the email that was 2.8:1 on navy and the outline button that was
 * 1.01:1 no longer exist as header elements. What replaces them lives in a portalled
 * {@link Menu}, which renders outside every surface scope and therefore paints on `--popover` —
 * the page's own, already-validated pairing.
 *
 * The theme control becomes a radio group inside the menu instead of a cycling button. A cycle
 * gives no indication of what the other options are and forces a blind press to discover them;
 * with four themes that is a genuinely poor control.
 */
export function AccountChip({ className }: { className?: string }): React.ReactElement {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const themeLabelId = useId();

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
          'focus-visible:ring-ring hover:bg-accent flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-1 pl-0.5 outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
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
        <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium" id={themeLabelId}>
          Theme
        </p>
        {/* The heading above relates to these four options visually and ONLY visually without
            this group — a screen-reader user arrowing through the menu would meet four radios
            with no idea what they choose between (WCAG 1.3.1). `role="group"` is transparent to
            the APG menu's roving focus, which queries `[role="menuitemradio"]` across all
            DESCENDANTS of the menu container, not its direct children. */}
        <div role="group" aria-labelledby={themeLabelId}>
          {THEMES.map((option) => {
            const { icon: Icon, label } = THEME_META[option];
            return (
              <MenuItem key={option} selected={theme === option} onSelect={() => setTheme(option)}>
                <Check
                  aria-hidden="true"
                  className={cn('size-4', theme === option ? 'opacity-100' : 'opacity-0')}
                />
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </MenuItem>
            );
          })}
        </div>
        <div className="border-border my-1 border-t" />
        <MenuItem
          // The sign-out mutation's pending state has to survive the move into a menu: a second
          // press mid-request would fire a duplicate call.
          disabled={signOut.isPending}
          onSelect={() => {
            signOut.mutate(undefined, {
              onSuccess: () => {
                void navigate({ to: '/sign-in' });
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
