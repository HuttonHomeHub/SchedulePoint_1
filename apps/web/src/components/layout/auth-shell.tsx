import { AnnouncerProvider } from '@/components/ui/announcer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Centred card layout for every **public** screen — sign-in, sign-up, accept-invite, and the
 * account-recovery screens ADR-0074 adds. The single `main` landmark for the page.
 *
 * **It mounts {@link AnnouncerProvider}, and that is not optional.** The app's provider lives
 * inside the authed shell (`app-shell.tsx`), so out here `useAnnounce()` resolves to the
 * context's no-op default and every "Check your email" / "That link has expired" is announced to
 * nobody — silently, which is the only way this defect ever ships. Mounting the **same** provider
 * rather than hand-rolling a second live region means a public screen and an authed one announce
 * through one implementation; a bespoke `onAnnounce` prop would have been a second mechanism to
 * keep in step (the ADR-0062 shape).
 *
 * **Why one shell and not two.** `InviteShell` was a near-copy that had already drifted on width
 * and on whether it announced anything. Three new callers were about to make that five callers on
 * two implementations, where each looks right alone and only a reader who opens the same thing two
 * ways ever notices one is a version behind.
 */
export function AuthShell({
  title,
  description,
  size = 'sm',
  busy = false,
  children,
}: {
  /** Omit when the children own the heading — the accept-invite card does. */
  title?: string;
  description?: string;
  /** `sm` for forms, `md` for the wider decision screens. Preserves both prior widths exactly. */
  size?: 'sm' | 'md';
  /** Reflected as `aria-busy` while an outcome is resolving. */
  busy?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const hasHeader = title !== undefined;

  return (
    <AnnouncerProvider>
      <main className="flex min-h-dvh items-center justify-center p-4" aria-busy={busy}>
        <Card className={size === 'md' ? 'w-full max-w-md' : 'w-full max-w-sm'}>
          {hasHeader ? (
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              {description === undefined ? null : <CardDescription>{description}</CardDescription>}
            </CardHeader>
          ) : null}
          {/* Without a header the children ARE the card — they bring their own CardHeader — so
              wrapping them in CardContent would double the padding. That is the shape the
              accept-invite flow uses and the reason this branch exists. */}
          {hasHeader ? (
            <CardContent className="flex flex-col gap-6">{children}</CardContent>
          ) : (
            children
          )}
        </Card>
      </main>
    </AnnouncerProvider>
  );
}
