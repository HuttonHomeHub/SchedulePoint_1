import { Link, useParams, useRouterState } from '@tanstack/react-router';
import { Menu } from 'lucide-react';

import { AccountChip } from '@/components/layout/account-chip';
import { BrandMark } from '@/components/layout/brand-mark';
import { useShell } from '@/components/layout/navigator/shell-context';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { OrgSwitcher } from '@/features/organizations';

/**
 * The wordmark's link treatment.
 *
 * `chrome`-scope rebound names only — no colour literals, which the ADR-0055 lint rule enforces
 * and which would be invisible to the contrast matrix. `rounded-md` plus the focus ring rather
 * than an underline: the wordmark is a lockup with an icon, and underlining half of it reads as
 * damage.
 */
const BRAND_LINK_CLASS =
  'focus-visible:ring-ring hover:opacity-90 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none';

/**
 * The header's contents — brand mark, organisation switcher, account chip. **No navigation.**
 *
 * The six organisation destinations (Clients, Calendars, Resources, Members, Audit log, Recently
 * deleted) moved to the Project Explorer rail's bottom zone in ADR-0097 Landing D1: they are
 * *places in the organisation*, and one navigator beats two. What is left is identity and account,
 * which is what a header is for.
 *
 * That freed **540 px** at 1646 — measured, not estimated
 * (`docs/specs/design-system-rewrite/m0-landing-d1-measurement.md`), and the figure the spec
 * carried until then was 637 px, which appears never to have been measured at all. It is what pays
 * for folding the plan identity line into this band, which ADR-0092 M5 withdrew for want of
 * exactly this width.
 *
 * Split from the element that carries it because the two shell shapes place it differently:
 * flag-off the header IS the chrome surface and centres its row at `max-w-6xl` (today's shell);
 * flag-on it is one row inside a full-bleed band that already owns the scope, the sticky
 * behaviour and the border. Keeping the split explicit means neither path branches on a flag
 * inside its own markup.
 *
 * A `1fr auto 1fr` grid (feature-spec.md §4.9, ADR-0056) — not a flex row with `flex-1`/`ml-auto`
 * — so the centre cell sits at the true midpoint between the brand and the account chip rather
 * than merely absorbing whatever space the edges don't claim. `min-w-0` on every cell means a long
 * organisation name truncates rather than pushing the account chip off-screen. DOM order (drawer →
 * brand → org switcher → account) is unchanged, so the pinned tab order holds by construction.
 */
/**
 * The wordmark, as the route home (ADR-0098 M4).
 *
 * **The link is added HERE and never inside `BrandMark`**, because `brand-panel.tsx` renders the
 * same mark on the public screens — sign-in, sign-up, reset — where there is no session and no
 * route home. A link inside the primitive would put one there, pointing at a route the visitor
 * cannot reach. There is a test asserting the public panel still renders no anchor.
 *
 * Off an organisation route (`/account`, `/me/activity`, `/onboarding`, `/staff`) it goes to `/`,
 * which the home resolver turns into the caller's last-active organisation or onboarding — the
 * same answer, arrived at by the one route that knows it.
 *
 * The accessible name **contains the visible text** ("SchedulePoint — organisation overview"), so
 * WCAG 2.5.3 Label in Name holds: a speech-input user saying "SchedulePoint" still matches.
 */
function BrandLink({ orgSlug }: { orgSlug: string | undefined }): React.ReactElement {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isLanding = orgSlug !== undefined && pathname === `/orgs/${orgSlug}`;

  if (orgSlug === undefined) {
    return (
      <Link to="/" aria-label="SchedulePoint — home" className={BRAND_LINK_CLASS}>
        <BrandMark />
      </Link>
    );
  }

  return (
    <Link
      to="/orgs/$orgSlug"
      params={{ orgSlug }}
      aria-label="SchedulePoint — organisation overview"
      // `aria-current` is set from the pathname rather than left to the router's `.active` class:
      // this is the affordance the "Overview" nav item provided with `activeOptions={{ exact:
      // true }}`, and it has to survive that item's removal in M5.
      aria-current={isLanding ? 'page' : undefined}
      className={BRAND_LINK_CLASS}
    >
      <BrandMark />
    </Link>
  );
}

function HeaderContents(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : undefined;
  // Opens the rail as a drawer below `lg`, where the pinned rail is hidden. Null outside the
  // shell — this header is also rendered by `chrome-band.tsx` on the DESIGNED_CHROME-off path.
  const shell = useShell();

  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-4">
      <div className="flex min-w-0 shrink-0 items-center gap-2 justify-self-start">
        {shell && orgSlug ? (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 lg:hidden"
            aria-label="Show Project Explorer"
            onClick={shell.openDrawer}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        ) : null}
        <BrandLink orgSlug={orgSlug} />
      </div>
      <div className="flex min-w-0 items-center gap-2 justify-self-center">
        <OrgSwitcher className="max-w-[12rem] truncate" />
      </div>
      <div className="flex shrink-0 items-center gap-2 justify-self-end">
        <AccountChip />
      </div>
    </div>
  );
}

/**
 * The header as its own chrome surface — today's shell, and the `VITE_DESIGNED_CHROME` flag-off
 * path. Centred at `max-w-6xl` to line up with the still-centred route bodies.
 */
export function AppHeader(): React.ReactElement {
  return (
    <Surface tone="chrome" as="header" className="border-border sticky top-0 z-10 border-b">
      <div className="mx-auto h-14 max-w-6xl px-4">
        <HeaderContents />
      </div>
    </Surface>
  );
}

/**
 * The header as the first row of the chrome band. Full-bleed — the band is chrome, and chrome
 * spans the viewport; the measure cap belongs to content, which keeps its own `max-w-6xl`. The
 * band owns the surface scope, the sticky position and the bottom border, so this is a bare
 * landmark.
 */
export function AppHeaderRow(): React.ReactElement {
  return (
    <header className="h-14 px-4">
      <HeaderContents />
    </header>
  );
}
