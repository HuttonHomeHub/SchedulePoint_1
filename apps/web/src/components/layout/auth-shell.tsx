import { BrandPanel } from './brand-panel';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Surface } from '@/components/ui/surface';

/**
 * The **floating card** every public screen is (ADR-0077 M7) — sign-in, sign-up, accept-invite and
 * the three account-recovery screens. The single `main` landmark for the page.
 *
 * **It is a card on a ground, not a full-bleed split.** M4 shipped the two-column layout edge to
 * edge; the product owner asked for the old app's floating box back, and they were right — a
 * 900px card on a soft ground reads as a considered object, while an edge-to-edge split reads as
 * a page that has not finished loading. The measurements are the old app's, not an approximation:
 * `static/css/auth.css` in `HuttonHomeHub/SchedulePoint` sets `width: 900px; max-width: 95%` on a
 * `linear-gradient(135deg, #f5f7fa, #c3cfe2)` body.
 *
 * **`tone="auth"`, so the card renders identically in Light, Dark and Corporate.** ADR-0077 §2
 * pinned the navy panel because a signed-out visitor never chose a theme — the boot script picked
 * Dark from their operating system, or Corporate because a colleague signed in on this machine
 * last month. That argument was applied to only half the screen: the card beside the pinned panel
 * still followed the theme, so a Dark-mode visitor met a fixed navy panel joined to a dark card,
 * one screen wearing two identities. Now the whole screen is one, and the theme picks up where it
 * belongs — after sign-in, on the app the reader has actually chosen to configure.
 *
 * **One height for all six screens, at `md` and up.** The old app's card was 466px on Forgot
 * Password and 694px on Register, so moving between screens resized the box under the reader's
 * cursor. A fixed height costs some space on the one-field screens and buys a box that never
 * moves. It is `md:`-only on purpose: a fixed-height card on a 320px phone is how content gets
 * clipped, and `e2e-public` measures exactly that.
 *
 * `overflow-y-auto` on the form column rather than the card, so a tall state scrolls its own
 * content and the panel beside it stays put.
 */
export function AuthShell({
  title,
  description,
  busy = false,
  children,
}: {
  /** Omit when the children own the heading — the accept-invite card does. */
  title?: string;
  description?: string;
  /** Reflected as `aria-busy` while an outcome is resolving. */
  busy?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const hasHeader = title !== undefined;

  return (
    <AnnouncerProvider>
      {/* The ground. Its two stops are a global token pair rather than surface-family members,
          because a gradient needs two stops and the 17-name surface vocabulary has no word for
          the second one — the same reason the canvas pair exists (ADR-0055). Naming the tokens
          in prose here would trip the seam guard, which matches text and not just code. */}
      <div className="from-ground to-ground-end grid min-h-dvh place-items-center bg-linear-to-br p-4">
        <Surface
          tone="auth"
          as="main"
          aria-busy={busy}
          className="bg-background grid w-full max-w-[900px] overflow-hidden rounded-lg shadow-xl md:h-[40rem] md:grid-cols-2"
        >
          <BrandPanel />
          <div className="flex flex-col justify-center overflow-y-auto p-2 md:p-4">
            {hasHeader ? (
              <CardHeader className="text-center">
                <CardTitle>{title}</CardTitle>
                {description === undefined ? null : (
                  <CardDescription>{description}</CardDescription>
                )}
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
          </div>
        </Surface>
      </div>
    </AnnouncerProvider>
  );
}
